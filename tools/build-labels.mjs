// Gera os rótulos das sete versões no layout UV do corpo da lata.
//
// O corpo do GLB tem mapeamento cilíndrico: u dá a volta (0,5 aponta para +z,
// a emenda fica nas costas) e v vai do topo (0) ao fundo (1). As fotos são
// frontais, então cada coluna do rótulo, no ângulo θ, lê a foto em
// x = centro + raio·sen θ. Só a faixa da frente é confiável; o resto da volta
// continua a cor da borda de cada linha, com um eco fraco da textura, e a lata
// nunca gira o bastante para mostrar essa parte.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const SOURCE_GLB = 'sources/monster-ultra.glb';
const OUT = 'public';
const LABEL_W = 2048;
const LABEL_H = 1536;
const MASK_W = 1024;
const MASK_H = 768;
const R = 33; // raio do corpo, mm

const PHOTOS = [
  { id: 'lagoon', file: 'monsterverde.png', dominant: '#67CD0A', flatten: 1, inkMetal: 0.12, inkRough: 0.4, silverVal: [0.6, 1] },
  { id: 'ritual', file: 'mangoloco.png', dominant: '#01B4EF', flatten: 0.7, inkMetal: 0.12, inkRough: 0.34, silverVal: [2, 2] },
  { id: 'bloom', file: 'monsterrosa.png', dominant: '#E8316A', flatten: 1, inkMetal: 0.12, inkRough: 0.4, silverVal: [0.6, 1] },
  { id: 'void', file: 'monsterazul.png', dominant: '#014694', flatten: 0.35, inkMetal: 0.3, inkRough: 0.4, silverVal: [2, 2] },
  { id: 'flare', file: 'monstervermelho.png', dominant: '#F80D1A', flatten: 1, inkMetal: 0.12, inkRough: 0.4, silverVal: [0.6, 1] },
  { id: 'apex', file: 'monsteramarelo.png', dominant: '#FBE404', flatten: 1, inkMetal: 0.05, inkRough: 0.3, silverVal: [2, 2] },
];

// De frente, a câmera (a 0,6 m) enxerga até ~87° para cada lado — o mesmo que a
// foto mostra. Por isso a foto vai quase até a silhueta, e a lata balança pouco.
const FRONT_LIMIT = (87 * Math.PI) / 180; // até onde a foto é usada
const MIRROR_BAND = (16 * Math.PI) / 180; // largura da faixa espelhada
const FADE_FROM = (81 * Math.PI) / 180; // a partir daqui a foto cede lugar ao preenchimento
const SIDE_CONTRAST = 0.35; // quanto da textura da borda sobra nas laterais
const FILL_PULL = 0.25; // quanto o preenchimento lateral puxa para a cor da lata
const SILVER_METAL = 0.18;
const SILVER_ROUGH = 0.3;
const NECK_LIMIT = 76; // mm; acima disso a foto mostra tampa e lacre, não rótulo

mkdirSync(`${OUT}/labels`, { recursive: true });
mkdirSync(`${OUT}/posters`, { recursive: true });

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- perfil v → (y, r)
async function readBodyProfile() {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(SOURCE_GLB);
  const body = doc.getRoot().listNodes().find((n) => /printed aluminium body/i.test(n.getName()));
  const prim = body.getMesh().listPrimitives()[0];
  const pos = prim.getAttribute('POSITION');
  const uv = prim.getAttribute('TEXCOORD_0');
  const bins = 1024;
  const sumY = new Float64Array(bins);
  const maxR = new Float64Array(bins);
  const count = new Uint32Array(bins);
  const p = [];
  const t = [];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, p);
    uv.getElement(i, t);
    const b = clamp(Math.floor(t[1] * bins), 0, bins - 1);
    sumY[b] += p[1] * 1000;
    maxR[b] = Math.max(maxR[b], Math.hypot(p[0], p[2]) * 1000);
    count[b]++;
  }
  const known = [];
  for (let b = 0; b < bins; b++) if (count[b]) known.push({ v: (b + 0.5) / bins, y: sumY[b] / count[b], r: maxR[b] });
  return (v) => {
    if (v <= known[0].v) return known[0];
    const last = known[known.length - 1];
    if (v >= last.v) return last;
    let i = 1;
    while (known[i].v < v) i++;
    const a = known[i - 1];
    const b = known[i];
    const f = (v - a.v) / (b.v - a.v);
    return { y: a.y + (b.y - a.y) * f, r: a.r + (b.r - a.r) * f };
  };
}

