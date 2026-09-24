// O rasgo entre o hero e a coleção: três garras cortam a tela de cima para
// baixo e depois se abrem até cobrir tudo. A camada da coleção é recortada pelo
// desenho das garras (clip-path: path), então ela aparece pelos rasgos; um
// traço na cor da versão marca a borda de cada corte.

interface Claw {
  x0: number; // topo, fração da largura
  x1: number; // ponta
  len: number; // comprimento, fração da altura
  width: number; // largura no topo, fração da largura
  bow: number; // curvatura lateral
  delay: number; // atraso dentro do corte (0–1)
  seed: number;
}

// Mesma leitura da garra da marca: a do meio é a mais longa.
const CLAWS: Claw[] = [
  { x0: 0.335, x1: 0.305, len: 0.9, width: 0.074, bow: -0.018, delay: 0, seed: 11 },
  { x0: 0.52, x1: 0.49, len: 1.08, width: 0.082, bow: 0.014, delay: 0.14, seed: 37 },
  { x0: 0.7, x1: 0.672, len: 0.84, width: 0.064, bow: -0.012, delay: 0.28, seed: 73 },
];
const SEGMENTS = 56;
const TEAR_SPAN = 1 - 0.28; // cada garra usa esta fração do corte

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOut = (t: number) => 1 - (1 - t) ** 3;

// ruído 1D estável: a borda serrilhada não treme enquanto a garra cresce
const TABLE = Array.from({ length: 1024 }, (_, i) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
});
const noise = (x: number) => {
  const i = Math.floor(x);
  const f = x - i;
  const a = TABLE[((i % 1024) + 1024) % 1024];
  const b = TABLE[(((i + 1) % 1024) + 1024) % 1024];
  return a + (b - a) * f * f * (3 - 2 * f);
};

function clawPath(c: Claw, w: number, h: number, tear: number, open: number) {
  const grow = easeOut(clamp((tear - c.delay) / TEAR_SPAN));
  if (grow <= 0) return '';
  const len = c.len * grow + open * 0.5;
  const widen = 1 + open * open * 18;
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = (i / SEGMENTS) * len;
    const u = Math.min(t / c.len, 1);
    const x = (c.x0 + (c.x1 - c.x0) * u + c.bow * Math.sin(Math.PI * u)) * w;
    const y = (-0.03 + t) * h;
    const taper = (1 - u) ** 0.75 * (1 - open) + open; // abrindo, a garra perde a ponta
    const tip = smoothstep(len, len - 0.08, t); // ponta afiada onde ela está crescendo
    const jag = 1 - open;
    const half = c.width * w * 0.5 * taper * tip * widen;
    const jl = 1 + (noise(t * 90 + c.seed) - 0.5) * 0.7 * jag + (noise(t * 11 + c.seed * 2) - 0.5) * 0.3 * jag;
    const jr = 1 + (noise(t * 90 + c.seed + 400) - 0.5) * 0.7 * jag + (noise(t * 11 + c.seed * 3) - 0.5) * 0.3 * jag;
    left.push(`${(x - half * jl).toFixed(1)} ${y.toFixed(1)}`);
    right.push(`${(x + half * jr).toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M${left.join(' L')} L${right.reverse().join(' L')} Z`;
}

export function createRip(layer: HTMLElement, edge: SVGPathElement, edgeSoft: SVGPathElement) {
  const svg = edge.ownerSVGElement!;
  let last = '';

  /** tear: 0–1 as garras cortando; open: 0–1 os cortes se abrindo até cobrir a tela. */
  function update(tear: number, open: number) {
    let state: string;
    if (tear <= 0) state = 'closed';
    else if (open >= 1) state = 'open';
    else state = `${tear.toFixed(4)}|${open.toFixed(4)}`;
    if (state === last) return;
    last = state;

    if (state === 'closed') {
      layer.style.clipPath = 'inset(0 0 100% 0)';
      svg.style.opacity = '0';
      return;
    }
    if (state === 'open') {
      layer.style.clipPath = 'none';
      svg.style.opacity = '0';
      return;
    }
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    const d = CLAWS.map((c) => clawPath(c, w, h, tear, open)).join(' ');
    layer.style.clipPath = d ? `path('${d}')` : 'inset(0 0 100% 0)';
    edge.setAttribute('d', d);
    edgeSoft.setAttribute('d', d);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.opacity = String(1 - open);
  }

  return { update };
}
