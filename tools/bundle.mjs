// ES モジュール 7 本 + CSS を 1 枚の HTML にまとめる（外部読み込みゼロ）。
// バンドラを入れずに済ませたいので、import/export 行を落として順に連結するだけ。
// `import * as A from './art.js'` 相当は、art の直後に A オブジェクトを定義して再現する。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// 依存順に連結する（util が最初、main が最後）
const ORDER = [
  'src/util.js',
  'src/view.js',
  'src/input.js',
  'src/audio.js',
  'src/art.js',
  'src/stages.js',
  'src/main.js',
];

// art.js が `import * as A` で使われているので、名前空間オブジェクトを手で作る
const ART_NAMESPACE = `
// --- bundle: \`import * as A from './art.js'\` の代替 ---
const A = {
  MOLD, PUD, PLATE, clearGradientCache, ellipse, ground, background,
  mold, moldPoolPoint, plate, pot, bowl, whisk, vesselSpout, stream, splash,
  steamPuffs, pudding, handIcon, guideArrow, sparkles,
};
`;

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
  if (f === 'src/art.js') parts.push(ART_NAMESPACE);
}

const css = read('styles.css');
const js = parts.join('\n');

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#f6d7b0">
<title>あまいひみつ</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23f6d7b0'/%3E%3Cellipse cx='16' cy='20' rx='11' ry='6' fill='%23d9dee4'/%3E%3C/svg%3E">
<style>
${css}
</style>
</head>
<body>
<canvas id="stage" aria-label="game"></canvas>
<div id="safe" aria-hidden="true"></div>
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
<style>
${css}
html, body { height: 100dvh; }
</style>
<canvas id="stage" aria-label="game"></canvas>
<div id="safe" aria-hidden="true"></div>
<script type="module">
${js}
</script>
`;
writeFileSync(join(root, 'dist/amai-himitsu.embed.html'), embed);
console.log('dist/amai-himitsu.embed.html', (embed.length / 1024).toFixed(1) + ' KB');
