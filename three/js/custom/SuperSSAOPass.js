'use strict';

// 生成一张随机噪声图的数据
// 返回的数组为Uint8Array，长度为 size * size * 4
function generateNoiseData(size) {
    var data = new Uint8Array(size * size * 4);
    var n = 0;
    var v3 = new THREE.Vector3();
    for (var i = 0; i < size; i++) {
        for (var j = 0; j < size; j++) {
            v3.set(Math.random() * 2 - 1, Math.random() * 2 - 1, 0).normalize();
            data[n++] = (v3.x * 0.5 + 0.5) * 255;
            data[n++] = (v3.y * 0.5 + 0.5) * 255;
            data[n++] = 0;
            data[n++] = 255;
        }
    }
    return data;
}

// 生成一张随机噪声的二维纹理，size为方形纹理的边长
function generateNoiseTexture(size) {
    var texture = new THREE.DataTexture(
        generateNoiseData(size), size, size,
        THREE.RGBAFormat,
        THREE.UnsignedByteType, THREE.UVMapping,
        THREE.RepeatWrapping, THREE.RepeatWrapping
    );
    texture.needsUpdate = true;
    return texture;
}

// Generate halton sequence
// https://en.wikipedia.org/wiki/Halton_sequence
// halton数列，用来产生0-1的均匀分布的一组数据
// index 为采样位置，base为基数（任意质数）
function halton(index, base) {
    var result = 0;
    var f = 1 / base;
    var i = index;
    while (i > 0) {
        result = result + f * (i % base);
        i = Math.floor(i / base);
        f = f / base;
    }
    return result;
}

// 生成采样偏移数组
// size为采样次数
// offset 为偏移值，传入不同的偏移可以生成不同的分布数
// hemisphere 代表phi的范围是否在0~180内，否则生成在0-360内
function generateKernel(size, offset, hemisphere) {
    var kernel = new Float32Array(size * 3);
    offset = offset || 0;
    for (var i = 0; i < size; i++) {
        var phi = halton(i + offset, 2) * (hemisphere ? 1 : 2) * Math.PI; // phi是方位面（水平面）内的角度
        var theta = halton(i + offset, 3) * Math.PI; // theta是俯仰面（竖直面）内的角度
        var r = Math.random();
        var x = Math.cos(phi) * Math.sin(theta) * r;
        var y = Math.cos(theta) * r;
        var z = Math.sin(phi) * Math.sin(theta) * r;

        kernel[i * 3] = x;
        kernel[i * 3 + 1] = y;
        kernel[i * 3 + 2] = z;
    }
    return kernel;
}

// 优化的 ssao pass，实现细节参考 clay-view
// resolution 为屏幕分辨率
// normalDepth 默认为 true，将normal与depth渲染到一张纹理中（需要平台支持FloatTexture）
// 可以使用renderer.capabilities.floatFragmentTextures来判断
THREE.SuperSSAOPass = function (scene, camera, resolution, normalDepth) {
    THREE.Pass.call( this );

    this.scene = scene;
    this.camera = camera;

    this.clear = true;
    this.needsSwap = false;

    var resolution = ( resolution !== undefined ) ? new THREE.Vector2( resolution.x, resolution.y ) : new THREE.Vector2( 256, 256 );

    this.normalDepth = ( normalDepth !== undefined) ? normalDepth : true;

    if(this.normalDepth) {
        if ( THREE.NormalDepthPrePass === undefined ) {

            console.error( 'THREE.SuperSSAOPass relies on THREE.NormalDepthPrePass' );

        }

        this.normalDepthPrePass = new THREE.NormalDepthPrePass(scene, camera, resolution);
    } else {
        if ( THREE.NormalPrePass === undefined ) {

            console.error( 'THREE.SuperSSAOPass relies on THREE.NormalPrePass' );

        }

        if ( THREE.DepthPrePass === undefined ) {

            console.error( 'THREE.SuperSSAOPass relies on THREE.DepthPrePass' );

        }

        this.normalPrePass = new THREE.NormalPrePass(scene, camera, resolution);
        this.depthPrePass = new THREE.DepthPrePass(scene, camera, resolution);
    }

    if ( THREE.SSAOPrePass === undefined ) {

        console.error( 'THREE.SuperSSAOPass relies on THREE.SSAOPrePass' );

    }

    if(this.normalDepth) {
        this.ssaoPrePass = new THREE.SSAOPrePass(scene, camera, resolution, this.normalDepthPrePass.getTexture());
    } else {
        this.ssaoPrePass = new THREE.SSAOPrePass(scene, camera, resolution, undefined, this.normalPrePass.getTexture(), this.depthPrePass.getTexture());
    }

    if ( THREE.CopyShader === undefined ) {

		console.error( 'THREE.SuperSSAOPass relies on THREE.CopyShader' );

	}

    // CustomBlending用于将ssao叠加到结果中，NoBlending用于纯拷贝
	this.materialCopy = new THREE.ShaderMaterial( {
		uniforms: THREE.UniformsUtils.clone( THREE.CopyShader.uniforms ),
		vertexShader: THREE.CopyShader.vertexShader,
		fragmentShader: THREE.CopyShader.fragmentShader,
		transparent: true,
        depthTest: false,
        depthWrite: false,

        blending: THREE.CustomBlending,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.SrcColorFactor,
        blendEquation: THREE.AddEquation,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.SrcColorFactor,
        blendEquationAlpha: THREE.AddEquation
	} );

    this.quadCamera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
	this.quadScene = new THREE.Scene();
	this.quad = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), null );
    this.quadScene.add( this.quad );

    this.oldClearColor = new THREE.Color();
    this.oldClearAlpha = 1;

    this.setNoiseSize(4);
    this.setKernelSize(6); // 12

    this.setParameter('radius', 0.2);
    this.setParameter('bias', 0.2 / 50);
    this.setParameter('power', 1);

    this.onlyAO = false;
}

