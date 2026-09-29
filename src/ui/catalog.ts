import gsap from 'gsap';
import type { Variant } from '../variants';

// A interface do catálogo, dos dois lados da lata: o nome do produto em letra
// grande à esquerda, na cor escolhida para destacar sobre a cena de cada
// versão, e à direita a legenda com o que está impresso na lata, que chega no
// scroll seguinte. Sem lista nem números: a ordem é a do scroll (e das
// setas). Quando a versão troca, o nome entra esticando pelo eixo de largura
// da fonte.

const WDTH = 78;

export function createCatalog(root: HTMLElement, reduced: boolean) {
  const name = root.querySelector<HTMLElement>('[data-name]')!;
  const lines = Array.from(root.querySelectorAll<HTMLElement>('[data-caption]'));
  const facts = root.querySelector<HTMLElement>('[data-facts]')!;
  const side = root.querySelector<HTMLElement>('[data-side]')!;
  const announce = root.querySelector<HTMLElement>('[data-announce]')!;

  /**
   * Palavra não quebra: se a mais longa ("Absolutely", "Watermelon") passar
   * do espaço à esquerda da lata, o nome inteiro diminui só o necessário.
   */
  function fit() {
    name.style.fontSize = '';
    gsap.set(name, { '--wdth': WDTH });
    const room = name.parentElement!.clientWidth;
    const widest = Math.max(...Array.from(name.children, (w) => (w as HTMLElement).offsetWidth));
    if (widest > room) name.style.fontSize = `${(parseFloat(getComputedStyle(name).fontSize) * room) / widest}px`;
  }

  function fill(v: Variant) {
    // uma palavra por linha: "Ultra / Paradise", "The / Doctor"
    name.replaceChildren(
      ...v.name.split(' ').map((word) => {
        const line = document.createElement('span');
        line.textContent = word;
        return line;
      }),
    );
    name.setAttribute('aria-label', v.name);
    name.style.color = v.color.name;
    fit();
    lines[0].textContent = v.caption[0];
    lines[1].textContent = v.caption[1];
    facts.replaceChildren(
      ...[v.facts.volume, v.facts.sugar].filter((f): f is string => Boolean(f)).map((f) => {
        const line = document.createElement('span');
        line.textContent = f;
        return line;
      }),
    );
  }

  /** Mostra a versão `v`. `dir` diz se o scroll está descendo (1) ou subindo (-1). */
  function show(v: Variant, dir: number, immediate: boolean) {
    announce.textContent = `${v.product}. ${v.caption.join(' ')}`;
    gsap.killTweensOf(name);
    if (immediate || reduced) {
      fill(v);
      gsap.set(name, { opacity: 1, y: 0, '--wdth': WDTH });
      return;
    }
    gsap
      .timeline()
      .to(name, { opacity: 0, y: -10 * dir, duration: 0.16, ease: 'power2.in' })
      .call(() => fill(v))
      .fromTo(
        name,
        { opacity: 0, y: 20 * dir, '--wdth': 62 },
        { opacity: 1, y: 0, '--wdth': WDTH, duration: 0.8, ease: 'expo.out' },
      );
  }

  /** Legenda do outro lado da lata: 0 = fora, 1 = no lugar. Segue o scroll. */
  let sideShown = -1;
  function setCaption(p: number) {
    const rounded = Math.round(p * 100) / 100;
    if (rounded === sideShown) return;
    sideShown = rounded;
    side.style.opacity = String(rounded);
    side.style.translate = `${reduced ? 0 : ((1 - rounded) * 24).toFixed(1)}px -50%`;
  }

  window.addEventListener('resize', fit);

  let visible = -1;
  function setOpacity(o: number) {
    const rounded = Math.round(o * 100) / 100;
    if (rounded === visible) return;
    visible = rounded;
    root.style.opacity = String(rounded);
    root.style.visibility = rounded <= 0 ? 'hidden' : 'visible';
  }

  return { show, setOpacity, setCaption };
}

export type Catalog = ReturnType<typeof createCatalog>;
