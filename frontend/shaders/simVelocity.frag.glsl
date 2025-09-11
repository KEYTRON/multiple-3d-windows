// Шейдер скорости (GPGPU): псевдо-«вихревая» динамика (curl-подобный шум) + тяготение к центроиду окон
// Текстуры: texturePosition, textureVelocity
// Выдать: новую скорость

uniform float time;
uniform float speed;
uniform vec2  link;

uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;

varying vec2 vUv;

float hash(vec3 p){ return fract(sin(dot(p, vec3(17.1, 31.7, 11.4))) * 43758.5453); }

float noise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  float n=0.0;
  for(int x=0;x<=1;x++)
  for(int y=0;y<=1;y++)
  for(int z=0;z<=1;z++){
    vec3 g=vec3(float(x),float(y),float(z));
    float h = hash(i+g);
    float w = 1.0 - length(f-g);
    n += h*w;
  }
  return clamp(n/8.0, 0.0, 1.0);
}

vec3 curl(vec3 p){
  float e=0.1;
  float n1 = noise(p + vec3(0.0,e,0.0));
  float n2 = noise(p - vec3(0.0,e,0.0));
  float n3 = noise(p + vec3(0.0,0.0,e));
  float n4 = noise(p - vec3(0.0,0.0,e));
  float n5 = noise(p + vec3(e,0.0,0.0));
  float n6 = noise(p - vec3(e,0.0,0.0));
  return vec3(n3-n4, n5-n6, n1-n2);
}

void main(){
  vec3 pos = texture2D(texturePosition, vUv).xyz;
  vec3 vel = texture2D(textureVelocity, vUv).xyz;

  float t = time*0.6;
  vec3 f = curl(pos*2.1 + t);         // вихрь
  f += 0.20 * normalize(vec3(link,0.0) - pos.xy0); // «тяга» к центроиду окон
  f += -0.08 * pos;                   // мягкая пружина к центру

  vel = mix(vel, f, 0.12*speed);      // демпфирование + усиление скоростью
  gl_FragColor = vec4(vel,1.0);
}