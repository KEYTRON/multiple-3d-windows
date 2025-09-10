// Объёмный плазменный шейдер как на картинках
precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

uniform float uTime;
uniform float uHue;
uniform float uSpeed;
uniform float uMirror;
uniform vec2  uRes;

// HSL to RGB
vec3 hsl2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
  return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0*c.z - 1.0));
}

// Простой 3D шум
float noise3d(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
}

// Турбулентность для плазмы
float turbulence(vec3 p, float time) {
  float t = 0.0;
  float f = 1.0;
  
  for(int i = 0; i < 6; i++) {
    t += abs(noise3d(p * f + time * 0.1 * f)) / f;
    f *= 2.0;
  }
  
  return t;
}

void main() {
  vec3 pos = vPosition;
  vec3 normal = normalize(vNormal);
  
  // Зеркалирование для взаимодействия окон
  if (uMirror > 0.5) { 
    pos.x = -pos.x; 
  }
  
  float time = uTime * uSpeed;
  
  // Расстояние от центра
  float dist = length(pos);
  
  // Создаём объёмную плазму
  vec3 plasmaPos = pos * 3.0 + vec3(sin(time * 0.7), cos(time * 0.5), sin(time * 0.3));
  float plasma = turbulence(plasmaPos, time);
  
  // Добавляем вращающиеся слои
  float layer1 = turbulence(pos * 2.0 + time * 0.2, time * 1.5);
  float layer2 = turbulence(pos * 4.0 + time * 0.4, time * 0.8);
  float layer3 = turbulence(pos * 1.5 - time * 0.3, time * 1.2);
  
  plasma = (plasma + layer1 * 0.7 + layer2 * 0.5 + layer3 * 0.8) * 0.25;
  
  // Создаём сферическую форму с объёмом
  float sphere = 1.0 - smoothstep(0.3, 1.2, dist);
  
  // Яркое ядро в центре
  float core = 1.0 - smoothstep(0.0, 0.6, dist);
  core = pow(core, 2.0);
  
  // Объёмное освещение (fresnel)
  float fresnel = 1.0 - abs(dot(normal, normalize(vec3(0.0, 0.0, 1.0))));
  fresnel = pow(fresnel, 1.5);
  
  // Создаём хвосты, тянущиеся в стороны
  vec3 tailDir = normalize(vec3(sin(time * 0.5), 0.0, cos(time * 0.5)));
  float tail = max(0.0, dot(normalize(pos), tailDir));
  tail = pow(tail, 3.0) * smoothstep(0.8, 1.5, dist);
  
  // Цвет на основе hue с вариациями
  float hueVar = uHue + plasma * 0.1 + sin(time * 0.3) * 0.05;
  vec3 baseColor = hsl2rgb(vec3(fract(hueVar), 0.85, 0.7));
  
  // Собираем финальный цвет
  float intensity = plasma * 2.0 + 0.3;
  vec3 color = baseColor * intensity * sphere;
  
  // Добавляем яркое ядро
  color += baseColor * core * 4.0;
  
  // Объёмное свечение
  color += baseColor * fresnel * 1.5 * sphere;
  
  // Хвосты плазмы
  color += baseColor * tail * 2.0;
  
  // Дополнительное свечение для объёма
  color += baseColor * pow(sphere, 0.5) * 0.8;
  
  // Прозрачность с объёмным эффектом
  float alpha = sphere * 0.8 + core * 0.4 + fresnel * 0.3 + tail * 0.5;
  alpha = clamp(alpha, 0.1, 1.0);
  
  gl_FragColor = vec4(color, alpha);
}
