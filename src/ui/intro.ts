import gsap from 'gsap';
import CLAW from './intro-claw.json';

// Abertura, numa timeline só (tempos contados do primeiro quadro):
//
//   0,0        preto, nada na tela
//   0,6 → 2,8  um feixe de luz de estúdio atravessa o escuro devagar e acende
//              a garra por onde passa; ela fica visível atrás dele
//   2,8        garra inteira (escala 0,96 → 1, sem quique)
//   3,5 → 4,7  MONSTER e depois ENERGY (verde) digitados; cada letra nasce
//              acesa e assenta; uma barrinha verde acompanha
//   5,4        a barrinha cai até a base da tela e vira o fio do convite
//
// A garra não é um logo qualquer: é a garra impressa no rótulo da Ultra,
// projetada pela câmera da primeira tela (tools/build-intro-claw.mjs), e fica
// no lugar exato em que a lata vai mostrar a dela. A abertura espera: só sai
// quando a pessoa rola (ou usa a seta, o espaço, o Page Down). Na saída o
// texto se apaga e a garra muda de branco para o cinza do rótulo enquanto a
// lata aparece em volta dela; depois se desfaz sobre a garra impressa. Nada
// se move.
//
// O feixe é o mesmo desenho do brilho da Franciana, em outro tom: a luz bate
// na silhueta e solta raios macios para longe dela. Verde quase branco, sem
// neon. É um canvas WebGL pequeno, à parte do three.js, e some quando acaba.

const LIGHT_SCALE = 0.5; // a luz é macia: meia resolução basta
const STEPS = 28;
const DENSITY = 0.5;
const DECAY = 0.9;

