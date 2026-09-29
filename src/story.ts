import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { variants, type Variant } from './variants';
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
//   apresentação  a Ultra sai do centro para a direita mostrando o verso (e o
//                 texto entra à esquerda), atravessa para a esquerda
//                 completando a volta (texto à direita) e volta ao centro;
//                 gelo e limão em 3D saem de perto dela e flutuam em volta.
//                 Depois a primeira cena aparece por trás
//   catálogo      01 → 07: cada versão fica parada meia tela e a onda leva à
//                 próxima, trocando lata e fundo na mesma linha
//   descrição     o rasgo de três garras abre para a roda dos produtos
//
// Nada disso depende de tempo: parar o scroll para tudo, voltar desfaz.

const n = variants.length;
/** tools/build-intro-claw.mjs mede a garra da abertura com esta distância */
const OPENING_Z = 0.5;
const MOVE_A = [0, 1] as const; // centro → direita, meia volta
const MOVE_B = [1.1, 2.1] as const; // direita → esquerda, a outra meia volta
const MOVE_C = [2.2, 2.7] as const; // esquerda → centro
const SIDE = 0.085; // metros do centro nas pontas da travessia
const REVEAL = [2.6, 3.05] as const;
const C0 = 3.05; // começo do catálogo
const SEG = 1.5; // uma versão a cada tela e meia
const TITLE_AT = 0.2; // parada do nome, em telas desde o começo da versão
const CAPTION_AT = 0.7; // parada da legenda, do outro lado da lata
const HOLD = 1 / SEG; // até aqui a versão fica parada; depois, a troca
const C_END = C0 + (n - 1) * SEG + HOLD * SEG;
const RIP0 = C_END + 0.1;
const RIP_TEAR = RIP0 + 0.8;
const RIP_END = RIP0 + 1.3;
const RING_END = RIP0 + 1.8;
const OPEN_END = RIP0 + 2.4;
const ITEM = 0.55;
const END = OPEN_END + (n - 1) * ITEM + 0.45;

const SMOOTHING = 9; // por segundo: a rodinha do mouse anda em degraus, a cena não

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
  /** os dois textos da travessia: à esquerda, depois à direita */
  moves: HTMLElement[];
  fallback: (v: Variant) => void;
  reduced: boolean;
  onCover(covered: boolean): void;
}

export function createStory(deps: Deps) {
  const { scene, labels, backgrounds, videos, catalog, wheel, moves, fallback, reduced, onCover } = deps;
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

  // Sempre para num ponto de leitura: a lata parada, os dois lados da
  // travessia, cada versão, anel, cada produto.
  const stops = [
    0,
    MOVE_A[1] + 0.05,
    MOVE_B[1] + 0.05,
    ...variants.flatMap((_, i) => [C0 + i * SEG + TITLE_AT, C0 + i * SEG + CAPTION_AT]),
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
    const ma = smooth((s - MOVE_A[0]) / (MOVE_A[1] - MOVE_A[0]));
    const mb = smooth((s - MOVE_B[0]) / (MOVE_B[1] - MOVE_B[0]));
    const mc = smooth((s - MOVE_C[0]) / (MOVE_C[1] - MOVE_C[0]));
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
        // a primeira cena sobe do preto por trás da lata depois da travessia
        scene.setWave(printed, printed, null, scene0, scene0 ? reveal : 0, ultra.color.glow, 5.7);
        // cada trecho da travessia é meia volta; a lata se inclina para o lado
        // em que anda, como quem ganha velocidade, e endireita ao parar
        scene.motion.x = SIDE * ma - 2 * SIDE * mb + SIDE * mc;
        scene.motion.spin = (ma + mb) * Math.PI;
        scene.motion.roll = -0.09 * Math.sin(Math.PI * ma) + 0.12 * Math.sin(Math.PI * mb) - 0.05 * Math.sin(Math.PI * mc);
        scene.motion.tilt = 0.05 * (Math.sin(Math.PI * ma) + Math.sin(Math.PI * mb));
        // começa na distância em que a garra da abertura foi medida e recua
        // para abrir espaço à travessia; termina na distância do catálogo
        scene.stage.shot.z = OPENING_Z + 0.12 * ma - 0.02 * mc;
        scene.ingredients.use(ultra.ingredients);
        scene.ingredients.setPresence(smooth((s - 0.1) / 0.6) * (1 - smooth((s - MOVE_C[0]) / 0.45)));
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
        scene.motion.roll = 0;
        scene.motion.x = 0;
        scene.stage.shot.z = 0.6;
        scene.ingredients.setPresence(0);
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
      catalog.show(variants[product], product >= shown ? 1 : -1, shown < 0);
      shown = product;
    }
    if (!scene && product !== fallbackShown) {
      fallback(variants[product]);
      fallbackShown = product;
    }
    // os textos da travessia: cada um do lado oposto ao da lata
    moves[0].style.opacity = String(smooth((s - 0.55) / 0.35) * (1 - smooth((s - MOVE_B[0]) / 0.25)));
    moves[1].style.opacity = String(smooth((s - 1.65) / 0.35) * (1 - smooth((s - MOVE_C[0]) / 0.25)));
    catalog.setOpacity(smooth((s - (REVEAL[0] + 0.2)) / 0.3) * (1 - smooth((s - C_END) / 0.25)));
    // a legenda chega no segundo scroll da versão e sai quando a troca começa
    const local = f * SEG;
    const leaving = k < n - 1 ? smooth((local - HOLD * SEG) / 0.15) : 0;
    catalog.setCaption(inCatalog ? smooth((local - 0.35) / 0.3) * (1 - leaving) : 0);

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
  const catalogAt = (i: number) => (C0 + i * SEG + TITLE_AT) * vh();

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
    const k = clamp(Math.round((current - C0 - (TITLE_AT + CAPTION_AT) / 2) / SEG), 0, n - 1);
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
