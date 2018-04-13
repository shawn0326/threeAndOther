/**
 * Super SSAO shader
 */

THREE.SuperSSAOShader = {

	defines: {
		'NORMAL_DEPTH_TEX': 0,
		'PERSPECTIVE_CAMERA': 1,
		'DEPTH_PACKING': 1,
		'KERNEL_SIZE': 64,
		'EPSILON': 1e-6,
		// 'ALCHEMY': 1
	},

	uniforms: {
        'tDepth': { value: null },
		'tNormal': { value: null },
		'normalDepthTex': { value: null },
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

		// "#if NORMAL_DEPTH_TEX == 1",
			"uniform sampler2D normalDepthTex;",
		// "#else",
			"uniform sampler2D tDepth;",
			"uniform sampler2D tNormal;",
		// "#endif",

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
			"#if NORMAL_DEPTH_TEX == 1",
				"return texture2D( normalDepthTex, screenPosition ).w;",
			"#else",
				"#if DEPTH_PACKING == 1",
					"return unpackRGBAToDepth( texture2D( tDepth, screenPosition ) );",
				"#else",
					"return texture2D( tDepth, screenPosition ).x;",
				"#endif",
			"#endif",
		"}",

		"vec3 getViewNormal( const in vec2 screenPosition ) {",
			"#if NORMAL_DEPTH_TEX == 1",
				"return texture2D( normalDepthTex, screenPosition ).xyz * 2.0 - 1.0;",
			"#else",
				"return unpackRGBToNormal( texture2D( tNormal, screenPosition ).xyz );",
			"#endif",
		"}",

		"float ssaoEstimator(in mat3 kernelBasis, in vec3 originPos, in vec3 N) {",
			"float occlusion = 0.0;",

			"for (int i = 0; i < KERNEL_SIZE; i++) {",
				"vec3 samplePos = kernelBasis * kernel[i];",
				"samplePos = samplePos * radius + originPos;",

				"vec4 texCoord = projection * vec4(samplePos, 1.0);",
				"texCoord.xy /= texCoord.w;",

				"float sampleDepth = getDepth(texCoord.xy * 0.5 + 0.5);",
				"float z = sampleDepth * 2.0 - 1.0;",

				"#ifdef ALCHEMY",
			        "vec4 projectedPos = vec4(texCoord.xy * 2.0 - 1.0, z, 1.0);",
			        "vec4 p4 = projectionInv * projectedPos;",
			        "p4.xyz /= p4.w;",
			        "vec3 cDir = p4.xyz - originPos;",

			        "float vv = dot(cDir, cDir);",
			        "float vn = dot(cDir, N);",

			        "float radius2 = radius * radius;",

			        "vn = max(vn + p4.z * bias, 0.0);",
			        "float f = max(radius2 - vv, 0.0) / radius2;",
			        "occlusion += f * f * f * max(vn / (0.01 + vv), 0.0);",
				"#else",
					// just for perspective camera
					"z = projection[3][2] / (z * projection[2][3] - projection[2][2]);",

					"float rangeCheck = smoothstep(0.0, 1.0, radius / abs(originPos.z - z));",
					"occlusion += rangeCheck * step(samplePos.z, z - bias);",

				"#endif",
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

			"float ao = ssaoEstimator(kernelBasis, position, N);",
			"ao = clamp(1.0 - (1.0 - ao) * intensity, 0.0, 1.0);",
			"gl_FragColor = vec4(vec3(ao), 1.0);",

			// "gl_FragColor = texture2D( normalDepthTex, vUv );",

		"}"

	].join( "\n" )

};

THREE.SuperSSAOBlurShader = {

	defines: {
		'NORMAL_DEPTH_TEX': 1,
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
		'normalDepthTex': { value: null },
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

		"#if NORMALTEX_ENABLED == 1",
			"#if NORMAL_DEPTH_TEX == 1",
				"uniform sampler2D normalDepthTex;",
			"#else",
				"uniform sampler2D normalTex;",
			"#endif",
			"vec3 getViewNormal( const in vec2 screenPosition ) {",
				"#if NORMAL_DEPTH_TEX == 1",
					"return texture2D( normalDepthTex, screenPosition ).xyz * 2.0 - 1.0;",
				"#else",
					"return unpackRGBToNormal( texture2D( normalTex, screenPosition ).xyz );",
				"#endif",
			"}",
		"#endif",

		"#if DEPTHTEX_ENABLED == 1",
			"#if NORMAL_DEPTH_TEX == 1 && NORMALTEX_ENABLED == 0",
				"uniform sampler2D normalDepthTex;",
			"#else",
				"uniform sampler2D depthTex;",
			"#endif",
			"uniform mat4 projection;",
			"uniform float depthRange;",

			"float getDepth( const in vec2 screenPosition ) {",
				"#if NORMAL_DEPTH_TEX == 1",
					"return texture2D( normalDepthTex, screenPosition ).w;",
				"#else",
					"#if DEPTH_PACKING == 1",
						"return unpackRGBAToDepth( texture2D( depthTex, screenPosition ) );",
					"#else",
						"return texture2D( depthTex, screenPosition ).x;",
					"#endif",
				"#endif",
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

			"#if NORMALTEX_ENABLED == 1",
				"vec3 centerNormal = getViewNormal(vUv);",
			"#endif",
			"#if DEPTHTEX_ENABLED == 1",
				"float centerDepth = getLinearDepth(vUv);",
			"#endif",

			"for (int i = 0; i < 5; i++) {",
				"vec2 coord = clamp(vUv + vec2(float(i) - 2.0) * off, vec2(0.0), vec2(1.0));",
				"float w = kernel[i];",

				"#if NORMALTEX_ENABLED == 1",
					"vec3 normal = getViewNormal(coord);",
					"w *= clamp(dot(normal, centerNormal), 0.0, 1.0);",
				"#endif",
				"#if DEPTHTEX_ENABLED == 1",
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

