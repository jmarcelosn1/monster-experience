import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Ingredientes em 3D que flutuam em volta da lata: gelo, rodelas de limão e
// de lima, cubos de manga, pétalas e fatias de melancia. Tudo é feito aqui,
// com geometria e texturas desenhadas no código (nada de baixar modelos), e
// com material físico: a fruta é molhada. O gelo não usa refração (sobre o
// preto da apresentação ela só mostraria preto): o miolo é quase
// transparente, as bordas acendem com a luz como vidro visto de lado, e por
// dentro há rachaduras e bolhas brancas.
// Cada versão diz quais leva (`ingredients` em variants.ts).
//
// A nuvem fica em volta do eixo da lata, dos lados e atrás dela, nunca na
// frente do rótulo. Ao aparecer, cada peça sai de perto da lata e se afasta
// até o lugar dela; parada, flutua e gira devagar.

export type IngredientKind = 'ice' | 'lemon' | 'lime' | 'mango' | 'rose' | 'marigold' | 'watermelon' | 'shard';

// ---------------------------------------------------------------- texturas

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Face de uma rodela de cítrico: casca, parte branca e gomos com membrana. */
function citrusFace(rind: string, pith: string, flesh: string, fleshDeep: string) {
  return canvasTexture(512, (ctx, s) => {
    const c = s / 2;
    ctx.fillStyle = rind;
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pith;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.9, 0, Math.PI * 2);
    ctx.fill();
    const segments = 10;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2 + 0.035;
      const a1 = ((i + 1) / segments) * Math.PI * 2 - 0.035;
      const g = ctx.createRadialGradient(c, c, c * 0.1, c, c, c * 0.82);
      g.addColorStop(0, fleshDeep);
      g.addColorStop(0.6, flesh);
      g.addColorStop(1, fleshDeep);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos((a0 + a1) / 2) * c * 0.1, c + Math.sin((a0 + a1) / 2) * c * 0.1);
      ctx.arc(c, c, c * 0.82, a0, a1);
      ctx.closePath();
      ctx.fill();
      // vesículas: gotinhas mais claras dentro do gomo
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let k = 0; k < 26; k++) {
        const a = a0 + Math.random() * (a1 - a0);
        const r = c * (0.2 + Math.random() * 0.58);
        ctx.beginPath();
        ctx.ellipse(c + Math.cos(a) * r, c + Math.sin(a) * r, 5, 2.2, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = pith;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.08, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Pétala: gota com a cor mais forte na base; o alfa desenha o recorte. */
function petalTexture(base: string, tip: string) {
  return canvasTexture(256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, s, 0, 0);
    g.addColorStop(0, base);
    g.addColorStop(1, tip);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.98);
    ctx.bezierCurveTo(s * 0.02, s * 0.62, s * 0.08, s * 0.06, s / 2, s * 0.03);
    ctx.bezierCurveTo(s * 0.92, s * 0.06, s * 0.98, s * 0.62, s / 2, s * 0.98);
    ctx.fill();
    // nervuras bem leves
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(s / 2, s * 0.95);
      ctx.quadraticCurveTo(s / 2 + i * s * 0.08, s * 0.5, s / 2 + i * s * 0.14, s * 0.12);
      ctx.stroke();
    }
  });
}

