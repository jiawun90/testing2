/**
 * JW Just Wishes — free-roaming 3D mascot + occasional coupon bubble
 * Model: images/mascot/model.glb (Draco OK)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const canvas = document.getElementById('mascotCanvas');
const track = document.getElementById('glbMascotTrack');
const container = document.getElementById('glbMascotContainer');
const hideBtn = document.getElementById('glbMascotHide');
const recallBtn = document.getElementById('glbMascotRecall');

if (!canvas || !track || !container) {
  console.warn('[mascot] missing DOM');
} else {
  // —— Renderer（透明，无边框感）——
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
  camera.position.set(0, 0.95, 2.6);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  scene.add(new THREE.HemisphereLight(0xfff8f0, 0x9999aa, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(2, 5, 3);
  scene.add(key);

  function resize() {
    const w = canvas.clientWidth || 110;
    const h = canvas.clientHeight || 130;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize);
  resize();

  let mixer = null;
  let modelRoot = null;
  const clock = new THREE.Clock();
  const lookTarget = new THREE.Vector3(0, 0.8, 0);

  // Draco
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
      const scale = 1.5 / maxDim;
      modelRoot.scale.setScalar(scale);
      modelRoot.position.sub(center.multiplyScalar(scale));
      modelRoot.position.y = 0;
      scene.add(modelRoot);

      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(modelRoot);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
      }

      track.classList.add('is-ready');
      console.log('[mascot] loaded');
      startWander();
      scheduleCouponBubble();
    },
    undefined,
    (err) => {
      console.error('[mascot] load failed', err);
      track.classList.add('is-error');
    }
  );

  // 轻微跟随鼠标一点点转头（更活）
  let mouseX = 0;
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  });

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (mixer) mixer.update(dt);
    if (modelRoot) {
      // 轻微左右看
      modelRoot.rotation.y = THREE.MathUtils.lerp(
        modelRoot.rotation.y,
        mouseX * 0.35,
        0.04
      );
    }
    renderer.render(scene, camera);
  }
  animate();

  // —— 在屏幕底部左右走动 ——
  let facingRight = true;
  function startWander() {
    track.classList.add('is-walking');
  }

  // 走到边缘时翻面（用 CSS 动画 + 节点 class）
  // 用 JS 定时在左右端切换 scaleX，避免气泡文字镜像
  const walkDurationMs = 14000; // 单程时间
  function flipLoop() {
    facingRight = !facingRight;
    container.classList.toggle('is-flipped', !facingRight);
  }
  // 与 CSS animation 半程对齐
  setInterval(flipLoop, walkDurationMs);

  // —— 折扣券气泡 ——
  const COUPON_LINES = [
    { title: 'Psst… coupon time!', code: 'Ask us on WhatsApp' },
    { title: 'Got a code?', code: 'Min. S$50 to use' },
    { title: 'Party soon?', code: 'Discount for bulk orders' },
    { title: 'Hello!', code: 'Tap cart · try a code' },
  ];

  function ensureBubble() {
    let bubble = container.querySelector('.glb-coupon-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'glb-coupon-bubble';
      bubble.innerHTML = '<strong></strong><span></span>';
      container.appendChild(bubble);
    }
    return bubble;
  }

  function showCouponBubble() {
    if (track.classList.contains('is-hidden')) return;
    const bubble = ensureBubble();
    const line = COUPON_LINES[Math.floor(Math.random() * COUPON_LINES.length)];
    bubble.querySelector('strong').textContent = line.title;
    bubble.querySelector('span').textContent = line.code;
    bubble.classList.add('is-show');
    setTimeout(() => bubble.classList.remove('is-show'), 4500);
  }

  function scheduleCouponBubble() {
    // 首次 8–15 秒后出现，之后每隔 25–45 秒
    const first = 8000 + Math.random() * 7000;
    setTimeout(function tick() {
      showCouponBubble();
      const next = 25000 + Math.random() * 20000;
      setTimeout(tick, next);
    }, first);
  }

  // 点击吉祥物也说一次
  container.addEventListener('click', (e) => {
    if (e.target === hideBtn || hideBtn?.contains(e.target)) return;
    showCouponBubble();
  });

  // Hide / recall
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
