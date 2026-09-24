import gsap from 'gsap';
import type { Variant } from '../variants';

// A interface do catálogo: o índice 01–07 (é uma sequência de scroll de
// verdade), o nome do produto, a legenda e o que está impresso na lata. Quando
// a versão troca, o nome entra esticando pelo eixo de largura da fonte.

const pad = (n: number) => String(n).padStart(2, '0');

interface Handlers {
  go(index: number): void;
}

export function createCatalog(root: HTMLElement, variants: readonly Variant[], handlers: Handlers, reduced: boolean) {
  const list = root.querySelector<HTMLElement>('[data-index]')!;
  const name = root.querySelector<HTMLElement>('[data-name]')!;
  const lines = Array.from(root.querySelectorAll<HTMLElement>('[data-caption]'));
  const facts = root.querySelector<HTMLElement>('[data-facts]')!;
  const announce = root.querySelector<HTMLElement>('[data-announce]')!;

  const buttons = variants.map((v, i) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = pad(i + 1);
    const w = document.createElement('span');
    w.className = 'w';
    w.textContent = v.name;
    button.append(n, w);
    button.addEventListener('click', () => handlers.go(i));
    item.append(button);
    list.append(item);
    return button;
  });

  function fill(v: Variant) {
    name.textContent = v.name;
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

  /** Mostra o produto `i`. `dir` diz se o scroll está descendo (1) ou subindo (-1). */
  function show(i: number, dir: number, immediate: boolean) {
    const v = variants[i];
    buttons.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    announce.textContent = `${pad(i + 1)}. ${v.product}.`;
    gsap.killTweensOf([name, ...lines, facts]);
    if (immediate || reduced) {
      fill(v);
      gsap.set([name, ...lines, facts], { opacity: 1, y: 0, '--wdth': 112 });
      return;
    }
    gsap
      .timeline()
      .to([name, ...lines, facts], { opacity: 0, y: -10 * dir, duration: 0.16, ease: 'power2.in' })
      .call(() => fill(v))
      .fromTo(
        name,
        { opacity: 0, y: 16 * dir, '--wdth': 62 },
        { opacity: 1, y: 0, '--wdth': 112, duration: 0.7, ease: 'expo.out' },
      )
      .fromTo(
        [...lines, facts],
        { opacity: 0, y: 10 * dir },
        { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', stagger: 0.05 },
        '<0.08',
      );
  }

  let visible = -1;
  function setOpacity(o: number) {
    const rounded = Math.round(o * 100) / 100;
    if (rounded === visible) return;
    visible = rounded;
    root.style.opacity = String(rounded);
    root.style.visibility = rounded <= 0 ? 'hidden' : 'visible';
    root.inert = rounded < 0.5;
  }

  return { show, setOpacity };
}

export type Catalog = ReturnType<typeof createCatalog>;
