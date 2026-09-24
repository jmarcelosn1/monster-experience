import type { Variant } from './variants';

// Tokens de cor da página. Durante a passagem de uma versão para a próxima,
// as cores de destaque se misturam na mesma proporção da onda de energia; o
// texto troca de tom (claro/escuro) na metade, quando a interface troca.

const root = document.documentElement;
const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

// Texto claro sobre cena escura, escuro sobre cena clara. A sombra do texto
// (--shade) segura a leitura sobre a imagem sem cobrir o fundo.
const TONE = {
  dark: { fg: '#F4F4F1', muted: '#D2D5D9', faint: '#B4B8BE', shade: 'rgba(0, 0, 0, 0.6)' },
  light: { fg: '#0E1013', muted: '#2E3238', faint: '#4E535A', shade: 'rgba(255, 255, 255, 0.75)' },
} as const;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

export function mixHex(a: string, b: string, t: number) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ca = rgb(a);
  const cb = rgb(b);
  return toHex(ca.map((v, i) => v + (cb[i] - v) * t));
}

let last = '';

/** Tema entre a versão `a` e a `b`, na proporção `t` (0 = a, 1 = b). */
export function applyThemeMix(a: Variant, b: Variant, t: number) {
  const tone = TONE[(t < 0.5 ? a : b).tone];
  const tokens: Record<string, string> = {
    '--deep': mixHex(a.color.deep, b.color.deep, t),
    '--glow': mixHex(a.color.glow, b.color.glow, t),
    '--ink': mixHex(a.color.ink, b.color.ink, t),
    '--fg': tone.fg,
    '--muted': tone.muted,
    '--faint': tone.faint,
    '--shade': tone.shade,
  };
  const key = Object.values(tokens).join('|');
  if (key === last) return;
  last = key;
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
  themeColor?.setAttribute('content', tokens['--deep']);
}
