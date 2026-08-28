/**
 * JW Just Wishes — 3D mascot viewer (mascot.glb)
 * Uses Three.js + OrbitControls + GLTFLoader
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CANVAS_ID = 'mascotCanvas';
const HINT_ID = 'mascotHint';
/** User placed model under images/mascot/ (or images/mascot.glb) */
const MODEL_CANDIDATES = [
  'images/mascot/mascot.glb',
  'images/mascot.glb',
  'images/mascot/Wishy.glb',
  'images/mascot/wishy.glb',
  'mascot.glb',
  'models/mascot.glb',
];

function setHint(text, state = '') {
  const el = document.getElementById(HINT_ID);
  if (!el) return;
  el.textContent = text;
  el.classList.remove('is-ready', 'is-error');
  if (state) el.classList.add(state);
}

async function resolveModelUrl() {
  for (const path of MODEL_CANDIDATES) {
    try {
      const res = await fetch(path, { method: 'HEAD' });
      if (res.ok) return path;
    } catch {
      /* try next */
    }
  }
  return MODEL_CANDIDATES[0];
}

function initMascotViewer() {
  const canvas = document.getElementById(CANVAS_ID);
  if (!canvas) return;

  const wrap = canvas.parentElement;
  const width = () => wrap.clientWidth || 400;
  const height = () => wrap.clientHeight || 400;

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(35, width() / height(), 0.1, 100);
  camera.position.set(0, 0.35, 2.4);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width(), height(), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const ambient = new THREE.AmbientLight(0xfff5f0, 0.85);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(2.5, 4, 3);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xb8d4ff, 0.55);
  fill.position.set(-3, 1.5, -1);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffd6e7, 0.4);
  rim.position.set(0, 2, -3);
  scene.add(rim);

  const hemi = new THREE.HemisphereLight(0xffeef5, 0xe8f0ff, 0.45);
  scene.add(hemi);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1.2;
  controls.maxDistance = 5;
  controls.target.set(0, 0.15, 0);
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.update();

  let idleTimer = null;
  const resumeAuto = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      controls.autoRotate = true;
    }, 4000);
  };
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
  });
  controls.addEventListener('end', resumeAuto);

  canvas.addEventListener('dblclick', () => {
    camera.position.set(0, 0.35, 2.4);
    controls.target.set(0, 0.15, 0);
    controls.update();
  });

  const loader = new GLTFLoader();

  function fitCameraToObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    object.position.sub(center);
    const yMin = new THREE.Box3().setFromObject(object).min.y;
    object.position.y -= yMin;

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dist = maxDim * 2.2;
    camera.position.set(dist * 0.35, dist * 0.25, dist);
    controls.target.set(0, size.y * 0.35, 0);
    controls.minDistance = maxDim * 0.9;
    controls.maxDistance = maxDim * 4.5;
    controls.update();
  }

  resolveModelUrl().then((url) => {
    setHint('Loading 3D mascot…');
    loader.load(
      url,
      (gltf) => {
        const modelRoot = gltf.scene;
        modelRoot.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            if (child.material) {
              const mats = Array.isArray(child.material)
                ? child.material
                : [child.material];
              mats.forEach((m) => {
                if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
                m.needsUpdate = true;
              });
            }
          }
        });
        scene.add(modelRoot);
        fitCameraToObject(modelRoot);
        setHint('Drag to rotate · Scroll to zoom · Double-click to reset', 'is-ready');
      },
      undefined,
      (err) => {
        console.error('[mascot-viewer] Failed to load', url, err);
        setHint(
          'Could not load mascot.glb — expected at images/mascot/mascot.glb',
          'is-error'
        );
      }
    );
  });

  function onResize() {
    const w = width();
    const h = height();
    if (w < 1 || h < 1) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  const ro = new ResizeObserver(onResize);
  ro.observe(wrap);
  window.addEventListener('resize', onResize);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMascotViewer);
} else {
  initMascotViewer();
}
