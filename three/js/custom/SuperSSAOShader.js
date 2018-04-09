/**
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
		'noiseTexSize': { value: new THREE.Vector2(4, 4) },
		'projection': { value: new THREE.Matrix4() },
		'projectionInv': { value: new THREE.Matrix4() },
		'viewInverseTranspose': { value: new THREE.Matrix4() },
		'kernel': {value: null},
		'radius': {value: 1},
		'power': {value: 1},
		'bias': {value: 0.01},
		'intensity': {value: 1}
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

		"uniform float intensity;",

		"#include <packing>",

		"float getDepth( const in vec2 screenPosition ) {",
		"	#if DEPTH_PACKING == 1",
		"	return unpackRGBAToDepth( texture2D( tDepth, screenPosition ) );",
		"	#else",
		"	return texture2D( tDepth, screenPosition ).x;",
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
				"float z = sampleDepth * 2.0 - 1.0;",
		
				// just for perspective camera
				"z = projection[3][2] / (z * projection[2][3] - projection[2][2]);",
		
				"float rangeCheck = smoothstep(0.0, 1.0, radius / abs(originPos.z - z));",
				"occlusion += rangeCheck * step(samplePos.z, z - bias);",
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
		
			"vec2 noiseTexCoord = gBufferTexSize / vec2(noiseTexSize) * vUv;",
			"vec3 rvec = texture2D(noiseTex, noiseTexCoord).rgb * 2.0 - 1.0;",
		
			// Tangent
			"vec3 T = normalize(rvec - N * dot(rvec, N));",
			// Bitangent
			"vec3 BT = normalize(cross(N, T));",
			"mat3 kernelBasis = mat3(T, BT, N);",

			// view position
			"float z = centerDepth * 2.0 - 1.0;",
			"vec4 projectedPos = vec4(vUv * 2.0 - 1.0, z, 1.0);",
			"vec4 p4 = projectionInv * projectedPos;",
			"vec3 position = p4.xyz / p4.w;",
		
			"float ao = ssaoEstimator(kernelBasis, position);",
			"ao = clamp(1.0 - (1.0 - ao) * intensity, 0.0, 1.0);",
			"gl_FragColor = vec4(vec3(ao), 1.0);",

		"}"

	].join( "\n" )

};

THREE.SuperSSAOBlurShader = {

	defines: {
		'NORMALTEX_ENABLED': 1,
		'DEPTHTEX_ENABLED': 1,
		'DEPTH_PACKING': 1
	},

	uniforms: {
		'tDiffuse': { value: null },
		'textureSize': { value: new THREE.Vector2()},
		'direction': { value: 0},
		'blurSize': {value: 1},
		'depthTex': { value: null },
		'normalTex': { value: null },
		'projection': { value: new THREE.Matrix4() },
		'depthRange': { value: 0.05}
	},
	
	vertexShader: [

		"varying vec2 vUv;",

		"void main() {",

			"vUv = uv;",

			"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

		"}"

	].join( "\n" ),

	fragmentShader: [

		"#include <packing>",

		"varying vec2 vUv;",

		"uniform vec2 textureSize;",
		"uniform float blurSize;",

		"uniform sampler2D tDiffuse;",

		// 0 horizontal, 1 vertical
		"uniform int direction;",

		"#ifdef NORMALTEX_ENABLED",
			"uniform sampler2D normalTex;",
			"vec3 getViewNormal( const in vec2 screenPosition ) {",
			"	return unpackRGBToNormal( texture2D( normalTex, screenPosition ).xyz );",
			"}",
		"#endif",

		"#ifdef DEPTHTEX_ENABLED",
			"uniform sampler2D depthTex;",
			"uniform mat4 projection;",
			"uniform float depthRange;",

			"float getDepth( const in vec2 screenPosition ) {",
			"	#if DEPTH_PACKING == 1",
			"	return unpackRGBAToDepth( texture2D( depthTex, screenPosition ) );",
			"	#else",
			"	return texture2D( depthTex, screenPosition ).x;",
			"	#endif",
			"}",

			"float getLinearDepth(vec2 coord)",
			"{",
				"float depth = getDepth(coord) * 2.0 - 1.0;",
				"return projection[3][2] / (depth * projection[2][3] - projection[2][2]);",
			"}",
		"#endif",

		"void main() {",

			"float kernel[5];",
			"kernel[0] = 0.122581;",
			"kernel[1] = 0.233062;",
			"kernel[2] = 0.288713;",
			"kernel[3] = 0.233062;",
			"kernel[4] = 0.122581;",

			"vec2 off = vec2(0.0);",
			"if (direction == 0) {",
				"off[0] = blurSize / textureSize.x;",
			"}",
			"else {",
				"off[1] = blurSize / textureSize.y;",
			"}",

			"float sum = 0.0;",
			"float weightAll = 0.0;",

			"#ifdef NORMALTEX_ENABLED",
				"vec3 centerNormal = getViewNormal(vUv);",
			"#endif",
			"#ifdef DEPTHTEX_ENABLED",
				"float centerDepth = getLinearDepth(vUv);",
			"#endif",
			
			"for (int i = 0; i < 5; i++) {",
				"vec2 coord = clamp(vUv + vec2(float(i) - 2.0) * off, vec2(0.0), vec2(1.0));",
				"float w = kernel[i];",

				"#ifdef NORMALTEX_ENABLED",
					"vec3 normal = getViewNormal(coord);",
					"w *= clamp(dot(normal, centerNormal), 0.0, 1.0);",
				"#endif",
				"#ifdef DEPTHTEX_ENABLED",
					"float d = getLinearDepth(coord);",
					// PENDING Better equation?
					"w *= (1.0 - smoothstep(abs(centerDepth - d) / depthRange, 0.0, 1.0));",
				"#endif",

				"weightAll += w;",
				"sum += w * texture2D(tDiffuse, coord).r;",
			"}",
		
			"gl_FragColor = vec4(vec3(sum / weightAll), 1.0);",

		"}"

	].join( "\n" )
};

