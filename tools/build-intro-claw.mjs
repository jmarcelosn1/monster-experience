// Gera a garra da abertura a partir da garra impressa no rótulo da Ultra,
// vista exatamente como a câmera da apresentação vê a lata. Assim, quando a
// abertura se desfaz, a garra dela está no mesmo lugar, tamanho e curvatura
// da garra da lata, pixel por pixel.
//
// 1. recorta a garra no rótulo (o contorno preto fecha a forma; tudo o que o
//    lado de fora alcança sem cruzar o contorno é fundo)
// 2. rasteriza o corpo da lata (o GLB da web) com a câmera da apresentação,
//    com profundidade e UV corrigido pela perspectiva, e lê a máscara pelo UV
// 3. grava a silhueta branca, a mesma garra com as cores do rótulo (o cinza
//    prateado e o contorno preto: é nela que a garra branca se transforma
//    antes de a lata aparecer) e o retângulo das duas, em alturas de tela a
//    partir do centro (a projeção só depende da altura da tela: o campo de
//    visão é vertical)
import { writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const LABEL = 'public/labels/origin.webp';
const MODEL = 'public/models/can.glb';
const OUT_IMAGE = 'public/claw-intro.webp';
const OUT_COLOR = 'public/claw-intro-color.webp';
const OUT_RECT = 'src/ui/intro-claw.json';

// Câmera da apresentação no começo do scroll: HERO_SHOT (stage.ts) com a
// distância de story.ts (OPENING_Z). Se mudar lá, rode de novo.
const CAMERA = { pos: [0, 0.004, 0.5], target: [0, -0.002, 0], fov: 24 };
const SCALE = 6000; // px por altura de tela na rasterização (2x o arquivo final)
const OUT_HEIGHT = 1000; // altura do arquivo final

// ---------------------------------------------------------------- 1. máscara no rótulo

const label = await sharp(LABEL).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const LW = label.info.width;
const LH = label.info.height;
const lum = (x, y) => {
  const i = (y * LW + x) * 3;
  return (label.data[i] * 0.299 + label.data[i + 1] * 0.587 + label.data[i + 2] * 0.114) / 255;
};

// área de busca em volta da garra (a garra fica entre u 0,36–0,61 e v 0,13–0,64)
const R = { x0: Math.floor(LW * 0.33), x1: Math.ceil(LW * 0.64), y0: Math.floor(LH * 0.11), y1: Math.ceil(LH * 0.665) };
const RW = R.x1 - R.x0;
const RH = R.y1 - R.y0;
const WALL = 0.42; // contorno preto (e a borda suavizada dele)
const outside = new Uint8Array(RW * RH);
const stack = [];
for (let x = 0; x < RW; x++) stack.push(x, 0, x, RH - 1);
for (let y = 0; y < RH; y++) stack.push(0, y, RW - 1, y);
while (stack.length) {
  const y = stack.pop();
  const x = stack.pop();
  if (x < 0 || y < 0 || x >= RW || y >= RH) continue;
  const k = y * RW + x;
  if (outside[k] || lum(R.x0 + x, R.y0 + y) < WALL) continue;
  outside[k] = 1;
  stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
}
// máscara em tamanho de rótulo; a borda ganha meio pixel de suavização pelo
// próprio tom do contorno
const mask = new Float32Array(LW * LH);
for (let y = 0; y < RH; y++) {
  for (let x = 0; x < RW; x++) {
    if (outside[y * RW + x]) {
      // pixel de fundo encostado no contorno: parcialmente coberto
      const l = lum(R.x0 + x, R.y0 + y);
      const near = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < RW && ny < RH && !outside[ny * RW + nx];
      });
      mask[(R.y0 + y) * LW + R.x0 + x] = near ? Math.max(0, Math.min(1, (0.75 - l) / 0.33)) : 0;
    } else {
      mask[(R.y0 + y) * LW + R.x0 + x] = 1;
    }
  }
}
const sample = (u, v) => {
  const fx = u * LW - 0.5;
  const fy = v * LH - 0.5;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  const tx = fx - x;
  const ty = fy - y;
  const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= LW || yy >= LH ? 0 : mask[yy * LW + xx]);
  return (at(x, y) * (1 - tx) + at(x + 1, y) * tx) * (1 - ty) + (at(x, y + 1) * (1 - tx) + at(x + 1, y + 1) * tx) * ty;
};

