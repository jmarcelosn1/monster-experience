import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export interface LabelPair {
  map: THREE.Texture;
  mask: THREE.Texture;
}

// Uma lata só. O material do rótulo recebe dois rótulos (A e B) e uma
// fronteira que sobe pela lata: abaixo dela aparece B, e uma faixa fina na
// fronteira brilha na cor da versão nova. A altura vem da geometria, não do UV,
// para a faixa sair reta até no pescoço afunilado.

const VERTEX_HEAD = /* glsl */ `
uniform float uYMin;
uniform float uYMax;
varying float vSweepY;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D uMapB;
uniform sampler2D uMaskB;
uniform float uSweep;
uniform vec3 uSweepColor;
uniform float uSweepGlow;
uniform float uSeed;
uniform float uSelfLight;
varying float vSweepY;

float sweepHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float sweepNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(sweepHash(i), sweepHash(i + vec2(1.0, 0.0)), u.x),
    mix(sweepHash(i + vec2(0.0, 1.0)), sweepHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
`;

const MAP_FRAGMENT = /* glsl */ `
float sweepReveal = 0.0;
float sweepBand = 0.0;
#ifdef USE_MAP
  float sweepFront = uSweep * 1.24 - 0.12;
  float sweepN = sweepNoise(vMapUv * vec2(26.0, 9.0) + uSeed) * 0.65
               + sweepNoise(vMapUv * vec2(80.0, 34.0) + uSeed) * 0.35;
  float sweepEdge = vSweepY + (sweepN - 0.5) * 0.09 - sweepFront;
  sweepReveal = 1.0 - smoothstep(-0.003, 0.003, sweepEdge);
  sweepBand = (1.0 - smoothstep(0.0, 0.035, abs(sweepEdge))) * step(0.0001, uSweep) * step(uSweep, 0.9999);
  vec4 sampledDiffuseColor = mix(texture2D(map, vMapUv), texture2D(uMapB, vMapUv), sweepReveal);
  diffuseColor *= sampledDiffuseColor;
#endif
`;

const ROUGHNESS_FRAGMENT = /* glsl */ `
float roughnessFactor = roughness;
float metalnessFactor = metalness;
#ifdef USE_ROUGHNESSMAP
  vec4 sweepMask = mix(texture2D(roughnessMap, vRoughnessMapUv), texture2D(uMaskB, vRoughnessMapUv), sweepReveal);
  roughnessFactor *= sweepMask.g;
  metalnessFactor *= sweepMask.b;
#endif
`;

// uSelfLight devolve parte da cor do rótulo sem depender da luz: sem isso a
// tinta fica bem mais escura que a lata da foto, porque o estúdio é escuro.
const EMISSIVE_FRAGMENT = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += uSweepColor * sweepBand * uSweepGlow;
#ifdef USE_MAP
  totalEmissiveRadiance += sampledDiffuseColor.rgb * uSelfLight * (1.0 - metalnessFactor);
#endif
`;

function solidTexture(r: number, g: number, b: number, colorSpace: THREE.ColorSpace) {
  const texture = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Alumínio sem tinta: o estado da lata antes da primeira impressão. */
export function blankLabel(): LabelPair {
  return {
    map: solidTexture(200, 204, 208, THREE.SRGBColorSpace),
    mask: solidTexture(255, 70, 242, THREE.NoColorSpace),
  };
}

export async function parseCan(buffer: ArrayBuffer) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(buffer, '');
  const root = gltf.scene;

  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });
  const byMaterial = (name: string) => meshes.find((m) => (m.material as THREE.Material).name === name);
  const labelMesh = byMaterial('label');
  const tabMesh = byMaterial('tab');
  if (!labelMesh || !tabMesh) throw new Error('GLB sem os materiais "label" e "tab"');
  const tab = tabMesh.material as THREE.MeshStandardMaterial;

  const label = labelMesh.material as THREE.MeshPhysicalMaterial;
  labelMesh.geometry.computeBoundingBox();
  const box = labelMesh.geometry.boundingBox!;

  const uniforms = {
    uMapB: { value: null as THREE.Texture | null },
    uMaskB: { value: null as THREE.Texture | null },
    uSweep: { value: 0 },
    uSweepColor: { value: new THREE.Color() },
    uSweepGlow: { value: 1.8 },
    uSeed: { value: 0 },
    uSelfLight: { value: 0.78 },
    uYMin: { value: box.min.y },
    uYMax: { value: box.max.y },
  };

  const blank = blankLabel();
  label.map = blank.map;
  label.roughnessMap = blank.mask;
  label.metalnessMap = null;
  label.color.set(0xffffff);
  label.roughness = 1;
  label.metalness = 1;
  label.clearcoat = 0.35;
  label.clearcoatRoughness = 0.18;
  uniforms.uMapB.value = blank.map;
  uniforms.uMaskB.value = blank.mask;

  label.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSweepY = (position.y - uYMin) / (uYMax - uYMin);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <map_fragment>', MAP_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', ROUGHNESS_FRAGMENT)
      .replace('#include <metalnessmap_fragment>', '')
      .replace('#include <emissivemap_fragment>', EMISSIVE_FRAGMENT);
  };
  label.needsUpdate = true;

  // Sombra de contato: uma imagem radial sob a lata, sem sombra em tempo real.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(0.4, 'rgba(0,0,0,0.22)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.13),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.0834;

  // altura do corpo (parte com rótulo) no mundo, para alinhar a onda da lata à do fundo
  root.updateMatrixWorld(true);
  const bodyBox = box.clone().applyMatrix4(labelMesh.matrixWorld);
  const body = { min: bodyBox.min.y, max: bodyBox.max.y };

  /**
   * Rótulo A por cima, B por baixo da onda; sweep 0–1 é a posição da onda no
   * corpo da lata. Pode ser chamado a cada quadro: trocar de textura não
   * recompila nada.
   */
  function setLabels(a: LabelPair, b: LabelPair, sweep: number, glow: THREE.Color, seed: number) {
    label.map = a.map;
    label.roughnessMap = a.mask;
    uniforms.uMapB.value = b.map;
    uniforms.uMaskB.value = b.mask;
    uniforms.uSweep.value = sweep;
    uniforms.uSweepColor.value.copy(glow);
    uniforms.uSeed.value = seed;
  }

  return { root, shadow, tab, uniforms, body, blank, setLabels };
}

export type Can = Awaited<ReturnType<typeof parseCan>>;
