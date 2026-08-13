/* =========================================================
 * game.js — 『ほんものイオン！100えんおかいもの』本体
 *
 * 画面: home / shop / checkout / scanner / line100 / walletq / zukan / parent
 * 価格は DATA（data/products.json 由来）のみを使用する。
 * ========================================================= */
(function () {
  'use strict';

  const $app = document.getElementById('app');
  const $fx = document.getElementById('fx-layer');
  const $drag = document.getElementById('drag-layer');

  /* ---------------------------------------------- セーブ */
  const SAVE_KEY = 'honmono-aeon-v1';

  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === 'object') {
        return {
          discovered: s.discovered || {},
          modes: s.modes || {},
          sound: s.sound !== false,
          wallet: s.wallet || null
        };
      }
    } catch (e) { /* 壊れたセーブは捨てる */ }
    return { discovered: {}, modes: {}, sound: true, wallet: null };
  }

  const save = loadSave();

  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 保存失敗でも遊べる */ }
  }

  /* ---------------------------------------------- 状態 */
  const state = {
    screen: 'home',
    walletChoice: null,      // 10/30/50/80/100
    session: null,           // { wallet, coins:[], basket:[Product] } おかいものセッション
    aisle: null,
    scannerAisle: null,
    scanned: new Set(),      // スキャナー訪問中に判明した商品
    line100: { pool: [], idx: 0, busy: false },
    wq: { current: null, tried: new Set(), solved: false },
    zukanTab: 30
  };

  /* ---------------------------------------------- 汎用 */
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function toast(msg) {
    const t = el('<div class="toast">' + esc(msg) + '</div>');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1700);
  }

  function sparkleAt(x, y, chars) {
    chars = chars || ['✨', '⭐', '✨', '🌟', '✨', '💛'];
    for (let i = 0; i < chars.length; i++) {
      const s = el('<span class="spark">' + chars[i] + '</span>');
      const ang = (Math.PI * 2 * i) / chars.length + Math.random() * 0.8;
      const dist = 46 + Math.random() * 52;
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * dist - 22 + 'px');
      $fx.appendChild(s);
      setTimeout(() => s.remove(), 850);
    }
  }

  function centerOf(elm) {
    const r = elm.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function discover(p) {
    if (!save.discovered[p.id]) {
      save.discovered[p.id] = true;
      persist();
      return true; // 初発見
    }
    return false;
  }

  function markMode(m) {
    if (!save.modes[m]) { save.modes[m] = true; persist(); }
  }

  /* 子ども画面の価格表示（101以上の数字は絶対に出さない） */
  function priceTagHTML(p) {
    if (p.price <= 100) return '<span class="price-tag">' + p.price + 'えん</span>';
    return '<span class="price-tag over">100えんより<br>たかい</span>';
  }

  /* ---------------------------------------------- ドラッグ共通 */
  function dragify(elm, opts) {
    elm.style.touchAction = 'none';
    elm.addEventListener('pointerdown', (e) => {
      if (opts.disabled && opts.disabled()) return;
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      let moved = false;
      const ghost = opts.makeGhost();
      ghost.style.left = e.clientX + 'px';
      ghost.style.top = e.clientY + 'px';
      $drag.appendChild(ghost);
      elm.classList.add('dragging');

      const move = (ev) => {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 8) moved = true;
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
        if (opts.onMove) opts.onMove(ev.clientX, ev.clientY);
      };
      const finish = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointercancel', finish);
        ghost.remove();
        elm.classList.remove('dragging');
        opts.onDrop(ev.clientX, ev.clientY, moved);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish, { once: true });
      window.addEventListener('pointercancel', finish, { once: true });
    });
  }

  function hit(x, y, target) {
    if (!target) return false;
    const r = target.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /* ---------------------------------------------- 画面遷移 */
  function go(screen) {
    state.screen = screen;
    render();
  }

  function render() {
    $app.innerHTML = '';
    $drag.innerHTML = '';
    const fn = {
      home: renderHome,
      shop: renderShop,
      checkout: renderCheckout,
      scanner: renderScanner,
      line100: renderLine100,
      walletq: renderWalletQ,
      zukan: renderZukan,
      parent: renderParent,
      error: renderError
    }[state.screen] || renderHome;
    fn();
  }

  /* ============================================== ホーム */
  function renderHome() {
    const scr = el('<div class="screen home"></div>');

    scr.appendChild(el(
      '<div class="home-title">' +
      '<span class="t1">ほんものイオン！</span>' +
      '<span class="t2">100えん おかいもの</span>' +
      '</div>'
    ));

    // 音量トグル
    const soundBtn = el('<button class="btn-round" style="position:absolute;top:max(8px, env(safe-area-inset-top));right:12px;min-width:52px;min-height:52px;font-size:22px" aria-label="おと">' + (save.sound ? '🔊' : '🔇') + '</button>');
    soundBtn.addEventListener('click', () => {
      save.sound = !save.sound;
      SND.setEnabled(save.sound);
      persist();
      soundBtn.textContent = save.sound ? '🔊' : '🔇';
      SND.play('pop');
    });
    scr.appendChild(soundBtn);

    scr.appendChild(el('<div class="section-label">きょうの おさいふを えらんでね</div>'));

    // 財布えらび
    const row = el('<div class="wallet-row"></div>');
    const todayLine = el('<div class="today-line"></div>');
    DATA.WALLET_TIERS.forEach(tier => {
      const opt = el('<button class="wallet-opt" data-tier="' + tier + '"><span class="w-coins"></span><span class="w-label">' + tier + 'えん</span></button>');
      const coinsBox = opt.querySelector('.w-coins');
      COINS.WALLET_COMPOSITIONS[tier].forEach(v => coinsBox.appendChild(COINS.coinEl(v, { tiny: true })));
      opt.addEventListener('click', () => {
        state.walletChoice = tier;
        save.wallet = tier;
        persist();
        SND.play('coin');
        row.querySelectorAll('.wallet-opt').forEach(o => o.classList.toggle('sel', +o.dataset.tier === tier));
        updateToday();
      });
      row.appendChild(opt);
    });
    scr.appendChild(row);
    scr.appendChild(todayLine);

    function updateToday() {
      todayLine.innerHTML = 'きょうは <em>' + state.walletChoice + 'えん</em>！';
      row.querySelectorAll('.wallet-opt').forEach(o => o.classList.toggle('sel', +o.dataset.tier === state.walletChoice));
    }
    if (!state.walletChoice) {
      state.walletChoice = save.wallet || DATA.WALLET_TIERS[2 + Math.floor(Math.random() * 3)]; // 50/80/100 のどれか
    }
    updateToday();

    // モード
    const grid = el('<div class="mode-grid"></div>');
    const modes = [
      { id: 'shop', cls: 'primary', emoji: '🛒', label: 'おみせで おかいもの' },
      { id: 'scanner', cls: 'scanner', emoji: '📟', label: 'ピッ！<br>スキャナー' },
      { id: 'line100', cls: 'line100', emoji: '⚖️', label: '100えん<br>ライン' },
      { id: 'walletq', cls: 'walletq', emoji: '👛', label: 'どの<br>おかね？' },
      { id: 'zukan', cls: 'zukan', emoji: '📖', label: 'かかく<br>ずかん' }
    ];
    modes.forEach(m => {
      const b = el('<button class="mode-btn ' + m.cls + '"><span class="m-emoji">' + m.emoji + '</span><span class="m-label">' + m.label + '</span></button>');
      b.addEventListener('click', () => {
        SND.play('pop');
        markMode(m.id);
        if (m.id === 'shop') {
          ensureSession(true);
          state.aisle = null;
          go('shop');
        } else if (m.id === 'scanner') {
          state.scanned = new Set();
          state.scannerAisle = null;
          go('scanner');
        } else if (m.id === 'line100') {
          startLine100();
          go('line100');
        } else if (m.id === 'walletq') {
          nextWalletQ();
          go('walletq');
        } else {
          go('zukan');
        }
      });
      grid.appendChild(b);
    });
    scr.appendChild(grid);

    // フッター: 免責 + 親モードゲート（2秒ながおし）
    const foot = el(
      '<div class="home-foot">' +
      '<div class="disclaimer">おうちのかたへ：本作はイオン株式会社・イオン琉球の公式アプリではありません。<br>' +
      '価格はイオン具志川店（ネットスーパー）の実売価格DBに基づく教育用ゲームです。</div>' +
      '<button class="parent-gate" aria-label="おうちのかた（ながおし）">🔒</button>' +
      '</div>'
    );
    const gate = foot.querySelector('.parent-gate');
    let holdTimer = null;
    gate.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      gate.textContent = '🔓';
      holdTimer = setTimeout(() => { SND.play('pop'); go('parent'); }, 1500);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
      gate.addEventListener(ev, () => { clearTimeout(holdTimer); gate.textContent = '🔒'; })
    );
    scr.appendChild(foot);

    $app.appendChild(scr);
  }

  /* ============================================== おかいものセッション */
  function ensureSession(forceIfWalletChanged) {
    if (!state.session || (forceIfWalletChanged && state.session.wallet !== state.walletChoice)) {
      state.session = {
        wallet: state.walletChoice,
        coins: COINS.WALLET_COMPOSITIONS[state.walletChoice].slice(),
        basket: []
      };
    }
  }

  function walletTotal() { return COINS.sum(state.session.coins); }
  function basketTotal() { return state.session.basket.reduce((a, p) => a + p.price, 0); }
  function remaining() { return walletTotal() - basketTotal(); }

  /* ============================================== 店（じゆうに おかいもの） */
  function renderShop() {
    ensureSession(false);
    const scr = el('<div class="screen" style="position:relative"></div>');

    scr.appendChild(shopTopbar('おかいもの'));
    const { tabs, shelf } = buildShelf({
      priceMode: 'show',
      onTap: (p, card) => openProductPopup(p, card)
    });
    scr.appendChild(tabs);
    scr.appendChild(shelf);

    // カゴバー
    const bar = el(
      '<div class="basket-bar">' +
      '<div class="basket-pill"><span class="bk-emoji">🧺</span><span class="bk-items"></span><span class="bk-empty">カゴは からっぽ</span></div>' +
      '<button class="btn-checkout"><span class="rj-emoji">🛎️</span>レジへ</button>' +
      '</div>'
    );
    scr.appendChild(bar);
    $app.appendChild(scr);
    updateBasketBar();

    bar.querySelector('.btn-checkout').addEventListener('click', () => {
      if (state.session.basket.length === 0) { toast('カゴに いれてから レジだよ！'); SND.play('cant'); return; }
      SND.play('pop');
      go('checkout');
    });
  }

  function shopTopbar(title, extraChipHTML) {
    const bar = el(
      '<div class="topbar">' +
      '<button class="btn-round" aria-label="もどる">🏠</button>' +
      '<span class="chip-title">' + esc(title) + '</span>' +
      '<span class="spacer"></span>' +
      '<div class="wallet-chip"><span class="wc-coins"></span><span class="wc-amount"></span></div>' +
      '</div>'
    );
    bar.querySelector('.btn-round').addEventListener('click', () => { SND.play('pop'); go('home'); });
    updateWalletChip(bar.querySelector('.wallet-chip'));
    return bar;
  }

  function updateWalletChip(chip) {
    chip = chip || document.querySelector('.wallet-chip');
    if (!chip) return;
    const coinsBox = chip.querySelector('.wc-coins');
    coinsBox.innerHTML = '';
    const coins = state.session ? state.session.coins : COINS.WALLET_COMPOSITIONS[state.walletChoice];
    coins.slice(0, 8).forEach(v => coinsBox.appendChild(COINS.coinEl(v, { tiny: true })));
    if (coins.length > 8) coinsBox.appendChild(el('<span style="font-size:14px;font-weight:900">…</span>'));
    const total = COINS.sum(coins);
    chip.querySelector('.wc-amount').textContent = total > 0 ? total + 'えん' : '0えん';
  }

  function buildShelf(opts) {
    const aisles = DATA.aisles();
    const stKey = opts.priceMode === 'mystery' ? 'scannerAisle' : 'aisle';
    if (!state[stKey]) state[stKey] = aisles[0].id;

    const tabs = el('<div class="aisle-tabs"></div>');
    const shelf = el('<div class="shelf"></div>');

    aisles.forEach(a => {
      const t = el('<button class="aisle-tab" data-id="' + a.id + '"><span class="a-emoji">' + a.emoji + '</span>' + a.label + '</button>');
      t.addEventListener('click', () => {
        state[stKey] = a.id;
        SND.play('pop');
        tabs.querySelectorAll('.aisle-tab').forEach(x => x.classList.toggle('sel', x.dataset.id === a.id));
        fillShelf();
      });
      tabs.appendChild(t);
    });

    function fillShelf() {
      shelf.innerHTML = '';
      const aisle = aisles.find(a => a.id === state[stKey]) || aisles[0];
      tabs.querySelectorAll('.aisle-tab').forEach(x => x.classList.toggle('sel', x.dataset.id === aisle.id));
      aisle.items.forEach(p => {
        const known = !!save.discovered[p.id];
        let tag;
        if (opts.priceMode === 'mystery' && !state.scanned.has(p.id)) {
          tag = '<span class="price-tag mystery">？？？</span>';
        } else {
          tag = priceTagHTML(p);
        }
        const card = el(
          '<button class="pcard scan-frame" data-id="' + p.id + '">' +
          (known ? '<span class="found-mark">⭐</span>' : '') +
          VIS.visualHTML(p) +
          '<span class="pname">' + esc(VIS.shortName(p)) + '</span>' +
          tag +
          '</button>'
        );
        card.addEventListener('click', () => opts.onTap(p, card));
        shelf.appendChild(card);
      });
    }
    fillShelf();
    return { tabs, shelf, refill: fillShelf };
  }

  /* 商品ポップアップ（店 / ずかん共用） */
  function openProductPopup(p, sourceCard, mode) {
    mode = mode || 'shop';
    const firstFind = discover(p);
    if (sourceCard && firstFind && !sourceCard.querySelector('.found-mark')) {
      sourceCard.insertAdjacentHTML('afterbegin', '<span class="found-mark">⭐</span>');
    }

    const inShop = mode === 'shop';
    const canAfford = inShop && p.price <= remaining();
    const over100 = p.price > 100;

    let verdictHTML = '';
    if (inShop) {
      if (canAfford) verdictHTML = '<div class="verdict can">かえる！</div>';
      else if (over100) verdictHTML = '<div class="verdict cant">100えんより たかい！</div>';
      else verdictHTML = '<div class="verdict cant">まだ たりない！</div>';
    } else {
      const tier = DATA.tierOf(p);
      verdictHTML = tier
        ? '<div class="verdict can">' + tier + 'えんで かえる！</div>'
        : '<div class="verdict cant">100えんでも かえない！</div>';
    }

    const priceHTML = p.price <= 100
      ? '<div class="pp-price">' + p.price + '<span style="font-size:.6em">えん</span></div>'
      : '<div class="pp-price over">100えんより たかい</div>';

    const ov = el(
      '<div class="overlay">' +
      '<div class="popup">' +
      '<button class="close-x" aria-label="とじる">✕</button>' +
      VIS.visualHTML(p, 'hop drag-src') +
      '<div class="pp-name">' + esc(VIS.shortName(p, 30)) + '</div>' +
      (p.packSize ? '<div class="pp-pack">' + esc(p.packSize) + '</div>' : '') +
      priceHTML +
      verdictHTML +
      '</div>' +
      '</div>'
    );
    const popup = ov.querySelector('.popup');

    if (canAfford) {
      popup.appendChild(el('<div class="drag-me-hint">したの カゴに いれてみよう！</div>'));
      const drop = el('<div class="basket-drop"><span class="bd-emoji">🧺</span>カゴに いれる</div>');
      popup.appendChild(drop);

      const visual = popup.querySelector('.pvisual');
      dragify(visual, {
        makeGhost() {
          const g = el(VIS.visualHTML(p, 'pvisual-ghost'));
          return g;
        },
        onMove(x, y) { drop.classList.toggle('hot', hit(x, y, drop)); },
        onDrop(x, y, moved) {
          drop.classList.remove('hot');
          if (hit(x, y, drop)) addToBasket(p, ov);
        }
      });
      // タップでも入れられる（4歳児フォールバック）
      drop.addEventListener('click', () => addToBasket(p, ov));
    } else if (inShop) {
      const back = el('<button class="btn-big ghost">たなに もどす</button>');
      back.addEventListener('click', () => close());
      popup.appendChild(back);
    }

    function close() { ov.remove(); }
    ov.querySelector('.close-x').addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });

    document.body.appendChild(ov);

    // 音と演出
    if (inShop) {
      if (canAfford) {
        SND.play('can');
        const c = centerOf(popup);
        sparkleAt(c.x, c.y - 60);
      } else {
        SND.play('cant');
      }
    } else {
      SND.play('pop');
    }
    if (firstFind) {
      SND.play('sparkle');
      toast('⭐ ずかんに とうろく！');
    }
  }

  function addToBasket(p, overlay) {
    if (p.price > remaining()) { SND.play('cant'); return; }
    state.session.basket.push(p);
    SND.play('basket');
    overlay.remove();
    updateBasketBar(true);
  }

  function updateBasketBar(bounce) {
    const pill = document.querySelector('.basket-pill');
    if (!pill) return;
    const items = pill.querySelector('.bk-items');
    const empty = pill.querySelector('.bk-empty');
    items.innerHTML = '';
    state.session.basket.forEach(p => items.insertAdjacentHTML('beforeend', VIS.visualHTML(p)));
    empty.style.display = state.session.basket.length ? 'none' : '';
    const btn = document.querySelector('.btn-checkout');
    if (btn) btn.disabled = state.session.basket.length === 0;
    if (bounce) {
      pill.classList.remove('bounce');
      void pill.offsetWidth;
      pill.classList.add('bounce');
    }
  }

  /* ============================================== レジ */
  function renderCheckout() {
    const s = state.session;
    const total = basketTotal();
    const scr = el('<div class="screen"></div>');

    const bar = el(
      '<div class="topbar">' +
      '<button class="btn-round" aria-label="おみせにもどる">⬅️</button>' +
      '<span class="chip-title">レジ 🛎️</span>' +
      '<span class="spacer"></span>' +
      '<div class="bag-zone"><span class="bag-emoji">🛍️</span></div>' +
      '</div>'
    );
    bar.querySelector('.btn-round').addEventListener('click', () => {
      // トレーに出した硬貨は財布へ戻す（おかねが消えないように）
      if (!paid && trayCoins.length) { s.coins = s.coins.concat(trayCoins.splice(0)); }
      SND.play('pop');
      go('shop');
    });
    scr.appendChild(bar);

    const co = el('<div class="checkout"><div class="co-left"></div><div class="co-right"></div></div>');
    const left = co.querySelector('.co-left');
    const right = co.querySelector('.co-right');

    // 商品と合計
    const itemsBox = el('<div class="co-items"></div>');
    s.basket.forEach(p => {
      itemsBox.appendChild(el(
        '<div class="co-item">' + VIS.visualHTML(p) +
        '<span class="ci-price">' + p.price + 'えん</span>' +
        '<span class="ci-name">' + esc(VIS.shortName(p, 12)) + '</span></div>'
      ));
    });
    left.appendChild(itemsBox);
    left.appendChild(el('<div class="co-total">ぜんぶで <em>' + total + '</em> えん</div>'));

    // トレー
    const tray = el('<div class="pay-tray"><span class="tray-hint">ここに おかねを のせてね</span></div>');
    left.appendChild(tray);

    // ガイド + 財布
    right.appendChild(el('<div class="guide-bubble">✋ ひかってる おかねを だそう！</div>'));
    right.appendChild(el('<div class="pay-label">じぶんの おさいふ 👛</div>'));
    const walletBox = el('<div class="pay-wallet"></div>');
    right.appendChild(walletBox);

    scr.appendChild(co);
    $app.appendChild(scr);

    // 支払い状態
    const trayCoins = [];
    let paid = false;

    // 「これをだそう！」ガイド: 超過最小・枚数最少の組み合わせをハイライト
    const hintSet = new Set();
    const plan = COINS.paymentSubset(s.coins, total);
    if (plan) plan.indices.forEach(i => hintSet.add(i));

    function renderWalletCoins() {
      walletBox.innerHTML = '';
      s.coins.forEach((v, idx) => {
        const c = COINS.coinEl(v);
        if (hintSet.has(idx) && !paid) c.classList.add('pay-hint');
        walletBox.appendChild(c);
        dragify(c, {
          disabled: () => paid,
          makeGhost() {
            const g = COINS.coinEl(v);
            g.classList.add('coin-ghost');
            return g;
          },
          onMove(x, y) { tray.classList.toggle('hot', hit(x, y, tray)); },
          onDrop(x, y, moved) {
            tray.classList.remove('hot');
            // ドラッグでトレーへ / タップでもトレーへ（4歳児フォールバック）
            if (hit(x, y, tray) || !moved) putCoin(idx);
          }
        });
      });
      if (s.coins.length === 0) walletBox.appendChild(el('<span class="empty-note" style="font-weight:900;color:#C89B5E">からっぽ！</span>'));
    }

    function putCoin(idx) {
      if (paid || idx >= s.coins.length) return;
      const v = s.coins.splice(idx, 1)[0];
      // ハイライト集合の添字を詰め直す
      const newHints = new Set();
      hintSet.delete(idx);
      hintSet.forEach(i => newHints.add(i > idx ? i - 1 : i));
      hintSet.clear();
      newHints.forEach(i => hintSet.add(i));

      trayCoins.push(v);
      SND.play('coin');
      tray.querySelector('.tray-hint').style.display = 'none';
      const c = COINS.coinEl(v);
      tray.appendChild(c);
      renderWalletCoins();

      if (COINS.sum(trayCoins) >= total) {
        paid = true;
        setTimeout(() => completePayment(), 450);
      }
    }

    function completePayment() {
      SND.play('register');
      toast('ピッ！');
      const bag = bar.querySelector('.bag-emoji');
      const bagPos = centerOf(bag);

      // 商品が袋へ飛ぶ
      const items = Array.from(itemsBox.querySelectorAll('.co-item .pvisual'));
      items.forEach((it, i) => {
        setTimeout(() => {
          const from = centerOf(it);
          const fly = el('<span class="fly-item">' + it.textContent + '</span>');
          fly.style.left = from.x - 22 + 'px';
          fly.style.top = from.y - 22 + 'px';
          document.body.appendChild(fly);
          it.style.visibility = 'hidden';
          requestAnimationFrame(() => {
            fly.style.transform = 'translate(' + (bagPos.x - from.x) + 'px,' + (bagPos.y - from.y) + 'px) scale(.4)';
            fly.style.opacity = '0';
          });
          setTimeout(() => {
            fly.remove();
            SND.play('basket');
            bag.classList.remove('catch');
            void bag.offsetWidth;
            bag.classList.add('catch');
          }, 520);
        }, i * 260);
      });

      const paidSum = COINS.sum(trayCoins);
      const change = paidSum - total;
      const bought = s.basket.slice();
      s.basket = [];

      setTimeout(() => {
        // おつりを実在硬貨で財布へ
        const changeCoins = COINS.breakdown(change);
        s.coins = s.coins.concat(changeCoins);
        showAfterPay(bought, changeCoins);
      }, items.length * 260 + 700);
    }

    function showAfterPay(bought, changeCoins) {
      const left2 = COINS.sum(s.coins);
      const ov = el(
        '<div class="overlay">' +
        '<div class="popup after-pay">' +
        '<div style="font-size:52px">🛍️</div>' +
        '<div class="verdict can">おかいもの できた！</div>' +
        (changeCoins.length ? '<div class="pay-label">おつりだよ！ チャリン✨</div>' : '') +
        '<div class="pay-label">おさいふの なかみ 👛</div>' +
        '<div class="wallet-open"></div>' +
        (left2 > 0
          ? '<div class="after-amount">あと <em>' + left2 + '</em> えん</div>'
          : '<div class="after-amount">おかね ぜんぶ つかった！</div>') +
        '<button class="btn-big mint">おみせに もどる</button>' +
        '<button class="btn-big ghost">おうちに かえる</button>' +
        '</div></div>'
      );
      const wo = ov.querySelector('.wallet-open');
      if (s.coins.length === 0) {
        wo.appendChild(el('<span class="empty-note">からっぽ！</span>'));
      } else {
        // 硬貨を1枚ずつチャリンと見せる（量感を体験させる）
        s.coins.forEach((v, i) => {
          setTimeout(() => {
            const c = COINS.coinEl(v);
            c.style.animation = 'verdict-pop .35s';
            wo.appendChild(c);
            SND.play('coin');
          }, 380 + i * 190);
        });
      }
      const btns = ov.querySelectorAll('.btn-big');
      btns[0].addEventListener('click', () => { ov.remove(); SND.play('pop'); go('shop'); });
      btns[1].addEventListener('click', () => { ov.remove(); SND.play('pop'); go('home'); });
      document.body.appendChild(ov);
      SND.play('tada');
      const c = centerOf(ov.querySelector('.popup'));
      sparkleAt(c.x, c.y - 100);
    }

    renderWalletCoins();
  }

  /* ============================================== スキャナー */
  function renderScanner() {
    const scr = el('<div class="screen" style="position:relative"></div>');
    const bar = el(
      '<div class="topbar">' +
      '<button class="btn-round" aria-label="もどる">🏠</button>' +
      '<span class="chip-title"><span class="scanner-tool">📟</span> ピッ！スキャナー</span>' +
      '<span class="spacer"></span>' +
      '<div class="wallet-chip"><span class="wc-coins"></span><span class="wc-amount"></span></div>' +
      '</div>'
    );
    bar.querySelector('.btn-round').addEventListener('click', () => { SND.play('pop'); go('home'); });
    scr.appendChild(bar);

    // スキャナーは「いまのおさいふで買えるか調べる」遊び（お金は減らない）
    const budget = state.walletChoice;
    const chip = bar.querySelector('.wallet-chip');
    chip.querySelector('.wc-coins').innerHTML = '';
    COINS.WALLET_COMPOSITIONS[budget].forEach(v => chip.querySelector('.wc-coins').appendChild(COINS.coinEl(v, { tiny: true })));
    chip.querySelector('.wc-amount').textContent = budget + 'えん';

    const { tabs, shelf } = buildShelf({
      priceMode: 'mystery',
      onTap: (p, card) => {
        if (state.scanned.has(p.id)) { openProductPopup(p, card); return; }
        // スキャン演出
        SND.play('scan');
        const beam = el('<span class="scan-beam"></span>');
        card.appendChild(beam);
        setTimeout(() => {
          beam.remove();
          state.scanned.add(p.id);
          const firstFind = discover(p);
          const tagEl = card.querySelector('.price-tag');
          tagEl.outerHTML = priceTagHTML(p);
          if (!card.querySelector('.found-mark')) card.insertAdjacentHTML('afterbegin', '<span class="found-mark">⭐</span>');
          const c = centerOf(card);
          if (p.price <= budget) {
            SND.play('can');
            sparkleAt(c.x, c.y);
            toast(p.price + 'えん！ かえる！');
          } else if (p.price > 100) {
            SND.play('cant');
            toast('100えんより たかい！');
          } else {
            SND.play('cant');
            toast(p.price + 'えん！ ' + budget + 'えんでは たりない！');
          }
          if (firstFind) SND.play('sparkle');
        }, 420);
      }
    });
    scr.appendChild(tabs);
    scr.appendChild(shelf);
    shelf.style.paddingBottom = 'calc(20px + env(safe-area-inset-bottom))';
    $app.appendChild(scr);
  }

  /* ============================================== 100えんライン */
  function startLine100() {
    const cheap = shuffle(DATA.products.filter(p => p.price <= 100));
    const exp = shuffle(DATA.products.filter(p => p.price > 100));
    // 提示順: 安い/高いを混ぜる（価格自体はDBのまま）
    const pool = [];
    let ci = 0, ei = 0;
    while (ci < cheap.length || ei < exp.length) {
      const pickCheap = ci < cheap.length && (ei >= exp.length || Math.random() < 0.45);
      pool.push(pickCheap ? cheap[ci++] : exp[ei++]);
    }
    state.line100 = { pool, idx: 0, busy: false };
  }

  function renderLine100() {
    const scr = el('<div class="screen line100"></div>');
    const bar = el(
      '<div class="topbar">' +
      '<button class="btn-round" aria-label="もどる">🏠</button>' +
      '<span class="chip-title">⚖️ 100えんライン</span>' +
      '<span class="spacer"></span>' +
      '</div>'
    );
    bar.querySelector('.btn-round').addEventListener('click', () => { SND.play('pop'); go('home'); });
    scr.appendChild(bar);

    scr.appendChild(el('<div class="l100-result" id="l100msg">どっちかな？ カードを うごかしてね</div>'));

    const zones = el(
      '<div class="l100-zones">' +
      '<div class="l100-zone cheap" data-z="cheap"><span class="z-emoji">💯⭕</span>100えんで<br>かえそう</div>' +
      '<div class="l100-zone exp" data-z="exp"><span class="z-emoji">📈</span>100えんより<br>たかそう</div>' +
      '</div>'
    );
    scr.appendChild(zones);
    $app.appendChild(scr);

    const zCheap = zones.querySelector('[data-z="cheap"]');
    const zExp = zones.querySelector('[data-z="exp"]');
    const msg = scr.querySelector('#l100msg');

    function nextCard() {
      const L = state.line100;
      if (L.idx >= L.pool.length) { startLine100(); }
      const p = state.line100.pool[state.line100.idx++];
      spawnCard(p);
    }

    function spawnCard(p) {
      const card = el(
        '<div class="l100-card">' + VIS.visualHTML(p) +
        '<span class="pname">' + esc(VIS.shortName(p, 20)) + '</span>' +
        '</div>'
      );
      zones.appendChild(card);
      state.line100.busy = false;

      let sx = 0, sy = 0, ox = 0, oy = 0, moved = false;
      card.addEventListener('pointerdown', (e) => {
        if (state.line100.busy) return;
        e.preventDefault();
        card.setPointerCapture(e.pointerId);
        sx = e.clientX; sy = e.clientY;
        const r = card.getBoundingClientRect();
        const zr = zones.getBoundingClientRect();
        ox = r.left + r.width / 2 - zr.left;
        oy = r.top + r.height / 2 - zr.top;
        moved = false;
        card.classList.remove('snap');

        const move = (ev) => {
          const dx = ev.clientX - sx, dy = ev.clientY - sy;
          if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
          card.style.left = ox + dx + 'px';
          card.style.top = oy + dy + 'px';
          zCheap.classList.toggle('hot', hit(ev.clientX, ev.clientY, zCheap));
          zExp.classList.toggle('hot', hit(ev.clientX, ev.clientY, zExp));
        };
        const up = (ev) => {
          card.removeEventListener('pointermove', move);
          zCheap.classList.remove('hot');
          zExp.classList.remove('hot');
          let guess = null;
          if (hit(ev.clientX, ev.clientY, zCheap)) guess = 'cheap';
          else if (hit(ev.clientX, ev.clientY, zExp)) guess = 'exp';
          if (!guess || !moved) {
            // 中途半端なら中央へ戻す
            card.classList.add('snap');
            card.style.left = '50%';
            card.style.top = '50%';
            return;
          }
          resolve(p, card, guess);
        };
        card.addEventListener('pointermove', move);
        card.addEventListener('pointerup', up, { once: true });
        card.addEventListener('pointercancel', up, { once: true });
      });

      // ゾーンをタップしても選べる（フォールバック）
      const tapPick = (guess) => () => { if (!state.line100.busy) resolve(p, card, guess); };
      zCheap.onclick = tapPick('cheap');
      zExp.onclick = tapPick('exp');
    }

    function resolve(p, card, guess) {
      state.line100.busy = true;
      const truth = p.price <= 100 ? 'cheap' : 'exp';
      const target = truth === 'cheap' ? zCheap : zExp;
      const zr = zones.getBoundingClientRect();
      const tc = centerOf(target);
      card.classList.add('snap');
      card.style.left = (tc.x - zr.left) + 'px';
      card.style.top = (tc.y - zr.top + 30) + 'px';
      const firstFind = discover(p);

      const correct = guess === truth;
      setTimeout(() => {
        if (truth === 'cheap') {
          msg.innerHTML = '<span style="color:var(--mint-deep)">' + p.price + 'えん！ 100えんで かえる！</span>';
        } else {
          msg.innerHTML = '<span style="color:#8B7BB5">100えんより たかい！</span>';
        }
        if (correct) {
          SND.play('can');
          const c = centerOf(card);
          sparkleAt(c.x, c.y);
        } else {
          SND.play('cant');
          msg.innerHTML += '<br><span style="font-size:.75em;color:var(--ink-soft)">こっちだったよ〜</span>';
        }
        if (firstFind) SND.play('sparkle');
      }, 320);

      setTimeout(() => {
        card.remove();
        msg.textContent = 'つぎは どっちかな？';
        nextCard();
      }, 2100);
    }

    nextCard();
  }

  /* ============================================== どのおかねなら かえる？ */
  function nextWalletQ() {
    const cheap = DATA.products.filter(p => p.price <= 100);
    const exp = DATA.products.filter(p => p.price > 100);
    const prev = state.wq.current ? state.wq.current.id : null;
    let p = null;
    for (let tries = 0; tries < 20 && (!p || p.id === prev); tries++) {
      // 7割は100円以下（正解の財布がある）、3割は「どれでもかえない」体験
      const pool = (Math.random() < 0.7 && cheap.length) ? cheap : exp;
      p = pool[Math.floor(Math.random() * pool.length)];
    }
    state.wq = { current: p, tried: new Set(), solved: false };
  }

  function renderWalletQ() {
    const p = state.wq.current;
    const scr = el('<div class="screen walletq"></div>');
    const bar = el(
      '<div class="topbar" style="width:100%">' +
      '<button class="btn-round" aria-label="もどる">🏠</button>' +
      '<span class="chip-title">👛 どの おかね？</span>' +
      '<span class="spacer"></span>' +
      '</div>'
    );
    bar.querySelector('.btn-round').addEventListener('click', () => { SND.play('pop'); go('home'); });
    scr.appendChild(bar);

    scr.appendChild(el(
      '<div class="wq-product">' + VIS.visualHTML(p) +
      '<span class="pname">' + esc(VIS.shortName(p, 24)) + '</span>' +
      '<span class="wq-price-slot"></span>' +
      '</div>'
    ));
    scr.appendChild(el('<div class="wq-question">どの おさいふなら かえるかな？<br><span style="font-size:.72em;color:var(--ink-soft)">いちばん ちいさい おさいふを さがしてね</span></div>'));

    const row = el('<div class="wq-row"></div>');
    DATA.WALLET_TIERS.forEach(tier => {
      const opt = el('<button class="wq-opt" data-tier="' + tier + '"><span class="w-coins"></span><span class="w-label">' + tier + 'えん</span></button>');
      const cb = opt.querySelector('.w-coins');
      COINS.WALLET_COMPOSITIONS[tier].forEach(v => cb.appendChild(COINS.coinEl(v, { tiny: true })));
      opt.addEventListener('click', () => pick(tier, opt));
      row.appendChild(opt);
    });
    scr.appendChild(row);

    const msg = el('<div class="wq-msg"></div>');
    scr.appendChild(msg);
    $app.appendChild(scr);

    const bestTier = DATA.tierOf(p); // null なら 100円でも買えない

    function revealPrice() {
      const slot = scr.querySelector('.wq-price-slot');
      slot.outerHTML = p.price <= 100
        ? '<div class="pp-price">' + p.price + '<span style="font-size:.6em">えん</span></div>'
        : '<div class="pp-price over">100えんより たかい</div>';
      discover(p);
    }

    function nextAfter(ms) {
      setTimeout(() => { nextWalletQ(); render(); }, ms);
    }

    function pick(tier, opt) {
      if (state.wq.solved) return;

      if (bestTier === null) {
        // どの財布でも買えない商品（これも大事な体験）
        state.wq.tried.add(tier);
        opt.classList.remove('no');
        void opt.offsetWidth;
        opt.classList.add('no');
        SND.play('cant');
        if (state.wq.tried.size >= 2) {
          state.wq.solved = true;
          revealPrice();
          msg.innerHTML = 'じつは… <span style="color:#8B7BB5">100えんより たかい！</span><br>どの おさいふでも かえないんだ〜';
          SND.play('sparkle');
          nextAfter(2600);
        } else {
          msg.textContent = 'まだ たりない！ ほかのは どうかな？';
        }
        return;
      }

      if (tier < bestTier) {
        opt.classList.remove('no');
        void opt.offsetWidth;
        opt.classList.add('no');
        SND.play('cant');
        msg.textContent = 'まだ たりない！';
      } else if (tier === bestTier) {
        state.wq.solved = true;
        opt.classList.add('best');
        revealPrice();
        SND.play('can');
        SND.play('sparkle');
        const c = centerOf(opt);
        sparkleAt(c.x, c.y);
        msg.innerHTML = '<span style="color:var(--mint-deep)">ぴったり！ ' + tier + 'えんで かえる！</span>';
        nextAfter(2200);
      } else {
        opt.classList.add('ok');
        SND.play('pop');
        msg.textContent = 'かえる！ でも もっと ちいさい おさいふでも かえるよ？';
      }
    }
  }

  /* ============================================== かかくずかん */
  const ZUKAN_TABS = [
    { key: 10, label: '10えんで かえる', emoji: '🪙' },
    { key: 30, label: '30えんで かえる', emoji: '🪙' },
    { key: 50, label: '50えんで かえる', emoji: '🪙' },
    { key: 80, label: '80えんで かえる', emoji: '🪙' },
    { key: 100, label: '100えんで かえる', emoji: '💯' },
    { key: 'over', label: '100えんでも かえない', emoji: '📈' }
  ];

  function bucketKey(p) {
    const t = DATA.tierOf(p);
    return t === null ? 'over' : t;
  }

  function renderZukan() {
    const scr = el('<div class="screen zukan"></div>');
    const bar = el(
      '<div class="topbar">' +
      '<button class="btn-round" aria-label="もどる">🏠</button>' +
      '<span class="chip-title">📖 ほんもの かかくずかん</span>' +
      '<span class="spacer"></span>' +
      '</div>'
    );
    bar.querySelector('.btn-round').addEventListener('click', () => { SND.play('pop'); go('home'); });
    scr.appendChild(bar);

    const buckets = {};
    ZUKAN_TABS.forEach(t => buckets[t.key] = []);
    DATA.products.forEach(p => buckets[bucketKey(p)].push(p));
    Object.values(buckets).forEach(list => list.sort((a, b) => a.price - b.price));

    const tabs = el('<div class="zukan-tabs"></div>');
    const grid = el('<div class="zukan-grid"></div>');

    ZUKAN_TABS.forEach(t => {
      const found = buckets[t.key].filter(p => save.discovered[p.id]).length;
      const total = buckets[t.key].length;
      // 101以上の数字を子どもに読ませないため 99+ 表記に丸める（価格ではないが念のため）
      const cnt = (n) => n > 99 ? '99+' : String(n);
      const b = el('<button class="zukan-tab" data-key="' + t.key + '">' + t.emoji + ' ' + t.label +
        ' <span class="zt-count">' + cnt(found) + '/' + cnt(total) + '</span></button>');
      b.addEventListener('click', () => {
        state.zukanTab = t.key;
        SND.play('pop');
        tabs.querySelectorAll('.zukan-tab').forEach(x => x.classList.toggle('sel', x.dataset.key === String(t.key)));
        fill();
      });
      tabs.appendChild(b);
    });

    function fill() {
      grid.innerHTML = '';
      const key = state.zukanTab;
      tabs.querySelectorAll('.zukan-tab').forEach(x => x.classList.toggle('sel', x.dataset.key === String(key)));
      const list = buckets[key];
      if (list.length === 0) {
        grid.appendChild(el('<div class="zukan-note">このおみせに ' + esc(ZUKAN_TABS.find(t => t.key === key).label) + ' ものは なかったよ…！<br>おみせの ものは おもったより たかいんだね。</div>'));
        return;
      }
      list.forEach(p => {
        const known = !!save.discovered[p.id];
        if (known) {
          const card = el(
            '<button class="pcard">' +
            '<span class="found-mark">⭐</span>' +
            VIS.visualHTML(p) +
            '<span class="pname">' + esc(VIS.shortName(p)) + '</span>' +
            priceTagHTML(p) +
            '</button>'
          );
          card.addEventListener('click', () => openProductPopup(p, null, 'zukan'));
          grid.appendChild(card);
        } else {
          grid.appendChild(el(
            '<div class="pcard unknown">' +
            VIS.visualHTML(p) +
            '<span class="pname">？？？</span>' +
            '<span class="price-tag mystery">？？？</span>' +
            '</div>'
          ));
        }
      });
    }

    scr.appendChild(tabs);
    scr.appendChild(grid);
    $app.appendChild(scr);
    fill();
  }

  /* ============================================== 親モード */
  function renderParent() {
    const meta = DATA.meta || {};
    const scr = el('<div class="screen"></div>');
    const bar = el(
      '<div class="topbar">' +
      '<button class="btn-round" aria-label="もどる">🏠</button>' +
      '<span class="chip-title">おうちのかたへ</span>' +
      '<span class="spacer"></span>' +
      '</div>'
    );
    bar.querySelector('.btn-round').addEventListener('click', () => go('home'));
    scr.appendChild(bar);

    const body = el('<div class="parent"></div>');
    body.appendChild(el(
      '<div class="warn">本ゲームはイオン株式会社・イオン琉球株式会社の公式アプリではありません。' +
      '実店舗の公開価格を「お金の量感」を学ぶための教材として利用した非公式の教育用ゲームです。</div>'
    ));

    body.appendChild(el('<h2>データセット情報</h2>'));
    body.appendChild(el(
      '<div class="meta-box">' +
      '<p>店舗: ' + esc(meta.store_name || '-') + '（店舗コード: ' + esc(meta.store_code || '-') + ' / ' + esc(meta.prefecture || '-') + '）</p>' +
      '<p>データ取得日: ' + esc(meta.observed_date || '-') + '</p>' +
      '<p>商品数: ' + (DATA.products.length) + '件</p>' +
      '<p>ゲーム価格ルール: ' + esc(meta.pricing_rule || '-') + '</p>' +
      '<p>子ども表示ルール: ' + esc(meta.child_display_rule || '-') + '</p>' +
      '<p>注意: ' + esc(meta.important_note || '-') + '</p>' +
      '</div>'
    ));

    body.appendChild(el('<h2>このゲームのねらい</h2>'));
    body.appendChild(el(
      '<p>足し算の練習ではなく、「10円・30円・50円・80円・100円で現実に何が買えるか」という' +
      '購買力の量感を、実在商品の実価格だけで体験させます。買えない商品が多いのは仕様であり、' +
      '「100円でも買えないものがたくさんある」こと自体が学びです。価格の加工・丸め・架空商品の追加は行っていません。</p>'
    ));

    body.appendChild(el('<h2>商品データ（全' + DATA.products.length + '件）</h2>'));
    const wrap = el('<div style="overflow-x:auto;max-height:50dvh;overflow-y:auto;border-radius:12px"></div>');
    const rows = DATA.products.map(p =>
      '<tr><td>' + esc(p.name) + (p.packSize ? '<br><small>' + esc(p.packSize) + '</small>' : '') + '</td>' +
      '<td>' + esc(p.category) + '</td>' +
      '<td>' + esc(p.jan || '—') + '</td>' +
      '<td>' + (p.priceExTax != null ? p.priceExTax + '円' : '—') + '</td>' +
      '<td>' + (p.priceInclTax != null ? p.priceInclTax + '円' : '—') + '</td>' +
      '<td>' + p.price + '円</td>' +
      '<td>' + esc(p.verificationLevel || '—') + '</td>' +
      '<td>' + esc(p.observedDate || '—') + '</td>' +
      '<td>' + (p.sourceUrl ? '<a href="' + esc(p.sourceUrl) + '" target="_blank" rel="noopener">出典</a>' : '—') + '</td></tr>'
    ).join('');
    wrap.appendChild(el(
      '<table><thead><tr><th>商品名</th><th>カテゴリ</th><th>JAN</th><th>税抜</th><th>税込表示</th><th>ゲーム価格</th><th>検証</th><th>取得日</th><th>出典</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>'
    ));
    body.appendChild(wrap);
    body.appendChild(el('<p style="margin-top:8px">検証レベル A: ' + esc((meta.verification_levels || {}).A || '') + '<br>検証レベル B: ' + esc((meta.verification_levels || {}).B || '') + '</p>'));

    body.appendChild(el('<h2>データの差し替え</h2>'));
    body.appendChild(el('<p><code>data/products.json</code> を同形式のファイルに置き換えると、他店舗や家庭のレシート由来価格に差し替えられます（優先設計: 1. 家庭の実購入価格 → 2. 最新の店舗Web価格 → 3. 過去の店舗Web価格）。</p>'));

    body.appendChild(el('<h2>セーブデータ</h2>'));
    const resetBtn = el('<button class="btn-big ghost" style="min-height:52px;font-size:16px">ずかん・発見データを消す</button>');
    let armed = false;
    resetBtn.addEventListener('click', () => {
      if (!armed) { armed = true; resetBtn.textContent = 'ほんとうに消しますか？（もう一度タップ）'; return; }
      save.discovered = {};
      save.modes = {};
      persist();
      toast('セーブデータを消しました');
      armed = false;
      resetBtn.textContent = 'ずかん・発見データを消す';
    });
    body.appendChild(resetBtn);
    body.appendChild(el('<p style="height:20px"></p>'));

    scr.appendChild(body);
    $app.appendChild(scr);
  }

  /* ============================================== エラー画面（データ欠損時） */
  function renderError() {
    $app.appendChild(el(
      '<div class="screen home" style="justify-content:center">' +
      '<div style="font-size:64px">🛒</div>' +
      '<div class="home-title"><span class="t2">おみせの じゅんびちゅう…</span></div>' +
      '<p style="color:var(--ink-soft);font-weight:700;text-align:center">商品データ（data/products.json）が読み込めませんでした。<br>ファイルを確認してから、もういちど開いてください。</p>' +
      '</div>'
    ));
  }

  /* ============================================== 起動 */
  document.addEventListener('pointerdown', function unlock() {
    SND.unlock();
    document.removeEventListener('pointerdown', unlock);
  });

  SND.setEnabled(save.sound);

  DATA.loadDB().then(({ products }) => {
    if (!products || products.length === 0) {
      state.screen = 'error';
    }
    render();
  }).catch(() => {
    state.screen = 'error';
    render();
  });
})();
