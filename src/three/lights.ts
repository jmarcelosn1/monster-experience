import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import type { Variant } from '../variants';

// Estúdio escuro com faixas de luz: é o que o alumínio reflete. Gerado uma vez,
// no código, sem baixar HDR.
function buildEnvironment(renderer: THREE.WebGLRenderer) {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x040404);
  const plane = new THREE.PlaneGeometry(1, 1);
  const materials: THREE.Material[] = [];
  const panel = (intensity: number, w: number, h: number, x: number, y: number, z: number) => {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(intensity), side: THREE.DoubleSide });
    materials.push(material);
    const mesh = new THREE.Mesh(plane, material);
    mesh.scale.set(w, h, 1);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    envScene.add(mesh);
  };
  panel(6, 1.1, 6, -3, 0.4, 2.2); // faixa principal, à esquerda
  panel(2.4, 0.7, 5, 3.2, 0, 1.6); // faixa de preenchimento, à direita
  panel(1.4, 4, 1.4, 0, 4, 0.6); // teto
  panel(1.1, 0.5, 5, -2.6, 0, -2.8); // contornos, atrás
  panel(1.1, 0.5, 5, 2.6, 0, -2.8);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();
  plane.dispose();
  for (const m of materials) m.dispose();
  return texture;
}

const KEY_HOME = new THREE.Vector3(-0.36, 0.12, 0.42);

export function createLights(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  RectAreaLightUniformsLib.init();
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 0.9;

  const key = new THREE.RectAreaLight(0xffffff, 2.2, 0.14, 0.5);
  key.position.copy(KEY_HOME);
  key.lookAt(0, 0, 0);

  const rimLeft = new THREE.RectAreaLight(0xffffff, 5, 0.05, 0.42);
  rimLeft.position.set(-0.24, 0.05, -0.2);
  rimLeft.lookAt(0, 0, 0);

  const rimRight = new THREE.RectAreaLight(0xffffff, 5, 0.05, 0.42);
  rimRight.position.set(0.26, 0.02, -0.18);
  rimRight.lookAt(0, 0, 0);

  scene.add(key, rimLeft, rimRight);

  const a = new THREE.Color();
  const b = new THREE.Color();

  /** Contorno entre a versão `va` e a `vb`, na proporção `t`. */
  function mix(va: Variant, vb: Variant, t: number) {
    a.set(va.color.glow);
    b.set(vb.color.glow);
    rimLeft.color.copy(a).lerp(b, t);
    rimRight.color.copy(rimLeft.color);
    rimLeft.intensity = va.rim + (vb.rim - va.rim) * t;
    rimRight.intensity = rimLeft.intensity * 0.8;
  }

  /**
   * A lata não se mexe: quem anda com o mouse é a luz principal, e o reflexo
   * desliza pelo metal.
   */
  function follow(x: number, y: number) {
    key.position.set(KEY_HOME.x + x * 0.3, KEY_HOME.y - y * 0.18, KEY_HOME.z);
    key.lookAt(0, 0, 0);
  }

  return { mix, follow };
}

export type Lights = ReturnType<typeof createLights>;
