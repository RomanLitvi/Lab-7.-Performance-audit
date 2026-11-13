// One-off conversion of the PNG sources in public/ to sized WebP files.
// Usage: node optimize-images.mjs <dir with original PNGs>
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const source = path.resolve(process.argv[2]);
const publicDir = path.resolve(import.meta.dirname, '../public');

const HERO_WIDTHS = [1200, 2400];
const PHOTO_SIZE = 512;

await mkdir(path.join(publicDir, 'images'), { recursive: true });
await mkdir(path.join(publicDir, 'photos'), { recursive: true });

for (const width of HERO_WIDTHS) {
  await sharp(path.join(source, 'images/hero.png'))
    .resize({ width })
    .webp({ quality: 80 })
    .toFile(path.join(publicDir, `images/hero-${width}.webp`));
}

for (const file of await readdir(path.join(source, 'photos'))) {
  if (!file.endsWith('.png')) continue;
  await sharp(path.join(source, 'photos', file))
    .resize(PHOTO_SIZE, PHOTO_SIZE)
    .webp({ quality: 75 })
    .toFile(path.join(publicDir, 'photos', file.replace('.png', '.webp')));
}