/** Cor do rótulo (0–255) em UV, com interpolação bilinear. */
const sampleRGB = (u, v) => {
  const fx = Math.min(LW - 1.001, Math.max(0, u * LW - 0.5));
  const fy = Math.min(LH - 1.001, Math.max(0, v * LH - 0.5));
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  const tx = fx - x;
  const ty = fy - y;
  return [0, 1, 2].map((c) => {
    const at = (xx, yy) => label.data[(yy * LW + xx) * 3 + c];
    return (at(x, y) * (1 - tx) + at(x + 1, y) * tx) * (1 - ty) + (at(x, y + 1) * (1 - tx) + at(x + 1, y + 1) * tx) * ty;
  });
};

// ---------------------------------------------------------------- 2. corpo da lata

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(MODEL);
const node = doc
  .getRoot()
  .listNodes()
  .find((n) => n.getMesh()?.listPrimitives().some((p) => p.getMaterial()?.getName() === 'label'));
if (!node) throw new Error('GLB sem o material "label"');
const prim = node.getMesh().listPrimitives().find((p) => p.getMaterial()?.getName() === 'label');
const m = node.getWorldMatrix();
const posA = prim.getAttribute('POSITION');
const uvA = prim.getAttribute('TEXCOORD_0');
const idx = prim.getIndices();
// getElement já devolve valores normalizados (o GLB usa quantização)
const decode = (acc, i) => acc.getElement(i, []);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((v) => v / l);
};
const f = norm(sub(CAMERA.target, CAMERA.pos));
const r = norm(cross(f, [0, 1, 0]));
const up = cross(r, f);
const tan = Math.tan((CAMERA.fov * Math.PI) / 360);

// vértice → tela, em alturas de tela a partir do centro (y para baixo)
const verts = [];
for (let i = 0; i < posA.getCount(); i++) {
  const p = decode(posA, i);
  const w = [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
  const d = sub(w, CAMERA.pos);
  const zc = dot(d, f);
  const uv = decode(uvA, i);
  verts.push({ sx: dot(d, r) / (zc * tan) / 2, sy: -dot(d, up) / (zc * tan) / 2, zc, u: uv[0], v: uv[1] });
}

// área da garra na tela, com folga: a malha tem poucos vértices ali, então a
// área sai da forma do corpo (cilindro com o raio e a altura do rótulo)
const body = verts.reduce(
  (acc, v, i) => {
    const p = decode(posA, i);
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    return { min: Math.min(acc.min, y), max: Math.max(acc.max, y), radius: Math.max(acc.radius, Math.abs(x)) };
  },
  { min: Infinity, max: -Infinity, radius: 0 },
);
const edge = [];
for (let i = 0; i <= 40; i++) {
  for (const [u, v] of [
    [0.33 + (0.31 * i) / 40, 0.11],
    [0.33 + (0.31 * i) / 40, 0.665],
    [0.33, 0.11 + (0.555 * i) / 40],
    [0.64, 0.11 + (0.555 * i) / 40],
  ]) {
    const angle = -Math.PI + 2 * Math.PI * u;
    const w = [body.radius * Math.sin(angle), body.max - v * (body.max - body.min), body.radius * Math.cos(angle)];
    const d = sub(w, CAMERA.pos);
    const zc = dot(d, f);
    edge.push([dot(d, r) / (zc * tan) / 2, -dot(d, up) / (zc * tan) / 2]);
  }
}
const box = {
  x0: Math.min(...edge.map((e) => e[0])) - 0.03,
  x1: Math.max(...edge.map((e) => e[0])) + 0.03,
  y0: Math.min(...edge.map((e) => e[1])) - 0.03,
  y1: Math.max(...edge.map((e) => e[1])) + 0.03,
};
const BW = Math.ceil((box.x1 - box.x0) * SCALE);
const BH = Math.ceil((box.y1 - box.y0) * SCALE);
const depth = new Float32Array(BW * BH).fill(Infinity);
const alpha = new Float32Array(BW * BH);
const color = new Float32Array(BW * BH * 3);

for (let t = 0; t < idx.getCount(); t += 3) {
  const [a, b, c] = [idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2)].map((i) => verts[i]);
  const P = [a, b, c].map((v) => [(v.sx - box.x0) * SCALE, (v.sy - box.y0) * SCALE]);
  const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
  if (Math.abs(area) < 1e-9) continue;
  const minX = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0])));
  const maxX = Math.min(BW - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
  const minY = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1])));
  const maxY = Math.min(BH - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area;
      const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      // interpolação correta pela perspectiva
      const iz = w0 / a.zc + w1 / b.zc + w2 / c.zc;
      const zc = 1 / iz;
      const k = y * BW + x;
      if (zc >= depth[k]) continue;
      depth[k] = zc;
      const u = (w0 * a.u / a.zc + w1 * b.u / b.zc + w2 * c.u / c.zc) * zc;
      const v = (w0 * a.v / a.zc + w1 * b.v / b.zc + w2 * c.v / c.zc) * zc;
      alpha[k] = sample(u, v);
      color.set(sampleRGB(u, v), k * 3);
    }
  }
}

