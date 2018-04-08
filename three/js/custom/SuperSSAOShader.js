/**
 * @author shawn / http://www.halflab.me
 *
 * Super SSAO shader
 */

THREE.SuperSSAOShader = {

	defines: {
		'PERSPECTIVE_CAMERA': 1,
		'DEPTH_PACKING': 1,
		'KERNEL_SIZE': 64,
		'EPSILON': 1e-6
	},

	uniforms: {
        'tDepth': { value: null },
		'tNormal': { value: null },
		'noiseTex': { value: null },
		'gBufferTexSize': { value: new THREE.Vector2() },
		'noiseTexSize': { value: new THREE.Vector2(512, 512) },
		'projection': { value: new THREE.Matrix4() },
		'projectionInv': { value: new THREE.Matrix4() },
		'viewInverseTranspose': { value: new THREE.Matrix4() },
		'kernel': {value: null},
		'radius': {value: 1.5},
		'power': {value: 2},
		'bias': {value: 0.01}
    },

	vertexShader: [

		"varying vec2 vUv;",

		"void main() {",

			"vUv = uv;",

			"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

		"}"

	].join( "\n" ),

	fragmentShader: [

		"varying vec2 vUv;",

		"uniform sampler2D tDepth;",

		"uniform sampler2D tNormal;",

		"uniform sampler2D noiseTex;",

		"uniform vec2 gBufferTexSize;",

		"uniform vec2 noiseTexSize;",

		"uniform mat4 projection;",

		"uniform mat4 projectionInv;",

		"uniform mat4 viewInverseTranspose;",

		"uniform vec3 kernel[KERNEL_SIZE];",

		"uniform float radius;",

		"uniform float power;",

		"uniform float bias;",

		"#include <packing>",

		"float getDepth( const in vec2 screenPosition ) {",
		"	#if DEPTH_PACKING == 1",
		"	return 1.0 - unpackRGBAToDepth( texture2D( tDepth, screenPosition ) );",
		"	#else",
		"	return 1.0 - texture2D( tDepth, screenPosition ).x;",
		"	#endif",
		"}",

		"vec3 getViewNormal( const in vec2 screenPosition ) {",
		"	return unpackRGBToNormal( texture2D( tNormal, screenPosition ).xyz );",
		"}",

		"float ssaoEstimator(in mat3 kernelBasis, in vec3 originPos) {",
			"float occlusion = 0.0;",
		
			"for (int i = 0; i < KERNEL_SIZE; i++) {",
				"vec3 samplePos = kernelBasis * kernel[i];",
				"samplePos = samplePos * radius + originPos;",
		
				"vec4 texCoord = projection * vec4(samplePos, 1.0);",
				"texCoord.xy /= texCoord.w;",
		
				"float sampleDepth = getDepth(texCoord.xy * 0.5 + 0.5);",
		
				"sampleDepth = projection[3][2] / (sampleDepth * projection[2][3] - projection[2][2]);",
		
				"float rangeCheck = smoothstep(0.0, 1.0, radius / abs(originPos.z - sampleDepth));",
				"occlusion += rangeCheck * step(samplePos.z, sampleDepth - bias);",
			"}",
			"occlusion = 1.0 - occlusion / float(KERNEL_SIZE);",
			"return pow(occlusion, power);",
		"}",

		"void main() {",

			"float centerDepth = getDepth( vUv );",
			"if( centerDepth >= ( 1.0 - EPSILON ) ) {",
			"	discard;",
			"}",

			"vec3 N = getViewNormal( vUv );",
		
			// Convert to view space
			// "N = (viewInverseTranspose * vec4(N, 0.0)).xyz;",

			"vec4 projectedPos = vec4(vUv * 2.0 - 1.0, centerDepth, 1.0);",
			"vec4 p4 = projectionInv * projectedPos;",
		
			"vec3 position = p4.xyz / p4.w;",
		
			"vec2 noiseTexCoord = gBufferTexSize / vec2(noiseTexSize) * vUv;",
			"vec3 rvec = texture2D(noiseTex, noiseTexCoord).rgb * 2.0 - 1.0;",
		
			// Tangent
			"vec3 T = normalize(rvec - N * dot(rvec, N));",
			// Bitangent
			"vec3 BT = normalize(cross(N, T));",
			"mat3 kernelBasis = mat3(T, BT, N);",
		
			"float ao = ssaoEstimator(kernelBasis, position);",
			"ao = clamp(1.0 - (1.0 - ao) * 1.0, 0.0, 1.0);",
			"gl_FragColor = vec4(vec3(ao), 1.0);",

			// "gl_FragColor = vec4( 1.0, 0.0, 0.0, 0.5 );",

			// "gl_FragColor = texture2D( tDepth, vUv );",

			// "gl_FragColor = texture2D( tNormal, vUv );",

			// "gl_FragColor = texture2D( noiseTex, vUv );",

		"}"

	].join( "\n" )

};

THREE.SuperSSAOBlurShader = {

	defines: {
		'BLUR_SIZE': 4
	},

	uniforms: {
		'tDiffuse': { value: null },
		'textureSize': { value: new THREE.Vector2()}
	},
	
	vertexShader: [

		"varying vec2 vUv;",

		"void main() {",

			"vUv = uv;",

			"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

		"}"

	].join( "\n" ),

	fragmentShader: [

		"varying vec2 vUv;",

		"uniform vec2 textureSize;",

		"uniform sampler2D tDiffuse;",

		"void main() {",

			"float kernel[5];",
			"kernel[0] = 0.122581;",
			"kernel[1] = 0.233062;",
			"kernel[2] = 0.288713;",
			"kernel[3] = 0.233062;",
			"kernel[4] = 0.122581;",

			"vec2 texelSize = 1.0 / textureSize;",

			"vec4 color = vec4(0.0);",
			"vec4 centerColor = texture2D(tDiffuse, vUv);",
			"float weightAll = 0.0;",
			"for (int x = 0; x < 5; x++) {",
				"for (int y = 0; y < 5; y++) {",
					"vec2 coord = (vec2(float(x) - 2.0, float(y) - 2.0)) * texelSize + vUv;",
					"vec4 sample = texture2D(tDiffuse, coord);",
					// http://stackoverflow.com/questions/6538310/anyone-know-where-i-can-find-a-glsl-implementation-of-a-bilateral-filter-blur
					// PENDING
					// "float closeness = 1.0 - distance(sample, centerColor) / sqrt(3.0);",
					"float weight = kernel[x];",
					"color += weight * sample;",
					"weightAll += weight;",
				"}",
			"}",
		
			"gl_FragColor = color / weightAll;",

		"}"

	].join( "\n" )
};