const VERTEX = `attribute vec2 p;varying vec2 u;void main(){u=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;

// R: tela (px CSS). B: caixa da garra (x, y, largura, altura; y de cima).
// X: centro do feixe na altura do meio da garra (px). f: intensidade.
const FRAGMENT = `precision highp float;
uniform sampler2D t;uniform vec2 R;uniform vec4 B;uniform float X,f,q;varying vec2 u;
float m(vec2 p){vec2 l=(p-B.xy)/B.zw;return texture2D(t,l).a*step(0.,l.x)*step(l.x,1.)*step(0.,l.y)*step(l.y,1.);}
float cx(float y){return X-(y-(B.y+B.w*.5))*.26;}
float beam(vec2 p){float d=(p.x-cx(p.y))/(B.z*.34);return exp(-d*d);}
void main(){
vec2 p=vec2(u.x,1.-u.y)*R;
float s=m(p)*beam(p);
vec2 L=vec2(cx(B.y+B.w*.28),B.y+B.w*.28);
vec2 d=(p-L)*(${DENSITY}/${STEPS}.),c=p-d*fract(sin(dot(u,vec2(12.9898,78.233))+q)*43758.5453);
float w=1.,W=0.,z=0.;
for(int i=0;i<${STEPS};i++){c-=d;z+=m(c)*beam(c)*w;W+=w;w*=${DECAY};}
float h=(p.y-(B.y+B.w*.5))/(B.w*.85);
float air=beam(p)*.045*exp(-h*h);
vec3 C=vec3(.86,1.,.8);
vec3 o=1.-exp(-(vec3(1.,1.,.97)*s*.9+C*(z/W*1.05+air))*f*1.4);
gl_FragColor=vec4(o,max(o.r,max(o.g,o.b)));}`;

function createLight(canvas: HTMLCanvasElement, logo: HTMLImageElement) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.bindAttribLocation(prog, 0, 'p');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, logo);

  const at = (name: string) => gl.getUniformLocation(prog, name);
  const uR = at('R');
  const uB = at('B');
  const uX = at('X');
  const uF = at('f');
  const uQ = at('q');

  return {
    /** x: centro do feixe em larguras da garra (0 = borda esquerda). */
    draw(x: number, f: number) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const bw = Math.round(w * LIGHT_SCALE);
      const bh = Math.round(h * LIGHT_SCALE);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
        gl.viewport(0, 0, bw, bh);
      }
      const r = logo.getBoundingClientRect();
      gl.uniform2f(uR, w, h);
      gl.uniform4f(uB, r.left, r.top, r.width, r.height);
      gl.uniform1f(uX, r.left + x * r.width);
      gl.uniform1f(uF, f);
      gl.uniform1f(uQ, (performance.now() % 1000) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
}

/** Quebra cada linha em letras escondidas: o texto já ocupa o lugar dele. */
function splitLetters(word: HTMLElement) {
  return Array.from(word.children).map((line) => {
    const text = line.textContent ?? '';
    line.textContent = '';
    return Array.from(text, (ch) => {
      const i = document.createElement('i');
      i.textContent = ch;
      line.append(i);
      return i;
    });
  });
}

const FORWARD_KEYS = new Set(['ArrowDown', 'PageDown', ' ', 'Enter']);

/** Resolve no primeiro gesto de ir adiante: rodinha, toque arrastando para cima ou tecla. */
function forwardGesture() {
  return new Promise<void>((resolve) => {
    let touchY: number | null = null;
    const done = () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
      resolve();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 0) done();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchY !== null && touchY - e.touches[0].clientY > 24) done();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!FORWARD_KEYS.has(e.key)) return;
      e.preventDefault();
      done();
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKey);
  });
}

export function createIntro(root: HTMLElement, reduced: boolean) {
  const claw = root.querySelector<HTMLElement>('[data-intro-claw]')!;
  const logo = root.querySelector<HTMLImageElement>('[data-logo]')!;
  const tone = root.querySelector<HTMLImageElement>('[data-intro-tone]')!;
  const word = root.querySelector<HTMLElement>('[data-intro-word]')!;
  const bg = root.querySelector<HTMLElement>('[data-intro-bg]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-intro-light]')!;
  const hint = root.querySelector<HTMLElement>('[data-intro-hint]')!;
  const hintLine = root.querySelector<HTMLElement>('[data-intro-hint-line]')!;
  const hintText = root.querySelector<HTMLElement>('[data-intro-hint-text]')!;
  const lines = splitLetters(word);
  const caret = document.createElement('b');
  caret.className = 'intro__caret';

  /**
   * Põe a garra no retângulo medido (em alturas de tela a partir do centro:
   * a projeção da câmera só depende da altura) e o texto logo abaixo dela.
   */
  function place() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = w / 2 + CLAW.left * h;
    const y = h / 2 + CLAW.top * h;
    const set = (name: string, px: number) => root.style.setProperty(name, `${px.toFixed(2)}px`);
    set('--claw-x', x);
    set('--claw-y', y);
    set('--claw-w', CLAW.width * h);
    set('--claw-h', CLAW.height * h);
    set('--word-x', x + (CLAW.width * h) / 2);
    set('--word-y', y + CLAW.height * h + h * 0.045);
  }
  place();
  window.addEventListener('resize', place);

  /** Digita as letras de uma linha; a barrinha acompanha a última. */
  function type(tl: gsap.core.Timeline, letters: HTMLElement[], at: number, duration: number) {
    const state = { n: 0 };
    tl.to(
      state,
      {
        n: letters.length,
        duration,
        ease: 'none',
        onUpdate() {
          const shown = Math.ceil(state.n - 1e-6);
          letters.forEach((l, i) => l.classList.toggle('is-on', i < shown));
          if (shown > 0) letters[shown - 1].append(caret);
        },
      },
      at,
    );
  }

  /**
   * A barrinha do fim da digitação cai até a base da tela e se estica no fio
   * do convite para rolar; depois uma gota de luz desce por ele, sem parar.
   */
  function dropCaret() {
    const from = caret.getBoundingClientRect();
    hint.classList.add('is-on');
    const to = hintLine.getBoundingClientRect();
    caret.remove();
    gsap
      .timeline()
      .fromTo(
        hintLine,
        {
          x: from.left + from.width / 2 - (to.left + to.width / 2),
          y: from.top - to.top,
          scaleY: from.height / to.height,
          transformOrigin: '50% 0%',
        },
        { x: 0, y: 0, scaleY: 1, duration: 1.1, ease: 'power3.inOut' },
      )
      .call(() => hint.classList.add('is-flowing'))
      .fromTo(hintText, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '-=0.2');
  }

  let markStill = () => {};
  /** Resolve quando o feixe passou e a garra está inteira e parada (2,9 s). */
  const still = new Promise<void>((resolve) => (markStill = resolve));

  const revealed = new Promise<void>((resolve) => {
    // a garra precisa estar decodificada antes do feixe; se demorar, o preto espera
    const ready = Promise.race([logo.decode().catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
    void ready.then(() => {
      const tl = gsap.timeline();

      if (reduced) {
        gsap.set(logo, { '--reveal': '300%' });
        tl.to(logo, { opacity: 1, duration: 0.6 }, 0.2);
        tl.call(() => lines.flat().forEach((l) => l.classList.add('is-on')), [], 0.8);
        tl.call(() => hint.classList.add('is-on'), [], 1.1);
        tl.set(hintText, { opacity: 1 }, 1.1);
        tl.call(markStill, [], 0.8);
        tl.call(resolve, [], 1.1);
        canvas.remove();
        return;
      }

      const light = createLight(canvas, logo);
      const sweep = { x: -0.9, f: 0 };
      const paint = () => {
        light?.draw(sweep.x, sweep.f);
        // a garra aparece atrás do feixe, na mesma inclinação
        logo.style.setProperty('--reveal', `${(sweep.x + 0.15) * 100}%`);
      };

      // 0,6 → 2,8: o feixe atravessa devagar
      tl.to(sweep, { f: 1, duration: 0.5, ease: 'power1.out', onUpdate: paint }, 0.6);
      tl.to(sweep, { x: 1.9, duration: 2.2, ease: 'power1.inOut', onUpdate: paint }, 0.6);
      tl.to(sweep, { f: 0, duration: 0.7, ease: 'power1.in', onUpdate: paint }, 2.15);
      tl.call(() => light?.dispose(), [], 2.9);
      tl.call(markStill, [], 2.95);

      // a garra ganha presença enquanto a luz passa
      tl.fromTo(logo, { opacity: 0 }, { opacity: 1, duration: 1.8, ease: 'power1.out' }, 0.8);
      tl.fromTo(claw, { scale: 0.96 }, { scale: 1, duration: 2.4, ease: 'power2.out' }, 0.6);
      tl.set(logo, { '--reveal': '300%' }, 2.85);

      // 3,5 → 4,7: MONSTER, respiro, ENERGY
      type(tl, lines[0], 3.5, 0.6);
      type(tl, lines[1], 4.25, 0.42);
      tl.call(resolve, [], 4.75);
      tl.call(dropCaret, [], 5.4);
    });
  });

  /** Resolve quando a pessoa rola depois da digitação. */
  const proceed = revealed.then(forwardGesture);

  /**
   * Só um desvanecer: o texto e o convite se apagam; a garra passa do branco
   * para o cinza do rótulo ao mesmo tempo em que o preto sai de trás dela (a
   * lata aparece em volta, parada), então nunca fica branca sobre a lata; por
   * fim ela se desfaz sobre a garra impressa. Devolve a duração.
   */
  function exit(tl: gsap.core.Timeline, at: number) {
    if (reduced) {
      tl.to(root, { opacity: 0, duration: 0.5 }, at);
      tl.set(root, { display: 'none' }, at + 0.5);
      return 0.5;
    }
    tl.to([hint, word], { opacity: 0, duration: 0.5, ease: 'power1.out' }, at);
    tl.to(word, { y: 10, duration: 0.5, ease: 'power1.out' }, at);
    tl.to(tone, { opacity: 1, duration: 1, ease: 'power1.inOut' }, at + 0.3);
    tl.to(logo, { opacity: 0, duration: 1, ease: 'power1.inOut' }, at + 0.3);
    tl.to(bg, { opacity: 0, duration: 1, ease: 'power1.inOut' }, at + 0.3);
    tl.to(claw, { opacity: 0, duration: 0.7, ease: 'power1.inOut' }, at + 1.3);
    tl.call(() => window.removeEventListener('resize', place), [], at + 2);
    tl.set(root, { display: 'none' }, at + 2);
    return 2;
  }

  return { still, revealed, proceed, exit };
}
