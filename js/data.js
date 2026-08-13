/* =========================================================
 * data.js — データ層（UIから分離）
 *
 * 価格の唯一のソースは data/products.json（添付DBのコピー）。
 * ゲーム内価格 = game_price_yen のみを使用し、加工・丸め・捏造を行わない。
 *
 * 将来の差し替え設計（優先順位）:
 *   1. 家庭の実購入レシート価格
 *   2. 最新の店舗Web価格
 *   3. 過去の店舗Web価格
 * → loadDB() が返す正規化済み配列の形を保てば、
 *   data/products.json を差し替えるだけで動作する。
 * ========================================================= */
(function () {
  'use strict';

  const WALLET_TIERS = [10, 30, 50, 80, 100];

  let _meta = null;
  let _products = [];

  function normalize(db) {
    const meta = db && db.metadata ? db.metadata : {};
    const raw = (db && Array.isArray(db.products)) ? db.products : [];
    const products = [];
    for (const p of raw) {
      // データ欠損に耐える: 価格が整数で取れないレコードはゲームに出さない（捏造しない）
      const price = Number(p && p.game_price_yen);
      if (!p || !Number.isInteger(price) || price <= 0) continue;
      if (!p.product_name) continue;
      products.push({
        id: p.record_id || ('P-' + products.length),
        name: String(p.product_name),
        category: p.category || 'その他',
        subcategory: p.subcategory || '',
        packSize: p.pack_size || '',
        price: price,                        // ゲーム価格（税込表示価格の整数化・DB由来）
        jan: p.jan || '',
        priceExTax: p.price_ex_tax_yen,
        priceInclTax: p.listed_price_incl_tax_yen,
        taxRate: p.tax_rate,
        verificationLevel: p.verification_level || '',
        sourceType: p.source_type || '',
        sourceUrl: p.source_url || '',
        observedDate: p.observed_date || '',
        storeName: p.store_name || '',
        note: p.note || ''
      });
    }
    return { meta, products };
  }

  async function loadDB() {
    let db = null;
    try {
      const res = await fetch('data/products.json', { cache: 'no-store' });
      if (res.ok) db = await res.json();
    } catch (e) { /* file:// などでは fetch 不可 → フォールバック */ }
    if (!db && window.__PRICE_DB__) db = window.__PRICE_DB__;
    const n = normalize(db);
    _meta = n.meta;
    _products = n.products;
    return n;
  }

  /* その商品を買える最小の財布（10/30/50/80/100）。100円で買えなければ null */
  function tierOf(p) {
    for (const t of WALLET_TIERS) if (p.price <= t) return t;
    return null;
  }

  /* 子ども向け価格表示: 100以下は実価格、101以上は数字を見せない */
  function childPriceText(p) {
    return p.price <= 100 ? p.price + 'えん' : '100えんより たかい';
  }

  /* 売場（DBのカテゴリを優先し、小さいカテゴリは「そのほか」に集約） */
  const AISLE_DEFS = [
    { id: 'okashi',  label: 'おかし',    emoji: '🍬', cats: ['お菓子'] },
    { id: 'pan',     label: 'パン',      emoji: '🍞', cats: ['パン'] },
    { id: 'nomimono',label: 'のみもの',  emoji: '🧃', cats: ['飲料'] },
    { id: 'ice',     label: 'アイス',    emoji: '🍦', cats: ['アイス・氷菓'] },
    { id: 'tofu',    label: 'とうふ',    emoji: '🍲', cats: ['豆腐・日配品', 'こんにゃく'] },
    { id: 'tamago',  label: 'たまご',    emoji: '🥚', cats: ['卵'] },
    { id: 'bunbogu', label: 'ぶんぼうぐ',emoji: '✏️', cats: ['文房具'] },
    { id: 'hoka',    label: 'そのほか',  emoji: '🍜', cats: [] } // 残り全カテゴリ
  ];

  function aisles() {
    const assigned = new Set();
    AISLE_DEFS.forEach(a => a.cats.forEach(c => assigned.add(c)));
    return AISLE_DEFS.map(a => {
      let items;
      if (a.id === 'hoka') {
        items = _products.filter(p => !assigned.has(p.category));
      } else {
        items = _products.filter(p => a.cats.includes(p.category));
      }
      return { ...a, items };
    }).filter(a => a.items.length > 0);
  }

  window.DATA = {
    WALLET_TIERS,
    loadDB,
    tierOf,
    childPriceText,
    aisles,
    get meta() { return _meta; },
    get products() { return _products; },
    byId(id) { return _products.find(p => p.id === id) || null; }
  };
})();
