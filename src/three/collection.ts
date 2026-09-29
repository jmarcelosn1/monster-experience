import * as THREE from 'three';
import { parseCan, type Can } from './can';
import { createLights } from './lights';
import { createTextures } from './textures';
import { createIngredients } from './ingredients';
import type { Variant } from '../variants';

// A roda da coleção em 3D de verdade: as sete latas do modelo, cada uma com o
// rótulo dela, num canvas próprio dentro da camada da roda (o rasgo recorta
// ele junto). A geometria é a mesma da roda em CSS (ui/wheel.ts): cada lata
// recebe a mesma sequência de transformações, convertida de pixels para
// metros, e a câmera tem o mesmo campo de visão da perspectiva CSS. Assim os
// botões da roda (que continuam lá, invisíveis) ficam em cima das latas.
//
// Três coisas que o CSS não fazia: cada lata gira no próprio eixo (até 30°)
// enquanto chega à frente, a da frente acompanha o mouse de leve, e os
// ingredientes do produto da frente flutuam em volta dela.

/**
 * Espera o navegador ficar livre: a montagem é feita em pedaços pequenos (uma
 * lata, um rótulo por vez) para não travar o scroll de quem está lendo.
 */
const breathe = () =>
  new Promise<void>((resolve) =>
    window.requestIdleCallback ? window.requestIdleCallback(() => resolve(), { timeout: 600 }) : window.setTimeout(resolve, 50),
  );

/** altura da lata inteira (tampa à base), em metros */
const CAN_HEIGHT = 0.168;
const TURN = THREE.MathUtils.degToRad(30);

/** Estado de uma lata, calculado pela roda a cada quadro (em pixels e graus). */
export interface WheelItem {
  /** 0 = no anel, 1 = no tambor (com a cascata de cada lata) */
  mix: number;
  /** distância até a lata da frente, em posições */
  offset: number;
  ringDeg: number;
  drumDeg: number;
  scale: number;
  visible: boolean;
}

export interface WheelGeometry {
  canH: number;
  ringR: number;
  drumR: number;
  bow: number;
  depth: number;
}

export async function createCollection(
  canvas: HTMLCanvasElement,
  buffer: ArrayBuffer,
  variants: readonly Variant[],
  reduced: boolean,
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  // as latas que vão para trás do tambor somem no escuro do fundo
  scene.fog = new THREE.Fog(0x050505, 0.45, 0.85);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  const lights = createLights(renderer, scene);
  const labels = createTextures(renderer, 16);

  labels.pin(variants.flatMap((v) => [`/labels/${v.id}.webp`, `/labels/${v.id}-mask.webp`]));
  const cans: Can[] = [];
  for (const v of variants) {
    await breathe();
    const can = await parseCan(buffer);
    can.tab.color.set(v.tab);
    const [map, mask] = await Promise.all([labels.load(`/labels/${v.id}.webp`, true), labels.load(`/labels/${v.id}-mask.webp`, false)]);
    // o envio do rótulo para a placa de vídeo também acontece aqui, e não no
    // primeiro quadro da roda
    await breathe();
    renderer.initTexture(map);
    renderer.initTexture(mask);
    const pair = { map, mask };
    can.setLabels(pair, pair, 0, new THREE.Color(v.color.glow), 0);
    scene.add(can.root);
    cans.push(can);
  }
  await breathe();
  renderer.compile(scene, camera);

  const ingredients = createIngredients();
  scene.add(ingredients.group);
  await breathe();
  ingredients.warm(renderer, scene, camera);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!reduced) {
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
      },
      { passive: true },
    );
  }

  let width = 0;
  let height = 0;
  function resize(w: number, h: number) {
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
  }

  // transformações da roda em CSS (y para baixo), refeitas no espaço do three
  const m = new THREE.Matrix4();
  const step = new THREE.Matrix4();
  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const Y = new THREE.Vector3(0, 1, 0);
  const rad = THREE.MathUtils.degToRad;

  let active = -1;
  let shown = -1; // ingredientes em cena
  let swap = 0; // 0–1: presença dos ingredientes da lata da frente

  /**
   * Desenha um quadro. `items` vem da roda; `drum` é o quanto ela já é
   * tambor (0 = anel), `front` a lata da frente.
   */
  function render(items: WheelItem[], geo: WheelGeometry, drum: number, front: number, dt: number, time: number) {
    if (!width || !geo.canH) return;
    const u = CAN_HEIGHT / geo.canH; // metros por pixel
    // mesma perspectiva do CSS: o olho a `depth` px do plano da tela
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / 2 / geo.depth));
    camera.position.set(0, 0, geo.depth * u);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const k = reduced ? 1 : 1 - Math.exp(-dt * 4);
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    lights.follow(pointer.x, pointer.y);

    items.forEach((it, i) => {
      const root = cans[i].root;
      root.visible = it.visible;
      if (!it.visible) return;
      const bowX = -geo.bow * (1 - Math.cos(rad(it.drumDeg)));
      m.makeTranslation(0, 0, -drum * geo.drumR * u);
      m.multiply(step.makeTranslation(it.mix * bowX * u, 0, 0));
      m.multiply(step.makeRotationAxis(Z, -rad((1 - it.mix) * it.ringDeg)));
      m.multiply(step.makeTranslation(0, (1 - it.mix) * geo.ringR * u, 0));
      // (espelhar o eixo y troca o sinal dos giros em x e em z)
      m.multiply(step.makeRotationAxis(X, -rad(it.mix * it.drumDeg)));
      m.multiply(step.makeTranslation(0, 0, it.mix * geo.drumR * u));
      // a lata gira no próprio eixo ao chegar à frente; a da frente segue o mouse
      const near = Math.max(0, 1 - Math.abs(it.offset));
      const yaw = -Math.max(-1, Math.min(1, it.offset)) * TURN * it.mix + near * pointer.x * 0.16;
      m.multiply(step.makeRotationAxis(Y, yaw));
      m.multiply(step.makeScale(it.scale, it.scale, it.scale));
      root.matrixAutoUpdate = false;
      root.matrix.copy(m);
      root.matrixWorldNeedsUpdate = true;
    });

    // ingredientes da lata da frente: trocam junto com ela
    if (front !== active) {
      active = front;
      lights.mix(variants[front], variants[front], 0);
    }
    if (shown !== active) {
      swap = Math.max(0, swap - dt * 2.5);
      if (swap === 0) {
        shown = active;
        ingredients.use(variants[shown].ingredients, 23 + shown * 7);
      }
    } else {
      swap = Math.min(1, swap + dt * 1.2);
    }
    ingredients.setPresence(swap * Math.max(0, (drum - 0.6) / 0.4));
    // na roda a lata está mais perto da câmera: a nuvem fica menor e um pouco
    // atrás, para não passar por cima do texto ao lado
    ingredients.group.scale.setScalar(0.62);
    ingredients.group.position.set(0, 0, -0.03);
    ingredients.group.rotation.y = pointer.x * 0.2;
    ingredients.group.rotation.x = pointer.y * 0.06;
    ingredients.update(dt, time, !reduced);

    renderer.render(scene, camera);
  }

  return { render, resize };
}

export type Collection = Awaited<ReturnType<typeof createCollection>>;
