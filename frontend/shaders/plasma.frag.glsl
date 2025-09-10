precision highp float;

varying vec2 vUv;

uniform float uTime;        // сек
uniform float uHue;         // 0..1
uniform float uSpeed;       // 0.1..3
uniform float uIntensity;   // 0.4..2
uniform float uMirror;      // 0|1
uniform float uLinkX;       // -1..+1 смещение «сцепки» между окнами
uniform vec2  uRes;         // пиксели

vec3 hsl2rgb(vec3 hsl){
  vec3 rgb = clamp(abs(mod(hsl.x*6.0 + vec3(0,4,2), 6.0)-3.0)-1.0,0.0,1.0);
  return hsl.z + hsl.y*(rgb-0.5)*(1.0-abs(2.0*hsl.z-1.0));
}

float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1))) * 43758.5453); }
float noise(vec3 p){
  vec3 i=floor(p), f=fract(p);
  float n=0.0;
  for(int x=0;x<=1;x++)
  for(int y=0;y<=1;y++)
  for(int z=0;z<=1;z++){
    vec3 g=vec3(float(x),float(y),float(z));
    float h=hash(i.xy+g.xy+(i.z+g.z)*13.0);
    float w=dot(f-g,f-g);
    n += mix(h,h*h,0.5)*(1.0 - smoothstep(0.0,1.0,w));
  }
  return clamp(n,0.0,1.0);
}

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b,a,h) - k*h*(1.0-h);
}

// SDF: две сферы + турбулентная деформация
float map(vec3 p, float t, float linkX){
  // лёгкое вращение
  float ca=cos(t*0.25), sa=sin(t*0.25);
  mat2 R=mat2(ca,-sa,sa,ca);
  p.xy = R * p.xy;

  // центры шаров: тянем их в сторону linkX (из канала меж окон)
  float pull = clamp(linkX, -1.0, 1.0) * 0.6;
  vec3 c1=vec3(-1.1 + pull, 0.0, 0.0);
  vec3 c2=vec3( 1.1 + pull, 0.0, 0.0);

  float r=0.9;
  float d1=length(p-c1)-r;
  float d2=length(p-c2)-r;

  // «перемычка»
  float d=smin(d1,d2,0.9);

  // шумовая деформация поверхности
  float n=noise(p*2.1 + t*0.6);
  d += (n-0.5)*0.15;
  return d;
}

float raymarch(vec3 ro, vec3 rd, float t, float linkX){
  float dist=0.0;
  for(int i=0;i<128;i++){
    vec3 p=ro+rd*dist;
    float h=map(p,t,linkX);
    if(h<0.001) return dist;
    dist += h*0.85;
    if(dist>6.0) break;
  }
  return -1.0;
}

vec3 calcNormal(vec3 p, float t, float linkX){
  float e=0.002; vec2 k=vec2(1,-1);
  return normalize(
    k.xyy*map(p + k.xyy*e, t, linkX) +
    k.yyx*map(p + k.yyx*e, t, linkX) +
    k.yxy*map(p + k.yxy*e, t, linkX) +
    k.xxx*map(p + k.xxx*e, t, linkX)
  );
}

void main(){
  vec2 uv = (gl_FragCoord.xy/uRes - 0.5) * vec2(uRes.x/uRes.y,1.0);
  if(uMirror>0.5) uv.x = -uv.x;

  float t = uTime*uSpeed;

  vec3 ro = vec3(0.0,0.0,2.6);
  vec3 rd = normalize(vec3(uv, -1.7));

  float d = raymarch(ro, rd, t, uLinkX);
  vec3 col = vec3(0.0);

  if(d>0.0){
    vec3 p = ro + rd*d;
    vec3 n = calcNormal(p, t, uLinkX);

    vec3 base = hsl2rgb(vec3(uHue, 0.85, 0.55));
    float core = smoothstep(0.45, 0.0, length(p.xy));
    float wrap = pow(max(dot(n, -rd), 0.0), 3.0);
    float turb = noise(p*3.3 + t*1.2);

    float glow = (core*1.3 + wrap*0.8 + turb*0.6);
    col = base * glow * uIntensity;

    float fog = clamp(d/6.0, 0.0, 1.0);
    col = mix(col, base*0.08, fog);
  }

  gl_FragColor = vec4(col,1.0);
}