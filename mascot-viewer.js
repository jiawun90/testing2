/**
 * JW Just Wishes — 3D mascot
 * 全身可见 · 可拖 · 可甩走 · 可召回 · 折扣气泡
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
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  scene.add(new THREE.HemisphereLight(0xfff8f0, 0x888899, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2, 6, 4);
  scene.add(key);

  function resize() {
    const w = Math.max(canvas.clientWidth, 1);
    const h = Math.max(canvas.clientHeight, 1);
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

  /** 把整只模型装进镜头 */
  function frameModel(root) {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center); // 原点居中

    const maxSize = Math.max(size.x, size.y, size.z) || 1;
    const fitH = size.y || maxSize;
    const fitW = Math.max(size.x, size.z) || maxSize;
    const fov = camera.fov * (Math.PI / 180);
    const fitHeightDist = (fitH * 0.5) / Math.tan(fov * 0.5);
    const fitWidthDist = (fitW * 0.5) / Math.tan(fov * 0.5) / Math.max(camera.aspect, 0.1);
    const dist = Math.max(fitHeightDist, fitWidthDist) * 1.35;

    camera.position.set(0, size.y * 0.05, dist);
    camera.near = dist / 100;
    camera.far = dist * 100;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  loader.load(
    'images/mascot/model.glb',
    (gltf) => {
      modelRoot = gltf.scene;
      // 先统一缩放到约 1.5 单位高，再 frame
      const box0 = new THREE.Box3().setFromObject(modelRoot);
      const s0 = box0.getSize(new THREE.Vector3());
      const m0 = Math.max(s0.x, s0.y, s0.z) || 1;
      modelRoot.scale.setScalar(1.5 / m0);
      scene.add(modelRoot);
      frameModel(modelRoot);
      resize();

      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(modelRoot);
        gltf.animations.forEach((c) => mixer.clipAction(c).play());
      }

      track.classList.add('is-ready', 'is-walking');
      console.log('[mascot] loaded + framed');
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
    if (modelRoot && !dragging) {
      const baseY = faceSign > 0 ? 0.15 : Math.PI - 0.15;
      modelRoot.rotation.y = THREE.MathUtils.lerp(
        modelRoot.rotation.y,
        baseY + mouseX * 0.12 * faceSign,
        0.05
      );
    }
    renderer.render(scene, camera);
  }
  animate();

  const WALK_MS = 28000;
  function startFaceSync() {
    const half = WALK_MS / 2;
    const t0 = performance.now();
    (function sync() {
      if (!dragging && track.classList.contains('is-walking')) {
        const elapsed = (performance.now() - t0) % WALK_MS;
        faceSign = elapsed < half ? 1 : -1;
      }
      requestAnimationFrame(sync);
    })();
  }

  // —— 拖拽 / 甩走 ——
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let vx = 0;
  let vy = 0;
  let posX = null; // px，手动模式
  let posY = null;

  function setManualPos(x, y) {
    const maxX = window.innerWidth - container.offsetWidth;
    const maxY = window.innerHeight - container.offsetHeight;
    posX = Math.min(maxX, Math.max(0, x));
    posY = Math.min(maxY, Math.max(0, y));
    container.style.left = posX + 'px';
    container.style.top = posY + 'px';
    container.style.bottom = 'auto';
    container.style.right = 'auto';
  }

  function onPointerDown(e) {
    if (e.target === hideBtn || hideBtn?.contains(e.target)) return;
    e.preventDefault();
    dragging = true;
    track.classList.remove('is-walking');
    track.classList.add('is-dragging');
    container.classList.add('is-dragging');

    const rect = container.getBoundingClientRect();
    posX = rect.left;
    posY = rect.top;
    container.style.animation = 'none';
    setManualPos(posX, posY);

    lastX = e.clientX ?? e.touches?.[0]?.clientX;
    lastY = e.clientY ?? e.touches?.[0]?.clientY;
    lastT = performance.now();
    vx = 0;
    vy = 0;

    container.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    if (cx == null) return;
    const now = performance.now();
    const dt = Math.max(now - lastT, 1);
    vx = (cx - lastX) / dt;
    vy = (cy - lastY) / dt;
    const dx = cx - lastX;
    const dy = cy - lastY;
    lastX = cx;
    lastY = cy;
    lastT = now;
    setManualPos(posX + dx, posY + dy);

    // 拖的时候模型跟着转一点
    if (modelRoot) {
      modelRoot.rotation.y += dx * 0.01;
    }
  }

  function flingAway() {
    track.classList.add('is-leaving');
    container.style.transition = 'transform 0.55s cubic-bezier(0.25, 0.8, 0.4, 1), opacity 0.55s ease';
    const dirX = vx >= 0 ? 1 : -1;
    const dirY = vy >= 0 ? 1 : -1;
    container.style.transform = `translate(${dirX * 120}vw, ${dirY * 40}vh) rotate(${dirX * 25}deg) scale(0.3)`;
    container.style.opacity = '0';
    setTimeout(() => {
      track.classList.add('is-hidden');
      track.classList.remove('is-leaving', 'is-dragging', 'is-walking');
      container.classList.remove('is-dragging');
      container.style.transition = '';
      container.style.transform = '';
      container.style.opacity = '';
      container.style.left = '';
      container.style.top = '';
      container.style.bottom = '';
      container.style.animation = '';
      if (recallBtn) recallBtn.hidden = false;
    }, 560);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    track.classList.remove('is-dragging');
    container.classList.remove('is-dragging');
    container.releasePointerCapture?.(e.pointerId);

    const speed = Math.hypot(vx, vy); // px/ms
    // 甩得够快 → 丢掉
    if (speed > 0.85) {
      flingAway();
      return;
    }
    // 否则停在原地，可再拖；双击区域外不自动走
    // 轻点：弹气泡
    if (speed < 0.12) {
      showCouponBubble();
    }
  }

  container.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // —— 气泡 ——
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
    setTimeout(() => bubble.classList.remove('is-show'), 4500);
  }

  function scheduleCouponBubble() {
    setTimeout(function tick() {
      if (!dragging && !track.classList.contains('is-hidden')) showCouponBubble();
      setTimeout(tick, 24000 + Math.random() * 16000);
    }, 8000);
  }

  if (hideBtn) {
    hideBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      flingAway();
    });
  }

  if (recallBtn) {
    recallBtn.addEventListener('click', () => {
      track.classList.remove('is-hidden');
      recallBtn.hidden = true;
      // 从右侧滚回来
      posX = window.innerWidth - 160;
      posY = window.innerHeight - 200;
      setManualPos(posX, posY);
      container.style.opacity = '0';
      container.style.transform = 'translateX(80px) scale(0.5)';
      requestAnimationFrame(() => {
        container.style.transition = 'transform 0.45s cubic-bezier(0.34,1.3,0.64,1), opacity 0.4s';
        container.style.opacity = '1';
        container.style.transform = 'none';
        setTimeout(() => {
          container.style.transition = '';
          track.classList.add('is-walking');
          container.style.left = '';
          container.style.top = '';
          container.style.bottom = '';
          container.style.animation = '';
        }, 480);
      });
      resize();
    });
  }
}
