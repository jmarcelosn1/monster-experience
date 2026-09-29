# Contexto do projeto

Site experimental da linha Monster Energy (estudo conceitual, sem vínculo com a marca). Vite + TypeScript + three.js puro + GSAP, sem React. Foco em desktop. O projeto é trabalhado em dois computadores via GitHub: `git pull` antes de começar, commit e push ao terminar.

## O que o dono do projeto já decidiu

- A lata fica parada no centro no catálogo e nas trocas: sem inclinar, sem zoom de câmera, sem flutuar. Só a luz segue o mouse.
- As laterais dos rótulos vêm de fotos frontais: a lata não pode girar a ponto de mostrá-las. Só a Ultra branca tem rótulo completo.
- Nada cobre o fundo de cena (véu e grão foram recusados). Legibilidade vem de sombra no texto.
- Cor da lata na tela é medida contra a foto e tem de bater. A garra prateada não é metálica, senão reflete preto.
- Nomes reais dos produtos; nada de palavras gigantes atrás da lata nem nomes inventados.
- Nada é escolhível antes de a abertura terminar.
- Close na tampa foi recusado. A roda da coleção é desenhada em 3D (`three/collection.ts`, canvas próprio na camada da roda) com a mesma geometria da roda em CSS; as fotos recortadas ficam só como área de clique e como reserva sem WebGL. Na roda cada lata gira até 30° no próprio eixo ao chegar à frente.
- Apresentação: a Ultra atravessa a tela com o scroll (direita mostrando o verso, depois esquerda completando a volta), com textos do próprio rótulo do lado oposto, e volta ao centro antes do catálogo.
- Ingredientes em 3D (`three/ingredients.ts`, `ingredients` em variants.ts) flutuam em volta da lata na apresentação e na roda; no catálogo não aparecem. O gelo não usa refração (sobre o preto viraria preto) nem névoa.
- Mudanças visuais grandes: mostrar antes de seguir; ele prefere direção limpa e premium a efeito épico.
- Abertura: feixe de luz de estúdio revela a garra, MONSTER / ENERGY (ENERGY em verde) digitados com as letras acendendo, e ela só sai quando a pessoa rola ("Unleash the Beast" embaixo). A garra da abertura é a garra impressa da Ultra projetada pela câmera da primeira tela (`tools/build-intro-claw.mjs` → `public/claw-intro.webp` e `src/ui/intro-claw.json`); na saída ela muda do branco para o cinza do rótulo (`claw-intro-color.webp`) enquanto a lata aparece e se desfaz sobre a garra da lata, que já está parada no lugar. Refletor, anel de luz, reflexo metálico e câmera se mexendo depois da passagem foram recusados. Se mudar HERO_SHOT ou OPENING_Z, rode o script de novo. Raio, relâmpago, energia atravessando a tela e glow exagerado foram recusados.
- Nada de lata de alumínio cru nem textos de apresentação ("Toda lata começa em alumínio"): a Ultra já impressa é acesa pela mesma luz da abertura e gira 360°.
- Catálogo sem lista 01–07 e sem números: duas paradas por lata, primeiro o nome grande à esquerda (cor de `color.name`: preto na Ultra e na Rosa, amarelo na The Doctor, branco nas outras), depois a legenda à direita. A leitura vem de uma sombra que segue o desenho das letras (em `em`); manchas de sombra atrás do bloco foram recusadas. O nome no Brasil é Ultra Rosa mesmo.

## Como verificar

- `npm run build` antes de entregar (checa tipos e gera `dist/`).
- No painel do navegador do Claude, as capturas chegam com um passo de atraso e o dono costuma rolar a página junto; conferir estado por JavaScript quando der dúvida.
