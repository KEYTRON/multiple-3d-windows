// Шейдер позиции (GPGPU): интегрируем позицию по скорости с мягким удержанием на сфере

uniform float time;
uniform float speed;
uniform vec2  link;

uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;

varying vec2 vUv;

void main(){
  vec3 pos = texture2D(texturePosition, vUv).xyz;
  vec3 vel = texture2D(textureVelocity, vUv).xyz;

  pos += vel * (0.008 * speed);

  // удерживаем частицы в окрестности сферы (радиус ~1.0)
  float r = length(pos);
  if(r > 1.08){
    pos = normalize(pos) * 1.08;
  }

  gl_FragColor = vec4(pos,1.0);
}