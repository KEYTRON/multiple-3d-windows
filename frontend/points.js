// Entry for modular, particle-based scene
import { PointsScene } from './modules/pointsScene.js';
import WindowManager from './modules/WindowManager.js';

const canvas = document.getElementById('scene');
const hud = document.getElementById('hud-info');

const params = new URLSearchParams(location.search);
const intensity = clamp(num(params.get('intensity'), 1.25), 0.4, 2.0);

function num(v,d){ const n=parseFloat(v); return Number.isFinite(n)?n:d; }
function clamp(x,a,b){ return Math.min(b, Math.max(a, x)); }

// Colors + sync (via WindowManager/localStorage)
const GOLDEN_ANGLE = 137.507764;
const HUE_EPS = 1.0;
const UUID = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
let baseHue = null;
let myHueDeg = null;
let wm = null;

function hashStrTo360(s){
  let h=2166136261>>>0;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return (h>>>0)/4294967295*360.0;
}
function circularDist(a,b){ return Math.abs(((a-b+540)%360)-180); }
function nearestSlotNotUsed(used){
  for(let k=0;k<2048;k++){
    const h=(baseHue + k*GOLDEN_ANGLE)%360;
    let ok=true;
    for(const u of used){ if(circularDist(h,u)<HUE_EPS){ ok=false; break; } }
    if(ok) return h;
  }
  return Math.random()*360;
}
function getClusterSeed(){
  const wins = wm ? wm.getWindows() : [];
  if(wins.length===0) return UUID;
  const minId = Math.min(...wins.map(w=>w.id));
  return String(minId);
}
function computeHue(){
  if(baseHue==null) baseHue = hashStrTo360(getClusterSeed());
  const used=[...peers.values()].filter(p=>typeof p.hue==='number').map(p=>p.hue);
  if(typeof myHueDeg==='number') used.push(myHueDeg);
  return nearestSlotNotUsed(used);
}
function normFromShape(shape){
  const sw = (screen.width || 1920), sh = (screen.height || 1080);
  const sx = (shape.x || 0) + (shape.w||0)/2;
  const sy = (shape.y || 0) + (shape.h||0)/2;
  return { x:(sx/sw)*2-1, y:(sy/sh)*2-1 };
}
function updateHUD(){
  const windows = peers.size + (myHueDeg!=null?1:0);
  hud.textContent = `v6-points · windows: ${windows} · my hue: ${myHueDeg==null?'—':Math.round(myHueDeg)}`;
}

// Scene
const ps = new PointsScene({ canvas, width: innerWidth, height: innerHeight, hue: 0.0, intensity });
addEventListener('resize', ()=> ps.resize(innerWidth, innerHeight));
requestAnimationFrame(function raf(t){ ps.render(t); requestAnimationFrame(raf); });

// WindowManager-based sync
wm = new WindowManager();
wm.setWinChangeCallback(()=>{ windowsUpdated(); });
wm.setWinShapeChangeCallback(()=>{ windowsUpdated(); });
wm.init({ hue: null });
windowsUpdated();
setInterval(()=> wm.update(), 200);

function windowsUpdated(){
  const wins = wm.getWindows();
  // ensure baseHue exists (shared across windows)
  const stored = localStorage.getItem('mw3d_baseHue');
  if(stored!=null){ baseHue = parseFloat(stored); }
  if(baseHue==null){ baseHue = hashStrTo360(getClusterSeed()); localStorage.setItem('mw3d_baseHue', String(baseHue)); }

  // collect used hues from windows meta
  const used = wins.map(w=> (w.metaData && typeof w.metaData.hue==='number') ? w.metaData.hue : null).filter(v=>typeof v==='number');
  if(typeof myHueDeg!=='number' || used.some(h=>Math.abs(h - myHueDeg)<HUE_EPS)){
    myHueDeg = nearestSlotNotUsed(used);
    wm.setThisMeta({ hue: myHueDeg });
  }
  ps.setHue((myHueDeg%360)/360);

  // update link direction from this window center to others
  const me = wm.getThisWindowData();
  const meC = normFromShape(me.shape);
  let ax=0, ay=0, cnt=0;
  for(const w of wins){ if(w.id===me.id) continue; const c=normFromShape(w.shape); ax += (c.x - meC.x); ay += (c.y - meC.y); cnt++; }
  if(cnt>0){ ax/=cnt; ay/=cnt; }
  ps.setLinkDir(ax, ay);
  ps.setPeers(cnt);
  updateHUD();
}
