/* =========================================================
 * coins.js — 実在硬貨（1・5・10・50・100円）のロジックと描画
 * 架空硬貨は存在しない。
 * ========================================================= */
(function () {
  'use strict';

  const DENOMS = [100, 50, 10, 5, 1];

  /* 財布の初期構成（実在硬貨のみ） */
  const WALLET_COMPOSITIONS = {
    10: [10],
    30: [10, 10, 10],
    50: [50],
    80: [50, 10, 10, 10],
    100: [100]
  };

  /* おつり等の金額 → 硬貨（貪欲法。日本硬貨は貪欲法で最適） */
  function breakdown(amount) {
    const coins = [];
    let rest = amount;
    for (const d of DENOMS) {
      while (rest >= d) { coins.push(d); rest -= d; }
    }
    return coins;
  }

  /*
   * 支払いガイド: 手持ち硬貨から「合計が price 以上で、超過額が最小、
   * その中で枚数最少」の部分集合を選ぶ（これを だそう！のハイライト用）。
   * 硬貨は多くても十数枚なので添字つきDPで十分。
   */
  function paymentSubset(coins, price) {
    const n = coins.length;
    // best.get(sum) = { count, pick(Set of indices) } — 到達可能な合計ごとの最少枚数
    let best = new Map();
    best.set(0, { count: 0, pick: [] });
    for (let i = 0; i < n; i++) {
      const next = new Map(best);
      for (const [sum, info] of best) {
        const s2 = sum + coins[i];
        const cand = { count: info.count + 1, pick: info.pick.concat(i) };
        const cur = next.get(s2);
        if (!cur || cand.count < cur.count) next.set(s2, cand);
      }
      best = next;
    }
    let chosen = null, chosenSum = Infinity;
    for (const [sum, info] of best) {
      if (sum < price) continue;
      if (sum < chosenSum || (sum === chosenSum && info.count < chosen.count)) {
        chosen = info; chosenSum = sum;
      }
    }
    return chosen ? { indices: chosen.pick, sum: chosenSum } : null;
  }

  const COIN_CLASS = { 1: 'c1', 5: 'c5', 10: 'c10', 50: 'c50', 100: 'c100' };
  const COIN_HOLE = { 5: true, 50: true };

  /* 硬貨DOM要素（大きく・見分けやすく・数字大きめ） */
  function coinEl(value, opts) {
    opts = opts || {};
    const el = document.createElement('div');
    el.className = 'coin ' + COIN_CLASS[value] + (opts.small ? ' coin-sm' : '') + (opts.tiny ? ' coin-xs' : '');
    el.dataset.value = value;
    el.innerHTML = (COIN_HOLE[value] ? '<span class="hole"></span>' : '') +
      '<span class="cnum">' + value + '</span>';
    return el;
  }

  function sum(coins) { return coins.reduce((a, b) => a + b, 0); }

  window.COINS = { DENOMS, WALLET_COMPOSITIONS, breakdown, paymentSubset, coinEl, sum };
})();
