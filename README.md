# Monster · sete latas

Estudo conceitual, sem vínculo com a Monster Energy Company. Uma lata 3D, sete versões, e um roteiro inteiro guiado pelo scroll.

## Primeira vez num computador

1. Instale o Git e o Node.js 22 LTS (o Vite 8 pede Node 20.19 ou mais novo).
2. Baixe o projeto:

   ```bash
   git clone https://github.com/jmarcelosn1/monster-experience.git
   ```

3. Instale as dependências e rode:

   ```bash
   cd monster-experience
   npm install
   npm run dev
   ```

   Abre em `http://localhost:5173`. Não abra o `index.html` direto: o projeto precisa do servidor do Vite.

## Trabalhando nos dois computadores

- Ao começar: `git pull`
- Ao terminar: `git add -A`, `git commit -m "o que mudou"` e `git push`

Se os dois computadores mexerem no mesmo arquivo sem enviar antes, o `git pull` avisa do conflito em vez de apagar trabalho.

## Comandos

- `npm run dev`: servidor local
- `npm run build`: checa os tipos e gera `dist/`, que vai para qualquer hospedagem estática
- `npm run assets`: refaz os arquivos de `public/` a partir de `sources/` (modelo, rótulos, fotos, fundos)

## Onde mexer

- `src/story.ts`: o roteiro por scroll (apresentação, catálogo 01–07, rasgo, roda)
- `src/variants.ts`: as sete versões; nenhum outro arquivo testa o id de uma versão
- `src/ui/intro.ts`: a abertura
- `src/three/`: palco, lata, luzes, fundo em WebGL, partículas
- `tools/`: scripts que geram os assets
