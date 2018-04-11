// 模型预览器

function ModelViewer(container, options) {

    // THREE.EventDispatcher.call(this);

    options = options || {};

    var camera = this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(10, 10, 10);
    this.camera.lookAt(0, 0, 0);

    this.controls = new THREE.OrbitControls(camera, container);
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    var scene = this.scene = new THREE.Scene();
    this.scene.background = options.envMap || null;

    // 模拟大气散射的半球光
    var scatteredLight = new THREE.HemisphereLight(0x888888, 0x555555);
    scatteredLight.position.set(0, 1, 0);
    scene.add(scatteredLight);

    // 主要灯光
    var mainLight = this.mainlight = new THREE.DirectionalLight(0xffffff);
    mainLight.position.set(10, 10, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.x = 2048;
    mainLight.shadow.mapSize.y = 2048;
    mainLight.shadow.camera.near = 2; // default
    mainLight.shadow.camera.far = 30;
    var shadowSize = 10;
    mainLight.shadow.camera.left = -shadowSize;
    mainLight.shadow.camera.right = shadowSize;
    mainLight.shadow.camera.top = shadowSize;
    mainLight.shadow.camera.bottom = -shadowSize;
    mainLight.shadow.bias = -0.0005;
    mainLight.shadow.radius = 2;
    mainLight.intensity = 1.8;
    scene.add(mainLight);
    // 灯光照向模型
    scene.add(mainLight.target);
    mainLight.target.position.set(0, 0, 0);

    // 灯光辅助线
    if (options.lightHelper) {
        this.lightHelper = new THREE.DirectionalLightHelper(mainLight, 5);
        scene.add(this.lightHelper);
    }

    // 渲染器
    // 抗锯齿 使用processing处理的情况下，antialias无效
    // 因为antialias只对backbuffer生效，对framebuffer不生效
    // 所以，在使用了其它processingpass的情况下，需要配合使用抗锯齿pass
    // renderer = new THREE.WebGLRenderer( { antialias: true } );
    var renderer = this.renderer = new THREE.WebGLRenderer();
    // 在retina屏幕上大幅提高画面质量
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.gammaOutput = true;
    // 使用预烘培的阴影贴图
    renderer.shadowMap.enabled = true;
    renderer.autoUpdate = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap

    // post-processing
    this.postprocessing = options.postprocessing || {
        antialiasing: "taa",
        sao: "superssao", // none, sao, ssao, superssao
        bloom: false,
        bokeh: false
    };

    var composer = this.initComposer();
    this.setPostProcessing(this.postprocessing);

    container.appendChild(renderer.domElement);

    var scope = this;

    function onWindowResize() {

        var width = window.innerWidth;
        var height = window.innerHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height);

        var pixelRatio = renderer.getPixelRatio();
        var newWidth = Math.floor(width * pixelRatio) || 1;
        var newHeight = Math.floor(height * pixelRatio) || 1;
        composer.setSize(newWidth, newHeight);

        scope.screenCache = false;

    }

    window.addEventListener('resize', onWindowResize, false);

    this.screenCache = false;
    this.lastZoom = true;
    this.meLoop = this.loop.bind(this);
    this.loop();
}

