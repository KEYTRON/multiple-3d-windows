// Русские комментарии: это «частичная» архитектура как в рефе:
// - GPGPU симуляция позиций/скоростей на текстурах (GPUComputationRenderer)
// - points материал (shaderMaterial) → светящаяся зернистая плазма
// - BroadcastChannel: уникальные оттенки (золотой угол) и «сцепка» окон
// URL: ?n=128|256 (размер текстуры частиц), ?speed=, ?intensity=, ?hue=override

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {EffectComposer} from 'https://cdn.jsdelivr.net/npm/three@0.155.0/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'https://cdn.jsdelivr.net/npm/three@0.155.0/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'https://cdn.jsdelivr.net/npm/three@0.155.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import {GPUComputationRenderer} from 'https://cdn.jsdelivr.net/npm/three@0.155.0/examples/jsm/misc/GPUComputationRenderer.js';

const canvas = document.getElementById('scene');
const hud = document.getElementById('hud-info');
const params = new URLSearchParams(location.search);

// -------- утилиты
const clamp = (x,a,b)=>Math.min(b,Math.max(a,x));
const num   = (v,d)=>{const n=parseFloat(v);return Number.isFinite(n)?n:d;};
const GOLDEN_ANGLE = 137.507764;
const HUE_EPS = 1.0;
const UUID = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
const forcedHue = (()=>{const v=params.get('hue');return v==null?null:((parseFloat(v)%360)+360)%360;})();
const speedUI   = clamp(num(params.get('speed'), 1.0), 0.2, 3.0);
const intensity = clamp(num(params.get('intensity'), 1.0), 0.4, 2.0);
const N = (()=>{
  const n = parseInt(params.get('n')||'256',10);
  return (n===128||n===256)?n:256;
})();

// -------- уникальные цвета + позиция окон
let channel=null, baseHue=null, myHueDeg=null;
let peers=new Map(); // id -> {hue,cx,cy}
let link = {x:0,y:0};
function hashStrTo360(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967295*360;}
function circDist(a,b){return Math.abs(((a-b+540)%360)-180);}
function nearestSlot(used){for(let k=0;k<2048;k++){const h=(baseHue+k*GOLDEN_ANGLE)%360;let ok=true;for(const u of used){if(circDist(h,u)<HUE_EPS){ok=false;break;}}if(ok)return h;}return Math.random()*360;}
function getCenter(){const sx=(window.screenX||0)+innerWidth/2;const sy=(window.screenY||0)+innerHeight/2;const sw=(screen.width||1920);const sh=(screen.height||1080);return {x:(sx/sw)*2-1,y:(sy/sh)*2-1};}
function updateLink(){const pts=[...peers.values()].map(p=>({x:p.cx,y:p.cy}));pts.push(getCenter());const ax=pts.reduce((s,p)=>s+p.x,0)/pts.length;const ay=pts.reduce((s,p)=>s+p.y,0)/pts.length;link.x=link.x*0.9+ax*0.1;link.y=link.y*0.9+ay*0.1;}
function updateHUD(){hud.textContent=`particles v1 · windows: ${peers.size+(myHueDeg!=null?1:0)} · hue: ${myHueDeg==null?'—':Math.round(myHueDeg)} · N=${N}`;}

if('BroadcastChannel' in window){
  channel = new BroadcastChannel('mw3d');
  channel.onmessage = ev=>{
    const m=ev.data||{}; if(!m||m.id===UUID) return;
    if(m.type==='hello'||m.type==='state'||m.type==='claim'){peers.set(m.id,{hue:m.hue,cx:m.cx,cy:m.cy}); if(m.baseHue!=null&&baseHue==null) baseHue=m.baseHue;}
    if(m.type==='bye'){peers.delete(m.id);}
    if(m.type==='move'){const p=peers.get(m.id);if(p){p.cx=m.cx;p.cy=m.cy;}}
    if(myHueDeg==null){const used=[...peers.values()].filter(p=>typeof p.hue==='number').map(p=>p.hue); myHueDeg = forcedHue??(baseHue==null?(baseHue=hashStrTo360([...peers.keys()].sort()[0]||UUID), nearestSlot(used)) : nearestSlot(used)); channel.postMessage({type:'claim',id:UUID,hue:myHueDeg,baseHue,cx:getCenter().x,cy:getCenter().y});}
    updateLink(); updateHUD();
  };
  // объявиться
  const c=getCenter();
  channel.postMessage({type:'hello',id:UUID,hue:null,baseHue:null,cx:c.x,cy:c.y});
  setInterval(()=>{const c=getCenter(); channel.postMessage({type:'move',id:UUID,cx:c.x,cy:c.y});},200);
  window.addEventListener('beforeunload',()=>{try{channel.postMessage({type:'bye',id:UUID});}catch(_){}});
}else{
  myHueDeg = forcedHue ?? Math.random()*360;
  updateHUD();
}

