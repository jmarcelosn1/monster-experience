# Contexto do projeto

Site experimental da linha Monster Energy (estudo conceitual, sem vínculo com a marca). Vite + TypeScript + three.js puro + GSAP, sem React. Foco em desktop. O projeto é trabalhado em dois computadores via GitHub: `git pull` antes de começar, commit e push ao terminar.

## O que o dono do projeto já decidiu

- A lata fica parada no centro no catálogo e nas trocas: sem inclinar, sem zoom de câmera, sem flutuar. Só a luz segue o mouse.
- As laterais dos rótulos vêm de fotos frontais: a lata não pode girar a ponto de mostrá-las. Só a Ultra branca tem rótulo completo.
- Nada cobre o fundo de cena (véu e grão foram recusados). Legibilidade vem de sombra no texto.
- Cor da lata na tela é medida contra a foto e tem de bater. A garra prateada não é metálica, senão reflete preto.
- Nomes reais dos produtos; nada de palavras gigantes atrás da lata nem nomes inventados.
- Nada é escolhível antes de a abertura terminar.
- Close na tampa foi recusado. A roda da coleção usa só as latas recortadas.
- Mudanças visuais grandes: mostrar antes de seguir; ele prefere direção limpa e premium a efeito épico.

## Como verificar

- `npm run build` antes de entregar (checa tipos e gera `dist/`).
- No painel do navegador do Claude, as capturas chegam com um passo de atraso e o dono costuma rolar a página junto; conferir estado por JavaScript quando der dúvida.