ModelViewer.prototype = Object.assign(Object.create(THREE.EventDispatcher.prototype), {

    constructor: ModelViewer,

    initComposer: function() {
        var renderer = this.renderer;
        var scene = this.scene;
        var camera = this.camera;
        var composer = this.composer = new THREE.EffectComposer(renderer);

        this.taaRenderPass = new THREE.TAARenderPass(scene, camera);
        composer.addPass(this.taaRenderPass);

        this.ssaaRenderPass = new THREE.SSAARenderPass(scene, camera);
        composer.addPass(this.ssaaRenderPass);

        this.renderPass = new THREE.RenderPass(scene, camera);
        composer.addPass(this.renderPass);

        this.effectFXAA = new THREE.ShaderPass(THREE.FXAAShader);
        this.effectFXAA.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
        composer.addPass(this.effectFXAA);

        // bloomPass = new THREE.UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85 ); //1.0, 9, 0.5, 512);
        // composer.addPass( bloomPass );

        // var bokehPass = new THREE.BokehPass( scene, camera, {
        // 	focus: 		30.0,
        // 	aperture:	0.01,
        // 	maxblur:	0.001,
        //
        // 	width: window.innerWidth,
        // 	height: window.innerHeight
        // } );
        // bokehPass.renderToScreen = true;
        // composer.addPass( bokehPass );

        this.ssaoPass = new THREE.SSAOPass(scene, camera);
        composer.addPass(this.ssaoPass);

        this.saoPass = new THREE.SAOPass(scene, camera, undefined, undefined, new THREE.Vector2(window.innerWidth, window.innerHeight));
        this.saoPass.params = {
            output: 0,
            saoBias: 0.5,
            saoIntensity: 0.0053,
            saoScale: 8,
            saoKernelRadius: 100,
            saoMinResolution: 0,
            saoBlur: true,
            saoBlurRadius: 8,
            saoBlurStdDev: 4,
            saoBlurDepthCutoff: 0.01
        };
        composer.addPass(this.saoPass);

        this.superSSAOPass = new THREE.SuperSSAOPass(
            scene, camera, 
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            renderer.capabilities.floatFragmentTextures
        );
        this.superSSAOPass.setParameter('intensity', 0.5);
        composer.addPass(this.superSSAOPass);

        this.smaaPass = new THREE.SMAAPass(window.innerWidth, window.innerHeight);
        this.smaaPass.renderToScreen = true;
        composer.addPass(this.smaaPass);

        this.copyPass = new THREE.ShaderPass(THREE.CopyShader);
        this.copyPass.renderToScreen = true;
        composer.addPass(this.copyPass);

        return composer;
    },

    setPostProcessing: function(options) {

        this.renderPass.enabled = true;
        this.copyPass.enabled = true;

        this.effectFXAA.enabled = false;
        this.taaRenderPass.enabled = false;
        this.ssaaRenderPass.enabled = false;
        this.smaaPass.enabled = false;

        switch (options.antialiasing) {
            case "fxaa":
                this.effectFXAA.enabled = true;
                break;
            case "smaa":
                this.smaaPass.enabled = true;
                this.copyPass.enabled = false;
                break;
            case "taa":
                this.taaRenderPass.enabled = true;
                this.renderPass.enabled = false;
                break;
            case "ssaa":
                this.ssaaRenderPass.enabled = true;
                this.renderPass.enabled = false;
                break;
            case "taa":
                this.taaRenderPass.enabled = true;
                this.renderPass.enabled = false;
            default:

        }

        if(options.sao == "sao") {
            this.ssaoPass.enabled = false;
            this.saoPass.enabled = true;
            this.superSSAOPass.enabled = false;
        } else if(options.sao == "ssao") {
            this.ssaoPass.enabled = true;
            this.saoPass.enabled = false;
            this.superSSAOPass.enabled = false;
        } else if(options.sao == "superssao") {
            this.ssaoPass.enabled = false;
            this.saoPass.enabled = false;
            this.superSSAOPass.enabled = true;
        } else {
            this.ssaoPass.enabled = false;
            this.saoPass.enabled = false;
            this.superSSAOPass.enabled = false;
        }
        
    },

    loadModel: function(url) {

        var modelScale = 0.0178; // TODO 根据模型的包围盒计算
        var scope = this;

        // model
        var loader = new THREE.GLTFLoader();
        loader.load(url, function(gltf) {

            gltf.scene.traverse(function(child) {

                if (child.isMesh) {

                    child.castShadow = true;
                    child.receiveShadow = true;

                }

            });

            gltf.scene.children[0].scale.set(modelScale, modelScale, modelScale);

            scope.scene.add(gltf.scene.children[0]);

            scope.renderer.needsUpdate = true;

            scope.screenCache = false;

            scope.dispatchEvent({
                type: 'modelLoaded'
            });

        });

        return this;
    },

    loop: function() {
        requestAnimationFrame(this.meLoop);

        this.lightHelper && this.lightHelper.update();

        var postprocessing = this.postprocessing;

        var zoom = this.controls.getZoomScale();

        this.setPostProcessing(postprocessing);

        if (this.controls.isStatic() && this.lastZoom == zoom && this.screenCache) {
            if (postprocessing.antialiasing == "taa") {
                this.taaRenderPass.accumulate = true;
            }
        } else {
            if (postprocessing.antialiasing == "taa") {
                this.taaRenderPass.accumulate = false;
            }

            this.lastZoom = zoom;
        }

        this.screenCache = true;

        this.composer.render();
    }

});