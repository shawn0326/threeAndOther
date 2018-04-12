


THREE.PrePass = function(scene, camera) {
    this.scene = scene;
    this.camera = camera;
}

Object.assign( THREE.PrePass.prototype, {

    update: function(renderer) {
        
    },

    setSize: function(width, height) {
        
    },

    dispose: function() {
        
    },

    getTexture: function() {
        
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
        
    }
})

THREE.NormalPrePass = function(scene, camera, resolution) {
    THREE.PrePass.call( this, scene, camera);

    var resolution = ( resolution !== undefined ) ? new THREE.Vector2( resolution.x, resolution.y ) : new THREE.Vector2( 256, 256 );

    this.normalRenderTarget = new THREE.WebGLRenderTarget( resolution.x, resolution.y, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat
    } );

    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.normalMaterial.blending = THREE.NoBlending;
}

THREE.NormalPrePass.prototype = Object.assign( Object.create( THREE.PrePass.prototype ), {

    constructor: THREE.NormalPrePass,

    update: function(renderer) {
        // Clear rule : default normal is facing the camera
        this.renderOverride( renderer, this.normalMaterial, this.normalRenderTarget, 0x7777ff, 1.0 );
    },

    setSize: function(width, height) {
        this.normalRenderTarget.setSize(width, height);
    },

    dispose: function() {
        this.normalRenderTarget.dispose();
    },

    getTexture: function() {
        return this.normalRenderTarget.texture;
    }
});

THREE.DepthPrePass = function(scene, camera, resolution) {
    THREE.PrePass.call( this, scene, camera);

    var resolution = ( resolution !== undefined ) ? new THREE.Vector2( resolution.x, resolution.y ) : new THREE.Vector2( 256, 256 );

    this.depthRenderTarget = new THREE.WebGLRenderTarget( resolution.x, resolution.y, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat
    } );

    this.depthMaterial = new THREE.MeshDepthMaterial();
    this.depthMaterial.depthPacking = THREE.RGBADepthPacking;
    this.depthMaterial.blending = THREE.NoBlending;
}

THREE.DepthPrePass.prototype = Object.assign( Object.create( THREE.PrePass.prototype ), {

    constructor: THREE.DepthPrePass,

    update: function(renderer) {
        // Clear rule : far clipping plane in both RGBA and Basic encoding
        this.renderOverride( renderer, this.depthMaterial, this.depthRenderTarget, 0x000000, 1.0 );
    },

    setSize: function(width, height) {
        this.depthRenderTarget.setSize(width, height);
    },

    dispose: function() {
        this.depthRenderTarget.dispose();
    },

    getTexture: function() {
        return this.depthRenderTarget.texture;
    }
});

