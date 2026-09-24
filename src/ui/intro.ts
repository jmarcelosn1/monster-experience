import gsap from 'gsap';

// Abertura: tela preta, e a garra da Monster rasga o preto. Cada uma das três
// garras é revelada por um corte serrilhado que desce acelerando, com uma
// faísca verde na ponta. Na saída a câmera mergulha no vão preto entre a garra
// da esquerda e a do meio, e o preto do vão vira o preto da apresentação.

const W = 604;
const H = 900;
// faixas que revelam cada garra (se sobrepõem de leve; o recorte da imagem
// já dá a forma exata)
const BANDS = [
  { x0: 0, x1: 262, delay: 0, seed: 3 },
  { x0: 236, x1: 456, delay: 0.16, seed: 17 },
  { x0: 430, x1: W, delay: 0.32, seed: 41 },
];
const SPAN = 1 - 0.32;
const ZOOM_ORIGIN = '42.5% 52%'; // centro do vão transparente, medido na imagem

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const TABLE = Array.from({ length: 256 }, (_, i) => {
  const x = Math.sin(i * 78.233) * 43758.5453;
  return x - Math.floor(x);
});
const noise = (x: number) => {
  const i = Math.floor(x);
  const f = x - i;
  const a = TABLE[((i % 256) + 256) % 256];
  const b = TABLE[(((i + 1) % 256) + 256) % 256];
  return a + (b - a) * f * f * (3 - 2 * f);
};

function edge(x0: number, x1: number, front: number, seed: number) {
  const pts: string[] = [];
  for (let x = x0; x <= x1; x += 8) {
    const slope = ((x - x0) / (x1 - x0) - 0.5) * -26; // corte levemente inclinado
    const jag = (noise(x * 0.09 + seed) - 0.5) * 36 + (noise(x * 0.025 + seed * 2) - 0.5) * 26;
    pts.push(`${x.toFixed(1)} ${(front + slope + jag).toFixed(1)}`);
  }
  return pts;
}

export function createIntro(root: HTMLElement, reduced: boolean) {
  const logo = root.querySelector<SVGSVGElement>('[data-logo]')!;
  const cut = root.querySelector<SVGPathElement>('[data-cut]')!;
  const spark = root.querySelector<SVGPathElement>('[data-spark]')!;
  const sparkSoft = root.querySelector<SVGPathElement>('[data-spark-soft]')!;
  const glow = root.querySelector<HTMLElement>('[data-intro-glow]')!;
  const state = { p: 0 };

  function draw() {
    let cutD = '';
    let sparkD = '';
    for (const b of BANDS) {
      const local = clamp((state.p - b.delay) / SPAN);
      if (local <= 0) continue;
      const e = local ** 1.7; // o corte acelera, como um golpe
      const front = -40 + e * (H + 90);
      const pts = edge(b.x0, b.x1, front, b.seed);
      cutD += `M${b.x0} -60 L${b.x1} -60 L${pts.slice().reverse().join(' L')} Z `;
      if (local < 1) sparkD += `M${pts.join(' L')} `;
    }
    cut.setAttribute('d', cutD || 'M0 0');
    spark.setAttribute('d', sparkD);
    sparkSoft.setAttribute('d', sparkD);
  }

  const revealed = new Promise<void>((resolve) => {
    const tl = gsap.timeline({ delay: 0.35, onComplete: resolve });
    if (reduced) {
      state.p = 1;
      draw();
      tl.fromTo(logo, { opacity: 0 }, { opacity: 1, duration: 0.5 });
      return;
    }
    tl.to(state, { p: 1, duration: 1.15, ease: 'none', onUpdate: draw });
    // o golpe termina e a marca "acende"
    tl.fromTo(logo, { scale: 0.965 }, { scale: 1, duration: 0.9, ease: 'expo.out' }, 1.05);
    tl.fromTo(glow, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 1.2, ease: 'expo.out' }, 1.0);
  });

  // enquanto termina de carregar, a garra respira devagar
  const breathe = reduced ? null : gsap.to(glow, { opacity: 0.5, duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1, paused: true });
  void revealed.then(() => breathe?.play());

  /** Mergulho no vão preto. Devolve a duração, para a cena entrar logo depois. */
  function exit(tl: gsap.core.Timeline, at: number) {
    tl.call(() => void breathe?.kill(), [], at);
    if (reduced) {
      tl.to(root, { opacity: 0, duration: 0.5 }, at);
      tl.set(root, { display: 'none' }, at + 0.5);
      return 0.5;
    }
    tl.set(logo, { transformOrigin: ZOOM_ORIGIN }, at);
    tl.to(glow, { opacity: 0, duration: 0.5, ease: 'power1.in' }, at);
    tl.to(logo, { scale: 80, duration: 1.6, ease: 'power4.in' }, at);
    tl.set(root, { display: 'none' }, at + 1.6);
    return 1.6;
  }

  return { revealed, exit };
}
