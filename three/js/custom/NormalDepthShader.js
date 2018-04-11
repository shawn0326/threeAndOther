/**
 * normal depth shader
 */

THREE.NormalDepthShader = {

    defines: {
        
    },
    
    uniforms: {
        
    },

    vertexShader: [

		"varying vec3 vNormal;",
        "varying vec4 vPosition;",

        "#include <morphtarget_pars_vertex>",
        "#include <skinning_pars_vertex>",

		"void main() {",

			"#include <begin_vertex>",
			"#include <beginnormal_vertex>",
			"#include <skinbase_vertex>",
			"#include <skinnormal_vertex>",
			"#include <defaultnormal_vertex>",
			"#include <morphtarget_vertex>",
			"#include <skinning_vertex>",
			"#include <project_vertex>",

			"	vNormal = normalize( transformedNormal );",
			"	vPosition = gl_Position;",

		"}"

    ].join( "\n" ),

    fragmentShader: [

		"varying vec3 vNormal;",
		"varying vec4 vPosition;",

        "void main() {",
        
            "vec3 normal = vNormal;",
            "vec4 position = vPosition;",

            "vec4 packedNormalDepth;",
            "packedNormalDepth.xyz = normalize(normal) * 0.5 + 0.5;",
            "packedNormalDepth.w = position.z / position.w;",

            "gl_FragColor = packedNormalDepth;",

		"}"

    ].join( "\n" )
    

}