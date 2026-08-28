/**
 * JW Just Wishes — floating 3D mascot (mascot.glb)
 * Walks randomly along the bottom of the page (no frame).
 * Replaces the old 2D corner mascots.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CANVAS_ID = 'mascotCanvas';
const MODEL_CANDIDATES = [
  'images/mascot/mascot.glb',
  'images/mascot.glb',
  'images/mascot/Wishy.glb',
  'images/mascot/wishy.glb',
  'mascot.glb',
  'models/mascot.glb',
];

async function resolveModelUrl() {
  for (const path of MODEL_CANDIDATES) {
    try {
      const res = await fetch(path, { method: 'HEAD' });
      if (res.ok) return path;
    } catch {
      /* next */
    }
  }
  return MODEL_CANDIDATES[0];
}

function initMascotViewer() {
  const canvas = document.getElementById(CANVAS_ID);
  const container = document.getElementById('glbMascotContainer');
  const track = document.getElementById('glbMascotTrack');
  const hideBtn = document.getElementById('glbMascotHide');
  const recallBtn = document.getElementById('glbMascotRecall');
  if (!canvas || !container || !track) return;

  // Hide any leftover 2D mascot nodes script.js may inject
  const killLegacy = () => {
    document.querySelectorAll('.mascot-track, .nav-mascot-track').forEach((el) => {
      el.style.display = 'none';
    });
  };
  killLegacy();
  const mo = new MutationObserver(killLegacy);
  mo.observe(document.body, { childList: true, subtree: true });

  const size = () => ({
    w: container.clientWidth || 110,
    h: container.clientHeight || 130,
  });

  const scene = new THREE.Scene();
  scene.background = null;

  const { w: iw, h: ih } = size();
  const camera = new THREE.PerspectiveCamera(32, iw / ih, 0.05, 50);
  camera.position.set(0, 0.4, 2.2);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(iw, ih, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  scene.add(new THREE.AmbientLight(0xfff5f0, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(2, 3.5, 2.5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb8d4ff, 0.5);
  fill.position.set(-2.5, 1.2, -1);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight(0xffeef5, 0xe8f0ff, 0.5));

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = Math.PI * 0.25;
  controls.maxPolarAngle = Math.PI * 0.65;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 2.2;
  controls.target.set(0, 0.25, 0);
  controls.update();

  // Pause spin while interacting
  let idleTimer = null;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
    pauseWalk = true;
  });
  controls.addEventListener('end', () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      controls.autoRotate = true;
      pauseWalk = false;
    }, 3500);
  });

  // --- Load GLB ---
  let modelRoot = null;
  const loader = new GLTFLoader();
  resolveModelUrl().then((url) => {
    loader.load(
      url,
      (gltf) => {
        modelRoot = gltf.scene;
        modelRoot.traverse((child) => {
          if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material)
              ? child.material
              : [child.material];
            mats.forEach((m) => {
              if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
              m.needsUpdate = true;
            });
          }
        });
        // Center & ground
        const box = new THREE.Box3().setFromObject(modelRoot);
        const sizeV = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        modelRoot.position.sub(center);
        const yMin = new THREE.Box3().setFromObject(modelRoot).min.y;
        modelRoot.position.y -= yMin;
        const maxDim = Math.max(sizeV.x, sizeV.y, sizeV.z) || 1;
        const dist = maxDim * 2.0;
        camera.position.set(dist * 0.2, dist * 0.35, dist);
        controls.target.set(0, sizeV.y * 0.4, 0);
        controls.update();
        scene.add(modelRoot);
      },
      undefined,
      (err) => {
        console.error('[glb-mascot] load failed', url, err);
        container.style.opacity = '0.35';
        container.title = 'Failed to load mascot.glb';
      }
    );
  });

  // --- Random walk along bottom ---
  let posX = 12; // px from left
  let dir = 1; // 1 = right, -1 = left
  let speed = 0.35 + Math.random() * 0.25; // px per frame-ish
  let pauseWalk = false;
  let nextTurnAt = performance.now() + 4000 + Math.random() * 6000;
  let bobT = 0;

  function maxX() {
    return Math.max(0, window.innerWidth - container.offsetWidth - 12);
  }

  function pickNewSpeed() {
    speed = 0.28 + Math.random() * 0.45;
  }

  function walkFrame(now) {
    if (!pauseWalk && !track.classList.contains('is-hidden')) {
      // occasional random direction change
      if (now >= nextTurnAt) {
        dir *= -1;
        pickNewSpeed();
        nextTurnAt = now + 3000 + Math.random() * 8000;
      }

      posX += dir * speed;

      const max = maxX();
      if (posX <= 8) {
        posX = 8;
        dir = 1;
        pickNewSpeed();
        nextTurnAt = now + 4000 + Math.random() * 5000;
      } else if (posX >= max) {
        posX = max;
        dir = -1;
        pickNewSpeed();
        nextTurnAt = now + 4000 + Math.random() * 5000;
      }

      // gentle bob
      bobT += 0.04;
      const bobY = Math.sin(bobT) * 3;

      container.style.left = `${posX}px`;
      container.style.bottom = `${8 + bobY}px`;
      // Face walk direction by yawing the 3D model (no CSS mirror)
      if (modelRoot) {
        const targetYaw = dir < 0 ? Math.PI / 2 : -Math.PI / 2;
        modelRoot.rotation.y += (targetYaw - modelRoot.rotation.y) * 0.08;
      }
    }
  }

  // Resize
  function onResize() {
    const { w, h } = size();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    posX = Math.min(posX, maxX());
  }
  window.addEventListener('resize', onResize);
  const ro = new ResizeObserver(onResize);
  ro.observe(container);

  // Hide / recall
  if (hideBtn) {
    hideBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      track.classList.add('is-hidden');
      if (recallBtn) recallBtn.hidden = false;
    });
  }
  if (recallBtn) {
    recallBtn.addEventListener('click', () => {
      track.classList.remove('is-hidden');
      recallBtn.hidden = true;
      posX = maxX() * 0.6;
      dir = -1;
    });
  }

  // Optional: drag container horizontally (does not conflict with orbit on canvas much)
  let drag = null;
  container.addEventListener('pointerdown', (e) => {
    if (e.target === hideBtn) return;
    // only start container drag with shift or long-press alternative: middle/right skipped
    // Keep orbit on canvas; skip container drag to avoid fighting controls
  });

  function animate(now) {
    requestAnimationFrame(animate);
    walkFrame(now || performance.now());
    controls.update();
    renderer.render(scene, camera);
  }
  // start roughly mid-right
  posX = Math.min(maxX() * 0.55, maxX());
  animate(performance.now());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMascotViewer);
} else {
  initMascotViewer();
}
