import * as THREE from 'three';

/** Enquadramento da câmera: posição e ponto para onde olha, em metros. */
export interface Shot {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
}

export const HERO_SHOT: Readonly<Shot> = { x: 0, y: 0.004, z: 0.6, tx: 0, ty: -0.002, tz: 0 };

const MAX_DPR = 2;
const MIN_DPR = 1;
const SLOW_FRAME_MS = 24;

export function createStage(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Khronos PBR Neutral: mantém a cor do rótulo perto do hex medido na lata.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.01, 20);
  const pivot = new THREE.Group();
  scene.add(pivot);

  const shot: Shot = { ...HERO_SHOT };
  const lookAt = new THREE.Vector3();

  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let width = 0;
  let height = 0;

  function resize(force = false) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!force && w === width && h === height) return;
    width = w;
    height = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Densidade de pixels adaptativa: se a média de quadros passar de 24 ms por
  // dois segundos seguidos, reduz 0,25 até chegar a 1.
  let slowTime = 0;
  let avg = 16;
  function sampleFrame(ms: number) {
    avg += (ms - avg) * 0.05;
    slowTime = avg > SLOW_FRAME_MS ? slowTime + ms : 0;
    if (slowTime > 2000 && dpr > MIN_DPR) {
      dpr = Math.max(MIN_DPR, dpr - 0.25);
      slowTime = 0;
      resize(true);
    }
  }

  /** Aplica o enquadramento atual. */
  function frame() {
    camera.position.set(shot.x, shot.y, shot.z);
    lookAt.set(shot.tx, shot.ty, shot.tz);
    camera.lookAt(lookAt);
  }

  function render() {
    renderer.render(scene, camera);
  }

  resize(true);

  return { renderer, scene, camera, pivot, shot, resize, frame, render, sampleFrame, get pixelRatio() { return dpr; } };
}

export type Stage = ReturnType<typeof createStage>;
