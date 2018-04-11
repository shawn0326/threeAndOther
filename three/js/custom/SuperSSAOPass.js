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

    this.resolution = ( resolution !== undefined ) ? new THREE.Vector2( resolution.x, resolution.y ) : new THREE.Vector2( 256, 256 );

    this.normalDepth = ( normalDepth !== undefined) ? normalDepth : true;

    this.ssaoRenderTarget = new THREE.WebGLRenderTarget( this.resolution.x, this.resolution.y, {
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		format: THREE.RGBAFormat
	} );
	this.blurIntermediateRenderTarget = this.ssaoRenderTarget.clone();

    if(this.normalDepth) {
        if ( THREE.NormalDepthShader === undefined ) {

            console.error( 'THREE.SuperSSAOPass relies on THREE.NormalDepthShader' );
    
        }

        this.normalDepthRenderTarget = new THREE.WebGLRenderTarget( this.resolution.x, this.resolution.y, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType // depth 
        } );

        this.normalDepthMaterial = new THREE.ShaderMaterial( {
            defines: Object.assign( {}, THREE.NormalDepthShader.defines ),
            fragmentShader: THREE.NormalDepthShader.fragmentShader,
            vertexShader: THREE.NormalDepthShader.vertexShader,
            uniforms: THREE.UniformsUtils.clone( THREE.NormalDepthShader.uniforms )
        } );
    } else {
        this.normalRenderTarget = new THREE.WebGLRenderTarget( this.resolution.x, this.resolution.y, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat
        } );
        this.depthRenderTarget = this.normalRenderTarget.clone();

        this.depthMaterial = new THREE.MeshDepthMaterial();
        this.depthMaterial.depthPacking = THREE.RGBADepthPacking;
        this.depthMaterial.blending = THREE.NoBlending;

        this.normalMaterial = new THREE.MeshNormalMaterial();
        this.normalMaterial.blending = THREE.NoBlending;
    }

	if ( THREE.SuperSSAOShader === undefined ) {

		console.error( 'THREE.SuperSSAOPass relies on THREE.SuperSSAOShader' );

    }
    
    this.ssaoMaterial = new THREE.ShaderMaterial( {
		defines: Object.assign( {}, THREE.SuperSSAOShader.defines ),
		fragmentShader: THREE.SuperSSAOShader.fragmentShader,
		vertexShader: THREE.SuperSSAOShader.vertexShader,
		uniforms: THREE.UniformsUtils.clone( THREE.SuperSSAOShader.uniforms )
    } );
    this.ssaoMaterial.blending = THREE.NoBlending;

    this.ssaoMaterial.defines["NORMAL_DEPTH_TEX"] = this.normalDepth ? 1 : 0;
    if(this.normalDepth) {
        this.ssaoMaterial.uniforms["normalDepthTex"].value = this.normalDepthRenderTarget.texture;
    } else {
        this.ssaoMaterial.uniforms["tDepth"].value = this.depthRenderTarget.texture;
        this.ssaoMaterial.uniforms["tNormal"].value = this.normalRenderTarget.texture;
    }

    this.blurMaterial = new THREE.ShaderMaterial( {
		defines: Object.assign( {}, THREE.SuperSSAOBlurShader.defines ),
		fragmentShader: THREE.SuperSSAOBlurShader.fragmentShader,
		vertexShader: THREE.SuperSSAOBlurShader.vertexShader,
		uniforms: THREE.UniformsUtils.clone( THREE.SuperSSAOBlurShader.uniforms )
    } );
    this.blurMaterial.blending = THREE.NoBlending;

    this.blurMaterial.defines["NORMAL_DEPTH_TEX"] = this.normalDepth ? 1 : 0;
    if(this.normalDepth) {
        this.blurMaterial.uniforms["normalDepthTex"].value = this.normalDepthRenderTarget.texture;
    } else {
        this.blurMaterial.uniforms[ 'normalTex' ].value = this.normalRenderTarget.texture;
        this.blurMaterial.uniforms[ 'depthTex' ].value = this.depthRenderTarget.texture;
    }

    if ( THREE.CopyShader === undefined ) {

		console.error( 'THREE.SuperSSAOPass relies on THREE.CopyShader' );

	}

	this.materialCopy = new THREE.ShaderMaterial( {
		uniforms: THREE.UniformsUtils.clone( THREE.CopyShader.uniforms ),
		vertexShader: THREE.CopyShader.vertexShader,
		fragmentShader: THREE.CopyShader.fragmentShader,
		blending: THREE.NoBlending
	} );
	this.materialCopy.transparent = true;
	this.materialCopy.depthTest = false;
	this.materialCopy.depthWrite = false;
	// this.materialCopy.blending = THREE.CustomBlending;
	// this.materialCopy.blendSrc = THREE.DstColorFactor;
	// this.materialCopy.blendDst = THREE.ZeroFactor;
	// this.materialCopy.blendEquation = THREE.AddEquation;
	// this.materialCopy.blendSrcAlpha = THREE.DstAlphaFactor;
	// this.materialCopy.blendDstAlpha = THREE.ZeroFactor;
    // this.materialCopy.blendEquationAlpha = THREE.AddEquation;
    // 这里使用混色将ssao贴图绘制到结果中
    this.materialCopy.blending = THREE.CustomBlending;
	this.materialCopy.blendSrc = THREE.ZeroFactor;
	this.materialCopy.blendDst = THREE.SrcColorFactor;
	this.materialCopy.blendEquation = THREE.AddEquation;
	this.materialCopy.blendSrcAlpha = THREE.ZeroFactor;
	this.materialCopy.blendDstAlpha = THREE.SrcColorFactor;
	this.materialCopy.blendEquationAlpha = THREE.AddEquation;

    this.quadCamera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
	this.quadScene = new THREE.Scene();
	this.quad = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), null );
    this.quadScene.add( this.quad );
    
    this.oldClearColor = new THREE.Color();
    this.oldClearAlpha = 1;
    
    this.setNoiseSize(4);
    this.setKernelSize(12);

    this.setParameter('radius', 0.5);
    this.setParameter('bias', 0.5 / 50);
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
            this.renderOverride( renderer, this.normalDepthMaterial, this.normalDepthRenderTarget, 0x000000, 1.0 );
        } else {
            // Clear rule : far clipping plane in both RGBA and Basic encoding
            this.renderOverride( renderer, this.depthMaterial, this.depthRenderTarget, 0x000000, 1.0 );
            // Clear rule : default normal is facing the camera
            this.renderOverride( renderer, this.normalMaterial, this.normalRenderTarget, 0x7777ff, 1.0 );
        }
        
        // draw ssao
        this.ssaoMaterial.uniforms["gBufferTexSize"].value.copy(this.resolution);
        this.ssaoMaterial.uniforms['projection'].value.copy( this.camera.projectionMatrix );
        this.ssaoMaterial.uniforms['projectionInv'].value.getInverse( this.camera.projectionMatrix );
        this.ssaoMaterial.uniforms['viewInverseTranspose'].value.copy( this.camera.matrixWorld ).transpose();
        this.renderPass( renderer, this.ssaoMaterial, this.ssaoRenderTarget, 0xffffff, 1.0 );
        
        // blur
        this.blurMaterial.uniforms[ 'textureSize' ].value.copy(this.resolution);
        this.blurMaterial.uniforms['projection'].value.copy( this.camera.projectionMatrix );

        this.blurMaterial.uniforms[ 'tDiffuse' ].value = this.ssaoRenderTarget.texture;
        this.blurMaterial.uniforms[ 'direction' ].value = 0;
        this.renderPass( renderer, this.blurMaterial, this.blurIntermediateRenderTarget, 0xffffff, 1.0 );

        this.blurMaterial.uniforms[ 'tDiffuse' ].value = this.blurIntermediateRenderTarget.texture;
        this.blurMaterial.uniforms[ 'direction' ].value = 1;
        this.renderPass( renderer, this.blurMaterial, this.ssaoRenderTarget, 0xffffff, 1.0 );
        
        // copy
        this.materialCopy.uniforms[ 'tDiffuse' ].value = this.ssaoRenderTarget.texture;
        this.materialCopy.needsUpdate = true;
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
        this.ssaoMaterial.defines["KERNEL_SIZE"] = size;
        this.ssaoMaterial.uniforms["kernel"].value = generateKernel(size, undefined, true);
    },

    setNoiseSize: function(size) {
        var texture = this.ssaoMaterial.uniforms["noiseTex"].value;
        if(!texture) {
            texture = generateNoiseTexture(size);
            this.ssaoMaterial.uniforms["noiseTex"].value = texture;
        } else {
            texture.image.data = generateNoiseData(size);
            texture.image.width = size;
            texture.image.height = size;
            texture.needsUpdate = true;
        }

        this.ssaoMaterial.uniforms["noiseTexSize"].value.set(size, size);
    },

    setParameter: function(name, val) {
        if (name === 'noiseTexSize') {
            this.setNoiseSize(val);
        }
        else if (name === 'kernelSize') {
            this.setKernelSize(val);
        }
        else if (name === 'blurSize') {
            this.blurMaterial.uniforms['blurSize'].value = val;
        }
        else {
            this.ssaoMaterial.uniforms[name].value = val;
        }
    },

    dispose: function () {

		this.ssaoRenderTarget && this.ssaoRenderTarget.dispose();
        this.blurIntermediateRenderTarget && this.blurIntermediateRenderTarget.dispose();
        this.normalDepthRenderTarget && this.normalDepthRenderTarget.dispose();
        this.normalRenderTarget && this.normalRenderTarget.dispose();
        this.depthRenderTarget && this.depthRenderTarget.dispose();

	},

	setSize: function ( width, height ) {

        this.ssaoRenderTarget && this.ssaoRenderTarget.setSize(width, height);
        this.blurIntermediateRenderTarget && this.blurIntermediateRenderTarget.setSize(width, height);
        this.normalDepthRenderTarget && this.normalDepthRenderTarget.setSize(width, height);
        this.normalRenderTarget && this.normalRenderTarget.setSize(width, height);
        this.depthRenderTarget && this.depthRenderTarget.setSize(width, height);

	}
});