/** Face da fatia de melancia, no espaço da forma (ver watermelonShape). */
function watermelonFace() {
  return canvasTexture(512, (ctx, s) => {
    const cx = s / 2;
    const cy = s; // o centro da fatia fica embaixo
    const ring = (r: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, r * s, 0, Math.PI * 2);
      ctx.fill();
    };
    ring(1.02, '#1F6B2A');
    ring(0.95, '#7BBF5A');
    ring(0.91, '#EAF3D2');
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.88 * s);
    g.addColorStop(0, '#C9142F');
    g.addColorStop(0.75, '#F2394E');
    g.addColorStop(1, '#F76B72');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 0.88 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1A0E0A';
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.075;
      const r = s * (0.5 + (i % 2) * 0.12);
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 5, 9, a + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Miolo do gelo: quase transparente, com rachaduras e bolhas brancas. */
function iceTexture() {
  const texture = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = 'rgba(225, 240, 255, 0.16)';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    for (let i = 0; i < 7; i++) {
      ctx.lineWidth = 0.8 + Math.random() * 1.6;
      ctx.beginPath();
      let x = Math.random() * s;
      let y = Math.random() * s;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (Math.random() - 0.5) * 70;
        y += (Math.random() - 0.5) * 70;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 0.8 + Math.random() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return texture;
}

/**
 * Vidro sem refração: a opacidade cresce com o ângulo (Fresnel), então o
 * miolo deixa ver o que está atrás e as bordas ficam claras e refletem.
 */
function glassy(material: THREE.MeshPhysicalMaterial, center: number, edge: number) {
  // a névoa da roda deixaria o gelo cinza: ele é claro em qualquer distância
  material.fog = false;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
      float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
      gl_FragColor.a = clamp(gl_FragColor.a + mix(${center.toFixed(2)}, ${edge.toFixed(2)}, fresnel), 0.0, 1.0);`,
    );
  };
  return material;
}

// ---------------------------------------------------------------- peças

function watermelonShape() {
  // setor de círculo de raio 1 apontando para cima, com o centro em (0, 0)
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  const a0 = Math.PI / 2 - 0.42;
  const a1 = Math.PI / 2 + 0.42;
  shape.lineTo(Math.cos(a0), Math.sin(a0));
  shape.absarc(0, 0, 1, a0, a1, false);
  shape.lineTo(0, 0);
  return shape;
}

/** Pétala curva: plano com a ponta dobrada e as bordas em concha. */
function petalGeometry() {
  const geometry = new THREE.PlaneGeometry(1, 1.3, 10, 12);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i) / 1.3 + 0.5; // 0 na base, 1 na ponta
    p.setZ(i, x * x * 0.55 + y * y * 0.35);
  }
  geometry.computeVertexNormals();
  return geometry;
}

interface Kit {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  /** tamanho em metros (a lata tem 16,8 cm) */
  size: number;
  /** achata ou alonga a peça (x, y, z) */
  shape?: [number, number, number];
}

function buildKits(): Record<IngredientKind, Kit> {
  // gelo: corpo claro meio transparente, superfície lisa que pega as faixas
  // de luz do estúdio nas quinas, e um brilho frio fraco por dentro
  const ice = glassy(
    new THREE.MeshPhysicalMaterial({
      map: iceTexture(),
      color: '#EAF6FF',
      roughness: 0.06,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 3,
    }),
    0.02,
    0.7,
  );
  const citrus = (face: THREE.Texture, rind: string) => {
    const side = new THREE.MeshPhysicalMaterial({ color: rind, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const cap = new THREE.MeshPhysicalMaterial({
      map: face,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
      sheen: 0.4,
      sheenColor: new THREE.Color('#FFF6C8'),
    });
    return [side, cap, cap];
  };
  const petal = (base: string, tip: string) =>
    new THREE.MeshPhysicalMaterial({
      map: petalTexture(base, tip),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.55,
      sheen: 1,
      sheenRoughness: 0.4,
      sheenColor: new THREE.Color(tip),
    });
  const melonFace = watermelonFace();
  melonFace.repeat.set(1 / 0.82, 1);
  melonFace.offset.set(0.5, 0);
  return {
    ice: { geometry: new RoundedBoxGeometry(1, 1, 1, 3, 0.18), material: ice, size: 0.02 },
    lemon: {
      geometry: new THREE.CylinderGeometry(0.5, 0.5, 0.12, 48, 1),
      material: citrus(citrusFace('#F2C230', '#FFF5D6', '#F9DC5C', '#E9B92E'), '#F2C230'),
      size: 0.038,
    },
    lime: {
      geometry: new THREE.CylinderGeometry(0.5, 0.5, 0.12, 48, 1),
      material: citrus(citrusFace('#4E9A2A', '#EEF6D8', '#B6DA6A', '#8FC048'), '#4E9A2A'),
      size: 0.034,
    },
    mango: {
      geometry: new RoundedBoxGeometry(1, 1, 1, 4, 0.16),
      material: new THREE.MeshPhysicalMaterial({
        color: '#FFA51F',
        roughness: 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        sheen: 0.6,
        sheenColor: new THREE.Color('#FFD27A'),
      }),
      size: 0.017,
    },
    rose: { geometry: petalGeometry(), material: petal('#C8174F', '#FF8DB0'), size: 0.022 },
    marigold: { geometry: petalGeometry(), material: petal('#E86A00', '#FFC247'), size: 0.02 },
    watermelon: {
      geometry: new THREE.ExtrudeGeometry(watermelonShape(), {
        depth: 0.16,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 3,
        curveSegments: 32,
      }).translate(0, -0.5, -0.08),
      material: [
        new THREE.MeshPhysicalMaterial({ map: melonFace, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.18 }),
        new THREE.MeshPhysicalMaterial({ color: '#E8384F', roughness: 0.4, clearcoat: 0.8 }),
      ],
      size: 0.04,
    },
    shard: {
      geometry: new THREE.IcosahedronGeometry(0.5, 0),
      material: glassy(
        new THREE.MeshPhysicalMaterial({
          color: '#A9DBFF',
          roughness: 0.04,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
          side: THREE.DoubleSide,
          clearcoat: 1,
          envMapIntensity: 3,
          emissive: new THREE.Color('#2F8FE0'),
          emissiveIntensity: 0.1,
          flatShading: true,
        }),
        0.05,
        0.8,
      ),
      size: 0.016,
      shape: [1, 2.2, 0.7],
    },
  };
}

// ---------------------------------------------------------------- nuvem

interface Piece {
  mesh: THREE.Mesh;
  home: THREE.Vector3;
  scale: THREE.Vector3;
  spin: THREE.Vector3;
  phase: number;
  bob: number;
  delay: number;
}

const COUNT = 16;

/** Sorteio com semente: a mesma nuvem a cada visita. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function createIngredients() {
  const kits = buildKits();
  const group = new THREE.Group();
  let pieces: Piece[] = [];
  let presence = 0;
  let current = '';

  /** Troca o conjunto de ingredientes (vazio = nenhum). */
  function use(kinds: readonly IngredientKind[], seed = 11) {
    const key = kinds.join(',') + seed;
    if (key === current) return;
    current = key;
    for (const p of pieces) group.remove(p.mesh);
    pieces = [];
    if (!kinds.length) return;
    const rand = seeded(seed);
    for (let i = 0; i < COUNT; i++) {
      const kit = kits[kinds[i % kinds.length]];
      const mesh = new THREE.Mesh(kit.geometry, kit.material);
      // em volta do eixo, dos lados e atrás: o ângulo foge da frente do rótulo
      // lado e tipo independentes: gelo e fruta dos dois lados
      const side = (i >> 1) % 2 ? 1 : -1;
      const angle = side * (0.75 + rand() * 1.9);
      const radius = 0.075 + rand() * 0.09;
      const home = new THREE.Vector3(Math.sin(angle) * radius, -0.085 + rand() * 0.17, Math.cos(angle) * radius - 0.01);
      const size = kit.size * (0.75 + rand() * 0.5);
      const shape = kit.shape ?? [1, 1, 1];
      const scale = new THREE.Vector3(
        size * shape[0] * (0.9 + rand() * 0.2),
        size * shape[1] * (0.9 + rand() * 0.2),
        size * shape[2] * (0.9 + rand() * 0.2),
      );
      mesh.rotation.set(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2);
      mesh.scale.setScalar(0.0001);
      group.add(mesh);
      pieces.push({
        mesh,
        home,
        scale,
        spin: new THREE.Vector3((rand() - 0.5) * 0.5, (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.4),
        phase: rand() * Math.PI * 2,
        bob: 0.002 + rand() * 0.004,
        delay: rand() * 0.35,
      });
    }
  }

  /** 0 = recolhidos (invisíveis), 1 = no lugar. */
  function setPresence(p: number) {
    presence = p;
  }

  const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

  function update(dt: number, time: number, animate: boolean) {
    group.visible = presence > 0.001 && pieces.length > 0;
    if (!group.visible) return;
    for (const p of pieces) {
      const k = ease((presence - p.delay) / (1 - p.delay));
      // sai de perto da lata e se afasta até o lugar dela
      p.mesh.position.copy(p.home).multiplyScalar(0.45 + 0.55 * k);
      if (animate) {
        p.mesh.position.y += Math.sin(time * 0.7 + p.phase) * p.bob;
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        p.mesh.rotation.z += p.spin.z * dt;
      }
      p.mesh.scale.copy(p.scale).multiplyScalar(Math.max(0.0001, k));
    }
  }

  /**
   * Compila de antemão os materiais de todos os ingredientes, para o primeiro
   * aparecimento não travar a animação.
   */
  async function warm(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    use(Object.keys(kits) as IngredientKind[], 1);
    group.visible = true;
    await renderer.compileAsync(scene, camera);
    use([]);
    group.visible = false;
  }

  return { group, use, setPresence, update, warm };
}

export type Ingredients = ReturnType<typeof createIngredients>;
