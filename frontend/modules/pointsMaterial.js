// Lightweight Points shader for a volumetric-looking sphere with a tail
// Uses global THREE provided by CDN; exports a factory function.

export function createPointsMaterial({ hue = 0.5 } = {}){
  const uniforms = {
    uTime:      { value: 0 },
    uHue:       { value: hue },
    uIntensity: { value: 1.0 },
    uRes:       { value: new THREE.Vector2(800, 600) },
    uLinkDir:   { value: new THREE.Vector2(0,0) },
    uPeers:     { value: 0.0 },
  };

  const vert = `
precision highp float;
attribute vec3 position;
attribute float seed;
uniform float uTime;
uniform vec2  uRes;
uniform vec2  uLinkDir;
uniform float uPeers;
varying float vAlpha;
varying float vGlow;

// simple hash noise
float hash(float n){ return fract(sin(n)*43758.5453); }
float n3(vec3 p){
  return fract(sin(dot(p, vec3(41.3, 113.1, 289.1))) * 43758.5453);
}

void main(){
  // base sphere point (unit sphere)
  vec3 p = normalize(position);

  // breathing radius + turbulence
  float t = uTime*0.35 + seed*7.0;
  float r = 0.95 + 0.08*sin(t) + (n3(p*3.1 + t*0.25)-0.5)*0.12;
  p *= r;

  // Tail direction
  vec3 L = normalize(vec3(uLinkDir, 0.0));
  float face = max(0.0, dot(normalize(position), L));
  float tailStrength = (uPeers>0.5 ? 1.0 : 0.0) * smoothstep(0.2, 1.0, face);
  p += L * tailStrength * 1.6; // stretch outward toward peers

  // Slight curl along tail
  p.xy += vec2(-L.y, L.x) * tailStrength * 0.25 * sin(t*1.7 + seed*13.0);

  // point size in pixels (scaled by viewport height to be stable)
  float px = mix(1.5, 2.5, hash(seed));
  float scale = max(uRes.y, 1.0) / 800.0;
  gl_PointSize = px * 2.0 * scale;

  vGlow = tailStrength;
  vAlpha = 0.85;
  gl_Position = vec4(p, 1.0);
}
`;

  const frag = `
precision highp float;
uniform float uHue;
uniform float uIntensity;
varying float vAlpha;
varying float vGlow;

vec3 hsl2rgb(vec3 hsl){
  vec3 rgb = clamp(abs(mod(hsl.x*6.0 + vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0,0.0,1.0);
  return hsl.z + hsl.y*(rgb-0.5)*(1.0-abs(2.0*hsl.z-1.0));
}

void main(){
  vec2 uv = gl_PointCoord*2.0 - 1.0;
  float r2 = dot(uv,uv);
  if(r2>1.0) discard;
  float g = exp(-r2*3.0) + 0.25*exp(-pow(length(uv)-0.6,2.0)*18.0);
  vec3 base = hsl2rgb(vec3(uHue, 0.85, 0.55));
  vec3 col = base * (0.35 + g*1.2 + vGlow*0.35) * uIntensity;
  gl_FragColor = vec4(col, vAlpha);
}
`;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return mat;
}

