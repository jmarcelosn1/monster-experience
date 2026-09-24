import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { variants, CLAW_GREEN, type Variant } from './variants';
import { applyThemeMix } from './theme';
import { createRip } from './ui/rip';
import type { Scene } from './three/scene';
import type { Textures } from './three/textures';
import type { Videos } from './three/videos';
import type { LabelPair } from './three/can';
import type { Catalog } from './ui/catalog';
import type { Wheel } from './ui/wheel';

// O roteiro inteiro do site, pelo scroll normal da página. Tudo está em alturas
// de tela contadas do topo:
//
//   apresentação  a lata de alumínio cru é impressa (a onda sobe) e dá uma
//                 volta inteira; depois a primeira cena aparece por trás
//   catálogo      01 → 07: cada versão fica parada meia tela e a onda leva à
//                 próxima, trocando lata e fundo na mesma linha
//   descrição     o rasgo de três garras abre para a roda dos produtos
//
// Nada disso depende de tempo: parar o scroll para tudo, voltar desfaz.

const n = variants.length;
const PRINT = [0.06, 0.95] as const;
const SPIN = [1.0, 2.0] as const;
const REVEAL = [2.0, 2.45] as const;
const C0 = 2.45; // começo do catálogo
const SEG = 1; // uma versão por tela
const HOLD = 0.5; // metade parada, metade trocando
const C_END = C0 + (n - 1) * SEG + HOLD;
const RIP0 = C_END + 0.1;
const RIP_TEAR = RIP0 + 0.8;
const RIP_END = RIP0 + 1.3;
const RING_END = RIP0 + 1.8;
const OPEN_END = RIP0 + 2.4;
const ITEM = 0.55;
const END = OPEN_END + (n - 1) * ITEM + 0.45;

const SMOOTHING = 9; // por segundo: a rodinha do mouse anda em degraus, a cena não
const TAU = Math.PI * 2;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};

interface Deps {
  scene: Scene | null;
  labels: Textures | null;
  backgrounds: Textures | null;
  videos: Videos | null;
  catalog: Catalog;
  wheel: Wheel;
  beats: HTMLElement[];
  fallback: (v: Variant) => void;
  reduced: boolean;
  onCover(covered: boolean): void;
}

