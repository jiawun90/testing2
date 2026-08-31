/**
 * JW Just Wishes — 3D mascot
 * 全身 · 拖动位移 · 拖动旋转 360° · 甩走 · 送折扣码
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

// ★ 吉祥物送出的折扣码（请在后端 / KV 里生成同样的码，并设满 S$50）
// 用完可改成新码，或做成「每人每天一次」由后端发放
const MASCOT_CODES = [
  { code: 'WISHY5', label: 'S$5 off', min: 'Min. S$50' },
  { code: 'WISHY10', label: '10% off', min: 'Min. S$50' },
  { code: 'HELLO', label: 'Welcome deal', min: 'Min. S$50' },
];

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
  let rotY = 0.2;
  let rotX = 0;
  let faceSign = 1;
  const clock = new THREE.Clock();

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  dracoLoader.setDecoderConfig({ type: 'js' });
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  function frameModel(root) {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);

    const fitH = size.y || 1;
    const fitW = Math.max(size.x, size.z) || 1;
    const fov = camera.fov * (Math.PI / 180);
    const distH = (fitH * 0.5) / Math.tan(fov * 0.5);
    const distW = (fitW * 0.5) / Math.tan(fov * 0.5) / Math.max(camera.aspect, 0.1);
    const dist = Math.max(distH, distW) * 1.4;

    camera.position.set(0, size.y * 0.02, dist);
    camera.near = dist / 100;
    camera.far = dist * 100;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  loader.load(
    'images/mascot/model.glb',
    (gltf) => {
      modelRoot = gltf.scene;
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

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (mixer) mixer.update(dt);
    if (modelRoot) {
      // 360°：rotY 无限制累加
      modelRoot.rotation.y = rotY;
      modelRoot.rotation.x = THREE.MathUtils.clamp(rotX, -0.45, 0.45);
    }
    renderer.render(scene, camera);
  }
  animate();

  const WALK_MS = 28000;
  function startFaceSync() {
    const half = WALK_MS / 2;
    const t0 = performance.now();
    (function sync() {
      if (!dragging && track.classList.contains('is-walking') && !userRotating) {
        const elapsed = (performance.now() - t0) % WALK_MS;
        faceSign = elapsed < half ? 1 : -1;
        // 走路时缓慢转向
        const target = faceSign > 0 ? 0.2 : Math.PI - 0.2;
        rotY += (target - rotY) * 0.03;
      }
      requestAnimationFrame(sync);
    })();
  }

  // —— 拖：移动位置 + 旋转 360° ——
  // 以按下后位移判断：移动多 = 移位；若按住并左右拖，同时旋转
  let dragging = false;
  let userRotating = false;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let vx = 0;
  let vy = 0;
  let posX = null;
  let posY = null;
  let moved = false;

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
    if (e.target.closest?.('.glb-coupon-bubble')) return;
    e.preventDefault();
    dragging = true;
    moved = false;
    userRotating = true;
    track.classList.remove('is-walking');
    track.classList.add('is-dragging');
    container.classList.add('is-dragging');

    const rect = container.getBoundingClientRect();
    posX = rect.left;
    posY = rect.top;
    container.style.animation = 'none';
    setManualPos(posX, posY);

    lastX = e.clientX;
    lastY = e.clientY;
    lastT = performance.now();
    vx = 0;
    vy = 0;
    try {
      container.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const cx = e.clientX;
    const cy = e.clientY;
    const now = performance.now();
    const dt = Math.max(now - lastT, 1);
    const dx = cx - lastX;
    const dy = cy - lastY;
    vx = dx / dt;
    vy = dy / dt;

    // 水平拖 → 绕 Y 轴 360°（不限制）
    rotY += dx * 0.012;
    // 垂直拖 → 轻微俯仰
    rotX += dy * 0.006;

    // 同时移动位置
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
    setManualPos(posX + dx, posY + dy);

    lastX = cx;
    lastY = cy;
    lastT = now;
  }

  function flingAway() {
    track.classList.add('is-leaving');
    container.style.transition = 'transform 0.55s cubic-bezier(0.25, 0.8, 0.4, 1), opacity 0.55s ease';
    const dirX = vx >= 0 ? 1 : -1;
    const dirY = vy >= 0 ? 1 : -1;
    container.style.transform = `translate(${dirX * 120}vw, ${dirY * 40}vh) rotate(${dirX * 28}deg) scale(0.25)`;
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
    userRotating = false;
    track.classList.remove('is-dragging');
    container.classList.remove('is-dragging');
    try {
      container.releasePointerCapture(e.pointerId);
    } catch (_) {}

    const speed = Math.hypot(vx, vy);
    if (speed > 0.85) {
      flingAway();
      return;
    }
    // 轻点（几乎没移动）→ 送折扣码
    if (!moved || speed < 0.1) {
      giveDiscountCode();
    }
  }

  // 滚轮也可 360 转
  container.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      rotY += e.deltaY * 0.005;
      userRotating = true;
      track.classList.remove('is-walking');
    },
    { passive: false }
  );

  container.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // —— 送折扣码 ——
  let lastGivenCode = null;

  function giveDiscountCode() {
    if (!bubble || track.classList.contains('is-hidden')) return;
    const item = MASCOT_CODES[Math.floor(Math.random() * MASCOT_CODES.length)];
    lastGivenCode = item.code;

    bubble.innerHTML = `
      <strong>${item.label}</strong>
      <span class="glb-code" data-code="${item.code}">${item.code}</span>
      <em>${item.min} · tap code to copy</em>
    `;
    bubble.classList.add('is-show');

    // 尝试写入购物车折扣输入框
    const input = document.getElementById('discountCodeInput');
    if (input) {
      input.value = item.code;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 点击码复制
    const codeEl = bubble.querySelector('.glb-code');
    if (codeEl) {
      codeEl.style.cursor = 'pointer';
      codeEl.title = 'Click to copy';
      codeEl.onclick = async (ev) => {
        ev.stopPropagation();
        try {
          await navigator.clipboard.writeText(item.code);
          codeEl.textContent = 'Copied!';
          setTimeout(() => {
            codeEl.textContent = item.code;
          }, 1200);
        } catch (_) {
          // fallback
          if (input) {
            input.focus();
            input.select();
          }
        }
      };
    }

    setTimeout(() => bubble.classList.remove('is-show'), 8000);
  }

  function scheduleCouponBubble() {
    setTimeout(function tick() {
      if (!dragging && !track.classList.contains('is-hidden')) giveDiscountCode();
      setTimeout(tick, 28000 + Math.random() * 20000);
    }, 10000);
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
      posX = window.innerWidth - 180;
      posY = window.innerHeight - 220;
      setManualPos(posX, posY);
      container.style.opacity = '0';
      container.style.transform = 'translateX(60px) scale(0.5)';
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
