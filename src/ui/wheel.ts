import gsap from 'gsap';
import type { Variant } from '../variants';

// A descrição dos produtos como uma roda (a partir do works-wheel), só com as
// latas recortadas. Em repouso, as sete formam um anel em volta do título, como
// raios; ao rolar, o anel se abre num tambor vertical: a lata da frente fica em
// pé e inteira, e as vizinhas giram para longe em perspectiva, saindo pelo alto
// e por baixo do quadro. Tudo sai de um número, `turn`: 0 é o anel, 1 é o
// tambor com a primeira versão na frente, e cada inteiro depois é uma versão a
// mais. Quem move `turn` é o scroll da página (ver scroll/journey.ts); aqui ele
// só é suavizado e desenhado.

const CAN_RATIO = 0.42; // largura / altura das latas recortadas
const CAN_H = 0.64; // altura da lata da frente, fração do palco
const CAN_MAX_W = 0.3; // ... mas nunca mais larga que isto
const STEP = 40; // graus entre latas no tambor
// Latas são altas: com raio menor que (altura/2)·cot(STEP/2) ≈ 1,37 altura, a borda
// de baixo da vizinha passa à frente da lata central e as duas se atravessam.
const DRUM = 1.55; // raio do tambor, em alturas de lata
const LENS = 2.6; // distância da perspectiva, em alturas de lata
const BOW = 0.9; // o tambor curva para a esquerda: a da frente fica no centro
const RING_R = 0.3; // raio do anel, fração do palco (até o centro de cada lata)
const RING_CAN = 0.24; // altura de cada lata no anel, fração do palco
const CULL = 1.6; // vizinhas além disso já estão de lado
const CASCADE = 0.35; // atraso máximo da cascata na passagem anel → tambor
const SMOOTH = 6.5; // por segundo; maior = segue o scroll mais de perto
const RING_DRIFT = 7; // graus por segundo que o anel gira sozinho

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rad = (deg: number) => (deg * Math.PI) / 180;
const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

function place(ringDeg: number, drumDeg: number, ringR: number, drumR: number, bow: number, m: number) {
  const bowX = -bow * (1 - Math.cos(rad(drumDeg)));
  return (
    `translateX(${(m * bowX).toFixed(2)}px)` +
    ` rotateZ(${((1 - m) * ringDeg).toFixed(3)}deg) translateY(${(-(1 - m) * ringR).toFixed(2)}px)` +
    ` rotateX(${(m * drumDeg).toFixed(3)}deg) translateZ(${(m * drumR).toFixed(2)}px)`
  );
}

interface Handlers {
  /** clicou na lata da frente */
  open(index: number): void;
  /** clicou numa vizinha ou no índice */
  seek(index: number): void;
}

