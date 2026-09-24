import * as THREE from 'three';

// O fundo de cena desenhado no mesmo canvas da lata, atrás dela. Recebe duas
// imagens (A e B) e a mesma onda de energia da lata: abaixo da frente aparece
// B, e a borda brilha na cor da versão nova. Assim a lata e o mundo trocam
// juntos, numa linha só. Sem tone mapping: a imagem sai com as cores dela.

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uA;
uniform sampler2D uB;
uniform vec2 uCover;
uniform float uZoomA;
uniform float uZoomB;
uniform vec2 uShift;
uniform float uFront;
uniform float uBand;
uniform vec3 uGlow;
uniform float uSeed;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// object-fit: cover, com zoom e deslocamento; as imagens chegam de cabeça
// para baixo (ImageBitmap não vira), então a leitura inverte o eixo y
vec2 fit(vec2 uv, float zoom) {
  vec2 c = (uv - 0.5) * uCover / zoom + 0.5 + uShift;
  return vec2(c.x, 1.0 - c.y);
}

void main() {
  vec3 a = texture2D(uA, fit(vUv, uZoomA)).rgb;
  vec3 b = texture2D(uB, fit(vUv, uZoomB)).rgb;
  float n = noise(vUv * vec2(9.0, 3.0) + uSeed) * 0.65 + noise(vUv * vec2(34.0, 12.0) + uSeed) * 0.35;
  float edge = vUv.y + (n - 0.5) * 0.07 - uFront;
  float reveal = 1.0 - smoothstep(-0.003, 0.003, edge);
  float band = (1.0 - smoothstep(0.0, 0.028, abs(edge))) * uBand;
  gl_FragColor = vec4(mix(a, b, reveal) + uGlow * band, 1.0);
  #include <colorspace_fragment>
}
`;

const IMAGE_ASPECT = 1672 / 941;

function solid(r: number, g: number, b: number) {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function createBackdrop() {
  const black = solid(0, 0, 0);
  const uniforms = {
    uA: { value: black as THREE.Texture },
    uB: { value: black as THREE.Texture },
    uCover: { value: new THREE.Vector2(1, 1) },
    uZoomA: { value: 1.04 },
    uZoomB: { value: 1.04 },
    uShift: { value: new THREE.Vector2() },
    uFront: { value: -1 },
    uBand: { value: 0 },
    uGlow: { value: new THREE.Color() },
    uSeed: { value: 0 },
  };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  function resize(width: number, height: number) {
    const screen = width / height;
    uniforms.uCover.value.set(screen > IMAGE_ASPECT ? 1 : screen / IMAGE_ASPECT, screen > IMAGE_ASPECT ? IMAGE_ASPECT / screen : 1);
  }

  /**
   * a/b: imagens (null = preto). front: altura da onda na tela (0 = base,
   * 1 = topo). band: 1 enquanto a onda passa.
   */
  function set(a: THREE.Texture | null, b: THREE.Texture | null, front: number, band: number, glow: THREE.Color, seed: number) {
    uniforms.uA.value = a ?? black;
    uniforms.uB.value = b ?? black;
    uniforms.uFront.value = front;
    uniforms.uBand.value = band;
    uniforms.uGlow.value.copy(glow);
    uniforms.uSeed.value = seed;
  }

  /** Aproximação lenta e deslocamento pelo ponteiro, só no fundo. */
  function frame(zoomA: number, zoomB: number, shiftX: number, shiftY: number) {
    uniforms.uZoomA.value = zoomA;
    uniforms.uZoomB.value = zoomB;
    uniforms.uShift.value.set(shiftX, shiftY);
  }

  return { mesh, resize, set, frame };
}

export type Backdrop = ReturnType<typeof createBackdrop>;
