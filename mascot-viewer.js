/**
 * JW Just Wishes — 3D mascot
 * 全身 · 随机走动（非固定路径）· 拖动位移 · 拖动旋转 360° · 甩走 · 送折扣码
 *
 * 这一版修正/改进的地方：
 * 1. 之前只要点一下（不管是拿折扣码还是拖拽），is-walking 这个 class 会被拿掉，
 *    但后面完全没有代码把它加回来，所以角色一旦被点过就永久定格。
 *    现在改成：拿折扣码 / 拖拽放开之后，都会安排一小段延迟，然后自动恢复走动。
 * 2. 之前的"走路"其实是一条固定的 CSS 位移路径（28秒从左走到右、再走回来），
 *    每次都一样，不是真的随机。现在改成 JS 控制的随机游走：
 *    每一小段会随机挑一个新的位置、随机的移动时长、走到定点后随机停留一下，
 *    看起来才像真的在到处闲晃，而不是机械式来回。
 * 3. 如果 mascot.glb 里有区分「走路」「待机」的动画片段（clip 名字含 walk / idle / run），
 *    会在移动 / 停留时自动切换对应动作；如果没有区分（只有一个或没取名），
 *    仍然维持原本「全部动画一起播放」的保底做法，不会因为找不到对应片段就完全没动作。
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
  const clock = new THREE.Clock();

  // 走路 / 待机动作（如果模型里有区分的话）
  let walkAction = null;
  let idleAction = null;
  let currentMotion = 'idle'; // 'idle' | 'walk'

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

  // 切换「走路」/「待机」动作（如果模型有对应片段的话，做交叉淡入淡出）
  function setMotion(state) {
    if (state === currentMotion) return;
    currentMotion = state;
    if (!walkAction || !idleAction) return; // 模型没有分开的走路/待机动作，就不处理，交给保底播放
    const from = state === 'walk' ? idleAction : walkAction;
    const to = state === 'walk' ? walkAction : idleAction;
    to.reset().play();
    to.crossFadeFrom(from, 0.35, true);
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

        // 尝试依名字找出「走路」「待机」片段（不分大小写，含 walk/run 或 idle 关键字）
        const findClip = (keywords) =>
          gltf.animations.find((c) => keywords.some((k) => c.name.toLowerCase().includes(k)));
        const walkClip = findClip(['walk', 'run']);
        const idleClip = findClip(['idle', 'stand']);

        if (walkClip && idleClip) {
          walkAction = mixer.clipAction(walkClip);
          idleAction = mixer.clipAction(idleClip);
          walkAction.play();
          idleAction.play();
          walkAction.setEffectiveWeight(0);
          idleAction.setEffectiveWeight(1);
          currentMotion = 'idle';
        } else {
          // 保底：模型没有区分走路/待机动作，就把找到的所有动画都播放（维持原本行为）
          gltf.animations.forEach((c) => mixer.clipAction(c).play());
        }
      }

      track.classList.add('is-ready', 'is-walking');
      console.log('[mascot] loaded');
      scheduleCouponBubble();
      startWandering();
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
      modelRoot.rotation.y = rotY;
      modelRoot.rotation.x = THREE.MathUtils.clamp(rotX, -0.45, 0.45);
    }
    renderer.render(scene, camera);
  }
  animate();

  // ==================== 随机游走（取代原本固定的CSS路径）====================
  let wanderTimer = null;
  let wandering = false;

  function getBounds() {
    const w = container.offsetWidth || 112;
    const h = container.offsetHeight || 138;
    const margin = 8;
    const bottomFixed = window.innerWidth <= 520 ? 12 : 16; // 保持贴地，只在水平方向游走
    return {
      minX: margin,
      maxX: Math.max(margin, window.innerWidth - w - margin),
      bottom: bottomFixed,
      w,
      h,
    };
  }

  function currentLeft() {
    const rect = container.getBoundingClientRect();
    return rect.left;
  }

  function stopWandering() {
    wandering = false;
    if (wanderTimer) {
      clearTimeout(wanderTimer);
      wanderTimer = null;
    }
    container.removeEventListener('transitionend', onLegEnd);
  }

  function onLegEnd(e) {
    if (e.propertyName !== 'left') return;
    container.removeEventListener('transitionend', onLegEnd);
    setMotion('idle');
    container.classList.remove('is-moving');
    // 走到定点后，随机停留 1~4 秒，再走下一段
    const pause = 1000 + Math.random() * 3000;
    wanderTimer = setTimeout(walkNextLeg, pause);
  }

  function walkNextLeg() {
    if (!wandering || dragging) return;
    const b = getBounds();
    const from = currentLeft();
    // 随机挑一个新的目的地（水平方向），确保跟目前位置有一点距离，不要走得太琐碎
    let target;
    let attempts = 0;
    do {
      target = b.minX + Math.random() * (b.maxX - b.minX);
      attempts++;
    } while (Math.abs(target - from) < Math.min(80, (b.maxX - b.minX) * 0.25) && attempts < 6);

    const distance = Math.abs(target - from);
    const speedPxPerSec = 55 + Math.random() * 25; // 每次速度略有不同，更自然
    const duration = Math.max(1.2, Math.min(9, distance / speedPxPerSec));

    // 面向移动方向
    const movingRight = target > from;
    const faceTarget = movingRight ? 0.2 : Math.PI - 0.2;
    rotY += (faceTarget - rotY); // 直接转向（走动瞬间转身，简单可靠）

    container.style.transition = `left ${duration}s linear`;
    container.style.left = target + 'px';
    container.style.bottom = b.bottom + 'px';
    container.style.top = 'auto';
    container.style.right = 'auto';

    container.classList.add('is-moving');
    setMotion('walk');

    container.addEventListener('transitionend', onLegEnd);
  }

  function startWandering() {
    if (wandering) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return; // 尊重系统的「减少动态效果」设定，角色保持静止不到处走
    wandering = true;
    // 初次先待机个 0.5~1.5 秒再开始走，比较自然
    wanderTimer = setTimeout(walkNextLeg, 500 + Math.random() * 1000);
  }

  function resumeWanderingSoon(delay = 1200) {
    if (track.classList.contains('is-hidden')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    track.classList.add('is-walking');
    stopWandering();
    wandering = true;
    wanderTimer = setTimeout(walkNextLeg, delay);
  }

  // —— 拖：移动位置 + 旋转 360° ——
  let dragging = false;
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
    track.classList.remove('is-walking');
    stopWandering();
    setMotion('idle');
    container.classList.remove('is-moving');
    track.classList.add('is-dragging');
    container.classList.add('is-dragging');

    const rect = container.getBoundingClientRect();
    posX = rect.left;
    posY = rect.top;
    container.style.transition = 'none';
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

    rotY += dx * 0.012;
    rotX += dy * 0.006;

    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
    setManualPos(posX + dx, posY + dy);

    lastX = cx;
    lastY = cy;
    lastT = now;
  }

  function flingAway() {
    track.classList.add('is-leaving');
    stopWandering();
    container.style.transition = 'transform 0.55s cubic-bezier(0.25, 0.8, 0.4, 1), opacity 0.55s ease';
    const dirX = vx >= 0 ? 1 : -1;
    const dirY = vy >= 0 ? 1 : -1;
    container.style.transform = `translate(${dirX * 120}vw, ${dirY * 40}vh) rotate(${dirX * 28}deg) scale(0.25)`;
    container.style.opacity = '0';
    setTimeout(() => {
      track.classList.add('is-hidden');
      track.classList.remove('is-leaving', 'is-dragging', 'is-walking');
      container.classList.remove('is-dragging', 'is-moving');
      container.style.transition = '';
      container.style.transform = '';
      container.style.opacity = '';
      container.style.left = '';
      container.style.top = '';
      container.style.bottom = '';
      if (recallBtn) recallBtn.hidden = false;
    }, 560);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
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
    // 轻点（几乎没移动）→ 送折扣码，然后过一会儿恢复走动
    if (!moved || speed < 0.1) {
      giveDiscountCode();
      resumeWanderingSoon(1800); // 给人时间看到气泡，再继续走
      return;
    }
    // 拖着移动了一段距离后放开 → 从目前位置继续随机游走
    resumeWanderingSoon(800);
  }

  container.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      rotY += e.deltaY * 0.005;
    },
    { passive: false }
  );

  container.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // —— 送折扣码 ——
  function giveDiscountCode() {
    if (!bubble || track.classList.contains('is-hidden')) return;
    const item = MASCOT_CODES[Math.floor(Math.random() * MASCOT_CODES.length)];

    bubble.innerHTML = `
      <strong>${item.label}</strong>
      <span class="glb-code" data-code="${item.code}">${item.code}</span>
      <em>${item.min} · tap code to copy</em>
    `;
    bubble.classList.add('is-show');

    const input = document.getElementById('discountCodeInput');
    if (input) {
      input.value = item.code;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

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
      container.style.transition = 'none';
      setManualPos(posX, posY);
      container.style.opacity = '0';
      container.style.transform = 'translateX(60px) scale(0.5)';
      requestAnimationFrame(() => {
        container.style.transition = 'transform 0.45s cubic-bezier(0.34,1.3,0.64,1), opacity 0.4s';
        container.style.opacity = '1';
        container.style.transform = 'none';
        setTimeout(() => {
          container.style.transition = '';
          container.style.left = '';
          container.style.top = '';
          container.style.bottom = '';
          startWandering();
        }, 480);
      });
      resize();
    });
  }
}
