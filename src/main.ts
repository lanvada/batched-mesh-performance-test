import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Object3D,
} from 'three';
import {
  DRACOLoader,
  GLTFLoader,
  OrbitControls,
} from 'three/examples/jsm/Addons.js';
import Stats from 'three/addons/libs/stats.module.js';
import { GLTFToolkit } from './GLTFToolkit';

//create a three.js renderer
const container = document.getElementById('app')!;
const renderer = new WebGLRenderer({
  antialias: true,
});
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
const canvas = renderer.domElement;
container.appendChild(canvas);
// add a stats panel
const stats = new Stats();
container.appendChild(stats.dom);

// create a three.js scene and a camera
const scene = new Scene();
scene.background = new Color(0x000000);
const camera = new PerspectiveCamera(
  75,
  container.clientWidth / container.clientHeight,
  0.1,
  1000,
);
camera.position.z = 200;
scene.add(camera);
// add orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
// add some light
const hemiLight = new HemisphereLight(0xffffff, 0x666666, 1.0);
hemiLight.position.set(0, 50, 0);
scene.add(hemiLight);
let dirLight = new DirectionalLight(0xffffff, 1.0);
dirLight.position.set(75, 50, -75);
scene.add(dirLight);
dirLight = new DirectionalLight(0xffffff, 1.0);
dirLight.position.set(-75, 50, 75);
scene.add(dirLight);

let model: Object3D | undefined;
const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/libs/draco/');
gltfLoader.setDRACOLoader(dracoLoader);

const noBatchedButton = document.getElementById('noBatched')!;
noBatchedButton.addEventListener('click', loadNoBatched);
const batchedButton = document.getElementById('batched')!;
batchedButton.addEventListener('click', loadBatched);

// Progress bar element
const url = '/models/test.glb';

loadNoBatched();

render();
// render the scene
function render() {
  stats.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

function loadBatched() {
  if (model) {
    scene.remove(model);
  }
  gltfLoader.load(
    url,
    async (gltf) => {
      model = (await GLTFToolkit.parseMeshFeatures(gltf)).scene;
      // const bbox = new Box3().setFromObject(model);
      // model.position.y += bbox.max.y / 2;
      scene.add(model);
    },
    undefined,
    (error) => {
      console.error(error);
    },
  );
}

function loadNoBatched() {
  // display the progress bar and reset progress
  if (model) {
    scene.remove(model);
  }
  gltfLoader.load(
    url,
    (gltf) => {
      model = gltf.scene;
      // const bbox = new Box3().setFromObject(model);
      // model.position.y += bbox.max.y / 2;
      scene.add(model);
    },
    undefined,
    (error) => {
      console.error(error);
    },
  );
}
