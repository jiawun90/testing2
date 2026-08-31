/**
 * JW Just Wishes — free-roaming 3D mascot
 * - No frame, walks along bottom above footer
 * - Face turns via 3D rotation (bubble text stays upright)
 * - Occasional coupon speech bubble
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const canvas = document.getElementById('mascotCanvas');
const track = document.getElementById('glbMascotTrack');
const container = document.getElementById('glbMascotContainer');
const hideBtn = document.getElementById('glbMascotHide');
const recallBtn = document.getElementById('glbMascotRecall');
const bubble = document.getElementById('glbCouponBubble');

if (!canvas || !track || !container) {
  console.warn('[mascot] missing DOM');
} else {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0.9, 2.5);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  scene.add(new THREE.HemisphereLight(0xfff8f0, 0x9999aa, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(2, 5, 3);
  scene.add(key);

  function resize() {
    const w = canvas.clientWidth || 120;
    const h = canvas.clientHeight || 140;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize);
  // 等布局完成后再量一次
  requestAnimationFrame(resize);

  let mixer = null;
  let modelRoot = null;
  let faceSign = 1; // 1 = 朝右, -1 = 朝左
  const clock = new THREE.Clock();

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  dracoLoader.setDecoderConfig({ type: 'js' });
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  loader.load(
    'images/mascot/model.glb',
    (gltf) => {
      modelRoot = gltf.scene;
      const box = new THREE.Box3().setFromObject(modelRoot);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = 1.55 / maxDim;
      modelRoot.scale.setScalar(scale);
      modelRoot.position.sub(center.multiplyScalar(scale));
      modelRoot.position.y = 0;
      scene.add(modelRoot);

      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(modelRoot);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
      }

      track.classList.add('is-ready', 'is-walking');
      console.log('[mascot] loaded');
      scheduleCouponBubble();
      startFaceSync();
    },
    undefined,
    (err) => {
      console.error('[mascot] load failed', err);
      track.classList.add('is-error');
    }
  );

  // 鼠标轻微看向
  let mouseX = 0;
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  });

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (mixer) mixer.update(dt);
    if (modelRoot) {
      // 朝向：走路方向 + 轻微看鼠标
      const baseY = faceSign > 0 ? 0.25 : Math.PI - 0.25;
      const targetY = baseY + mouseX * 0.2 * faceSign;
      modelRoot.rotation.y = THREE.MathUtils.lerp(modelRoot.rotation.y, targetY, 0.06);
    }
    renderer.render(scene, camera);
  }
  animate();

  // CSS 动画 28s 一轮：0–50% 向右，50–100% 向左 → 在 50% 处转身
  const WALK_MS = 28000;
  function startFaceSync() {
    const half = WALK_MS / 2;
    // 与 animation 开始对齐
    const t0 = performance.now();
    function sync() {
      const elapsed = (performance.now() - t0) % WALK_MS;
      faceSign = elapsed < half ? 1 : -1;
      requestAnimationFrame(sync);
    }
    requestAnimationFrame(sync);
  }

  const COUPON_LINES = [
    { title: 'Got a code?', code: 'Min. S$50 to use' },
    { title: 'Psst… coupon!', code: 'Ask us on WhatsApp' },
    { title: 'Party soon?', code: 'Bulk order discounts' },
    { title: 'Hello!', code: 'Try a code in the cart' },
  ];

  function showCouponBubble() {
    if (!bubble || track.classList.contains('is-hidden')) return;
    const line = COUPON_LINES[Math.floor(Math.random() * COUPON_LINES.length)];
    bubble.querySelector('strong').textContent = line.title;
    bubble.querySelector('span').textContent = line.code;
    bubble.classList.add('is-show');
    bubble.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      bubble.classList.remove('is-show');
      bubble.setAttribute('aria-hidden', 'true');
    }, 4800);
  }

  function scheduleCouponBubble() {
    const first = 6000 + Math.random() * 6000;
    setTimeout(function tick() {
      showCouponBubble();
      setTimeout(tick, 22000 + Math.random() * 18000);
    }, first);
  }

  container.addEventListener('click', (e) => {
    if (e.target === hideBtn || hideBtn?.contains(e.target)) return;
    showCouponBubble();
  });

  if (hideBtn && recallBtn) {
    hideBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      track.classList.add('is-hidden');
      recallBtn.hidden = false;
    });
    recallBtn.addEventListener('click', () => {
      track.classList.remove('is-hidden');
      recallBtn.hidden = true;
      resize();
    });
  }
}
