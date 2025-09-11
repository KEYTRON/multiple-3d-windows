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
float map(vec3 p, float t, float linkX, float peers){
  float ca=cos(t*0.25), sa=sin(t*0.25);
  mat2 R=mat2(ca,-sa,sa,ca);
  p.xy = R * p.xy;

  // Базовая центральная сфера — всегда видна
  float r=0.9;
  float d = length(p) - r;

  // Если есть другие окна — добавляем призрачную сферу для хвоста
  if(peers > 0.5){
    float pull = clamp(linkX, -1.0, 1.0);
    float dir = sign(pull==0.0 ? 1.0 : pull);
    vec3 c2 = vec3(dir*1.75, 0.0, 0.0);
    float d2 = length(p-c2) - r;
    d = smin(d, d2, 0.95);
  }

  float n=noise(p*2.1 + t*0.6);
  d += (n-0.5)*0.15;
  return d;
}
float raymarch(vec3 ro, vec3 rd, float t, float linkX, float peers){
  float dist=0.0;
  for(int i=0;i<128;i++){
    vec3 p=ro+rd*dist;
    float h=map(p,t,linkX,peers);
    if(h<0.001) return dist;
    dist += max(h*0.85, 0.003);
    if(dist>6.0) break;
  }
  return -1.0;
}
vec3 calcNormal(vec3 p, float t, float linkX, float peers){
  float e=0.002; vec2 k=vec2(1.0,-1.0);
  return normalize(
    k.xyy*map(p + k.xyy*e, t, linkX, peers) +
    k.yyx*map(p + k.yyx*e, t, linkX, peers) +
    k.yxy*map(p + k.yxy*e, t, linkX, peers) +
    k.xxx*map(p + k.xxx*e, t, linkX, peers)
  );
}
void main(){
  vec2 uv = (gl_FragCoord.xy/uRes - 0.5) * vec2(uRes.x/uRes.y,1.0);
  if(uMirror>0.5) uv.x = -uv.x;

  float t = uTime*uSpeed;

  vec3 ro = vec3(0.0,0.0,2.6);
  vec3 rd = normalize(vec3(uv, -1.7));

  float d = raymarch(ro, rd, t, uLinkX, uPeers);
  vec3 base = hsl2rgb(vec3(uHue, 0.85, 0.55));
  vec3 col = vec3(0.0);

  if(d>0.0){
    vec3 p = ro + rd*d;
    vec3 n = calcNormal(p, t, uLinkX, uPeers);

    float core = smoothstep(0.45, 0.0, length(p.xy));
    float wrap = pow(max(dot(n, -rd), 0.0), 3.0);
    float turb = noise(p*3.3 + t*1.2);

    float glow = (core*1.3 + wrap*0.8 + turb*0.6);
    col = base * glow * uIntensity;

    float fog = clamp(d/6.0, 0.0, 1.0);
    col = mix(col, base*0.08, fog);
  } else {
    // Фон по тону — заметнее, чтобы не было чёрного экрана
    float g = 0.22 + 0.32*exp(-dot(uv,uv)*2.0);
    col = base * g;
  }

  gl_FragColor = vec4(col,1.0);
}
`;

// -------- графика (шейдер) --------
let renderer, scene, camera, geo, material, mesh, composer=null;
try{
  renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 1.0);
  renderer.autoClear = true;

  scene  = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  // ВАЖНО: поддержка новых/старых версий three.js
  geo    = (THREE.PlaneGeometry ? new THREE.PlaneGeometry(2,2)
                                : new THREE.PlaneBufferGeometry(2,2));

  const uniforms = {
    uTime:      { value: 0 },
    uHue:       { value: 0.0 },
    uSpeed:     { value: speed },
    uIntensity: { value: intensity },
    uMirror:    { value: mirror },
    uLinkX:     { value: 0.0 },
    uPeers:     { value: 0.0 },
    uRes:       { value: new THREE.Vector2(innerWidth, innerHeight) },
  };

  try{
    material = new THREE.ShaderMaterial({
      vertexShader: VERT_SRC,
      fragmentShader: SIMPLE_MODE ? FRAG_SRC_SIMPLE : FRAG_SRC,
      uniforms,
      depthWrite:false,
      depthTest:false
    });
  }catch(e){
    showErr('ShaderMaterial ctor failed: '+ (e && e.message || e));
  }

  if(!material){
    // жёсткий фолбэк: просто цветной квадрат, чтобы было видно, что рендер жив
    const color = new THREE.Color().setHSL(((forcedHue ?? 200)%360)/360, 0.6, 0.5);
    material = new THREE.MeshBasicMaterial({color});
  }

  mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 0; // фон рисуем первым
  scene.add(mesh);
  // UI примитивы больше не нужны — всё рисуем в шейдере

  // Отключаем постпроцессинг для надёжности
  composer = null;

  onResize();
  animate();

}catch(e){
  showErr(e && e.stack || e);
}

// цикл
function animate(t=0){
  try{
    if(material && material.uniforms){
      material.uniforms.uTime && (material.uniforms.uTime.value = t*0.001);
      material.uniforms.uLinkX && (material.uniforms.uLinkX.value = linkX);
      if(myHueDeg!=null && material.uniforms.uHue){
        material.uniforms.uHue.value = (myHueDeg%360)/360.0;
      }
    }
    if(composer) composer.render(); else renderer.render(scene, camera);
  }catch(e){
    showErr(e && e.stack || e);
  }
  requestAnimationFrame(animate);
}
function onResize(){
  try{
    renderer.setSize(innerWidth, innerHeight);
    material.uniforms && material.uniforms.uRes && material.uniforms.uRes.value.set(innerWidth, innerHeight);
  }catch(e){
    // ignore
  }
}
addEventListener('resize', onResize);
function syncScene(){
  // collect nodes (self + peers with known hue)
  const nodes = [];
  if(myHueDeg!=null){ nodes.push({ id: UUID, cx: myCenter.x, cy: myCenter.y, hue: myHueDeg }); }
  for(const [id,p] of peers){ if(typeof p.hue==='number'){ nodes.push({ id, cx: p.cx, cy: p.cy, hue: p.hue }); } }

  // Update shader uniform: averaged direction from my sphere to peers
  if(material && material.uniforms){
    const u = material.uniforms;
    let ax = 0, ay = 0, cnt = 0;
    for(const n of nodes){ if(n.id!==UUID){ ax += (n.cx - myCenter.x); ay += (n.cy - myCenter.y); cnt++; } }
    if(cnt>0){ ax/=cnt; ay/=cnt; }
    if(u.uPeers) u.uPeers.value = cnt;
  }
}
