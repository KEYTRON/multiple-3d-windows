// PointsScene: sets up renderer + scene + camera + particle sphere
// Uses global THREE and the createPointsMaterial() factory
import { createPointsMaterial } from './pointsMaterial.js';

export class PointsScene {
  constructor({ canvas, width, height, hue = 0.5, intensity = 1.0 }){
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 1.0);
    this.renderer.autoClear = true;

    this.scene = new THREE.Scene();
    // Use clip-space coordinates: Orthographic [-1,1] cube
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);

    // Geometry: fibonacci sphere distribution
    const N = 20000; // ~20k points
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    const phi = Math.PI * (3 - Math.sqrt(5));
    for(let i=0;i<N;i++){
      const y = 1 - (i / (N - 1)) * 2; // y from 1 to -1
      const radius = Math.sqrt(1 - y * y);
      const theta = phi * i;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      pos[i*3+0] = x;
      pos[i*3+1] = y;
      pos[i*3+2] = z;
      seed[i] = (i % 9973) / 9973;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));

    this.material = createPointsMaterial({ hue });
    this.material.uniforms.uRes.value.set(width, height);
    this.material.uniforms.uIntensity.value = intensity;

    this.points = new THREE.Points(geo, this.material);
    this.scene.add(this.points);
  }

  resize(width, height){
    this.renderer.setSize(width, height);
    this.material.uniforms.uRes.value.set(width, height);
  }

  setHue(h){ this.material.uniforms.uHue.value = h; }
  setIntensity(v){ this.material.uniforms.uIntensity.value = v; }
  setLinkDir(x, y){ this.material.uniforms.uLinkDir.value.set(x, y); }
  setPeers(n){ this.material.uniforms.uPeers.value = n; }

  render(timeMs){
    this.material.uniforms.uTime.value = timeMs * 0.001;
    this.renderer.render(this.scene, this.camera);
  }
}

