import * as THREE from 'three';
import type { Variant } from '../variants';

// Um sistema só para as sete versões. A personalidade de cada uma é um
// conjunto de números (direção, velocidade, giro, rastro, tamanho), nunca um
// efeito próprio.

const HALF = new THREE.Vector3(0.34, 0.18, 0.24);
const CENTER = new THREE.Vector3(0, 0, -0.05);

const vertexShader = /* glsl */ `
attribute float aSeed;
uniform vec3 uOffset;
uniform vec3 uHalf;
uniform vec3 uCenter;
uniform float uSwirl;
uniform float uSpread;
uniform float uSize;
uniform float uStretch;
uniform float uPixelRatio;
uniform float uTime;
varying float vAlpha;

void main() {
  vec3 p = position + uOffset * (0.55 + aSeed * 0.9);
  p = mod(p + uHalf, 2.0 * uHalf) - uHalf;
  vec3 fade = 1.0 - smoothstep(0.78, 1.0, abs(p / uHalf));
  float a = uSwirl * (0.6 + aSeed * 0.8);
  p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
  p *= uSpread;
  p.y += sin(uTime * 0.6 + aSeed * 40.0) * 0.003;
  vec4 mv = modelViewMatrix * vec4(p + uCenter, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = uSize * (0.55 + aSeed) * uPixelRatio * 1.8 / -mv.z;
  gl_PointSize = size * mix(1.0, uStretch * 0.8, step(1.01, uStretch));
  vAlpha = fade.x * fade.y * fade.z * (0.35 + aSeed * 0.65);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uStretch;
varying float vAlpha;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  d.y *= uStretch;
  float a = pow(1.0 - smoothstep(0.0, 0.5, length(d)), 1.6);
  gl_FragColor = vec4(uColor, a * uOpacity * vAlpha);
  #include <colorspace_fragment>
}
`;

export function createParticles(count: number) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() * 2 - 1) * HALF.x;
    positions[i * 3 + 1] = (Math.random() * 2 - 1) * HALF.y;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * HALF.z;
    seeds[i] = Math.random();
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const uniforms = {
    uOffset: { value: new THREE.Vector3() },
    uHalf: { value: HALF.clone() },
    uCenter: { value: CENTER.clone() },
    uSwirl: { value: 0 },
    uSpread: { value: 1 },
    uSize: { value: 1 },
    uStretch: { value: 1 },
    uPixelRatio: { value: 1 },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color() },
    uOpacity: { value: 0 },
  };

  const points = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false }),
  );
  points.frustumCulled = false;

  // Estado animável; deslocamento e giro são integrados quadro a quadro para a
  // mudança de velocidade não dar salto.
  const style = { speed: 0, dx: 0, dy: 1, swirl: 0, stretch: 1, size: 1, opacity: 0 };
  let swirlAngle = 0;

  const colorA = new THREE.Color();
  const colorB = new THREE.Color();
  /** Quanto das partículas aparece (0 = nenhuma): a abertura e a apresentação controlam. */
  let presence = 0;

  /** Estilo entre a versão `a` e a `b`, na proporção `t`. */
  function mix(a: Variant, b: Variant, t: number) {
    const pa = a.particles;
    const pb = b.particles;
    const lerp = (x: number, y: number) => x + (y - x) * t;
    let dx = lerp(pa.direction[0], pb.direction[0]);
    let dy = lerp(pa.direction[1], pb.direction[1]);
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    Object.assign(style, {
      speed: lerp(pa.speed, pb.speed),
      dx,
      dy,
      swirl: lerp(pa.swirl, pb.swirl),
      stretch: lerp(pa.stretch, pb.stretch),
      size: lerp(pa.size, pb.size),
      opacity: lerp(pa.opacity, pb.opacity),
    });
    uniforms.uColor.value.copy(colorA.set(a.color.glow)).lerp(colorB.set(b.color.glow), t);
  }

  function setPresence(value: number) {
    presence = value;
  }

  function update(dt: number, time: number, pixelRatio: number, moving: boolean) {
    if (moving) {
      uniforms.uOffset.value.x += style.dx * style.speed * dt;
      uniforms.uOffset.value.y += style.dy * style.speed * dt;
      swirlAngle += style.swirl * dt;
      uniforms.uTime.value = time;
    }
    uniforms.uSwirl.value = swirlAngle;
    uniforms.uSize.value = style.size;
    uniforms.uStretch.value = style.stretch;
    uniforms.uOpacity.value = style.opacity * presence;
    uniforms.uPixelRatio.value = pixelRatio;
  }

  return { points, mix, setPresence, update };
}

export type Particles = ReturnType<typeof createParticles>;
