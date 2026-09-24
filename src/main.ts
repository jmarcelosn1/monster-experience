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
const all = <T extends Element>(selector: string) => Array.from(document.querySelectorAll<T>(selector));

// a página sempre abre do começo, e ninguém rola antes da abertura terminar
history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

// A garra começa a rasgar o preto antes de qualquer outra coisa. O three.js
// chega em outro arquivo, em paralelo, e o preparo pesado do 3D (luz e shaders)
// só roda depois do golpe, para não travar a animação.
const intro = createIntro(one('[data-intro]'), reduced);
const threeModules = Promise.all([import('./three/scene'), import('./three/textures'), import('./three/videos')]);
const loader = createLoader(one('[data-loader]'), one('[data-loader-value]'));
const modelFile = fetchAll(['/models/can.glb'], loader.update).then(([glb]) => glb.arrayBuffer());

applyThemeMix(variants[0], variants[0], 0);

const canvas = one<HTMLCanvasElement>('[data-canvas]');
const stageEl = one<HTMLElement>('.stage');
const beatsEl = one<HTMLElement>('[data-beats]');
let story: Story | null = null;

const catalog = createCatalog(one('[data-catalog]'), variants, { go: (i) => story?.goTo(i) }, reduced);
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
  await intro.revealed;
  try {
    const [{ createScene }, { createTextures }, { createVideos }] = await threeModules;
    scene = createScene(canvas, reduced);
    labels = createTextures(scene.stage.renderer, 10);
    backgrounds = createTextures(scene.stage.renderer, 4);
    videos = createVideos();
    // só o modelo segura a abertura; rótulo e cena chegam enquanto ela acontece
    await scene.load(await modelFile);
    const first = variants[0];
    void labels.load(`/labels/${first.id}.webp`, true);
    void labels.load(`/labels/${first.id}-mask.webp`, false);
    void backgrounds.load(`/backgrounds/${first.id}.webp`, true);
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
    beats: all<HTMLElement>('[data-beat]'),
    fallback: showFallback,
    reduced,
    onCover: setCovered,
  });
  const run = story;
  gsap.ticker.add((time, deltaMs) => run.tick(time, deltaMs));

  html.classList.remove('is-loading');
  const tl = gsap.timeline({ onComplete: afterIntro });
  const dive = intro.exit(tl, 0);
  // a lata sobe do preto quando a câmera termina de atravessar a garra
  gsap.set([canvas, beatsEl, one('.bar')], { opacity: 0 });
  tl.to(canvas, { opacity: 1, duration: 1.4, ease: 'power2.out' }, dive - 0.25);
  if (scene) tl.fromTo(scene.motion, { lift: -0.016 }, { lift: 0, duration: 1.8, ease: 'power3.out' }, dive - 0.25);
  tl.to(beatsEl, { opacity: 1, duration: 0.8 }, dive + 0.5);
  tl.to(one('.bar'), { opacity: 1, duration: 0.8 }, dive + 0.7);
}

function afterIntro() {
  html.classList.remove('is-locked');
  wheel.load();
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
