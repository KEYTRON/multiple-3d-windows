/* Русские комментарии:
 * Это основной JS. Создаём сцену Three.js с плоской плоскостью во весь экран
 * и вешаем на неё наш шейдер "плазма". Плюс постобработка Bloom.
 * Добавлена синхронизация между окнами через BroadcastChannel.
 */
const canvas = document.getElementById('scene');

// Синхронизация между окнами
const channel = new BroadcastChannel('plasma-sync');
let windowId = Math.random().toString(36).substr(2, 9);
let isMaster = false;
let syncData = {};

// Утилита: читаем URL-параметры
const params = new URLSearchParams(location.search);
let hueDeg = clamp(parseFloat(params.get('hue') || '0'), 0, 360);
let speed  = clamp(parseFloat(params.get('speed') || '1.2'), 0.1, 3);
let mirror = params.get('mirror') === '1' ? 1.0 : 0.0;
let seed   = params.get('seed') || 'default';

// Если нет параметров, генерируем случайные для нового окна
if (!params.has('hue') && !params.has('speed') && !params.has('mirror') && !params.has('seed')) {
  // Используем более уникальную рандомизацию
  const uniqueId = Date.now() + Math.random() * 1000000;
  hueDeg = (uniqueId * 137.5) % 360; // Золотое сечение для лучшего распределения цветов
  speed = 0.8 + (uniqueId % 100) / 50; // 0.8-2.8
  mirror = (uniqueId % 2) === 0 ? 1.0 : 0.0;
  seed = 'unique_' + uniqueId.toFixed(0);
  // Обновляем URL без перезагрузки
  const newUrl = new URL(location);
  newUrl.searchParams.set('hue', Math.round(hueDeg));
  newUrl.searchParams.set('speed', speed.toFixed(1));
  newUrl.searchParams.set('mirror', mirror);
  newUrl.searchParams.set('seed', seed);
  history.replaceState({}, '', newUrl);
}

function clamp(x, lo, hi) { return isNaN(x) ? lo : Math.min(hi, Math.max(lo, x)); }

// Для детерминированного смещения тона по seed (простейший хеш)
function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
const seedJitter = hashStr(seed) * 0.08 - 0.04; // -0.04..0.04

// Three.js: базовые сущности
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
camera.position.z = 3;

// Геометрия — сфера с плазменным эффектом
const geo = new THREE.SphereGeometry(1, 64, 64);

// Загружаем шейдеры
async function loadText(url) {
  const res = await fetch(url);
  return await res.text();
}
let material, mesh, composer;
let mouseX = 0, mouseY = 0;
let targetRotationX = 0, targetRotationY = 0;

// Обработка синхронизации
channel.addEventListener('message', (event) => {
  const { type, data, from } = event.data;
  
  if (from === windowId) return; // Игнорируем собственные сообщения
  
  switch (type) {
    case 'sync_request':
      // Отправляем свои параметры
      channel.postMessage({
        type: 'sync_response',
        data: { hueDeg, speed, mirror, seed, windowId },
        from: windowId
      });
      break;
      
    case 'sync_response':
      // Получаем параметры другого окна
      syncData[from] = data;
      updateHUD();
      break;
      
    case 'parameter_change':
      // НЕ синхронизируем цвета - только скорость и зеркало
      if (data.speed !== undefined) speed = data.speed;
      if (data.mirror !== undefined) mirror = data.mirror;
      
      if (material) {
        material.uniforms.uSpeed.value = speed;
        material.uniforms.uMirror.value = mirror;
      }
      break;
  }
});

// Запрос синхронизации при загрузке
setTimeout(() => {
  channel.postMessage({ type: 'sync_request', from: windowId });
}, 1000);

// Обновление HUD с информацией о других окнах
function updateHUD() {
  const hud = document.getElementById('hud');
  const otherWindows = Object.keys(syncData).length;
  if (otherWindows > 0) {
    hud.innerHTML += `<br/><small>${otherWindows} окна</small>`;
  }
}

