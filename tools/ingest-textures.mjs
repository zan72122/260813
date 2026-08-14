// Normalise raw CC0 material downloads into the small, committed source set.
//
//   node tools/ingest-textures.mjs <dirWithExtractedZips>
//
// ambientCG ships 1K maps plus .blend/.usdc extras we do not need. This keeps
// Color / Normal / AO / Roughness only, downsizes them, and writes JPEGs that
// are small enough to live in the repo so `bake-textures` stays reproducible.
//
// All image work happens in a headless Chromium canvas — no native deps.

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SRC_ROOT = process.argv[2];
if (!SRC_ROOT) {
  console.error('usage: node tools/ingest-textures.mjs <dirWithExtractedZips>');
  process.exit(1);
}
const OUT = path.resolve('assets/source');
fs.mkdirSync(OUT, { recursive: true });

// logical name -> { prefix to match, maps to keep at which size }
const MATERIALS = [
  { name: 'wood',   match: /^Wood095/,      credit: 'ambientCG Wood095 (CC0)' },
  { name: 'floor',  match: /^WoodFloor051/, credit: 'ambientCG WoodFloor051 (CC0)' },
  { name: 'bamboo', match: /^Bamboo002A/,   credit: 'ambientCG Bamboo002A (CC0)' },
  { name: 'cloth',  match: /^Carpet016/,    credit: 'ambientCG Carpet016 (CC0)' },
  { name: 'snow',   match: /^Snow007A/,     credit: 'ambientCG Snow007A (CC0)' },
];

const MAPS = [
  { key: 'color',  re: /_Color\.jpg$/i,            size: 512, q: 0.86, required: true },
  { key: 'normal', re: /_NormalGL\.jpg$/i,         size: 512, q: 0.9,  required: true },
  { key: 'ao',     re: /_AmbientOcclusion\.jpg$/i, size: 512, q: 0.82, required: false },
  { key: 'rough',  re: /_Roughness\.jpg$/i,        size: 256, q: 0.82, required: false },
];

function findFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findFiles(p));
    else if (/\.(jpg|jpeg|png)$/i.test(entry.name)) out.push(p);
  }
  return out;
}

const all = findFiles(SRC_ROOT);
const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
});
const page = await browser.newPage();
await page.setContent('<canvas id=c></canvas>');

async function resizeToJpeg(file, size, quality) {
  const b64 = fs.readFileSync(file).toString('base64');
  const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  return page.evaluate(async ([data, m, s, q]) => {
    const img = new Image();
    img.src = `data:${m};base64,${data}`;
    await img.decode();
    const c = document.getElementById('c');
    // Keep the source aspect ratio; ambientCG tiles are usually square but
    // Wood095 is 2:1 and squashing it would ruin the grain scale.
    const ar = img.naturalWidth / img.naturalHeight;
    c.width = ar >= 1 ? s : Math.round(s * ar);
    c.height = ar >= 1 ? Math.round(s / ar) : s;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q).split(',')[1];
  }, [b64, mime, size, quality]);
}

const credits = ['# Texture sources', '',
  'All materials below are CC0 (public domain equivalent) from ambientCG.',
  'Files here are downsized and re-encoded; `tools/bake-textures.mjs` turns',
  'them into the lit tiles the game actually loads.', ''];

for (const mat of MATERIALS) {
  let kept = 0;
  for (const map of MAPS) {
    const file = all.find((f) => mat.match.test(path.basename(f)) && map.re.test(f));
    if (!file) {
      if (map.required) console.warn(`! ${mat.name}: missing required ${map.key}`);
      continue;
    }
    const b64 = await resizeToJpeg(file, map.size, map.q);
    const dest = path.join(OUT, `${mat.name}_${map.key}.jpg`);
    fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
    kept++;
    console.log(`${mat.name}/${map.key.padEnd(6)} -> ${(fs.statSync(dest).size / 1024).toFixed(0)}KB`);
  }
  if (kept) credits.push(`- **${mat.name}** — ${mat.credit}`);
}

fs.writeFileSync(path.join(OUT, 'CREDITS.md'), credits.join('\n') + '\n');
await browser.close();
console.log('\ningested ->', OUT);
