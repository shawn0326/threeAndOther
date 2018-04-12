// 基于Temporal的SSAO
// 可以通过设置accumulate来实现ssao的单独抗锯齿

THREE.TemporalSSAOPass = function ( scene, camera, resolution, normalDepth ) {

	if ( THREE.SuperSSAOPass === undefined ) {

		console.error( "THREE.TemporalSSAOPass relies on THREE.SuperSSAOPass" );

	}

    THREE.SuperSSAOPass.call( this, scene, camera, resolution, normalDepth );

    if ( THREE.CopyShader === undefined ) console.error( "THREE.TemporalSSAOPass relies on THREE.CopyShader" );

	var copyShader = THREE.CopyShader;
    
    this.temporalCopyMaterial = new THREE.ShaderMaterial(	{
		uniforms: THREE.UniformsUtils.clone( copyShader.uniforms ),
		vertexShader: copyShader.vertexShader,
		fragmentShader: copyShader.fragmentShader,
		premultipliedAlpha: true,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthTest: false,
		depthWrite: false
	} );

    
    this.accumulate = false;
    this.unbiased = true;

};

THREE.TemporalSSAOPass.prototype = Object.assign( Object.create( THREE.SuperSSAOPass.prototype ), {

    constructor: THREE.TemporalSSAOPass,

    render: function( renderer, writeBuffer, readBuffer, delta ) {

        if ( ! this.accumulate ) {

			THREE.SuperSSAOPass.prototype.render.call( this, renderer, writeBuffer, readBuffer, delta );

			this.accumulateIndex = - 1;
			return;

        }

        var jitterOffsets = THREE.TemporalSSAOPass.JitterVectors[ 5 ];

        if ( ! this.sampleRenderTarget ) {

			this.sampleRenderTarget = new THREE.WebGLRenderTarget( readBuffer.width, readBuffer.height );
			this.sampleRenderTarget.texture.name = "TemporalSSAOPass.sample";

		}

		if ( ! this.holdRenderTarget ) {

			this.holdRenderTarget = new THREE.WebGLRenderTarget( readBuffer.width, readBuffer.height );
			this.holdRenderTarget.texture.name = "TemporalSSAOPass.hold";

        }

        if ( ! this.resultRenderTarget ) {

			this.resultRenderTarget = new THREE.WebGLRenderTarget( readBuffer.width, readBuffer.height );
			this.resultRenderTarget.texture.name = "TemporalSSAOPass.result";

        }

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
        
        if ( this.accumulate && this.accumulateIndex === - 1 ) {

            if(this.normalDepth) {
                this.normalDepthPrePass.update(renderer);
            } else {
                this.normalPrePass.update(renderer);
                this.depthPrePass.update(renderer);
            }
            
            this.ssaoPrePass.update(renderer);

            // 将ssao绘制到hold
            this.materialCopy.uniforms[ 'tDiffuse' ].value = this.ssaoPrePass.getTexture();
            this.materialCopy.blending = THREE.NoBlending;
            this.renderPass( renderer, this.materialCopy, this.holdRenderTarget );

			this.accumulateIndex = 0;

        }
        
        var baseSampleWeight = 1.0 / jitterOffsets.length;
        var roundingRange = 1 / 32;

        if ( this.accumulateIndex >= 0 && this.accumulateIndex < jitterOffsets.length ) {
            var sampleWeight = baseSampleWeight;

            if ( this.unbiased ) {

                // the theory is that equal weights for each sample lead to an accumulation of rounding errors.
                // The following equation varies the sampleWeight per sample so that it is uniformly distributed
                // across a range of values whose rounding errors cancel each other out.

                var uniformCenteredDistribution = ( - 0.5 + ( this.accumulateIndex + 0.5 ) / jitterOffsets.length );
                sampleWeight += roundingRange * uniformCenteredDistribution;

            }

            this.temporalCopyMaterial.uniforms[ "opacity" ].value = sampleWeight;
            this.temporalCopyMaterial.uniforms[ "tDiffuse" ].value = this.ssaoPrePass.getTexture();

            var j = this.accumulateIndex;
            var jitterOffset = jitterOffsets[ j ];
            
            if ( this.camera.setViewOffset ) {

                this.camera.setViewOffset( readBuffer.width, readBuffer.height,
                    jitterOffset[ 0 ] * 0.0625, jitterOffset[ 1 ] * 0.0625,   // 0.0625 = 1 / 16
                    readBuffer.width, readBuffer.height );

            }

            this.ssaoPrePass.ssaoMaterial.uniforms["kernel"].value = this._kernels[this.accumulateIndex % this._kernels.length];

            if(this.normalDepth) {
                this.normalDepthPrePass.update(renderer);
            } else {
                this.normalPrePass.update(renderer);
                this.depthPrePass.update(renderer);
            }
            
            this.ssaoPrePass.update(renderer);
            this.renderPass( renderer, this.temporalCopyMaterial, this.sampleRenderTarget, ( this.accumulateIndex === 0 ) ? 0x000000 : undefined, ( this.accumulateIndex === 0 ) ? 0 : undefined);

            this.accumulateIndex ++;

            if ( this.camera.clearViewOffset ) this.camera.clearViewOffset();
        }
        
        var accumulationWeight = this.accumulateIndex * baseSampleWeight;

        if ( this.unbiased ) {
			for(var i = 0; i < this.accumulateIndex; i++) {
				var uniformCenteredDistribution = ( - 0.5 + ( i + 0.5 ) / jitterOffsets.length );
				accumulationWeight += roundingRange * uniformCenteredDistribution;
			}
        }
        
        if ( accumulationWeight > 0 ) {

			this.temporalCopyMaterial.uniforms[ "opacity" ].value = 1.0;
			this.temporalCopyMaterial.uniforms[ "tDiffuse" ].value = this.sampleRenderTarget.texture;
            this.renderPass( renderer, this.temporalCopyMaterial, this.resultRenderTarget, 0x000000, 0);

		}

		if ( accumulationWeight < 1.0 ) {

			this.temporalCopyMaterial.uniforms[ "opacity" ].value = 1.0 - accumulationWeight;
			this.temporalCopyMaterial.uniforms[ "tDiffuse" ].value = this.holdRenderTarget.texture;
            this.renderPass( renderer, this.temporalCopyMaterial, this.resultRenderTarget, ( accumulationWeight === 0 ) ? 0x000000 : undefined, ( accumulationWeight === 0 ) ? 0 : undefined);

        }
        
        // copy ssao to result
        this.materialCopy.uniforms[ 'tDiffuse' ].value = this.resultRenderTarget.texture;
        this.materialCopy.blending = THREE.CustomBlending;
        this.renderPass( renderer, this.materialCopy, this.renderToScreen ? null : readBuffer );

        // restore renderer clear states
        renderer.setClearColor( this.oldClearColor, this.oldClearAlpha );
		renderer.autoClear = oldAutoClear;

    },

    setKernelSize: function(size) {
        this._kernelSize = size;
        this.ssaoPrePass.ssaoMaterial.defines["KERNEL_SIZE"] = size;
        this._kernels = this._kernels || [];
        for (var i = 0; i < 30; i++) {
            this._kernels[i] = generateKernel(size, i * size, true);
        }

        this.ssaoPrePass.ssaoMaterial.uniforms["kernel"].value = this._kernels[0];
    }
});

