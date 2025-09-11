// Фрагмент для точек: мягкий спрайт + bloom-friendly эмиссия
precision highp float;

uniform float hue;        // 0..1
uniform float intensity;  // 0.4..2
uniform float time;

varying float vSpeed;
varying vec3  vPos;

vec3 hsl2rgb(vec3 hsl){
  vec3 rgb = clamp(abs(mod(hsl.x*6.0 + vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0,0.0,1.0);
  return hsl.z + hsl.y*(rgb-0.5)*(1.0-abs(2.0*hsl.z-1.0));
}

void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p,p);
  if(r2>1.0) discard; // круглые спрайты

  float edge = smoothstep(1.0, 0.0, r2);
  float spark = pow(edge, 2.2 + 1.8*clamp(vSpeed,0.0,1.5));

  // базовый оттенок + лёгкая модуляция яркости от позиции
  float l = 0.45 + 0.25 * sin(vPos.x*3.0 + time*0.7);
  vec3 col = hsl2rgb(vec3(hue, 0.85, l));

  gl_FragColor = vec4(col * spark * (1.2*intensity), spark);
}