// ---------------------------------------------------------------- 3. silhueta e retângulo

let x0 = BW;
let x1 = 0;
let y0 = BH;
let y1 = 0;
for (let y = 0; y < BH; y++) {
  for (let x = 0; x < BW; x++) {
    if (alpha[y * BW + x] > 0.02) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x + 1);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + 1);
    }
  }
}
const cw = x1 - x0;
const ch = y1 - y0;
const rgba = Buffer.alloc(cw * ch * 4);
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const o = (y * cw + x) * 4;
    rgba[o] = rgba[o + 1] = rgba[o + 2] = 255;
    rgba[o + 3] = Math.round(Math.min(1, alpha[(y0 + y) * BW + x0 + x]) * 255);
  }
}
await sharp(rgba, { raw: { width: cw, height: ch, channels: 4 } })
  .resize({ height: OUT_HEIGHT, kernel: 'lanczos3' })
  .webp({ quality: 95, alphaQuality: 100 })
  .toFile(OUT_IMAGE);
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const o = (y * cw + x) * 4;
    const k = ((y0 + y) * BW + x0 + x) * 3;
    // na borda a cor lida mistura o branco do rótulo; ali a garra é o
    // contorno preto, então a borda escurece junto com a cobertura
    const edge = Math.min(1, Math.max(0, (alpha[(y0 + y) * BW + x0 + x] - 0.5) / 0.5)) ** 2;
    rgba[o] = Math.round(color[k] * edge);
    rgba[o + 1] = Math.round(color[k + 1] * edge);
    rgba[o + 2] = Math.round(color[k + 2] * edge);
  }
}
await sharp(rgba, { raw: { width: cw, height: ch, channels: 4 } })
  .resize({ height: OUT_HEIGHT, kernel: 'lanczos3' })
  .webp({ quality: 92, alphaQuality: 100 })
  .toFile(OUT_COLOR);

const rect = {
  left: box.x0 + x0 / SCALE,
  top: box.y0 + y0 / SCALE,
  width: cw / SCALE,
  height: ch / SCALE,
};
const round = (n) => Math.round(n * 1e5) / 1e5;
writeFileSync(
  OUT_RECT,
  JSON.stringify(
    {
      $comment: 'gerado por tools/build-intro-claw.mjs: retângulo da garra em alturas de tela, a partir do centro',
      camera: CAMERA,
      left: round(rect.left),
      top: round(rect.top),
      width: round(rect.width),
      height: round(rect.height),
    },
    null,
    2,
  ) + '\n',
);
console.log('garra da abertura', cw, 'x', ch, '→', OUT_IMAGE, rect);