THREE.SuperSSAOPass.prototype = Object.assign( Object.create( THREE.Pass.prototype ), {
    constructor: THREE.SuperSSAOPass,

    render: function(renderer, writeBuffer, readBuffer, delta, maskActive) {

        // 因为此pass配置为不需要swapBuffer，所以绘制效果直接绘制在readBuffer上
        // 因此，如果需要绘制在屏幕上，则需要执行一次copy
        if(this.renderToScreen && !this.onlyAO) {
            this.materialCopy.blending = THREE.NoBlending;
			this.materialCopy.uniforms[ 'tDiffuse' ].value = readBuffer.texture;
			this.materialCopy.needsUpdate = true;
			this.renderPass( renderer, this.materialCopy, null );
        }

        // save renderer clear states
        this.oldClearColor.copy( renderer.getClearColor() );
		this.oldClearAlpha = renderer.getClearAlpha();
		var oldAutoClear = renderer.autoClear;
        renderer.autoClear = false;

        if(this.onlyAO) {
            renderer.setClearColor(0xffffff);
            renderer.setClearAlpha(1.0);
            this.onlyAO && renderer.clear(true, true, true);
        }

        if(this.normalDepth) {
            this.normalDepthPrePass.update(renderer);
        } else {
            this.normalPrePass.update(renderer);
            this.depthPrePass.update(renderer);
        }

        this.ssaoPrePass.update(renderer);

        // copy ssao to result
        this.materialCopy.uniforms[ 'tDiffuse' ].value = this.ssaoPrePass.getTexture();
        this.materialCopy.blending = THREE.CustomBlending;
        this.renderPass( renderer, this.materialCopy, this.renderToScreen ? null : readBuffer );

        // restore renderer clear states
        renderer.setClearColor( this.oldClearColor, this.oldClearAlpha );
		renderer.autoClear = oldAutoClear;
    },

    renderPass: function ( renderer, passMaterial, renderTarget, clearColor, clearAlpha ) {

		// save original state
		var originalClearColor = renderer.getClearColor();
		var originalClearAlpha = renderer.getClearAlpha();
		var originalAutoClear = renderer.autoClear;

		// setup pass state
		renderer.autoClear = false;
		var clearNeeded = ( clearColor !== undefined ) && ( clearColor !== null );
		if ( clearNeeded ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );

		}

		this.quad.material = passMaterial;
		renderer.render( this.quadScene, this.quadCamera, renderTarget, clearNeeded );

		// restore original state
		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

	},

	renderOverride: function ( renderer, overrideMaterial, renderTarget, clearColor, clearAlpha ) {

		var originalClearColor = renderer.getClearColor();
		var originalClearAlpha = renderer.getClearAlpha();
		var originalAutoClear = renderer.autoClear;

		renderer.autoClear = false;

		clearColor = overrideMaterial.clearColor || clearColor;
		clearAlpha = overrideMaterial.clearAlpha || clearAlpha;
		var clearNeeded = ( clearColor !== undefined ) && ( clearColor !== null );
		if ( clearNeeded ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );

		}

		this.scene.overrideMaterial = overrideMaterial;
		renderer.render( this.scene, this.camera, renderTarget, clearNeeded );
		this.scene.overrideMaterial = null;

		// restore original state
		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( originalClearColor );
        renderer.setClearAlpha( originalClearAlpha );

	},

    setKernelSize: function(size) {
       this.ssaoPrePass.ssaoMaterial.defines["KERNEL_SIZE"] = size;
       this.ssaoPrePass.ssaoMaterial.uniforms["kernel"].value = generateKernel(size, undefined, true);
    },

    setNoiseSize: function(size) {
        var texture =this.ssaoPrePass.ssaoMaterial.uniforms["noiseTex"].value;
        if(!texture) {
            texture = generateNoiseTexture(size);
           this.ssaoPrePass.ssaoMaterial.uniforms["noiseTex"].value = texture;
        } else {
            texture.image.data = generateNoiseData(size);
            texture.image.width = size;
            texture.image.height = size;
            texture.needsUpdate = true;
        }

       this.ssaoPrePass.ssaoMaterial.uniforms["noiseTexSize"].value.set(size, size);
    },

    setParameter: function(name, val) {
        if (name === 'noiseTexSize') {
            this.setNoiseSize(val);
        }
        else if (name === 'kernelSize') {
            this.setKernelSize(val);
        }
        else if (name === 'blurSize') {
            this.ssaoPrePass.blurMaterial.uniforms['blurSize'].value = val;
        }
        else {
           this.ssaoPrePass.ssaoMaterial.uniforms[name].value = val;
        }
    },

    dispose: function () {

        this.ssaoPrePass.dispose();

        this.normalDepthPrePass && this.normalDepthPrePass.dispose();
        this.normalPrePass && this.normalPrePass.dispose();
        this.depthPrePass && this.depthPrePass.dispose();

	},

	setSize: function ( width, height ) {

        this.ssaoPrePass.setSize(width, height);

        this.normalDepthPrePass && this.normalDepthPrePass.setSize(width, height);
        this.normalPrePass && this.normalPrePass.setSize(width, height);
        this.depthPrePass && this.depthPrePass.setSize(width, height);

	}
});