// ---------------------------------------------------------------- imagens
async function readRGBA(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function sampler(img) {
  const { data, w, h } = img;
  return (x, y, out) => {
    x = clamp(x, 0, w - 1.001);
    y = clamp(y, 0, h - 1.001);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    for (let c = 0; c < 4; c++) {
      const i00 = (y0 * w + x0) * 4 + c;
      const i10 = i00 + 4;
      const i01 = i00 + w * 4;
      const i11 = i01 + 4;
      out[c] = (data[i00] * (1 - fx) + data[i10] * fx) * (1 - fy) + (data[i01] * (1 - fx) + data[i11] * fx) * fy;
    }
    return out;
  };
}

function measureCan(img) {
  const { data, w, h } = img;
  const solid = (x, y) => data[(y * w + x) * 4 + 3] > 200;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h && top < 0; y++) for (let x = 0; x < w; x++) if (solid(x, y)) { top = y; break; }
  for (let y = h - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < w; x++) if (solid(x, y)) { bottom = y; break; }
  const lefts = [];
  const rights = [];
  for (let y = Math.round(top + (bottom - top) * 0.35); y < top + (bottom - top) * 0.65; y++) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < w; x++) if (solid(x, y)) { l = x; break; }
    for (let x = w - 1; x >= 0; x--) if (solid(x, y)) { r = x; break; }
    if (l >= 0) { lefts.push(l); rights.push(r); }
  }
  const median = (arr) => arr.sort((a, b) => a - b)[arr.length >> 1];
  const left = median(lefts);
  const right = median(rights) + 1;
  return { top, bottom: bottom + 1, cx: (left + right) / 2, halfW: (right - left) / 2 };
}

// ganho por ângulo que desfaz a luz embutida na foto
function lightingGain(img, can, dominant, strength) {
  const { data, w } = img;
  const [dr, dg, db] = hexToRgb(dominant);
  const target = luma(dr, dg, db);
  const deg = 180;
  const bins = Array.from({ length: deg }, () => []);
  const y0 = Math.round(can.top + (can.bottom - can.top) * 0.14);
  const y1 = Math.round(can.bottom - (can.bottom - can.top) * 0.14);
  for (let x = Math.ceil(can.cx - can.halfW * 0.985); x < can.cx + can.halfW * 0.985; x++) {
    const theta = Math.asin(clamp((x - can.cx) / can.halfW, -1, 1));
    const bin = clamp(Math.floor(((theta * 180) / Math.PI) + 90), 0, deg - 1);
    for (let y = y0; y < y1; y += 2) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 200) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // mesma cor de tinta, qualquer brilho: compara a direção da cor
      const n = Math.hypot(r, g, b) || 1;
      const m = Math.hypot(dr, dg, db) || 1;
      const cos = (r * dr + g * dg + b * db) / (n * m);
      if (cos > 0.985) bins[bin].push(luma(r, g, b));
    }
  }
  const med = bins.map((arr) => (arr.length > 12 ? arr.sort((a, b) => a - b)[arr.length >> 1] : NaN));
  // preenche buracos e suaviza
  const filled = med.slice();
  for (let i = 0; i < deg; i++) {
    if (!Number.isNaN(filled[i])) continue;
    let a = i - 1;
    let b = i + 1;
    while (a >= 0 && Number.isNaN(med[a])) a--;
    while (b < deg && Number.isNaN(med[b])) b++;
    filled[i] = a >= 0 && b < deg ? (med[a] + med[b]) / 2 : a >= 0 ? med[a] : b < deg ? med[b] : target;
  }
  const smooth = filled.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let k = -6; k <= 6; k++) {
      const j = clamp(i + k, 0, deg - 1);
      s += filled[j];
      c++;
    }
    return s / c;
  });
  return (theta) => {
    const bin = clamp(Math.floor(((theta * 180) / Math.PI) + 90), 0, deg - 1);
    const g = clamp(target / Math.max(smooth[bin], 1), 0.72, 1.6);
    return 1 + (g - 1) * strength;
  };
}

function sourceAngle(theta) {
  const a = Math.abs(theta);
  if (a <= FRONT_LIMIT) return theta;
  const k = (a - FRONT_LIMIT) % (2 * MIRROR_BAND);
  const t = k < MIRROR_BAND ? FRONT_LIMIT - k : FRONT_LIMIT - 2 * MIRROR_BAND + k;
  return Math.sign(theta) * t;
}

