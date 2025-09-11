// Вертекс для точек: читаем позицию из текстуры GPGPU (texturePosition)
// uv атрибут — это адрес в текстуре (x,y)
uniform sampler2D positions;
uniform sampler2D velocities;
uniform float size;
uniform float time;

varying float vSpeed;
varying vec3  vPos;

void main(){
  vec3 pos = texture2D(positions, uv).xyz;
  vec3 vel = texture2D(velocities, uv).xyz;

  vSpeed = length(vel);
  vPos = pos;

  vec4 mv = modelViewMatrix * vec4(pos,1.0);
  gl_Position = projectionMatrix * mv;

  // динамический размер с завязкой на скорость
  gl_PointSize = size * (1.5 + 2.5 * smoothstep(0.0, 0.8, vSpeed)) * (300.0 / -mv.z);
}