export function createStory(deps: Deps) {
  const { scene, labels, backgrounds, videos, catalog, wheel, beats, fallback, reduced, onCover } = deps;
  gsap.registerPlugin(ScrollTrigger);
  if (import.meta.env.DEV) Object.assign(window, { __scrollTrigger: ScrollTrigger });

  const spacer = document.querySelector<HTMLElement>('[data-story]')!;
  const layer = document.querySelector<HTMLElement>('[data-journey-layer]')!;
  const rip = createRip(
    layer,
    document.querySelector<SVGPathElement>('[data-rip-edge]')!,
    document.querySelector<SVGPathElement>('[data-rip-soft]')!,
  );
  const vh = () => window.innerHeight;

  function size() {
    spacer.style.height = `${(END + 1) * vh()}px`;
    wheel.measure();
    scene?.resize();
  }
  size();

  // Sempre para num ponto de leitura: lata impressa, cada versão, anel, cada produto.
  const stops = [
    0,
    PRINT[1] + 0.02,
    ...variants.map((_, i) => C0 + i * SEG + HOLD / 2),
    RIP0 + 1.55,
    ...variants.map((_, i) => OPEN_END + i * ITEM),
    END,
  ];
  ScrollTrigger.create({
    start: 0,
    end: () => END * vh(),
    snap: reduced
      ? undefined
      : { snapTo: stops.map((s) => s / END), duration: { min: 0.4, max: 1.3 }, delay: 0.12, ease: 'power2.inOut' },
  });

  const labelUrls = (v: Variant) => [`/labels/${v.id}.webp`, `/labels/${v.id}-mask.webp`];
  const bgUrl = (v: Variant) => `/backgrounds/${v.id}.webp`;

  function pair(v: Variant): LabelPair | null {
    if (!labels) return null;
    const [mapUrl, maskUrl] = labelUrls(v);
    const map = labels.ready(mapUrl, true);
    const mask = labels.ready(maskUrl, false);
    return map && mask ? { map, mask } : null;
  }
  // vídeo quando a versão tiver um e ele já tiver o primeiro quadro; senão a foto
  const bg = (v: Variant) => (v.video ? videos?.get(v.video) : null) ?? backgrounds?.ready(bgUrl(v), true) ?? null;

  let s = window.scrollY / vh(); // posição suavizada que a cena usa
  let shown = -1;
  let covered = false;
  let fallbackShown = -1;

  function tick(time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    const target = window.scrollY / vh();
    s = reduced ? target : s + (target - s) * (1 - Math.exp(-dt * SMOOTHING));
    if (Math.abs(target - s) < 1e-4) s = target;

    // ---------------------------------------------------------- posição
    const print = clamp((s - PRINT[0]) / (PRINT[1] - PRINT[0]));
    const spin = clamp((s - SPIN[0]) / (SPIN[1] - SPIN[0]));
    const reveal = clamp((s - REVEAL[0]) / (REVEAL[1] - REVEAL[0]));
    let k = 0;
    let t = 0;
    let f = 0;
    if (s >= C0) {
      const x = (s - C0) / SEG;
      k = Math.min(n - 1, Math.floor(x));
      f = clamp(x - k);
      t = k < n - 1 ? smooth((f - HOLD) / (1 - HOLD)) : 0;
    }
    const a = variants[k];
    const b = variants[Math.min(n - 1, k + 1)];
    const inCatalog = s >= C0;

    // ---------------------------------------------------------- lata e fundo
    if (scene?.ready && !covered) {
      const ultra = variants[0];
      if (!inCatalog) {
        const printed = pair(ultra);
        const scene0 = bg(ultra);
        if (s < REVEAL[0]) {
          // alumínio cru → rótulo, com a onda na cor da garra
          scene.setWave(null, printed, null, null, printed ? print : 0, CLAW_GREEN, 3.1);
        } else {
          // a primeira cena sobe do preto por trás da lata, na mesma onda
          scene.setWave(printed, printed, null, scene0, scene0 ? reveal : 0, ultra.color.glow, 5.7);
        }
        scene.motion.spin = smooth(spin) * TAU;
        scene.motion.tilt = Math.sin(spin * Math.PI) * 0.09;
        scene.stage.shot.z = 0.5 + 0.1 * smooth(spin);
        scene.motion.bgZoomA = scene.motion.bgZoomB = 1.04;
        scene.mixLook(ultra, ultra, 0);
        scene.particles.setPresence(reveal);
        videos?.playOnly([ultra.video]);
        labels?.pin([...labelUrls(ultra)]);
        backgrounds?.pin([bgUrl(ultra)]);
        void pair(variants[1]);
        void bg(variants[1]);
      } else {
        const la = pair(a);
        const lb = pair(b);
        const ba = bg(a);
        const bb = bg(b);
        // se a próxima ainda não chegou, a onda espera
        const p = la && lb && ba && bb ? t : 0;
        scene.setWave(la, lb ?? la, ba, bb ?? ba, p, b.color.glow, k * 7.3 + 1);
        scene.motion.spin = 0;
        scene.motion.tilt = 0;
        scene.stage.shot.z = 0.6;
        // a cena se aproxima devagar enquanto a versão está na tela
        scene.motion.bgZoomA = 1.04 + 0.035 * f;
        scene.motion.bgZoomB = 1.04;
        scene.mixLook(a, b, t);
        scene.particles.setPresence(1);
        videos?.playOnly(t > 0 ? [a.video, b.video] : [a.video]);
        labels?.pin([...labelUrls(a), ...labelUrls(b)]);
        backgrounds?.pin([bgUrl(a), bgUrl(b)]);
        const ahead = variants[Math.min(n - 1, k + 2)];
        void pair(ahead);
        void bg(ahead);
      }
      scene.tick(time, dt, deltaMs);
    }

    // ---------------------------------------------------------- interface
    document.documentElement.classList.toggle('is-dark-stage', s < REVEAL[0] + 0.25);
    applyThemeMix(inCatalog ? a : variants[0], inCatalog ? b : variants[0], inCatalog ? t : 0);
    const product = inCatalog ? k + (t >= 0.5 ? 1 : 0) : 0;
    if (product !== shown) {
      catalog.show(product, product >= shown ? 1 : -1, shown < 0);
      shown = product;
    }
    if (!scene && product !== fallbackShown) {
      fallback(variants[product]);
      fallbackShown = product;
    }
    catalog.setOpacity(smooth((s - (REVEAL[0] + 0.2)) / 0.3) * (1 - smooth((s - C_END) / 0.25)));
    beats[0].style.opacity = String(1 - smooth((s - 0.55) / 0.35));
    beats[1].style.opacity = String(smooth((s - 1.05) / 0.2) * (1 - smooth((s - 1.75) / 0.2)));

    // ---------------------------------------------------------- rasgo e roda
    const tear = reduced ? (s > RIP0 ? 1 : 0) : clamp((s - RIP0) / (RIP_TEAR - RIP0));
    const open = reduced ? clamp((s - RIP0) / (RIP_END - RIP0)) : clamp((s - RIP_TEAR) / (RIP_END - RIP_TEAR));
    if (reduced) {
      layer.style.clipPath = 'none';
      layer.style.opacity = String(open);
    } else {
      rip.update(tear, open);
    }
    const nowCovered = open >= 1;
    if (nowCovered !== covered) {
      covered = nowCovered;
      onCover(covered);
    }
    if (tear > 0) {
      const w = s < RING_END ? 0 : s < OPEN_END ? (s - RING_END) / (OPEN_END - RING_END) : 1 + (s - OPEN_END) / ITEM;
      wheel.setTarget(w);
      wheel.frame(dt);
    }
    // depois da roda, a camada fixa sobe junto com a página até o rodapé
    layer.style.translate = s > END ? `0 ${(-(s - END) * vh()).toFixed(1)}px` : '';
  }

  /** Posição de rolagem de uma versão do catálogo. */
  const catalogAt = (i: number) => (C0 + i * SEG + HOLD / 2) * vh();

  /**
   * Vai até a versão `i` do catálogo. De longe, salta para a anterior e rola
   * só a última onda, para não atravessar todas as trocas no caminho.
   */
  function goTo(i: number) {
    const target = catalogAt(i);
    const from = window.scrollY;
    if (Math.abs(target - from) > SEG * vh() * 1.3) {
      const near = i > 0 ? catalogAt(i - 1) : C0 * vh();
      window.scrollTo({ top: near, behavior: 'instant' });
      s = near / vh(); // a cena pula junto, sem passar pelo meio
    }
    window.scrollTo({ top: target, behavior: reduced ? 'instant' : 'smooth' });
  }

  function step(dir: number) {
    const current = window.scrollY / vh();
    if (current < C0 - 0.3 || current > C_END + 0.2) return false;
    const k = clamp(Math.round((current - C0 - HOLD / 2) / SEG), 0, n - 1);
    goTo(clamp(k + dir, 0, n - 1));
    return true;
  }

  /** Posição de rolagem em que o produto `i` fica na frente da roda. */
  const wheelAt = (i: number) => (OPEN_END + i * ITEM) * vh();

  window.addEventListener('resize', () => {
    size();
    ScrollTrigger.refresh();
  });

  return { tick, goTo, step, wheelAt };
}

export type Story = ReturnType<typeof createStory>;
