// ずかん：28マス（6色 × 4かたち ＝ 24 ＋ レア 4）。
// 出したものだけ 絵が入り、まだのものは シルエットのまま。

import { COLORS, SHAPES, RARES, LABEL } from './recipe.js';

const KEY = 'niji-bismuth-codex-v1';

/** ずかんのマスの並び（表示順） */
export function codexCells() {
  const cells = [];
  for (const shape of SHAPES) {
    for (const color of COLORS) {
      cells.push({ key: `${color}|${shape}`, color, shape, rare: null });
    }
  }
  for (const rare of RARES) {
    cells.push({ key: `rare:${rare}`, color: null, shape: null, rare });
  }
  return cells;
}

export const CELL_COUNT = COLORS.length * SHAPES.length + RARES.length;

export function loadCodex() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { cells: {}, made: 0 };
    const data = JSON.parse(raw);
    return {
      cells: data && typeof data.cells === 'object' && data.cells ? data.cells : {},
      made: Number(data?.made) || 0,
    };
  } catch {
    return { cells: {}, made: 0 };
  }
}

export function saveCodex(codex) {
  try {
    localStorage.setItem(KEY, JSON.stringify(codex));
  } catch {
    /* プライベートモードなどでは、ほぞんできなくても遊べる */
  }
}

/**
 * できた結晶を ずかんに記録する。
 * @returns {{isNew: boolean, key: string, count: number}}
 */
export function record(codex, spec, thumb) {
  const key = spec.key;
  const prev = codex.cells[key];
  const isNew = !prev;
  codex.cells[key] = {
    seed: spec.seed,
    recipe: spec.recipe,
    stars: Math.max(spec.stars, prev?.stars ?? 0),
    count: (prev?.count ?? 0) + 1,
    // 絵は「いちばん最初のもの」を残す。差し替え続けると 見おぼえがなくなるため。
    thumb: prev?.thumb || thumb || '',
  };
  codex.made = (codex.made || 0) + 1;
  saveCodex(codex);
  return { isNew, key, count: codex.cells[key].count };
}

export function filled(codex) {
  return Object.keys(codex.cells || {}).length;
}

/** シルエット用の、そのマスらしい形の SVG パス */
export function cellIcon(cell) {
  if (cell.rare) {
    return (
      '<svg viewBox="0 0 64 64"><path d="M32 8l6 14 15 2-11 10 3 15-13-7-13 7 3-15-11-10 15-2z"' +
      ' fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/></svg>'
    );
  }
  const body = {
    // つみき：階段状の四角
    tsumiki: '<path d="M14 46h36v6H14zM19 38h26v7H19zM24 30h16v7H24zM28 22h8v7h-8z"/>',
    // ふたご：ふたつ くっついている
    futago: '<path d="M8 46h28v6H8zM13 38h18v7H13zM17 31h10v6H17zM34 48h22v5H34zM38 41h14v6H38z"/>',
    // たくさん：小さいのが いくつも
    takusan:
      '<path d="M6 48h14v5H6zM9 42h8v5H9zM25 48h14v5H25zM28 42h8v5h-8zM44 48h14v5H44zM47 42h8v5h-8z"/>',
    // とんがり：細い段が たくさん積んだ塔
    tongari:
      '<path d="M20 50h24v4H20zM22 45h20v4H22zM24 40h16v4H24zM25 35h14v4H25zM27 30h10v4H27z' +
      'M28 25h8v4h-8zM29 20h6v4h-6zM30 15h4v4h-4z"/>',
  }[cell.shape];
  return `<svg viewBox="0 0 64 64" fill="currentColor">${body}</svg>`;
}

/** マスの読み（親が読んであげる用。画面には出さない＝aria-label にだけ使う） */
export function cellLabel(cell) {
  if (cell.rare) return LABEL[cell.rare];
  return `${LABEL[cell.color]}の${LABEL[cell.shape]}`;
}