// ---------------------------------------------------------------- máscara metal/rugosidade
async function writeMask(id, rgb, w, h, opts) {
  const out = Buffer.alloc(w * h * 3);
  const [sLo, sHi] = opts.silverVal;
  for (let i = 0, j = 0; i < w * h * 3; i += 3, j += 3) {
    const r = rgb[i] / 255;
    const g = rgb[i + 1] / 255;
    const b = rgb[i + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0;
    const silver = (1 - smoothstep(0.1, 0.28, sat)) * smoothstep(sLo, sLo + 0.12, mx) * (1 - smoothstep(sHi, sHi + 0.08, mx));
    const black = 1 - smoothstep(0.1, 0.28, mx);
    // A garra prateada já vem com o brilho dela na foto. Como metal puro ela
    // refletiria o estúdio escuro e ficaria riscada de preto; fica só um pouco
    // mais lisa que a tinta, para o verniz marcar o reflexo.
    const metal = (opts.inkMetal + (SILVER_METAL - opts.inkMetal) * silver) * (1 - 0.75 * black);
    const rough = (opts.inkRough + (SILVER_ROUGH - opts.inkRough) * silver) * (1 - black) + 0.55 * black;
    out[j] = 255;
    out[j + 1] = Math.round(clamp(rough, 0, 1) * 255);
    out[j + 2] = Math.round(clamp(metal, 0, 1) * 255);
  }
  await sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .resize(MASK_W, MASK_H)
    .webp({ quality: 88 })
    .toFile(`${OUT}/labels/${id}-mask.webp`);
}

// ---------------------------------------------------------------- execução
const profile = await readBodyProfile();
const report = {};

for (const cfg of PHOTOS) {
  const img = await readRGBA(`sources/${cfg.file}`);
  const can = measureCan(img);
  const sample = sampler(img);
  const gain = lightingGain(img, can, cfg.dominant, cfg.flatten);
  const [fr, fg, fb] = hexToRgb(cfg.dominant);
  const sX = can.halfW / R;
  const sY = (can.bottom - can.top) / 163.8;
  const yTopMm = 80.8;
  const rgb = Buffer.alloc(LABEL_W * LABEL_H * 3);
  const px = [0, 0, 0, 0];
  const rowY = new Float64Array(LABEL_H);
  const rowR = new Float64Array(LABEL_H);
  for (let j = 0; j < LABEL_H; j++) {
    const { y, r } = profile((j + 0.5) / LABEL_H);
    rowY[j] = can.top + (yTopMm - Math.min(y, NECK_LIMIT)) * sY;
    rowR[j] = r;
  }
  // cor de cada linha na borda confiável da foto, dos dois lados
  const readPhoto = (theta, j, out) => {
    sample(can.cx + rowR[j] * Math.sin(theta) * sX - 0.5, rowY[j] - 0.5, px);
    const al = px[3] / 255;
    const k = gain(theta);
    out[0] = px[0] * k * al + fr * (1 - al);
    out[1] = px[1] * k * al + fg * (1 - al);
    out[2] = px[2] * k * al + fb * (1 - al);
    return out;
  };
  const edge = (sign) => {
    const raw = new Float64Array(LABEL_H * 3);
    const c = [0, 0, 0];
    for (let j = 0; j < LABEL_H; j++) {
      let n = 0;
      for (let d = 0; d <= 14; d++) {
        readPhoto(sign * (FADE_FROM - (d * Math.PI) / 180), j, c);
        raw[j * 3] += c[0];
        raw[j * 3 + 1] += c[1];
        raw[j * 3 + 2] += c[2];
        n++;
      }
      raw[j * 3] /= n;
      raw[j * 3 + 1] /= n;
      raw[j * 3 + 2] /= n;
    }
    // suaviza forte na vertical (duas passadas) para virar degradê, não listra,
    // e puxa um pouco para a cor da lata
    const blur = (src) => {
      const out = new Float64Array(LABEL_H * 3);
      const rad = 56;
      for (let j = 0; j < LABEL_H; j++) {
        let n = 0;
        for (let k = -rad; k <= rad; k++) {
          const q = clamp(j + k, 0, LABEL_H - 1);
          out[j * 3] += src[q * 3];
          out[j * 3 + 1] += src[q * 3 + 1];
          out[j * 3 + 2] += src[q * 3 + 2];
          n++;
        }
        out[j * 3] /= n;
        out[j * 3 + 1] /= n;
        out[j * 3 + 2] /= n;
      }
      return out;
    };
    const out = blur(blur(raw));
    for (let j = 0; j < LABEL_H; j++) {
      out[j * 3] += (fr - out[j * 3]) * FILL_PULL;
      out[j * 3 + 1] += (fg - out[j * 3 + 1]) * FILL_PULL;
      out[j * 3 + 2] += (fb - out[j * 3 + 2]) * FILL_PULL;
    }
    return out;
  };
  const rightFill = edge(1);
  const leftFill = edge(-1);
  const around = 2 * Math.PI - 2 * FADE_FROM;
  const cur = [0, 0, 0];
  const mir = [0, 0, 0];
  for (let j = 0; j < LABEL_H; j++) {
    for (let i = 0; i < LABEL_W; i++) {
      const theta = ((i + 0.5) / LABEL_W - 0.5) * Math.PI * 2;
      const abs = Math.abs(theta);
      const o = (j * LABEL_W + i) * 3;
      const side = smoothstep(FADE_FROM, FRONT_LIMIT, abs);
      if (side < 1) readPhoto(theta, j, cur);
      if (side > 0) {
        // dá a volta pelas costas: da borda direita até a esquerda
        const t = smoothstep(0, 1, theta > 0 ? (theta - FADE_FROM) / around : (theta + 2 * Math.PI - FADE_FROM) / around);
        const e = theta > 0 ? rightFill : leftFill;
        let fr0 = rightFill[j * 3] + (leftFill[j * 3] - rightFill[j * 3]) * t;
        let fg0 = rightFill[j * 3 + 1] + (leftFill[j * 3 + 1] - rightFill[j * 3 + 1]) * t;
        let fb0 = rightFill[j * 3 + 2] + (leftFill[j * 3 + 2] - rightFill[j * 3 + 2]) * t;
        // eco da textura da borda: só variações pequenas, nada de letra
        readPhoto(sourceAngle(theta), j, mir);
        const dr = mir[0] - e[j * 3];
        const dg = mir[1] - e[j * 3 + 1];
        const db = mir[2] - e[j * 3 + 2];
        const keep = SIDE_CONTRAST * (1 - smoothstep(24, 70, Math.hypot(dr, dg, db)));
        fr0 += dr * keep;
        fg0 += dg * keep;
        fb0 += db * keep;
        if (side >= 1) {
          cur[0] = fr0;
          cur[1] = fg0;
          cur[2] = fb0;
        } else {
          cur[0] += (fr0 - cur[0]) * side;
          cur[1] += (fg0 - cur[1]) * side;
          cur[2] += (fb0 - cur[2]) * side;
        }
      }
      rgb[o] = clamp(cur[0], 0, 255);
      rgb[o + 1] = clamp(cur[1], 0, 255);
      rgb[o + 2] = clamp(cur[2], 0, 255);
    }
  }
  await sharp(rgb, { raw: { width: LABEL_W, height: LABEL_H, channels: 3 } })
    .webp({ quality: 90 })
    .toFile(`${OUT}/labels/${cfg.id}.webp`);
  await writeMask(cfg.id, rgb, LABEL_W, LABEL_H, cfg);

  // cor do lacre: topo da lata, faixa central
  const tabBins = new Map();
  for (let y = can.top; y < can.top + (can.bottom - can.top) * 0.03; y++) {
    for (let x = Math.round(can.cx - can.halfW * 0.25); x < can.cx + can.halfW * 0.25; x++) {
      const i = (y * img.w + x) * 4;
      if (img.data[i + 3] < 220) continue;
      const key = ((img.data[i] >> 5) << 6) | ((img.data[i + 1] >> 5) << 3) | (img.data[i + 2] >> 5);
      const e = tabBins.get(key) ?? { c: 0, r: 0, g: 0, b: 0 };
      e.c++;
      e.r += img.data[i];
      e.g += img.data[i + 1];
      e.b += img.data[i + 2];
      tabBins.set(key, e);
    }
  }
  const tabTop = [...tabBins.values()].sort((a, b) => b.c - a.c).slice(0, 3)
    .map((e) => '#' + [e.r, e.g, e.b].map((v) => Math.round(v / e.c).toString(16).padStart(2, '0')).join('').toUpperCase());

  // foto 2D para a coleção e reserva
  await sharp(`sources/${cfg.file}`)
    .extract({ left: Math.max(0, Math.floor(can.cx - can.halfW * 1.02)), top: can.top, width: Math.ceil(can.halfW * 2.04), height: can.bottom - can.top })
    .resize({ height: 1000 })
    .webp({ quality: 86, alphaQuality: 90 })
    .toFile(`${OUT}/posters/${cfg.id}.webp`);

  report[cfg.id] = { can, heightOverWidth: ((can.bottom - can.top) / (can.halfW * 2)).toFixed(3), tabCandidates: tabTop };
  console.log(cfg.id, JSON.stringify(report[cfg.id]));
}

// ---------------------------------------------------------------- ORIGIN: rótulo que já veio no GLB
{
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(SOURCE_GLB);
  const image = doc.getRoot().listTextures()[0].getImage();
  const { data, info } = await sharp(Buffer.from(image)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
    .webp({ quality: 92 })
    .toFile(`${OUT}/labels/origin.webp`);
  await writeMask('origin', data, info.width, info.height, { inkMetal: 0.22, inkRough: 0.34, silverVal: [0.35, 0.8] });
  console.log('origin', info.width, 'x', info.height);

  // foto da ORIGIN: primeiro quadro do vídeo 360, recortado pela silhueta
  const frame = await readRGBA('sources/origin-frame.png');
  const { data: fd, w, h } = frame;
  const lit = (x, y) => luma(fd[(y * w + x) * 4], fd[(y * w + x) * 4 + 1], fd[(y * w + x) * 4 + 2]) > 30;
  // fundo preto: primeiro e último pixel aceso na faixa central de cada linha
  const rows = Array.from({ length: h }, (_, y) => {
    let l = -1;
    let r = -1;
    for (let x = Math.round(w * 0.3); x < w * 0.7; x++) if (lit(x, y)) { l = x; break; }
    for (let x = Math.round(w * 0.7); x > w * 0.3; x--) if (lit(x, y)) { r = x; break; }
    return r - l > 20 ? [l, r] : [-1, -1];
  });
  const widths = rows.filter(([l]) => l >= 0).map(([l, r]) => r - l);
  const medianW = widths.sort((a, b) => a - b)[widths.length >> 1];
  const mid = Math.round(h / 2);
  const inCan = (y) => rows[y][0] >= 0 && rows[y][1] - rows[y][0] > medianW * 0.75 && rows[y][1] - rows[y][0] < medianW * 1.06;
  const extend = (y, step) => {
    let last = y;
    for (let k = y, miss = 0; k > 0 && k < h - 1 && miss < 8; k += step) {
      if (inCan(k)) { last = k; miss = 0; } else miss++;
    }
    return last;
  };
  const top = extend(mid, -1);
  const bottom = extend(mid, 1) + 1;
  let left = w;
  let right = 0;
  for (let y = top; y < bottom; y++) { left = Math.min(left, rows[y][0]); right = Math.max(right, rows[y][1]); }
  const cw = right - left + 1;
  const ch = bottom - top;
  const cut = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const [l, r] = rows[top + y];
    for (let x = 0; x < cw; x++) {
      const sx = left + x;
      const si = ((top + y) * w + sx) * 4;
      const di = (y * cw + x) * 4;
      cut[di] = fd[si];
      cut[di + 1] = fd[si + 1];
      cut[di + 2] = fd[si + 2];
      cut[di + 3] = l >= 0 && sx >= l && sx <= r ? 255 : 0;
    }
  }
  await sharp(cut, { raw: { width: cw, height: ch, channels: 4 } })
    .resize({ height: 1000 })
    .webp({ quality: 86, alphaQuality: 90 })
    .toFile(`${OUT}/posters/origin.webp`);
  console.log('origin poster', cw, 'x', ch);
}

// ---------------------------------------------------------------- grão
{
  const size = 192;
  const grain = Buffer.alloc(size * size * 4);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * size; i++) {
    const v = rand() > 0.5 ? 255 : 0;
    grain[i * 4] = v;
    grain[i * 4 + 1] = v;
    grain[i * 4 + 2] = v;
    grain[i * 4 + 3] = Math.round(rand() * 60);
  }
  await sharp(grain, { raw: { width: size, height: size, channels: 4 } }).png().toFile(`${OUT}/grain.png`);
}

writeFileSync('tools/labels-report.json', JSON.stringify(report, null, 2));
