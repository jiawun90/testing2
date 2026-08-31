/**
 * JW Just Wishes — free-roaming 3D mascot (full body, above footer)
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
  // 拉远 + 略俯视，整只入画
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 1.2, 3.6);
  camera.lookAt(0, 0.7, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  scene.add(new THREE.HemisphereLight(0xfff8f0, 0x9999aa, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(2, 5, 3);
  scene.add(key);

  function resize() {
    const w = canvas.clientWidth || 160;
    const h = canvas.clientHeight || 190;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize);
  requestAnimationFrame(resize);

  let mixer = null;
  let modelRoot = null;
  let faceSign = 1;
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
      const scale = 1.2 / maxDim;
      modelRoot.scale.setScalar(scale);
      modelRoot.position.sub(center.multiplyScalar(scale));
      modelRoot.position.y = 0;
      scene.add(modelRoot);
      camera.lookAt(0, size.y * scale * 0.42, 0);

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

  let mouseX = 0;
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  });

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (mixer) mixer.update(dt);
    if (modelRoot) {
      const baseY = faceSign > 0 ? 0.2 : Math.PI - 0.2;
      const targetY = baseY + mouseX * 0.15 * faceSign;
      modelRoot.rotation.y = THREE.MathUtils.lerp(modelRoot.rotation.y, targetY, 0.06);
    }
    renderer.render(scene, camera);
  }
  animate();

  const WALK_MS = 28000;
  function startFaceSync() {
    const half = WALK_MS / 2;
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
    setTimeout(() => bubble.classList.remove('is-show'), 4800);
  }

  function scheduleCouponBubble() {
    setTimeout(function tick() {
      showCouponBubble();
      setTimeout(tick, 22000 + Math.random() * 18000);
    }, 6000 + Math.random() * 5000);
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
