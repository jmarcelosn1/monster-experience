# Monster 3D Experience

Experiência web em 3D guiada por scroll: uma lata renderizada em WebGL, sete versões de produto e um roteiro inteiro conduzido pela rolagem da página.

> Estudo conceitual, sem vínculo com a Monster Energy Company. Marcas e nomes de produtos pertencem aos seus donos.

**Stack:** TypeScript 7 · three.js · GSAP (ScrollTrigger) · Vite 8 · sem framework de UI

## Visão geral

O site conta uma história em quatro atos, todos controlados pelo scroll normal da página:

1. **Abertura:** feixe de luz de estúdio revela a garra, o título é digitado e a experiência só avança quando a pessoa rola.
2. **Apresentação:** a lata atravessa a tela girando 360 graus, com textos do próprio rótulo do lado oposto.
3. **Coleção:** um rasgo de três garras abre uma roda 3D com as sete versões.
4. **Catálogo:** uma parada por versão, com nome, legenda e fundo próprios.

## Destaques técnicos

- **Cena WebGL sem framework de UI.** three.js puro, com luzes de área, partículas, ingredientes 3D e fundos por versão. O modelo da lata é um GLB de cerca de 216 KB, comprimido com meshopt.
- **Roteiro declarativo.** `src/story.ts` concentra a linha do tempo inteira (GSAP + ScrollTrigger), em alturas de tela contadas do topo, em vez de espalhar animações pelos módulos.
- **Fonte única de dados.** `src/variants.ts` define as sete versões (nome, rótulo, cor, tom claro ou escuro, ingredientes, partículas). Nenhum outro arquivo testa o id de uma versão, então acrescentar uma versão é mexer em um lugar só.
- **Rótulos por textura.** Cada versão usa uma textura WebP e uma máscara; a lata não gira a ponto de mostrar as laterais, que vêm de fotos frontais.
- **Cor medida, não chutada.** A cor de cada lata na tela é comparada com a foto de referência.
- **Reserva sem WebGL.** Se o WebGL não estiver disponível ou o contexto for perdido, a página cai para uma versão com imagens em vez de quebrar.
- **Pipeline de assets reproduzível.** `npm run assets` recria modelo, rótulos, fundos e a garra da abertura a partir de `sources/`, com glTF-Transform, meshopt e sharp.

## Como rodar

Requisitos: Git e Node.js 22 LTS (o Vite 8 pede Node 20.19 ou mais novo).

```bash
git clone https://github.com/jmarcelosn1/monster-3d-experience.git
cd monster-3d-experience
npm install
npm run dev
```

O servidor abre em `http://localhost:5173`. O `index.html` não funciona aberto direto no navegador: o projeto precisa do servidor do Vite.

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor local com recarga automática |
| `npm run build` | Checa os tipos e gera `dist/`, pronto para qualquer hospedagem estática |
| `npm run typecheck` | Só a checagem de tipos |
| `npm run assets` | Refaz `public/` a partir de `sources/` (modelo, rótulos, fotos, fundos) |

## Estrutura

```
src/
  main.ts          inicialização, carregamento e ligação dos módulos
  story.ts         o roteiro por scroll (apresentação, coleção, rasgo, catálogo)
  variants.ts      as sete versões, fonte única de dados
  theme.ts         mistura de cores entre versões
  three/           palco, lata, luzes, fundo, partículas, ingredientes, texturas
  ui/              abertura, roda da coleção, rasgo, catálogo, carregamento
tools/             scripts que geram os assets otimizados
sources/           originais dos assets (modelo, rótulos, fotos)
CLAUDE.md          decisões de design e restrições do projeto
```

## Desenvolvimento com agentes de IA

O projeto foi construído com um agente de código (Claude Code) conduzido por especificação:

- **`CLAUDE.md` é o contrato.** Cada decisão de direção fica registrada ali (o que já foi aprovado e o que foi recusado, por exemplo "sem zoom de câmera" e "nada cobre o fundo de cena"), para o agente não reabrir discussões nem desfazer decisões em novas sessões.
- **Decisão antes do código.** Mudanças visuais grandes são mostradas antes de seguir: o agente propõe, a pessoa aprova.
- **Verificação antes de entregar.** `npm run build` (tipos e build) a cada entrega e conferência do estado da página no navegador, inclusive por JavaScript quando a captura de tela não basta.

## Trabalhando em mais de um computador

Ao começar, `git pull`. Ao terminar, `git add -A`, `git commit -m "o que mudou"` e `git push`. Se dois computadores mexerem no mesmo arquivo sem enviar antes, o `git pull` avisa do conflito em vez de apagar trabalho.
