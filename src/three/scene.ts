import gsap from 'gsap';
import * as THREE from 'three';
import { createStage } from './stage';
import { createLights } from './lights';
import { parseCan, type Can, type LabelPair } from './can';
import { createParticles } from './particles';
import { createBackdrop } from './backdrop';
import type { Variant } from '../variants';

// A cena não decide nada sozinha: o roteiro do scroll (story.ts) diz, a cada
// quadro, quais rótulos e fundos estão em jogo e onde está a onda. A lata só
// gira na apresentação; no catálogo ela fica parada no centro, e quem responde
// ao mouse é a luz e o fundo.

const WAVE_FROM = -0.08; // a onda entra por baixo da tela...
const WAVE_TO = 1.08; // ...e sai por cima

export function createScene(canvas: HTMLCanvasElement, reduced: boolean) {
  const stage = createStage(canvas);
  const lights = createLights(stage.renderer, stage.scene);
  const particles = createParticles(window.innerWidth < 760 ? 140 : 340);
  const backdrop = createBackdrop();
  stage.scene.add(backdrop.mesh, particles.points);

  let can: Can | null = null;

  /** O que o roteiro pode animar: giro e inclinação da apresentação, subida inicial. */
  const motion = { spin: 0, tilt: 0, lift: 0, bgZoomA: 1.04, bgZoomB: 1.04 };
  const pointer = { x: 0, y: 0 };
  const followX = gsap.quickTo(pointer, 'x', { duration: 1.2, ease: 'power3' });
  const followY = gsap.quickTo(pointer, 'y', { duration: 1.2, ease: 'power3' });
  if (!reduced) {
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        followX((e.clientX / window.innerWidth) * 2 - 1);
        followY((e.clientY / window.innerHeight) * 2 - 1);
      },
      { passive: true },
    );
  }

  async function load(buffer: ArrayBuffer) {
    can = await parseCan(buffer);
    stage.pivot.add(can.root);
    stage.scene.add(can.shadow);
    stage.renderer.compile(stage.scene, stage.camera);
  }

  const projected = new THREE.Vector3();
  /** Altura na tela (0 = base, 1 = topo) de um ponto do eixo da lata. */
  function screenY(worldY: number) {
    projected.set(0, worldY + stage.pivot.position.y, 0).project(stage.camera);
    return (projected.y + 1) / 2;
  }

  const glowColor = new THREE.Color();
  const tabA = new THREE.Color();
  const tabB = new THREE.Color();

  /**
   * Onda de energia: progresso 0–1 sobe da base ao topo da tela. Abaixo dela
   * aparecem o rótulo e o fundo B. Lata e fundo usam a mesma linha.
   */
  function setWave(
    labelA: LabelPair | null,
    labelB: LabelPair | null,
    bgA: THREE.Texture | null,
    bgB: THREE.Texture | null,
    progress: number,
    glow: string,
    seed: number,
  ) {
    const front = WAVE_FROM + (WAVE_TO - WAVE_FROM) * progress;
    const moving = progress > 0 && progress < 1;
    glowColor.set(glow);
    backdrop.set(bgA, bgB, front, moving ? 1 : 0, glowColor, seed);
    if (!can) return;
    const bottom = screenY(can.body.min);
    const top = screenY(can.body.max);
    // o shader da lata põe a frente em uSweep·1,24 − 0,12 (0 = base do corpo)
    const local = (front - bottom) / (top - bottom);
    const sweep = Math.min(1, Math.max(0, (local + 0.12) / 1.24));
    can.setLabels(labelA ?? can.blank, labelB ?? labelA ?? can.blank, sweep, glowColor, seed);
  }

  /** Luz, partículas e lacre entre duas versões. */
  function mixLook(a: Variant, b: Variant, t: number) {
    lights.mix(a, b, t);
    particles.mix(a, b, t);
    can?.tab.color.copy(tabA.set(a.tab)).lerp(tabB.set(b.tab), t);
  }

  function resize() {
    stage.resize();
    backdrop.resize(window.innerWidth, window.innerHeight);
  }
  resize();

  function tick(time: number, dt: number, frameMs: number) {
    const pivot = stage.pivot;
    pivot.rotation.y = motion.spin;
    pivot.rotation.x = motion.tilt;
    pivot.position.y = motion.lift;
    lights.follow(pointer.x, pointer.y);
    // o fundo anda um pouco com o mouse; a lata não
    backdrop.frame(motion.bgZoomA, motion.bgZoomB, -pointer.x * 0.008, pointer.y * 0.006);
    particles.update(dt, time, stage.pixelRatio, !reduced);
    stage.frame();
    stage.render();
    stage.sampleFrame(frameMs);
  }

  return {
    stage,
    motion,
    particles,
    load,
    setWave,
    mixLook,
    resize,
    tick,
    get ready() {
      return can !== null;
    },
  };
}

export type Scene = ReturnType<typeof createScene>;
