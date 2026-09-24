// Única fonte das sete versões. A ordem é a do catálogo (01–07).
// Nenhum outro módulo testa o id de uma versão: tudo sai daqui.
// Arquivos: /labels/<id>.webp (rótulo), /backgrounds/<id>.webp (cena),
// /posters/<id>.webp (lata recortada) e, se existir, o vídeo em `video`.

export type VariantId = 'origin' | 'lagoon' | 'ritual' | 'bloom' | 'void' | 'flare' | 'apex';

export interface ParticleStyle {
  /** m/s ao longo de `direction` */
  speed: number;
  direction: readonly [number, number];
  /** rad/s em volta do eixo da lata */
  swirl: number;
  /** 1 = ponto redondo; maior = rastro horizontal */
  stretch: number;
  size: number;
  opacity: number;
}

export interface Variant {
  id: VariantId;
  /** nome curto, como aparece no catálogo */
  name: string;
  /** nome completo impresso na lata */
  product: string;
  caption: readonly [string, string];
  /** o que se vê na lata; nada de promessa sobre o produto */
  description: string;
  /** só o que está impresso na lata; campo ausente = não aparece */
  facts: { volume?: string; sugar?: string };
  /** cena clara (texto escuro) ou escura (texto claro) */
  tone: 'light' | 'dark';
  /** vídeo em loop do fundo, quando existir (ex.: '/backgrounds/lagoon.mp4') */
  video?: string;
  color: {
    /** cor medida no maior bloco de cor lisa da lata */
    can: string;
    /** luz de contorno, onda da troca e partículas */
    glow: string;
    /** texto de destaque pequeno, legível sobre a cena */
    ink: string;
    /** fundo da página fora do palco */
    deep: string;
  };
  tab: string;
  /** intensidade da luz de contorno */
  rim: number;
  particles: ParticleStyle;
}

const still = { swirl: 0, stretch: 1 } as const;

export const variants: readonly Variant[] = [
  {
    id: 'origin',
    name: 'Ultra',
    product: 'Monster Energy Ultra',
    caption: ['Antes da cor, o metal.', 'As outras seis partem daqui.'],
    description: 'A lata branca da linha Ultra: rótulo prata com arabescos, a garra em cinza e o Energy em azul.',
    facts: { volume: '473 ml', sugar: 'Sem açúcar' },
    tone: 'light',
    color: { can: '#D9DCDF', glow: '#DDE6EE', ink: '#066AA0', deep: '#080A0E' },
    tab: '#BFC4C9',
    rim: 5,
    particles: { ...still, speed: 0.004, direction: [0, 1], size: 0.8, opacity: 0.22 },
  },
  {
    id: 'lagoon',
    name: 'Ultra Paradise',
    product: 'Monster Energy Ultra Paradise',
    caption: ['Maré baixa, sol alto.', 'Sem açúcar, sem pressa.'],
    description: 'Verde-limão com palmeiras, ondas e ilhas desenhadas em prata em volta da lata.',
    facts: { volume: '473 ml', sugar: 'Sem açúcar' },
    tone: 'dark',
    color: { can: '#67CD0A', glow: '#67CD0A', ink: '#67CD0A', deep: '#040D01' },
    tab: '#141414',
    rim: 6,
    particles: { ...still, speed: 0.012, direction: [0.08, 1], size: 0.9, opacity: 0.28 },
  },
  {
    id: 'ritual',
    name: 'Mango Loco',
    product: 'Juice Monster Mango Loco',
    caption: ['Manga e caveiras floridas.', 'A lata mais barulhenta da coleção.'],
    description: 'Da família Juice Monster: fundo azul, garra cor de manga e caveiras floridas inspiradas no Día de Muertos.',
    facts: {},
    tone: 'dark',
    color: { can: '#01B4EF', glow: '#FDB902', ink: '#FDB902', deep: '#000C16' },
    tab: '#0AA6E0',
    rim: 6,
    particles: { ...still, speed: 0.003, direction: [0, 1], swirl: 0.18, size: 0.9, opacity: 0.32 },
  },
  {
    id: 'bloom',
    name: 'Ultra Rosa',
    product: 'Monster Energy Ultra Rosa',
    caption: ['Rosa, prata e espinho.', 'Delicada só na aparência.'],
    description: 'Rosa do topo à base, com rosas e espinhos desenhados em prata ao redor da garra.',
    facts: { volume: '473 ml', sugar: 'Sem açúcar' },
    tone: 'light',
    color: { can: '#E8316A', glow: '#FF5C8D', ink: '#A8144A', deep: '#160407' },
    tab: '#E8467F',
    rim: 6,
    particles: { ...still, speed: 0.006, direction: [0.3, -1], swirl: 0.04, size: 1.2, opacity: 0.3 },
  },
  {
    id: 'void',
    name: 'Absolutely Zero',
    product: 'Monster Energy Absolutely Zero',
    caption: ['Azul até perder o fundo.', 'O resto é silêncio.'],
    description: 'Azul que escurece até o preto nas bordas, com a garra branca no centro e gotas desenhadas.',
    facts: { volume: '473 ml', sugar: 'Zero açúcar' },
    tone: 'dark',
    color: { can: '#014694', glow: '#01B7F7', ink: '#01B7F7', deep: '#030A18' },
    tab: '#0271AF',
    rim: 7,
    particles: { ...still, speed: 0.0015, direction: [0, 1], size: 0.6, opacity: 0.2 },
  },
  {
    id: 'flare',
    name: 'Ultra Watermelon',
    product: 'Monster Energy Ultra Watermelon',
    caption: ['Melancia gelada.', 'Fogos no rótulo.'],
    description: 'Vermelho de melancia com fogos de artifício em volta e a garra contornada de verde, como a casca.',
    facts: { volume: '473 ml', sugar: 'Sem açúcar' },
    tone: 'dark',
    color: { can: '#F80D1A', glow: '#FF3B3B', ink: '#FF5A5F', deep: '#160504' },
    tab: '#0A8E33',
    rim: 6,
    particles: { ...still, speed: 0.003, direction: [0, 1], size: 0.9, opacity: 0.35 },
  },
  {
    id: 'apex',
    name: 'The Doctor',
    product: 'Monster Energy The Doctor',
    caption: ['Amarelo de pit lane.', 'Frear depois, acelerar antes.'],
    description: 'A lata do 46 de Valentino Rossi: amarelo inteiro, garra laranja e as cores do capacete na base.',
    facts: {},
    tone: 'dark',
    color: { can: '#FBE404', glow: '#FBE404', ink: '#FBE404', deep: '#0D0A00' },
    tab: '#1A1A18',
    rim: 6,
    particles: { ...still, speed: 0.1, direction: [1, 0], stretch: 6, size: 1.6, opacity: 0.26 },
  },
];

export const variantCount = variants.length;

/** Cor da garra da marca: a abertura e a impressão da primeira lata usam ela. */
export const CLAW_GREEN = '#A9F803';
