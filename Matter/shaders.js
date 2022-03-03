const glsl = require("glslify");
// TODO: READ https://webglfundamentals.org/webgl/lessons/webgl-gpgpu.html
const noise = glsl`
  vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec2 mod289(vec2 x) {
      return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec3 permute(vec3 x) {
      return mod289(((x*34.0)+1.0)*x);
  }

  float noise(vec2 v) {
      const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                        0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                      -0.577350269189626,  // -1.0 + 2.0 * C.x
                        0.024390243902439); // 1.0 / 41.0
      // First corner
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v -   i + dot(i, C.xx);

      // Other corners
      vec2 i1;
      //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0
      //i1.y = 1.0 - i1.x;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      // x0 = x0 - 0.0 + 0.0 * C.xx ;
      // x1 = x0 - i1 + 1.0 * C.xx ;
      // x2 = x0 - 1.0 + 2.0 * C.xx ;
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;

      // Permutations
      i = mod289(i); // Avoid truncation effects in permutation
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
          + i.x + vec3(0.0, i1.x, 1.0 ));

      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m ;
      m = m*m ;

      // Gradients: 41 points uniformly over a line, mapped onto a diamond.
      // The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)

      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;

      // Normalise gradients implicitly by scaling m
      // Approximation of: m *= inversesqrt( a0*a0 + h*h );
      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

      // Compute final noise value at P
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
  }
`;

const curlNoise = glsl`
  ${noise}

  vec3 curl(float	x,	float	y,	float	z, float t) {
    float	eps	= 1., eps2 = 2. * eps;
    float	n1,	n2,	a,	b;

    x += t;
    y += t;
    z += t;

    vec3 curl = vec3(0.);

    n1	=	noise(vec2( x,	y	+	eps ));
    n2	=	noise(vec2( x,	y	-	eps ));
    a	=	(n1	-	n2)/eps2;

    n1	=	noise(vec2( x,	z	+	eps));
    n2	=	noise(vec2( x,	z	-	eps));
    b	=	(n1	-	n2)/eps2;

    curl.x	=	a	-	b;

    n1 = noise(vec2( y,	z	+	eps));
    n2 = noise(vec2( y,	z	-	eps));
    a	=	(n1	-	n2)/eps2;

    n1	=	noise(vec2( x	+	eps,	z));
    n2	=	noise(vec2( x	+	eps,	z));
    b	=	(n1	-	n2)/eps2;

    curl.y	=	a	-	b;

    n1	=	noise(vec2( x	+	eps,	y));
    n2	=	noise(vec2( x	-	eps,	y));
    a	=	(n1	-	n2)/eps2;

    n1	=	noise(vec2(  y	+	eps,	z));
    n2	=	noise(vec2(  y	-	eps,	z));
    b	=	(n1	-	n2)/eps2;

    curl.z	=	a	-	b;

    return curl;
  }
`;

/**
 * PARTICLE RENDER FRAGMENT
 */
const particleFragmentShader = glsl`
    varying vec2 vRef;

    float circle(in vec2 _st, in float _radius) {
        vec2 dist = _st-vec2(0.5);
	    return 1.-smoothstep(_radius-(_radius*0.01),
                         _radius+(_radius*0.01),
                         dot(dist,dist)*4.0);
    }

    void main() {
        // vec2 st = gl_FragCoord.xy / resolution;
        // gl_FragColor = vec4(gl_PointCoord, 1.0, 1.0);
        // float pct = distance(gl_PointCoord, vec2(0.5));
        vec4 color = vec4(.9, .7, .9, 1.);
        float circ = circle(gl_PointCoord, 0.9);

        // vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
        // if (dot(circCoord, circCoord) > 1.0) {
        //     discard;
        // }
        
        gl_FragColor = color * circ;
        gl_FragColor.a *= 0.1;
    }
`;

/**
 * PARTICLE RENDER VERTEX
 */
const particleVertexShader = glsl`
  attribute vec2 reference;
  
  uniform float uTime;
  uniform sampler2D uVelocityTexture;
  uniform sampler2D uPositionTexture;

  varying vec2 vRef;
  varying vec3 vPos;     

  varying float vLife;

  float PI = 3.141592653589793238;

  void main() {
        vRef = reference;

        vec4 pos = texture2D(uPositionTexture, reference);
        vec3 vel = texture2D(uVelocityTexture, reference).xyz;

        // vec3 target = pos + vel;

        
        // gl_PointSize = ( step( 1. - ( 1. / 512. ), pos.y ) ) * 3.0;
        // gl_PointSize = ( step( 1. - ( 1. / 512. ), pos.y ) ) * 8.0;

        // TODO: Pointsize dependent on dpr??
        gl_PointSize = 2.0;
        
        vec4 mvPos = modelViewMatrix * vec4(pos.xyz, 1.0);      
        gl_Position = projectionMatrix * mvPos;

        vLife = pos.w / 100.;
  }
`;

/**
 * SIMULATION POSITION
 */
const simulationPositionShader = ({ attractorCount }) => glsl`
    uniform float uTime;
    uniform float uDelta;

    uniform vec3 uAcceleration;
    uniform vec4 uAttractorPositions[${attractorCount}];

    const float GRAVITY = 1.;

    

    ${curlNoise}

    float sdSphere(in vec3 p, in vec3 c, in float r) {
      return distance(p, c) - r;
    }

    void main() {
        
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 posTex = texture2D(GPGPU_texture_Position, uv);
        vec4 velTex = normalize(texture2D(GPGPU_texture_Velocity, uv));

        vec3 pos = posTex.xyz;

        // Curl noise
        float f = 0.000015;
        float a = 250.;
        float t = uTime * 0.0001;
        float maxDistance = 200.;
        vec3 c = pos + curl(pos.x * f, pos.y * f, pos.z * f, t) * a;      
        float dist = length( pos-c ) / maxDistance;     
        vec3 curled = mix(pos, c, pow(dist, 2.0));    

        gl_FragColor = vec4(curled, 1.0);
    }
`;

/**
 * SIMULATION VELOCITY
 */

//  HINT:
// base_position = start_position +
//                 velocity * local_time +
//                 acceleration * local_time * local_time;
// dafuq is this shader for now?
const simulationVelocityShader = ({ attractorCount }) => glsl`
  
    uniform float uTime;
    uniform float uDelta;
    
    uniform vec3 uAcceleration;

    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;

        vec4 posTex = texture2D(GPGPU_texture_Position, uv);
        vec4 selfVelocity = texture2D(GPGPU_texture_Velocity, uv);

        // vec3 vel = selfVelocity.xyz;
  
        gl_FragColor = selfVelocity;
    }      
        
    
`;

module.exports = {
    particleVertexShader,
    particleFragmentShader,
    simulationPositionShader,
    simulationVelocityShader,
};
