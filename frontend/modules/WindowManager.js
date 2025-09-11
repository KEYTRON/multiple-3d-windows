// Ported from base/WindowManager.js to ESM for frontend/modules
export default class WindowManager {
  #windows; #count; #id; #winData; #winShapeChangeCallback; #winChangeCallback;
  constructor(){
    const that = this;
    addEventListener('storage', (event)=>{
      if(event.key === 'windows'){
        const newWindows = JSON.parse(event.newValue||'[]');
        const winChange = that.#didWindowsChange(that.#windows||[], newWindows);
        that.#windows = newWindows;
        if(winChange && that.#winChangeCallback) that.#winChangeCallback();
      }
    });
    window.addEventListener('beforeunload', ()=>{
      const index = that.getWindowIndexFromId(that.#id);
      if(index>=0){ that.#windows.splice(index,1); that.updateWindowsLocalStorage(); }
    });
  }
  #didWindowsChange(pWins, nWins){
    if(pWins.length !== nWins.length) return true;
    for(let i=0;i<pWins.length;i++){ if(pWins[i].id !== nWins[i].id) return true; }
    return false;
  }
  init(metaData){
    this.#windows = JSON.parse(localStorage.getItem('windows')||'[]');
    this.#count = parseInt(localStorage.getItem('count')||'0',10);
    this.#count++;
    this.#id = this.#count;
    const shape = this.getWinShape();
    this.#winData = { id:this.#id, shape, metaData };
    this.#windows.push(this.#winData);
    localStorage.setItem('count', String(this.#count));
    this.updateWindowsLocalStorage();
  }
  getWinShape(){ return { x: window.screenLeft, y: window.screenTop, w: innerWidth, h: innerHeight }; }
  getWindowIndexFromId(id){ let idx=-1; for(let i=0;i<(this.#windows||[]).length;i++){ if(this.#windows[i].id===id) idx=i; } return idx; }
  updateWindowsLocalStorage(){ localStorage.setItem('windows', JSON.stringify(this.#windows||[])); }
  update(){
    const winShape = this.getWinShape();
    if(!this.#winData || !this.#windows) return;
    if(winShape.x!==this.#winData.shape.x || winShape.y!==this.#winData.shape.y || winShape.w!==this.#winData.shape.w || winShape.h!==this.#winData.shape.h){
      this.#winData.shape = winShape;
      const index = this.getWindowIndexFromId(this.#id);
      if(index>=0) this.#windows[index].shape = winShape;
      if(this.#winShapeChangeCallback) this.#winShapeChangeCallback();
      this.updateWindowsLocalStorage();
    }
  }
  // allow updating this window's metadata and broadcast to others
  setThisMeta(patch){
    if(!this.#winData) return;
    this.#winData.metaData = { ...(this.#winData.metaData||{}), ...(patch||{}) };
    const index = this.getWindowIndexFromId(this.#id);
    if(index>=0){
      this.#windows[index].metaData = this.#winData.metaData;
      this.updateWindowsLocalStorage();
      if(this.#winChangeCallback) this.#winChangeCallback();
    }
  }
  setWinShapeChangeCallback(cb){ this.#winShapeChangeCallback = cb; }
  setWinChangeCallback(cb){ this.#winChangeCallback = cb; }
  getWindows(){ return this.#windows||[]; }
  getThisWindowData(){ return this.#winData; }
  getThisWindowID(){ return this.#id; }
}
