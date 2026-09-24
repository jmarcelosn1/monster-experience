// Fundos de cena, um por versão: só redimensiona e comprime.
import sharp from 'sharp';
import { mkdirSync, readdirSync } from 'node:fs';

const SOURCE = 'sources/backgrounds';
const OUT = 'public/backgrounds';
const WIDTH = 1920;

mkdirSync(OUT, { recursive: true });

for (const file of readdirSync(SOURCE)) {
  const id = file.replace(/\.\w+$/, '');
  const info = await sharp(`${SOURCE}/${file}`)
    .resize({ width: WIDTH, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(`${OUT}/${id}.webp`);
  console.log(id, `${info.width}x${info.height}`, `${Math.round(info.size / 1024)} KB`);
}
