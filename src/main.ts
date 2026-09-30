import '@fontsource-variable/archivo/wdth.css';
import './styles/main.css';

import gsap from 'gsap';
import { variants, type Variant } from './variants';
import { applyThemeMix } from './theme';
import { createIntro } from './ui/intro';
import { createCatalog } from './ui/catalog';
import { createWheel } from './ui/wheel';
import { createLoader, fetchAll } from './ui/loader';
import { createStory, type Story } from './story';
import type { Scene } from './three/scene';
import type { Textures } from './three/textures';
import type { Videos } from './three/videos';

const html = document.documentElement;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const one = <T extends Element>(selector: string) => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`faltando no HTML: ${selector}`);
  return el;
};

// a página sempre abre do começo, e ninguém rola antes da abertura terminar
history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

// A abertura começa antes de qualquer outra coisa. O three.js chega em outro
// arquivo, em paralelo, e o preparo do 3D (luz e shaders) começa assim que o
// feixe passa e a garra fica parada, com os shaders compilando em paralelo,
// para a lata já estar pronta quando a pessoa rolar. A abertura só sai
// quando a pessoa rola.
const intro = createIntro(one('[data-intro]'), reduced);
const threeModules = Promise.all([import('./three/scene'), import('./three/textures'), import('./three/videos')]);
const loader = createLoader(one('[data-loader]'), one('[data-loader-value]'), 5200);
const modelFile = fetchAll(['/models/can.glb'], loader.update).then(([glb]) => glb.arrayBuffer());

applyThemeMix(variants[0], variants[0], 0);

const canvas = one<HTMLCanvasElement>('[data-canvas]');
const stageEl = one<HTMLElement>('.stage');
let story: Story | null = null;

const catalog = createCatalog(one('[data-catalog]'), reduced);
const wheel = createWheel(
  one('[data-wheel]'),
  variants,
  {
    open: (i) => story?.goTo(i),
    seek: (i) => story && window.scrollTo({ top: story.wheelAt(i), behavior: reduced ? 'instant' : 'smooth' }),
  },
  reduced,
);

// ---------------------------------------------------------------- 3D

let scene: Scene | null = null;
let labels: Textures | null = null;
let backgrounds: Textures | null = null;
let videos: Videos | null = null;

const fallbackBg = one<HTMLImageElement>('[data-fallback-bg]');
const poster = one<HTMLImageElement>('[data-poster]');
function showFallback(v: Variant) {
  fallbackBg.src = `/backgrounds/${v.id}.webp`;
  poster.src = `/posters/${v.id}.webp`;
}

function useFallback() {
  scene = null;
  labels = null;
  backgrounds = null;
  videos = null;
  html.classList.add('no-webgl');
}

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  useFallback();
  window.location.reload(); // o roteiro é montado com a cena; recomeça em fotos
});

// quando a coleção cobre a tela, o palco para de desenhar
function setCovered(covered: boolean) {
  stageEl.style.visibility = covered ? 'hidden' : '';
  html.classList.toggle('stage-off', covered);
}

// ---------------------------------------------------------------- abertura

async function loadStage() {
  await intro.still;
  try {
    const [{ createScene }, { createTextures }, { createVideos }] = await threeModules;
    scene = createScene(canvas, reduced);
    labels = createTextures(scene.stage.renderer, 10);
    backgrounds = createTextures(scene.stage.renderer, 4);
    videos = createVideos();
    // o modelo e o rótulo da Ultra seguram a saída (a lata nunca aparece sem
    // tinta); a primeira cena chega depois, só é vista após a volta
    await scene.load(await modelFile);
    const first = variants[0];
    void backgrounds.load(`/backgrounds/${first.id}.webp`, true);
    await Promise.all([labels.load(`/labels/${first.id}.webp`, true), labels.load(`/labels/${first.id}-mask.webp`, false)]);
  } catch (err) {
    console.warn('3D indisponível; usando as fotos.', err);
    useFallback();
  }
  await document.fonts.ready;
  loader.done();
}

async function boot() {
  await loadStage();

  story = createStory({
    scene,
    labels,
    backgrounds,
    videos,
    catalog,
    wheel,
    moves: Array.from(document.querySelectorAll<HTMLElement>('[data-move]')),
    fallback: showFallback,
    reduced,
    onCover: setCovered,
  });
  const run = story;
  gsap.ticker.add((time, deltaMs) => run.tick(time, deltaMs));

  await intro.proceed;
  html.classList.remove('is-loading');
  // só um desvanecer: a lata já está parada no lugar final, com a garra
  // impressa exatamente sob a garra da abertura; o preto sai em volta e a
  // garra da abertura se desfaz sobre a dela. Por último, a navegação
  const tl = gsap.timeline();
  const fade = intro.exit(tl, 0);
  const bar = one('.bar');
  tl.fromTo(bar, { opacity: 0 }, { opacity: 1, duration: 0.6 }, fade - 0.3);
  tl.call(afterIntro, [], fade + 0.2);
}

function afterIntro() {
  html.classList.remove('is-locked');
  wheel.load();
  // a roda em 3D monta sete latas: fica para quando o navegador estiver livre
  if (scene) {
    const later = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2000));
    later(() => {
      void Promise.all([import('./three/collection'), modelFile])
        .then(([{ createCollection }, buffer]) => createCollection(one('[data-wheel-gl]'), buffer, variants, reduced))
        .then((collection) => wheel.attach(collection))
        .catch((err) => console.warn('roda em 3D indisponível; ficam as fotos.', err));
    });
  }
  // o resto chega comprimido enquanto a pessoa olha; decodificar fica para depois
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
  idle(() => {
    for (const v of variants) {
      labels?.prefetch(`/labels/${v.id}.webp`);
      labels?.prefetch(`/labels/${v.id}-mask.webp`);
      backgrounds?.prefetch(`/backgrounds/${v.id}.webp`);
    }
  });
}

// ---------------------------------------------------------------- teclado

window.addEventListener('keydown', (e) => {
  if (!story || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
  const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (dir && story.step(dir)) e.preventDefault();
});

if (import.meta.env.DEV) {
  Object.assign(window, {
    __monster: {
      gsap,
      get story() {
        return story;
      },
      get scene() {
        return scene;
      },
    },
  });
}

void boot();
