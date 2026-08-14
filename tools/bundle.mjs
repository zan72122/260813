// ES モジュール一式 + CSS を 1 枚の HTML にまとめる（外部読み込みゼロ）。
// バンドラを入れずに済ませたいので、import/export 行を落として順に連結するだけ。
// `import * as X` は、そのモジュールの直後に名前空間オブジェクトを定義して再現する。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// 依存順（モジュール読み込み時に評価される定数があるので順序は厳密）
const ORDER = [
  'src/util.js',
  'src/light.js',
  'src/gl/mat.js',
  'src/gl/glx.js',
  'src/gl/env.js',
  'src/gl/geom.js',
  'src/gl/shaders.js',
  'src/art.js',
  'src/view.js',
  'src/input.js',
  'src/audio.js',
  'src/gl/hero.js',
  'src/stages.js',
  'src/main.js',
];

// `import * as X from ...` の代替となる名前空間オブジェクト
const NAMESPACES = {
  'src/art.js': `
// --- bundle: import * as A from './art.js' の代替 ---
const A = {
  MOLD, PUD, PLATE, clearGradientCache, ellipse, ground, background,
  mold, moldPoolPoint, plate, pot, bowl, whisk, vesselSpout, stream, splash,
  steamPuffs, pudding, handIcon, guideArrow, sparkles,
};
`,
  'src/gl/mat.js': `
// --- bundle: import * as M from './mat.js' の代替 ---
const M = { ident, mul, translate, scale, rotateX, rotateY, rotateZ, normalMat3, place };
`,
  'src/gl/geom.js': `
// --- bundle: import * as G from './geom.js' の代替 ---
const G = {
  lathe, puddingProfile, moldProfile, plateProfile, potProfile, bowlProfile,
  liquidProfile, upload,
};
`,
  'src/gl/shaders.js': `
// --- bundle: import * as S from './shaders.js' の代替 ---
const S = {
  PRELUDE, VS_LATHE, FS_PUDDING, FS_METAL, FS_CERAMIC, FS_LIQUID, VS_TUBE, FS_TUBE,
  VS_FULL, FS_BACKDROP, FS_THRESHOLD, FS_BLUR, FS_COMPOSITE, FS_FIELD,
};
`,
};

function strip(src) {
  return src
    // import 文（複数行のものも含む）を丸ごと落とす
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^import\s+['"][^'"]+['"];\s*$/gm, '')
    // export キーワードだけ外す（宣言は残す）
    .replace(/^export\s+(?=(const|let|var|function|class|async))/gm, '')
    .replace(/^export\s+default\s+/gm, '')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
}

const parts = [];
for (const f of ORDER) {
  parts.push(`\n// ================= ${f} =================\n`);
  parts.push(strip(read(f)));
  if (NAMESPACES[f]) parts.push(NAMESPACES[f]);
}

const css = read('styles.css');
const js = parts.join('\n');

const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#f6d7b0">
<title>あまいひみつ</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23f6d7b0'/%3E%3Cellipse cx='16' cy='20' rx='11' ry='6' fill='%23d9dee4'/%3E%3C/svg%3E">`;

const BODY = `<canvas id="back"></canvas>
<canvas id="gl"></canvas>
<canvas id="front" aria-label="game"></canvas>
<div id="safe" aria-hidden="true"></div>`;

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
${HEAD}
<style>
${css}
</style>
</head>
<body>
${BODY}
<script type="module">
${js}
</script>
</body>
</html>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/amai-himitsu.html'), html);
console.log('dist/amai-himitsu.html', (html.length / 1024).toFixed(1) + ' KB');

// ホスト側が doctype/head/body を用意する埋め込み先（claude.ai の Artifact など）向け。
// 100dvh を明示しないと、埋め込み枠でキャンバスが潰れることがある。
const embed = `<title>あまいひみつ</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23f6d7b0'/%3E%3Cellipse cx='16' cy='20' rx='11' ry='6' fill='%23d9dee4'/%3E%3C/svg%3E">
<style>
${css}
html, body { height: 100dvh; }
</style>
${BODY}
<script type="module">
${js}
</script>
`;
writeFileSync(join(root, 'dist/amai-himitsu.embed.html'), embed);
console.log('dist/amai-himitsu.embed.html', (embed.length / 1024).toFixed(1) + ' KB');