export function createWheel(root: HTMLElement, variants: readonly Variant[], handlers: Handlers, reduced: boolean) {
  const drum = root.querySelector<HTMLElement>('[data-wheel-drum]')!;
  const label = root.querySelector<HTMLElement>('[data-wheel-label]')!;
  const titleBox = root.querySelector<HTMLElement>('[data-wheel-title]')!;
  const panelName = titleBox.querySelector<HTMLElement>('[data-wheel-name]')!;
  const panelProduct = titleBox.querySelector<HTMLElement>('[data-wheel-product]')!;
  const panelDesc = titleBox.querySelector<HTMLElement>('[data-wheel-desc]')!;
  const panelFacts = titleBox.querySelector<HTMLElement>('[data-wheel-facts]')!;
  const panelGo = titleBox.querySelector<HTMLButtonElement>('[data-wheel-go]')!;
  const panelParts = [panelName, panelProduct, panelDesc, panelFacts, panelGo];
  panelGo.addEventListener('click', () => handlers.open(active));
  const index = root.querySelector<HTMLElement>('[data-wheel-index]')!;
  const n = variants.length;

  const cards = variants.map((v, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'wheel__card';
    card.setAttribute('aria-label', v.product);
    const can = document.createElement('img');
    can.className = 'wheel__can';
    can.alt = '';
    can.decoding = 'async';
    can.draggable = false;
    card.append(can);
    card.addEventListener('click', () => (i === active && m > 0.9 ? handlers.open(i) : handlers.seek(i)));
    drum.append(card);
    return { card, can };
  });

  const indexButtons = variants.map((v, i) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    const num = document.createElement('span');
    num.textContent = String(i + 1).padStart(2, '0');
    button.append(num, ` ${v.name}`);
    button.addEventListener('click', () => handlers.seek(i));
    item.append(button);
    index.append(item);
    return button;
  });

  /** As latas só entram depois da abertura, para não disputar banda. */
  function load() {
    variants.forEach((v, i) => (cards[i].can.src = `/posters/${v.id}.webp`));
  }

  let geo = { canH: 0, drumR: 0, ringR: 0, ringScale: 1, bow: 0 };
  function measure() {
    const w = root.clientWidth;
    const h = root.clientHeight;
    const canH = Math.min(h * CAN_H, (w * CAN_MAX_W) / CAN_RATIO);
    geo = {
      canH,
      drumR: canH * DRUM,
      ringR: h * RING_R,
      ringScale: (h * RING_CAN) / canH,
      bow: canH * BOW,
    };
    root.style.setProperty('--can-w', `${canH * CAN_RATIO}px`);
    root.style.setProperty('--can-h', `${canH}px`);
    root.style.setProperty('--depth', `${canH * LENS}px`);
    root.style.setProperty('--ring-title', `${h * 0.05}px`);
    root.style.setProperty('--title', `${h * 0.075}px`);
  }

  let turn = 0;
  let target = 0;
  let drift = 0;
  let m = 0;
  let active = -1;

  function setActive(i: number) {
    if (i === active) return;
    const first = active < 0;
    active = i;
    const v = variants[i];
    indexButtons.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    // a roda é escura em todas as versões: o título usa a cor da luz, legível ali
    gsap.to(root, { '--wheel-glow': v.color.glow, '--wheel-deep': v.color.deep, duration: 0.6, ease: 'power1.inOut' });
    const swap = () => {
      panelName.textContent = v.name;
      panelProduct.textContent = v.product;
      panelDesc.textContent = v.description;
      panelFacts.textContent = [v.facts.volume, v.facts.sugar].filter(Boolean).join(', ');
      panelGo.setAttribute('aria-label', `Ver ${v.name} no catálogo`);
    };
    if (first || reduced) {
      swap();
      return;
    }
    gsap
      .timeline()
      .to(panelParts, { y: -8, opacity: 0, duration: 0.16, ease: 'power2.in' })
      .call(swap)
      .fromTo(panelParts, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out', stagger: 0.04 });
  }

  /** Posição pedida pelo scroll (0 = anel, 1 = primeira versão na frente). */
  function setTarget(value: number) {
    target = clamp(value, 0, n);
  }

  function frame(dt: number) {
    const k = reduced ? 1 : 1 - Math.exp(-dt * SMOOTH);
    turn += (target - turn) * k;
    if (Math.abs(target - turn) < 0.0002) turn = target;
    m = clamp(turn, 0, 1);
    const pos = Math.max(0, turn - 1);
    if (!reduced) drift = (drift + dt * RING_DRIFT * (1 - m)) % 360;

    // o tambor recua para a lata da frente cair no plano da tela
    drum.style.transform = `translateZ(${(-m * geo.drumR).toFixed(2)}px)`;
    for (let i = 0; i < n; i++) {
      const d = i - pos;
      const { card, can } = cards[i];
      // Na passagem anel → tambor, a primeira lata chega antes e as outras
      // vêm em cascata, pela distância no anel; quem não fica no tambor some aos poucos.
      const ringDist = Math.min(i, n - i) / (n / 2);
      const mi = smooth((m - ringDist * CASCADE) / (1 - CASCADE));
      const keep = 1 - smooth((Math.abs(d) - (CULL - 0.5)) / 0.5);
      const dim = 1 - Math.min(1, Math.abs(d)) * 0.45 * mi; // vizinhas mais apagadas
      const opacity = lerp(1, keep, mi) * dim;
      card.style.transform = place(i * (360 / n) + drift, d * STEP, geo.ringR, geo.drumR, geo.bow, mi);
      card.style.opacity = opacity.toFixed(3);
      card.style.visibility = opacity < 0.01 ? 'hidden' : '';
      card.style.zIndex = String(Math.round(100 - Math.abs(d) * 2));
      can.style.transform = `scale(${lerp(geo.ringScale, 1, mi).toFixed(4)})`;
    }
    label.style.opacity = String(1 - smooth(m / 0.4));
    const panel = smooth((m - 0.6) / 0.4);
    titleBox.style.opacity = String(panel);
    titleBox.style.pointerEvents = panel > 0.6 ? 'auto' : 'none';
    index.style.opacity = String(smooth((m - 0.5) / 0.5));
    setActive(clamp(Math.round(pos), 0, n - 1));
  }

  measure();
  return {
    load,
    measure,
    setTarget,
    frame,
    /** nada a desenhar: chegou ao alvo e já é tambor (o anel gira sozinho) */
    get settled() {
      return turn === target && m >= 1;
    },
  };
}

export type Wheel = ReturnType<typeof createWheel>;