// -------- сцена
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x0b0f13, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 100);
camera.position.set(0,0,3.2);

const renderPass = new RenderPass(scene,camera);
const composer = new EffectComposer(renderer);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight), 1.1*intensity, 0.8, 0.85);
composer.addPass(bloom);

// -------- GPGPU
const gpu = new GPUComputationRenderer(N, N, renderer);
const dtPosition = gpu.createTexture();
const dtVelocity = gpu.createTexture();

// инициализация: частицы на сфере + небольшой радиальный шум
{
  const p = dtPosition.image.data; // RGBA float32
  const v = dtVelocity.image.data;
  const rand = (i)=>((Math.sin(i*12.9898)*43758.5453)%1);
  for(let i=0;i<N*N;i++){
    // равномерно на сфере (сфер. координаты)
    const u = (i+0.5)/(N*N);
    const z = 1.0 - 2.0*u;
    const phi = 6.2831853*((i*1.61803398875)%1);
    const r = Math.sqrt(1.0 - z*z);
    const x = r*Math.cos(phi), y=r*Math.sin(phi);
    const jitter = 0.06*(rand(i)-0.5);
    p[4*i+0] = (x)*(1.0+jitter);
    p[4*i+1] = (y)*(1.0+jitter);
    p[4*i+2] = (z)*(1.0+jitter);
    p[4*i+3] = 1.0;

    v[4*i+0] = 0.0;
    v[4*i+1] = 0.0;
    v[4*i+2] = 0.0;
    v[4*i+3] = 1.0;
  }
}

const posVar = gpu.addVariable('texturePosition', await fetchText('./shaders/simPosition.frag.glsl'), dtPosition);
const velVar = gpu.addVariable('textureVelocity', await fetchText('./shaders/simVelocity.frag.glsl'), dtVelocity);
gpu.setVariableDependencies(posVar, [posVar, velVar]);
gpu.setVariableDependencies(velVar, [posVar, velVar]);

posVar.material.uniforms = {
  time: {value:0},
  speed: {value:speedUI},
  link: {value:new THREE.Vector2(0,0)},
};
velVar.material.uniforms = {
  time: {value:0},
  speed: {value:speedUI},
  link: {value:new THREE.Vector2(0,0)},
};

const gpuInit = gpu.init();
if(gpuInit !== null) { throw new Error('GPUComputation init error: '+gpuInit); }

// -------- Геометрия точек
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(N*N*3);
const uvs = new Float32Array(N*N*2);
let p=0,u=0;
for(let y=0;y<N;y++){
  for(let x=0;x<N;x++){
    positions[p++]=0;positions[p++]=0;positions[p++]=0; // реальная позиция берётся из текстуры
    uvs[u++]=x/(N-1);
    uvs[u++]=y/(N-1);
  }
}
geometry.setAttribute('position', new THREE.BufferAttribute(positions,3));
geometry.setAttribute('uv',       new THREE.BufferAttribute(uvs,2));

// загрузка шейдеров точек
const pointsVert = await fetchText('./shaders/points.vert.glsl');
const pointsFrag = await fetchText('./shaders/points.frag.glsl');

const uniforms = {
  positions: {value: null},
  velocities:{value: null},
  size:      {value: 1.8},
  hue:       {value: 0.33}, // заменим ниже
  intensity: {value: intensity},
  time:      {value: 0},
};

const material = new THREE.ShaderMaterial({
  vertexShader: pointsVert,
  fragmentShader: pointsFrag,
  uniforms,
  blending: THREE.AdditiveBlending,
  depthTest: false,
  transparent: true
});

const points = new THREE.Points(geometry, material);
scene.add(points);

// -------- рендер-цикл
onResize();
window.addEventListener('resize', onResize);

let t0 = performance.now();
animate();

function animate(){
  const t = (performance.now()-t0)/1000;

  // связь окон → «центр притяжения»
  posVar.material.uniforms.time.value = t;
  velVar.material.uniforms.time.value = t;
  posVar.material.uniforms.link.value.set(link.x, link.y);
  velVar.material.uniforms.link.value.set(link.x, link.y);
  posVar.material.uniforms.speed.value = speedUI;
  velVar.material.uniforms.speed.value = speedUI;

  gpu.compute();

  uniforms.positions.value = gpu.getCurrentRenderTarget(posVar).texture;
  uniforms.velocities.value= gpu.getCurrentRenderTarget(velVar).texture;
  uniforms.time.value = t;
  if(myHueDeg!=null) uniforms.hue.value = (myHueDeg%360)/360;

  composer.render();
  requestAnimationFrame(animate);
}

function onResize(){
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
}

async function fetchText(url){
  const r = await fetch(url+'?v=particles1',{cache:'no-store'}); 
  return r.text();
}