(async () => {
  try {
    const [vertSrc, fragSrc] = await Promise.all([
      loadText('./shaders/plasma.vert.glsl'),
      loadText('./shaders/plasma.frag.glsl'),
    ]);

    // Юниформы для шейдера
    const uniforms = {
      uTime:   { value: 0.0 },
      uHue:    { value: ((hueDeg / 360) + seedJitter) % 1.0 },
      uSpeed:  { value: speed },
      uMirror: { value: mirror },
      uRes:    { value: new THREE.Vector2(innerWidth, innerHeight) },
    };

    material = new THREE.ShaderMaterial({
      vertexShader: vertSrc,
      fragmentShader: fragSrc,
      uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    // Создаём одну объёмную сферу
    mesh = new THREE.Mesh(geo, material);
    scene.add(mesh);

    // Post-processing: RenderPass + UnrealBloomPass
    const renderScene = new THREE.RenderPass(scene, camera);
    const bloom = new THREE.UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      2.0,   // strength - увеличиваем для яркого свечения
      0.4,   // radius
      0.1    // threshold - понижаем для большего свечения
    );

    composer = new THREE.EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloom);

    onResize();
    animate();
    
    console.log('Плазма загружена успешно!');
  } catch (error) {
    console.error('Ошибка загрузки шейдеров:', error);
    // Показываем простой цветной фон в случае ошибки
    const fallbackMaterial = new THREE.MeshBasicMaterial({ 
      color: new THREE.Color().setHSL(hueDeg / 360, 0.8, 0.5) 
    });
    const fallbackMesh = new THREE.Mesh(geo, fallbackMaterial);
    scene.add(fallbackMesh);
    animate();
  }
})();

function animate(t = 0) {
  // Переводим t в секунды
  const timeSec = t * 0.001;
  if (material) {
    material.uniforms.uTime.value = timeSec;
  }
  
  // Вращение сферы
  if (mesh) {
    // Медленное автоматическое вращение
    mesh.rotation.y += 0.003 * speed;
    mesh.rotation.x += 0.002 * speed;
    
    // Плавное вращение мышью
    targetRotationY += (mouseX - targetRotationY) * 0.02;
    targetRotationX += (mouseY - targetRotationX) * 0.02;
    mesh.rotation.y += targetRotationY * 0.005;
    mesh.rotation.x += targetRotationX * 0.005;
  }
  
  composer ? composer.render() : renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  if (material) {
    material.uniforms.uRes.value.set(innerWidth, innerHeight);
  }
}
addEventListener('resize', onResize);

// Обработка мыши для вращения сферы
addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / innerWidth) * 2 - 1;
  mouseY = (e.clientY / innerHeight) * 2 - 1;
});

// Обработка колеса мыши для масштабирования
addEventListener('wheel', (e) => {
  e.preventDefault();
  camera.position.z += e.deltaY * 0.01;
  camera.position.z = Math.max(1, Math.min(10, camera.position.z));
});

// Функции для управления синхронизацией
function syncWithOtherWindows() {
  channel.postMessage({
    type: 'parameter_change',
    data: { hueDeg, speed, mirror, seed },
    from: windowId
  });
}

// Обработка клавиш для управления
addEventListener('keydown', (e) => {
  switch(e.key) {
    case 'h':
      // Случайный hue
      hueDeg = Math.random() * 360;
      if (material) material.uniforms.uHue.value = ((hueDeg / 360) + seedJitter) % 1.0;
      syncWithOtherWindows();
      break;
    case 's':
      // Случайная скорость
      speed = 0.5 + Math.random() * 2.5;
      if (material) material.uniforms.uSpeed.value = speed;
      syncWithOtherWindows();
      break;
    case 'm':
      // Переключить зеркало
      mirror = mirror === 1.0 ? 0.0 : 1.0;
      if (material) material.uniforms.uMirror.value = mirror;
      syncWithOtherWindows();
      break;
    case 'r':
      // Полная рандомизация
      hueDeg = Math.random() * 360;
      speed = 0.5 + Math.random() * 2.5;
      mirror = Math.random() > 0.5 ? 1.0 : 0.0;
      seed = 'random_' + Date.now();
      
      if (material) {
        material.uniforms.uHue.value = ((hueDeg / 360) + seedJitter) % 1.0;
        material.uniforms.uSpeed.value = speed;
        material.uniforms.uMirror.value = mirror;
      }
      syncWithOtherWindows();
      break;
  }
});

// Минимальные подсказки
document.addEventListener('DOMContentLoaded', () => {
  const hud = document.getElementById('hud');
  hud.innerHTML += `<br/><small>H S M R | мышь</small>`;
});