// These jitter vectors are specified in integers because it is easier.
// I am assuming a [-8,8) integer grid, but it needs to be mapped onto [-0.5,0.5)
// before being used, thus these integers need to be scaled by 1/16.
//
// Sample patterns reference: https://msdn.microsoft.com/en-us/library/windows/desktop/ff476218%28v=vs.85%29.aspx?f=255&MSPPError=-2147217396
THREE.TemporalSSAOPass.JitterVectors = [
	[
		[ 0, 0 ]
	],
	[
		[ 4, 4 ], [ - 4, - 4 ]
	],
	[
		[ - 2, - 6 ], [ 6, - 2 ], [ - 6, 2 ], [ 2, 6 ]
	],
	[
		[ 1, - 3 ], [ - 1, 3 ], [ 5, 1 ], [ - 3, - 5 ],
		[ - 5, 5 ], [ - 7, - 1 ], [ 3, 7 ], [ 7, - 7 ]
	],
	[
		[ 1, 1 ], [ - 1, - 3 ], [ - 3, 2 ], [ 4, - 1 ],
		[ - 5, - 2 ], [ 2, 5 ], [ 5, 3 ], [ 3, - 5 ],
		[ - 2, 6 ], [ 0, - 7 ], [ - 4, - 6 ], [ - 6, 4 ],
		[ - 8, 0 ], [ 7, - 4 ], [ 6, 7 ], [ - 7, - 8 ]
	],
	[
		[ - 4, - 7 ], [ - 7, - 5 ], [ - 3, - 5 ], [ - 5, - 4 ],
		[ - 1, - 4 ], [ - 2, - 2 ], [ - 6, - 1 ], [ - 4, 0 ],
		[ - 7, 1 ], [ - 1, 2 ], [ - 6, 3 ], [ - 3, 3 ],
		[ - 7, 6 ], [ - 3, 6 ], [ - 5, 7 ], [ - 1, 7 ],
		[ 5, - 7 ], [ 1, - 6 ], [ 6, - 5 ], [ 4, - 4 ],
		[ 2, - 3 ], [ 7, - 2 ], [ 1, - 1 ], [ 4, - 1 ],
		[ 2, 1 ], [ 6, 2 ], [ 0, 4 ], [ 4, 4 ],
		[ 2, 5 ], [ 7, 5 ], [ 5, 6 ], [ 3, 7 ]
	]
];