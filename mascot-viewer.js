/**
 * JW Just Wishes — floating 3D mascot (Three.js)
 * Model: images/mascot/model.glb (Draco-compressed OK)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('mascotCanvas');
const track = document.getElementById('glbMascotTrack');
const hideBtn = document.getElementById('glbMascotHide');
const recallBtn = document.getElementById('glbMascotRecall');

if (!canvas || !track) {
  console.warn('[mascot] canvas or track not found');
} else {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 1.0, 2.8);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  scene.add(new THREE.HemisphereLight(0xfff5f0, 0x888899, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(2.5, 5, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffcce0, 0.35);
  fill.position.set(-2, 2, -1);
  scene.add(fill);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * 0.35;
  controls.maxPolarAngle = Math.PI * 0.55;
  controls.target.set(0, 0.7, 0);

  function resize() {
    const w = canvas.clientWidth || 120;
    const h = canvas.clientHeight || 140;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize);
  resize();

  let mixer = null;
  const clock = new THREE.Clock();

  // Draco decoder（你的 model.glb 用了 Draco 压缩，必须配置）
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  dracoLoader.setDecoderConfig({ type: 'js' });

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  const MODEL_PATH = 'images/mascot/model.glb';

  loader.load(
    MODEL_PATH,
    (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = 1.35 / maxDim;
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));
      model.position.y = 0;
      scene.add(model);
      controls.target.set(0, size.y * scale * 0.4, 0);
      controls.update();

      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => {
          mixer.clipAction(clip).play();
        });
      }
      console.log('[mascot] loaded:', MODEL_PATH);
      track.classList.add('is-ready');
      track.classList.remove('is-error');
    },
    undefined,
    (err) => {
      console.error('[mascot] load failed:', MODEL_PATH, err);
      track.classList.add('is-error');
    }
  );

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (mixer) mixer.update(dt);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

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