THREE.NormalDepthPrePass = function(scene, camera, resolution) {
    THREE.PrePass.call( this, scene, camera);

    var resolution = ( resolution !== undefined ) ? new THREE.Vector2( resolution.x, resolution.y ) : new THREE.Vector2( 256, 256 );

    if ( THREE.NormalDepthShader === undefined ) {

        console.error( 'THREE.NormalDepthPrePass relies on THREE.NormalDepthShader' );

    }

    this.normalDepthRenderTarget = new THREE.WebGLRenderTarget( resolution.x, resolution.y, {
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
}

THREE.NormalDepthPrePass.prototype = Object.assign( Object.create( THREE.PrePass.prototype ), {

    constructor: THREE.NormalDepthPrePass,

    update: function(renderer) {
        this.renderOverride( renderer, this.normalDepthMaterial, this.normalDepthRenderTarget, 0x000000, 1.0 );
    },

    setSize: function(width, height) {
        this.normalDepthRenderTarget.setSize(width, height);
    },

    dispose: function() {
        this.normalDepthRenderTarget.dispose();   
    },

    getTexture: function() {
        return this.normalDepthRenderTarget.texture;
    }
});

THREE.SSAOPrePass = function(scene, camera, resolution, normalDepthTexture, normalTexture, depthTexture) {
    THREE.PrePass.call( this, scene, camera);

    var resolution = ( resolution !== undefined ) ? new THREE.Vector2( resolution.x, resolution.y ) : new THREE.Vector2( 256, 256 );

    this.ssaoRenderTarget = new THREE.WebGLRenderTarget( resolution.x, resolution.y, {
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		format: THREE.RGBAFormat
	} );
	this.blurIntermediateRenderTarget = this.ssaoRenderTarget.clone();

	if ( THREE.SuperSSAOShader === undefined ) {

		console.error( 'THREE.SSAOPrePass relies on THREE.SuperSSAOShader' );

    }
    
    this.ssaoMaterial = new THREE.ShaderMaterial( {
		defines: Object.assign( {}, THREE.SuperSSAOShader.defines ),
		fragmentShader: THREE.SuperSSAOShader.fragmentShader,
		vertexShader: THREE.SuperSSAOShader.vertexShader,
		uniforms: THREE.UniformsUtils.clone( THREE.SuperSSAOShader.uniforms )
    } );
    this.ssaoMaterial.blending = THREE.NoBlending;

    this.ssaoMaterial.defines["NORMAL_DEPTH_TEX"] = !!normalDepthTexture ? 1 : 0;
    if(!!normalDepthTexture) {
        this.ssaoMaterial.uniforms["normalDepthTex"].value = normalDepthTexture;
    } else {
        this.ssaoMaterial.uniforms["tDepth"].value = depthTexture;
        this.ssaoMaterial.uniforms["tNormal"].value = normalTexture;
    }
    this.ssaoMaterial.uniforms["gBufferTexSize"].value.copy(resolution);

    this.blurMaterial = new THREE.ShaderMaterial( {
		defines: Object.assign( {}, THREE.SuperSSAOBlurShader.defines ),
		fragmentShader: THREE.SuperSSAOBlurShader.fragmentShader,
		vertexShader: THREE.SuperSSAOBlurShader.vertexShader,
		uniforms: THREE.UniformsUtils.clone( THREE.SuperSSAOBlurShader.uniforms )
    } );
    this.blurMaterial.blending = THREE.NoBlending;

    this.blurMaterial.defines["NORMAL_DEPTH_TEX"] = !!normalDepthTexture ? 1 : 0;
    if(!!normalDepthTexture) {
        this.blurMaterial.uniforms["normalDepthTex"].value = normalDepthTexture;
    } else {
        this.blurMaterial.uniforms[ 'normalTex' ].value = normalTexture;
        this.blurMaterial.uniforms[ 'depthTex' ].value = depthTexture;
    }
    this.blurMaterial.uniforms[ 'textureSize' ].value.copy(resolution);

    this.quadCamera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
	this.quadScene = new THREE.Scene();
	this.quad = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), null );
    this.quadScene.add( this.quad );

}

THREE.SSAOPrePass.prototype = Object.assign( Object.create( THREE.PrePass.prototype ), {

    constructor: THREE.SSAOPrePass,

    update: function(renderer) {
        // draw ssao
        this.ssaoMaterial.uniforms['projection'].value.copy( this.camera.projectionMatrix );
        this.ssaoMaterial.uniforms['projectionInv'].value.getInverse( this.camera.projectionMatrix );
        this.ssaoMaterial.uniforms['viewInverseTranspose'].value.copy( this.camera.matrixWorld ).transpose();
        this.renderPass( renderer, this.ssaoMaterial, this.ssaoRenderTarget, 0xffffff, 1.0 );
        
        // blur
        this.blurMaterial.uniforms['projection'].value.copy( this.camera.projectionMatrix );

        this.blurMaterial.uniforms[ 'tDiffuse' ].value = this.ssaoRenderTarget.texture;
        this.blurMaterial.uniforms[ 'direction' ].value = 0;
        this.renderPass( renderer, this.blurMaterial, this.blurIntermediateRenderTarget, 0xffffff, 1.0 );

        this.blurMaterial.uniforms[ 'tDiffuse' ].value = this.blurIntermediateRenderTarget.texture;
        this.blurMaterial.uniforms[ 'direction' ].value = 1;
        this.renderPass( renderer, this.blurMaterial, this.ssaoRenderTarget, 0xffffff, 1.0 );
    },

    setSize: function(width, height) {
        this.ssaoRenderTarget.setSize(width, height);
        this.blurIntermediateRenderTarget.setSize(width, height);
        this.ssaoMaterial.uniforms["gBufferTexSize"].value.set(width, height);
        this.blurMaterial.uniforms[ 'textureSize' ].value.set(width, height);
    },

    dispose: function() {
        this.ssaoRenderTarget.dispose();
        this.blurIntermediateRenderTarget.dispose();
    },

    getTexture: function() {
        return this.ssaoRenderTarget.texture;
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

	}
});