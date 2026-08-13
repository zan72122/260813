/* =========================================================
 * game.js — 『おかいものシアター』演出・進行
 *
 * プレイヤーは「意味のある操作」（商品を取る・カゴへ入れる・
 * カゴを置く・硬貨を出す・袋詰め・カゴ返却）だけを行い、
 * つなぎの移動はキャラクターが演技する。
 *
 * 価格は data/products.json（実価格DB）のみを使用する。
 * 101以上の数字は子ども画面に出さない。
 * ========================================================= */
(function () {
  'use strict';

  const T = THREE;
  const W = WORLD;
  const L = W.L;

  /* ============================================== 基盤 */
  const canvas = document.getElementById('stage');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;

  const scene = new T.Scene();
  scene.background = new T.Color(0xBFE3F0);
  scene.fog = new T.Fog(0xD8ECF2, 22, 40);

  const camera = new T.PerspectiveCamera(46, 1, 0.1, 60);

  const hemi = new T.HemisphereLight(0xFFFFFF, 0xCBB89A, 0.8);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xFFF3DD, 0.65);
  sun.position.set(5, 10, 6);
  scene.add(sun);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦画面では視野を広げて店内が見えるように
    camera.fov = w < h ? 60 : 46;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------------------------------------------- tween */
  const tweens = [];
  const easeIO = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

  function tw(dur, update, ease) {
    return new Promise(res => {
      tweens.push({ t: 0, dur, update, ease: ease || easeIO, res });
    });
  }
  function sleep(ms) { return tw(ms / 1000, () => {}); }

  function tickTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const o = tweens[i];
      o.t += dt / o.dur;
      const k = o.t >= 1 ? 1 : o.ease(o.t);
      try { o.update(k); } catch (e) { /* 演出は落とさない */ }
      if (o.t >= 1) { tweens.splice(i, 1); o.res(); }
    }
  }

  function moveTo(obj, to, dur, ease, lift) {
    const from = obj.position.clone();
    const target = to.clone();
    return tw(dur, k => {
      obj.position.lerpVectors(from, target, k);
      if (lift) obj.position.y += Math.sin(k * Math.PI) * lift;
    }, ease);
  }

  /* ---------------------------------------------- カメラリグ */
  const camState = {
    mode: 'pose', // 'pose' | 'follow'
    pos: new T.Vector3(0, 2, 14),
    look: new T.Vector3(0, 1, 9),
    followTarget: null
  };
  camera.position.copy(camState.pos);
  camera.lookAt(camState.look);

  const POSE = {
    outside:  { pos: [1.6, 2.6, 14.6], look: [-0.3, 1.2, 8.8] },
    cart:     { pos: [-1.0, 1.9, 8.9], look: [-3.6, 0.7, 6.0] },
    storeView:{ pos: [0.8, 2.5, 9.6], look: [-3.6, 1.0, -3.0] },
    shelf:    { pos: [-4.35, 1.7, 0.55], look: [-4.6, 0.8, -3.9] },
    shelfClose:{ pos: [-4.4, 1.4, -0.3], look: [-4.6, 0.85, -3.9] },
    register: { pos: [0.9, 2.1, 4.9], look: [4.0, 1.0, 0.6] },
    scan:     { pos: [2.85, 1.8, 2.75], look: [4.15, 1.0, 0.35] },
    pay:      { pos: [2.5, 1.75, 3.1], look: [3.7, 1.0, 0.8] },
    sacker:   { pos: [0.6, 2.7, 7.5], look: [0.6, 0.8, 4.8] },
    returnP:  { pos: [-0.4, 1.8, 8.8], look: [-2.9, 0.5, 6.0] },
    finale:   { pos: [0, 1.7, 16.4], look: [0, 1.0, 11.8] }
  };

  function camGoto(name, dur) {
    camState.mode = 'pose';
    const p = POSE[name];
    const fromP = camState.pos.clone(), fromL = camState.look.clone();
    const toP = new T.Vector3(...p.pos), toL = new T.Vector3(...p.look);
    return tw(dur == null ? 1.1 : dur, k => {
      camState.pos.lerpVectors(fromP, toP, k);
      camState.look.lerpVectors(fromL, toL, k);
    });
  }
  function camFollow(target) {
    camState.mode = 'follow';
    camState.followTarget = target;
  }

  function tickCamera(dt) {
    if (camState.mode === 'follow' && camState.followTarget) {
      const t = camState.followTarget;
      const dir = new T.Vector3(0, 0, 1).applyQuaternion(t.quaternion);
      const wantP = t.position.clone().addScaledVector(dir, -3.6).add(new T.Vector3(0, 2.4, 0));
      const wantL = t.position.clone().addScaledVector(dir, 2.0).add(new T.Vector3(0, 0.9, 0));
      camState.pos.lerp(wantP, Math.min(1, dt * 2.4));
      camState.look.lerp(wantL, Math.min(1, dt * 3));
    }
    camera.position.copy(camState.pos);
    camera.lookAt(camState.look);
  }

  /* ---------------------------------------------- HUD */
  const $hint = document.getElementById('hint');
  const $bubble = document.getElementById('bubble');
  const $walletHud = document.getElementById('wallet-hud');
  const $overlay = document.getElementById('overlay-layer');
  const $drag = document.getElementById('drag-layer');

  function hint(text) {
    if (!text) { $hint.classList.add('hidden'); return; }
    $hint.textContent = text;
    $hint.classList.remove('hidden');
  }
  let bubbleTimer = null;
  function bubble(face, text, holdMs) {
    clearTimeout(bubbleTimer);
    $bubble.querySelector('.bb-face').textContent = face;
    $bubble.querySelector('.bb-text').textContent = text;
    $bubble.classList.remove('hidden');
    if (holdMs !== 0) {
      bubbleTimer = setTimeout(() => $bubble.classList.add('hidden'), holdMs || 2600);
    }
    return sleep(Math.min(holdMs || 2600, 2600) * 0.55);
  }
  function hideBubble() { clearTimeout(bubbleTimer); $bubble.classList.add('hidden'); }

  const walletCoins = []; // 実在硬貨のみ（今回は100円玉1枚でスタート）
  function walletHUD() {
    const box = $walletHud.querySelector('.wh-coins');
    box.innerHTML = '';
    walletCoins.forEach(v => box.appendChild(COINS.coinEl(v, { tiny: true })));
    if (walletCoins.length === 0) {
      box.innerHTML = '<span style="font-weight:900;color:#C89B5E;font-size:14px">からっぽ</span>';
    }
  }
  function walletBump() {
    $walletHud.classList.remove('bump');
    void $walletHud.offsetWidth;
    $walletHud.classList.add('bump');
  }

  function ripple(x, y) {
    const r = document.createElement('div');
    r.className = 'tap-ripple';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 500);
  }
  function sparkle(x, y) {
    const chars = ['✨', '⭐', '✨', '🌟', '✨'];
    chars.forEach((c, i) => {
      const s = document.createElement('span');
      s.className = 'spark';
      s.textContent = c;
      const ang = (Math.PI * 2 * i) / chars.length + Math.random();
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      s.style.setProperty('--dx', Math.cos(ang) * 60 + 'px');
      s.style.setProperty('--dy', (Math.sin(ang) * 60 - 30) + 'px');
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 850);
    });
  }

  function toScreen(v3) {
    const v = v3.clone().project(camera);
    return {
      x: (v.x + 1) / 2 * window.innerWidth,
      y: (1 - v.y) / 2 * window.innerHeight
    };
  }

  /* ---------------------------------------------- 目印マーカー（矢印） */
  const marker = new T.Group();
  const markerCone = new T.Mesh(
    new T.ConeGeometry(0.16, 0.34, 10),
    new T.MeshLambertMaterial({ color: 0xFFD166, emissive: 0x8a6a10 })
  );
  markerCone.rotation.x = Math.PI;
  marker.add(markerCone);
  const markerRing = new T.Mesh(
    new T.TorusGeometry(0.34, 0.045, 8, 24),
    new T.MeshBasicMaterial({ color: 0xFFD166, transparent: true, opacity: 0.85 })
  );
  markerRing.rotation.x = -Math.PI / 2;
  markerRing.position.y = -0.35;
  marker.add(markerRing);
  marker.visible = false;
  scene.add(marker);
  let markerBase = new T.Vector3();
  function showMarker(pos, opts) {
    markerBase.copy(pos);
    marker.visible = true;
    markerRing.visible = !(opts && opts.noRing);
  }
  function hideMarker() { marker.visible = false; }

  /* ドロップ先ハイライトリング */
  const dropRing = new T.Mesh(
    new T.TorusGeometry(0.42, 0.05, 8, 28),
    new T.MeshBasicMaterial({ color: 0x7ED8B4, transparent: true, opacity: 0.9 })
  );
  dropRing.rotation.x = -Math.PI / 2;
  dropRing.visible = false;
  scene.add(dropRing);

  /* ---------------------------------------------- 入力 */
  const ray = new T.Raycaster();
  const pointer = new T.Vector2();
  let tapArm = null;   // { items:[{obj, cb}], }
  let dragArm = null;  // { items:[mesh], target:{pos,r}, onDrop, lift, dropRingY }
  let dragging = null;

  function setPointer(e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  function raycastList(list) {
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects(list, true);
    if (!hits.length) return null;
    // ルート（登録オブジェクト）まで遡る
    let o = hits[0].object;
    while (o && !list.includes(o)) o = o.parent;
    return { root: o, point: hits[0].point };
  }

  function armTap(items) {
    // items: [{obj, pad?}] → タップされた obj を resolve
    return new Promise(res => { tapArm = { items, res }; });
  }
  function disarmTap() { tapArm = null; }

  const dragPlane = new T.Plane();

  canvas.addEventListener('pointerdown', e => {
    SND.unlock();
    setPointer(e);
    // ドラッグ優先
    if (dragArm && !dragging) {
      const hit = raycastList(dragArm.items);
      if (hit && hit.root) {
        startDrag(hit.root, hit.point, e);
        return;
      }
    }
    // タップ（当たり判定はレイ + 画面距離の寛容判定）
    if (tapArm) {
      const objs = tapArm.items.map(i => i.obj);
      const hit = raycastList(objs);
      let chosen = hit && hit.root;
      if (!chosen) {
        let bestD = 90; // px 吸着
        for (const i of tapArm.items) {
          const c = new T.Vector3();
          new T.Box3().setFromObject(i.obj).getCenter(c);
          const s = toScreen(c);
          const d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
          if (d < bestD + (i.pad || 0)) { bestD = d; chosen = i.obj; }
        }
      }
      if (chosen) {
        ripple(e.clientX, e.clientY);
        SND.play('pop');
        const res = tapArm.res;
        tapArm = null;
        res(chosen);
      }
    }
  });

  /* ドロップ判定はスクリーン座標で行う（奥行き差があっても4歳児の指で吸着する） */
  function screenNear(obj, tgt) {
    if (!tgt) return false;
    const so = toScreen(obj.getWorldPosition(new T.Vector3()));
    const st = toScreen(tgt.pos);
    const r = tgt.screenR || Math.max(100, Math.min(window.innerWidth, window.innerHeight) * 0.16);
    return Math.hypot(so.x - st.x, so.y - st.y) < r;
  }

  function startDrag(obj, point, e) {
    dragging = { obj, moved: false };
    const camDir = new T.Vector3();
    camera.getWorldDirection(camDir);
    dragPlane.setFromNormalAndCoplanarPoint(camDir, point);
    // 掴んだ瞬間（元の親子関係を先に記録してから scene 直下へ）
    const parent = obj.parent;
    dragging.home = { pos: null, quat: obj.quaternion.clone(), parent };
    scene.attach(obj);
    dragging.home.pos = obj.position.clone();
    SND.play('take');
    if (dragArm.onGrab) dragArm.onGrab(obj);
    // ドロップ先リング表示
    const tgt = dragArm.target(obj);
    if (tgt) {
      dropRing.position.copy(tgt.pos);
      dropRing.position.y = tgt.ringY != null ? tgt.ringY : (tgt.pos.y + 0.03);
      dropRing.scale.setScalar(tgt.r / 0.42);
      dropRing.visible = true;
    }
    canvas.setPointerCapture(e.pointerId);
  }

  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    setPointer(e);
    ray.setFromCamera(pointer, camera);
    const p = new T.Vector3();
    if (ray.ray.intersectPlane(dragPlane, p)) {
      dragging.moved = true;
      dragging.obj.position.copy(p);
      if (dragArm && dragArm.onMove) dragArm.onMove(dragging.obj, p);
      const tgt = dragArm && dragArm.target(dragging.obj);
      if (tgt) {
        dropRing.material.color.set(screenNear(dragging.obj, tgt) ? 0xFFD166 : 0x7ED8B4);
      }
    }
  });

  function endDrag(e) {
    if (!dragging) return;
    const d = dragging;
    dragging = null;
    dropRing.visible = false;
    const tgt = dragArm && dragArm.target(d.obj);
    const ok = tgt && screenNear(d.obj, tgt);
    if (dragArm && dragArm.onDrop) {
      dragArm.onDrop(d.obj, !!ok, d.home);
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function armDragOnce(items, opts) {
    // 1回のドロップ成功で resolve するドラッグ
    return new Promise(res => {
      dragArm = {
        items,
        target: opts.target,
        onGrab: opts.onGrab,
        onMove: opts.onMove,
        onDrop: async (obj, ok, home) => {
          if (ok) {
            dragArm = null;
            res(obj);
          } else {
            // そっと元へ戻す
            const from = obj.position.clone();
            await tw(0.35, k => {
              obj.position.lerpVectors(from, home.pos, k);
            }, easeOut);
            obj.position.copy(home.pos);
            obj.quaternion.copy(home.quat);
            if (home.parent && home.parent !== scene) home.parent.attach(obj);
            if (opts.onReturn) opts.onReturn(obj);
          }
        }
      };
    });
  }
  function disarmDrag() { dragArm = null; }

  /* ============================================== 商品セレクション */
  /*
   * Vertical Slice: お菓子棚1台・6商品。
   * 実価格DBから「安く買える／100円前後／100円超」を必ず混在させて選ぶ。
   * 価格の加工は行わない（DBに無い商品は選ばれない）。
   */
  const SHELF_PLAN = [
    { match: 'うまい棒チーズ', shape: 'stick', colors: { body: 0xF5C542, accent: 0xE87A00 } },
    { match: 'もろこし輪太郎', shape: 'pouch', colors: { body: 0xF08A24, accent: 0xD84315 } },
    { match: 'ブラックサンダー', shape: 'bar', colors: { body: 0x37322D, accent: 0xFFD400 } },
    { match: 'つりグミ', shape: 'box', colors: { body: 0xE53935, accent: 0x1E88E5 } },
    { match: 'ミックスゼリー', shape: 'cup', colors: { body: 0xF48FB1, accent: 0xFFF3E0 } },
    { match: 'ベジたべる あっさりサラダ', shape: 'bigpouch', colors: { body: 0x8BC34A, accent: 0x33691E } }
  ];
  const FALLBACK_SHAPES = ['pouch', 'box', 'cup', 'bar', 'stick', 'bigpouch'];
  const FALLBACK_COLORS = [
    { body: 0xF08A24, accent: 0xD84315 }, { body: 0x42A5F5, accent: 0x1565C0 },
    { body: 0xAB47BC, accent: 0x6A1B9A }, { body: 0x26A69A, accent: 0x00695C },
    { body: 0xF5C542, accent: 0xE87A00 }, { body: 0x8BC34A, accent: 0x33691E }
  ];

  function chooseProducts() {
    const okashi = DATA.products.filter(p => p.category === 'お菓子');
    const chosen = [];
    for (const plan of SHELF_PLAN) {
      const p = okashi.find(x => x.name.includes(plan.match) && !chosen.some(c => c.product.id === x.id));
      if (p) chosen.push({ product: p, def: plan });
    }
    // DB差し替え時のフォールバック: 安い順＋100円超を必ず混ぜて6点そろえる
    if (chosen.length < 6) {
      const rest = okashi.filter(x => !chosen.some(c => c.product.id === x.id))
        .sort((a, b) => a.price - b.price);
      const cheap = rest.filter(p => p.price <= 100);
      const exp = rest.filter(p => p.price > 100);
      const picks = [...cheap.slice(0, 4), ...exp.slice(0, 2), ...rest];
      for (const p of picks) {
        if (chosen.length >= 6) break;
        if (chosen.some(c => c.product.id === p.id)) continue;
        const i = chosen.length;
        chosen.push({ product: p, def: { shape: FALLBACK_SHAPES[i % 6], colors: FALLBACK_COLORS[i % 6] } });
      }
    }
    return chosen.slice(0, 6);
  }

  /* ============================================== 役者と舞台 */
  let refs, hero, cashier, npcQueue, npcWalker;
  const shelfSlots = []; // { plan, mesh(現在の前面在庫), pos, tag }
  let basket;            // 主人公のカゴ（カートに載る）
  let doneBasket;        // スキャン済みかご
  const basketItems = [];// カゴ内の商品メッシュ
  let bag;

  function buildActors() {
    refs = W.buildStore(scene);

    hero = W.person({ height: 1.15, shirt: 0xFF8FAB, pants: 0xFFE082, hair: 0x5D4037 });
    hero.position.set(-0.9, 0, 11.4);
    hero.rotation.y = Math.PI; // 店を向く
    hero.userData.idleSeed = 1;
    scene.add(hero);

    cashier = W.person({ height: 1.6, shirt: 0x4E8FBF, pants: 0x37474F, hair: 0x3E2723, apron: 0x7ED8B4, cap: 0x7ED8B4, hairStyle: 'short' });
    cashier.position.set(4.2, 0, -0.4);
    cashier.userData.idleSeed = 2;
    scene.add(cashier);

    // 先に並んでいるお客さん
    npcQueue = W.person({ height: 1.5, shirt: 0xC9B6F2, pants: 0x8D6E63, hair: 0x263238, hairStyle: 'short' });
    npcQueue.position.copy(L.PAY);
    npcQueue.rotation.y = Math.PI; // レジを向く（-z向き…人物は+zが正面なのでPIで-zへ）
    npcQueue.userData.idleSeed = 3;
    scene.add(npcQueue);

    // 遠くを歩く買い物客
    npcWalker = W.person({ height: 1.55, shirt: 0xFFCC80, pants: 0x546E7A, hair: 0x6D4C41, hairStyle: 'short' });
    npcWalker.position.set(-8, 0, 2);
    npcWalker.userData.idleSeed = 4;
    scene.add(npcWalker);

    basket = W.basketMesh(0xE05B4B);
    // カートのカゴ受けに載せる
    refs.cart.add(basket);
    basket.position.set(0, 0.84, 0);

    doneBasket = W.basketMesh(0x4E8FBF);
    doneBasket.position.copy(L.DONE_BASKET);
    doneBasket.position.y = 0.98;
    scene.add(doneBasket);

    bag = refs.sacker.userData.bag;
  }

  function stockShelf() {
    const chosen = chooseProducts();
    const shelf = refs.shelf;
    const boards = [0.8, 1.22]; // 手が届く中段・上段
    chosen.forEach((plan, i) => {
      const board = boards[Math.floor(i / 3)];
      const x = (i % 3 - 1) * 0.95;
      const boardTop = board + 0.018;
      // 前面（取れる）＋奥の在庫（左右にも並べて棚を賑やかに）
      for (let d = 0; d < 3; d++) {
        const cols = d === 0 ? [0] : [-0.2, 0, 0.2];
        for (const cx of cols) {
          const m = W.productMesh(plan.product, plan.def);
          m.position.set(L.SHELF.x + x + cx + (d ? (Math.random() - 0.5) * 0.03 : 0), boardTop, L.SHELF.z + 0.16 - d * 0.22);
          scene.add(m);
          if (d === 0) {
            shelfSlots.push({ plan, mesh: m, pos: m.position.clone(), boardTop });
          }
        }
      }
      // 値札（レールに）
      const tag = W.priceTagMesh(plan.product);
      tag.position.set(L.SHELF.x + x, board - 0.045, L.SHELF.z + 0.315);
      scene.add(tag);
    });
  }

  /* ============================================== 歩行 */
  async function walkTo(person, points, opts) {
    opts = opts || {};
    const speed = opts.speed || 1.5;
    person.userData.acting = true;
    if (opts.follow !== false) camFollow(person);
    let stepAcc = 0;
    for (const pt of points) {
      const target = pt.clone ? pt.clone() : new T.Vector3(pt[0], 0, pt[1]);
      target.y = 0;
      const from = person.position.clone(); from.y = 0;
      const dist = from.distanceTo(target);
      if (dist < 0.05) continue;
      const dir = target.clone().sub(from).normalize();
      const wantYaw = Math.atan2(dir.x, dir.z);
      // 向きを変える
      const startYaw = person.rotation.y;
      let dYaw = wantYaw - startYaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      await tw(Math.max(0.15, Math.abs(dYaw) * 0.22), k => {
        person.rotation.y = startYaw + dYaw * k;
        placeCart(person, opts);
      });
      // 歩く
      const dur = dist / speed;
      await tw(dur, k => {
        person.position.x = from.x + (target.x - from.x) * k;
        person.position.z = from.z + (target.z - from.z) * k;
        W.walkAnim(person, 1 / 60, 1);
        if (opts.armsLocked) { person.userData.armL.rotation.x = -1.05; person.userData.armR.rotation.x = -1.05; }
        placeCart(person, opts);
        stepAcc += 1;
        if (stepAcc % 22 === 0) SND.play(opts.cart ? 'cart' : 'step');
      }, t => t); // 等速
    }
    person.userData.legL.rotation.x = 0;
    person.userData.legR.rotation.x = 0;
    if (!opts.armsLocked) { person.userData.armL.rotation.x = 0; person.userData.armR.rotation.x = 0; }
    // カートを押したまま止まる場合は姿勢を保つ（アイドルで腕が戻らないように）
    person.userData.acting = !!opts.armsLocked;
    if (opts.face != null) {
      const startYaw = person.rotation.y;
      let dYaw = opts.face - startYaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      await tw(0.25, k => { person.rotation.y = startYaw + dYaw * k; placeCart(person, opts); });
    }
  }

  function placeCart(person, opts) {
    if (!opts.cart) return;
    const cart = refs.cart;
    const dir = new T.Vector3(0, 0, 1).applyQuaternion(person.quaternion);
    cart.position.copy(person.position).addScaledVector(dir, 0.75);
    cart.position.y = 0;
    cart.rotation.y = person.rotation.y;
    cart.userData.wheels.forEach(w => { w.rotation.x += 0.18; });
  }

  /* 腕を伸ばす演出 */
  async function reach(person, side, amount, dur) {
    const arm = side === 'L' ? person.userData.armL : person.userData.armR;
    person.userData.acting = true;
    const from = arm.rotation.x;
    await tw(dur || 0.3, k => { arm.rotation.x = from + (amount - from) * k; }, easeOut);
  }
  async function unreach(person, dur) {
    const { armL, armR } = person.userData;
    const fl = armL.rotation.x, fr = armR.rotation.x;
    await tw(dur || 0.3, k => {
      armL.rotation.x = fl * (1 - k);
      armR.rotation.x = fr * (1 - k);
    }, easeOut);
    person.userData.acting = false;
  }

  /* ============================================== 3D硬貨 */
  const COIN_COLORS = { 1: 0xD8DBE1, 5: 0xD9B24A, 10: 0xC07A45, 50: 0xC6CBD4, 100: 0xC9CED8 };
  function coin3D(value) {
    const tex = W.canvasTex(96, 96, (ctx, w, h) => {
      const col = { 1: '#E6E9EE', 5: '#E8C96A', 10: '#D08A52', 50: '#DCE1E8', 100: '#DEE3EA' }[value];
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(70,55,40,.85)';
      ctx.font = '900 44px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(value), w / 2, h / 2);
      if (value === 5 || value === 50) {
        ctx.fillStyle = '#F2EBDD';
        ctx.beginPath(); ctx.arc(w / 2, h / 4, 8, 0, Math.PI * 2); ctx.fill();
      }
    });
    const r = value === 100 ? 0.085 : value === 50 ? 0.075 : value === 10 ? 0.08 : value === 5 ? 0.076 : 0.07;
    const side = new T.MeshLambertMaterial({ color: COIN_COLORS[value] });
    const face = new T.MeshLambertMaterial({ map: tex });
    const m = new T.Mesh(new T.CylinderGeometry(r, r, 0.022, 20), [side, face, face]);
    m.userData.value = value;
    return m;
  }

  /* ============================================== POS状態 */
  const posState = { count: 0, total: 0 };
  function posText() {
    refs.register.userData.drawPOS(
      posState.count === 0 && posState.total === 0
        ? null
        : { count: posState.count, total: posState.total, over: posState.total > 100 }
    );
  }

  /* ============================================== 進行フロー */
  const scannedItems = []; // { mesh, product }
  let purchasedProducts = [];

  async function main() {
    buildActors();
    stockShelf();
    walletCoins.push(100); // きょうは100えん
    walletHUD();

    // タイトル
    await new Promise(res => {
      document.getElementById('btn-start').addEventListener('click', () => {
        SND.unlock();
        SND.play('pop');
        res();
      }, { once: true });
    });
    const title = document.getElementById('title-screen');
    title.classList.add('fade');
    setTimeout(() => title.remove(), 600);
    $walletHud.classList.remove('hidden');

    /* ---- Scene 1: 入口 ---- */
    camState.pos.set(...POSE.outside.pos);
    camState.look.set(...POSE.outside.look);
    bubble('👧', 'きょうは 100えん もってきたよ！', 3000);
    await sleep(600);
    hint('ドアを タップ！');
    showMarker(new T.Vector3(0, 2.9, 9));
    await armTap([{ obj: refs.doorL, pad: 60 }, { obj: refs.doorR, pad: 60 }]);
    hideMarker(); hint(null); hideBubble();
    await openDoors();
    await walkTo(hero, [L.INSIDE], { follow: true });
    closeDoors();

    /* ---- Scene 2: カートを取る ---- */
    await camGoto('cart');
    hint('カートを タップ！');
    showMarker(refs.cart.userData.handle.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0.5, 0)));
    await armTap([{ obj: refs.cart }]);
    hideMarker(); hint(null);
    await walkTo(hero, [L.CART_GRAB], { follow: false });
    // カートを引き出す
    await reach(hero, 'L', -1.05, 0.25);
    await reach(hero, 'R', -1.05, 0.25);
    SND.play('cart');
    await tw(0.7, k => {
      refs.cart.position.x = L.CART_STATION.x + k * 0.9;
      refs.cart.userData.wheels.forEach(w => { w.rotation.x += 0.1; });
    }, easeOut);
    SND.play('kakon');
    bubble('👧', 'カートで いこう！', 2000);

    /* ---- Scene 3: 売場へ ---- */
    await camGoto('storeView'); // 店内を見渡して売場の看板が見える
    hint('🍬 おかしの かんばんを タップ！');
    showMarker(new T.Vector3(L.SHELF.x, 3.1, L.SHELF.z + 0.4));
    await armTap([{ obj: refs.signOkashi, pad: 40 }, { obj: refs.shelf, pad: 20 }]);
    hideMarker(); hint(null);
    await walkTo(hero, [new T.Vector3(-1.6, 0, 3.2), new T.Vector3(-3.6, 0, -0.8), L.SHELF_FRONT], { cart: true, follow: true, armsLocked: true, face: Math.PI * 0.88 });
    // カートを右横（画面に見える位置）に停める
    await tw(0.5, k => {
      refs.cart.position.lerp(L.CART_PARK, k);
      refs.cart.rotation.y = refs.cart.rotation.y + (Math.PI * 0.5 - refs.cart.rotation.y) * k;
      refs.cart.userData.wheels.forEach(w => { w.rotation.x += 0.08; });
    });
    await unreach(hero);
    await camGoto('shelf');

    /* ---- Scene 4: 商品を取ってカゴへ ---- */
    await browsePhase();

    /* ---- Scene 5: レジへ ---- */
    hint(null);
    await walkTo(hero, [new T.Vector3(-2.6, 0, 0.6), new T.Vector3(0.6, 0, 2.8), L.QUEUE], { cart: true, follow: true, armsLocked: true, face: Math.PI });
    await camGoto('register');

    // 前のお客さんが1つだけピッとしてもらう
    await queueScene();

    // 自分の番
    await walkTo(hero, [L.PAY], { cart: true, follow: false, armsLocked: true, face: Math.PI });
    await tw(0.4, k => { refs.cart.position.lerp(new T.Vector3(2.35, 0, 1.9), k); });
    await unreach(hero);
    await bubble('🧑‍🍳', 'いらっしゃいませ！', 2200);

    /* ---- Scene 6: カゴをレジ台へ ---- */
    hint('カゴを レジだいへ！');
    scene.attach(basket);
    const basketTarget = L.BASKET_PLACE.clone();
    showMarker(basketTarget.clone().add(new T.Vector3(0, 0.9, 0)));
    await armDragOnce([basket], {
      target: () => ({ pos: basketTarget, r: 0.75, ringY: 1.02 }),
      onGrab: () => { reach(hero, 'R', -1.4, 0.2); hideMarker(); }
    });
    hideMarker(); hint(null);
    await moveTo(basket, basketTarget, 0.25, easeOut);
    basket.rotation.set(0, 0, 0);
    SND.play('koto');
    unreach(hero);

    /* ---- Scene 7: スキャン（最大の見せ場） ---- */
    await camGoto('scan', 0.9);
    await scanAll();

    /* ---- Scene 8: 100円を超えていたら戻す ---- */
    if (posState.total > 100) await returnPhase();

    if (scannedItems.length === 0) {
      // ぜんぶ戻した（それも学び）
      await bubble('🧑‍🍳', 'また きてね！', 2400);
      purchasedProducts = [];
    } else {
      /* ---- Scene 9: 支払い ---- */
      await payPhase();
      /* ---- Scene 10: レシート ---- */
      await receiptPhase();
    }

    /* ---- Scene 11: サッカー台で袋詰め ---- */
    let basketToReturn;
    if (scannedItems.length > 0) {
      // 赤いカゴは店員さんが回収（カウンター下へ）
      tw(0.6, k => { basket.position.y = 0.98 - k * 1.2; }).then(() => scene.remove(basket));
      await baggingPhase();
      // 青いカゴ（スキャン済みカゴ）を持って返却場所へ
      basketToReturn = doneBasket;
      scene.attach(doneBasket);
      await tw(0.35, k => {
        doneBasket.position.lerp(hero.position.clone().add(new T.Vector3(0, 0.6, 0.4)), k);
      });
      heroHold(doneBasket, new T.Vector3(-0.24, 0.5, 0.4));
      doneBasket.scale.setScalar(0.85);
      await walkTo(hero, [new T.Vector3(-0.6, 0, 5.4), L.RETURN_STAND], { follow: true, face: -Math.PI / 2 });
    } else {
      // なにも買わなかった日：自分のカゴを返しに行く
      scene.attach(basket);
      await tw(0.4, k => { basket.position.lerp(new T.Vector3(2.6, 0.6, 2.6), k); });
      heroHold(basket, new T.Vector3(0, 0.55, 0.42));
      basketToReturn = basket;
      await walkTo(hero, [new T.Vector3(1.2, 0, 4.4), L.RETURN_STAND], { follow: true, face: -Math.PI / 2 });
    }

    /* ---- Scene 12: カゴ返却 ---- */
    await returnBasketPhase(basketToReturn);

    /* ---- Scene 13: 退店 ---- */
    await walkTo(hero, [new T.Vector3(0, 0, 7.2)], { follow: true });
    await openDoors();
    await walkTo(hero, [new T.Vector3(0, 0, 11.6)], { follow: true });
    closeDoors();
    await finale();
  }

  /* ---------------------------------------------- ドア */
  async function openDoors() {
    SND.play('door');
    await tw(0.9, k => {
      refs.doorL.position.x = -0.63 - k * 1.25;
      refs.doorR.position.x = 0.63 + k * 1.25;
    }, easeIO);
  }
  function closeDoors() {
    tw(0.9, k => {
      refs.doorL.position.x = -1.88 + k * 1.25;
      refs.doorR.position.x = 1.88 - k * 1.25;
    }, easeIO);
  }

  /* ---------------------------------------------- 買い物フェーズ */
  function basketWorldPos() {
    return basket.getWorldPosition(new T.Vector3());
  }

  async function browsePhase() {
    hint('しょうひんに さわってみよう！');
    bubble('👧', 'どれに しようかな〜', 2600);

    let resolveGo;
    const goRegister = new Promise(res => { resolveGo = res; });
    let armedRegister = false;
    let goChip = null;

    async function revealRegister() {
      // レジという「場所」を一度ちゃんと見せる（画面遷移ではなく実在の場所）
      disarmDrag();
      hint(null);
      await camGoto('register', 1.0);
      showMarker(new T.Vector3(L.REGISTER.x, 3.3, L.REGISTER.z), { noRing: true });
      await bubble('👧', 'おわったら あそこの レジに いくよ！', 2200);
      await sleep(700);
      hideMarker();
      await camGoto('shelf', 1.0);
      // 大きな一時ボタン（実際のレジへ歩いて向かうトリガー）
      goChip = document.createElement('button');
      goChip.className = 'go-register-chip';
      goChip.innerHTML = '🛎️ レジへ いく';
      goChip.addEventListener('click', () => { SND.play('pop'); resolveGo(); });
      document.body.appendChild(goChip);
      hint('もっと えらんでも いいよ！');
      armShelf();
      // 3Dのレジ看板をタップしても行ける
      armTap([{ obj: refs.signRegister, pad: 60 }]).then(() => resolveGo());
    }

    function armShelf() {
      const items = shelfSlots.filter(s => s.mesh).map(s => s.mesh);
      dragArm = {
        items,
        target: () => ({ pos: basketWorldPos().add(new T.Vector3(0, 0.1, 0)), r: 0.85, ringY: 1.02 }),
        onGrab: (obj) => {
          hint(null);
          reach(hero, 'R', -1.5, 0.25);
          // 手に取った商品の値札を見せる
          const slot = shelfSlots.find(s => s.mesh === obj);
          if (slot) popPriceAt(obj, slot.plan.product);
        },
        onDrop: async (obj, ok, home) => {
          const slot = shelfSlots.find(s => s.mesh === obj);
          unreach(hero);
          if (ok && basketItems.length < 6) {
            // カゴへ「コトン」
            slot.mesh = null;
            await dropIntoBasket(obj, slot.plan.product);
            restock(slot);
            if (!armedRegister && basketItems.length >= 1) {
              armedRegister = true;
              await revealRegister();
              return;
            }
          } else {
            if (ok) { bubble('👧', 'カゴが いっぱい！', 1800); }
            // 棚へ戻す
            const from = obj.position.clone();
            await tw(0.35, k => { obj.position.lerpVectors(from, slot.pos, k); }, easeOut);
            obj.position.copy(slot.pos);
            obj.quaternion.copy(home.quat);
          }
          if (dragArm !== null || armedRegister) armShelf(); // 残りを再アーム
        }
      };
    }
    armShelf();
    await goRegister;
    disarmDrag();
    disarmTap();
    if (goChip) goChip.remove();
    hideMarker();
    hideBubble();
  }

  /* 値札ポップ（商品を掴んだ時に頭上へ） */
  const activeTags = [];
  function popPriceAt(obj, product) {
    const tag = W.priceTagMesh(product);
    tag.scale.setScalar(1.4);
    scene.add(tag);
    activeTags.push({ tag, obj, t: 0 });
    if (product.price <= 100) SND.play('can'); else SND.play('cant');
    setTimeout(() => {
      const i = activeTags.findIndex(a => a.tag === tag);
      if (i >= 0) { scene.remove(tag); activeTags.splice(i, 1); }
    }, 2200);
  }
  function tickTags() {
    activeTags.forEach(a => {
      const p = a.obj.getWorldPosition(new T.Vector3());
      a.tag.position.set(p.x, p.y + 0.55, p.z);
      a.tag.quaternion.copy(camera.quaternion);
    });
  }

  async function dropIntoBasket(obj, product) {
    const bp = basketWorldPos();
    // 放物線でカゴへ
    const from = obj.position.clone();
    await tw(0.4, k => {
      obj.position.lerpVectors(from, bp, k);
      obj.position.y += Math.sin(k * Math.PI) * 0.5;
      obj.rotation.z = k * 0.4;
    }, t => t);
    SND.play('basket');
    const s = toScreen(bp);
    sparkle(s.x, s.y);
    // カゴの中に実物として残す
    basket.attach(obj);
    const n = basketItems.length;
    obj.position.set((n % 2 === 0 ? -0.13 : 0.13) + (Math.random() - 0.5) * 0.06, 0.1 + Math.floor(n / 2) * 0.1, (Math.random() - 0.5) * 0.16);
    obj.rotation.set(0, Math.random() * Math.PI, 0.15);
    obj.scale.setScalar(0.82);
    basketItems.push({ mesh: obj, product });
    // カゴが弾む
    tw(0.25, k => { basket.scale.y = 1 - Math.sin(k * Math.PI) * 0.1; });
  }

  function restock(slot) {
    setTimeout(() => {
      const m = W.productMesh(slot.plan.product, slot.plan.def);
      m.position.copy(slot.pos);
      m.scale.setScalar(0.01);
      scene.add(m);
      tw(0.4, k => m.scale.setScalar(0.01 + k * 0.99), easeOutBack);
      slot.mesh = m;
      if (dragArm && dragArm.items) dragArm.items.push(m);
    }, 900);
  }

  /* ---------------------------------------------- レジ列 */
  async function queueScene() {
    // 前のお客さんの商品を1つだけスキャン
    const item = W.productMesh(
      { name: 'おきゃくさんの おかいもの', price: 1, category: 'お菓子', id: 'NPC' },
      { shape: 'box', colors: { body: 0x90CAF9, accent: 0x1E88E5 } }
    );
    item.position.set(3.4, 1.0, 0.4);
    scene.add(item);
    await sleep(500);
    await cashierScanMotion(item, null);
    scene.remove(item);
    await sleep(300);
    // お客さん退店
    walkTo(npcQueue, [new T.Vector3(2.0, 0, 4.6), new T.Vector3(0.3, 0, 7.4), new T.Vector3(0.3, 0, 12.5)], { follow: false, speed: 1.9 }).then(() => {
      scene.remove(npcQueue);
    });
    await sleep(600);
  }

  /* ---------------------------------------------- スキャン */
  async function cashierScanMotion(itemMesh, product) {
    const u = refs.register.userData;
    cashier.userData.acting = true;
    // 手を伸ばして取る
    await reach(cashier, 'R', -1.3, 0.3);
    scene.attach(itemMesh);
    itemMesh.scale.setScalar(0.9);
    // 手元（スキャナー上空）へ
    await moveTo(itemMesh, L.SCANNER.clone().add(new T.Vector3(0, 0.3, 0)), 0.45, easeIO, 0.15);
    // くるっと回してバーコードを探す
    const r0 = itemMesh.rotation.y;
    await tw(0.55, k => {
      itemMesh.rotation.y = r0 + k * Math.PI * 2;
      itemMesh.rotation.z = Math.sin(k * Math.PI * 2) * 0.35;
    });
    await tw(0.22, k => { itemMesh.rotation.x = k * Math.PI * 0.5; }); // バーコード面を下へ
    // スキャナーへ通す「ピッ！」
    await moveTo(itemMesh, L.SCANNER.clone().add(new T.Vector3(0, 0.16, 0)), 0.22, easeIO);
    SND.play('scan');
    u.beam.material.opacity = 0.85;
    u.scanGlass.material.emissive = new T.Color(0x2EDD88);
    tw(0.35, k => { u.beam.material.opacity = 0.85 * (1 - k); });
    setTimeout(() => { u.scanGlass.material.emissive = new T.Color(0x1A6985); }, 350);

    if (product) {
      posState.count += 1;
      posState.total += product.price;
      posText();
      // 価格ポップ（100円以下のみ数字、超えは「たかい」）
      popPriceAt(itemMesh, product);
    }
    // スキャン済みカゴへ
    await moveTo(itemMesh, doneBasket.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0.15, 0)), 0.4, easeIO, 0.3);
    if (product) {
      doneBasket.attach(itemMesh);
      const n = scannedItems.length;
      itemMesh.position.set((n % 2 === 0 ? -0.12 : 0.12), 0.08 + Math.floor(n / 2) * 0.09, (Math.random() - 0.5) * 0.14);
      itemMesh.rotation.set(0, Math.random() * Math.PI, 0);
      SND.play('basket');
    }
    await unreach(cashier);
  }

  async function scanAll() {
    // カゴからスキャン待ちへ
    const queue = basketItems.splice(0);
    for (const it of queue) {
      await cashierScanMotion(it.mesh, it.product);
      scannedItems.push(it);
      await sleep(200);
    }
    await sleep(400);
    if (posState.total > 100) {
      await bubble('🧑‍🍳', '100えんより たかくなったよ', 2800);
    } else {
      await bubble('🧑‍🍳', 'ぜんぶで ' + posState.total + 'えん です', 2800);
    }
  }

  /* ---------------------------------------------- 商品を戻す */
  async function returnPhase() {
    await camGoto('register', 0.8);
    await bubble('🧑‍🍳', 'どれを おみせに もどそうか？', 0);

    while (posState.total > 100 && scannedItems.length > 0) {
      // スキャン済み商品をカウンター前面に並べる
      scannedItems.forEach((it, i) => {
        scene.attach(it.mesh);
        const x = 3.3 + i * 0.45;
        it.mesh.position.set(x, 1.02, 1.0);
        it.mesh.rotation.set(0, 0, 0);
        it.mesh.scale.setScalar(0.9);
        popPriceAt(it.mesh, it.product);
      });
      hint('もどす しょうひんを てんいんさんへ！');
      const cashierPos = cashier.position.clone().add(new T.Vector3(0, 1.0, 0.3));
      const returned = await armDragOnce(scannedItems.map(i => i.mesh), {
        target: () => ({ pos: cashierPos, r: 0.9, ringY: 0.05 }),
        onGrab: () => hint(null)
      });
      const idx = scannedItems.findIndex(i => i.mesh === returned);
      const it = scannedItems.splice(idx, 1)[0];
      posState.count -= 1;
      posState.total -= it.product.price;
      posText();
      SND.play('take');
      await bubble('🧑‍🍳', 'これは もどしておくね', 2000);
      await tw(0.4, k => {
        returned.position.lerp(cashierPos, k);
        returned.scale.setScalar(0.9 * (1 - k * 0.9));
      }, easeIO);
      scene.remove(returned);
      await sleep(300);
    }
    hint(null);
    // 残りをスキャン済みカゴへ戻す
    scannedItems.forEach((it, n) => {
      doneBasket.attach(it.mesh);
      it.mesh.position.set((n % 2 === 0 ? -0.12 : 0.12), 0.08 + Math.floor(n / 2) * 0.09, (Math.random() - 0.5) * 0.14);
      it.mesh.rotation.set(0, Math.random() * Math.PI, 0);
    });
    if (scannedItems.length > 0) {
      await bubble('🧑‍🍳', 'これなら かえるね！ ぜんぶで ' + posState.total + 'えん です', 3000);
    }
  }

  /* ---------------------------------------------- 支払い */
  async function payPhase() {
    await camGoto('pay', 0.9);
    hint('100えんだまを トレーに おこう！');
    walletBump();

    // 財布から100円玉（DOM）が出る
    const payCoinWrap = document.createElement('div');
    payCoinWrap.className = 'pay-coin';
    payCoinWrap.appendChild(COINS.coinEl(100));
    // 画面下・中央（財布のそば）から出す → トレーへ持ち上げる動作になる
    const homeX = window.innerWidth * 0.5;
    const homeY = window.innerHeight - 150;
    payCoinWrap.style.left = homeX + 'px';
    payCoinWrap.style.top = homeY + 'px';
    document.body.appendChild(payCoinWrap);
    walletCoins.length = 0; // 財布から出した
    walletHUD();

    // トレーへドラッグ（DOM→3D投影ドロップ）
    await new Promise(res => {
      payCoinWrap.addEventListener('pointerdown', e => {
        e.preventDefault();
        payCoinWrap.setPointerCapture(e.pointerId);
        payCoinWrap.style.animation = 'none';
        const move = ev => {
          payCoinWrap.style.left = ev.clientX + 'px';
          payCoinWrap.style.top = ev.clientY + 'px';
          payCoinWrap.style.transform = 'translate(-50%,-50%) scale(1.1)';
        };
        const up = ev => {
          payCoinWrap.removeEventListener('pointermove', move);
          const trayS = toScreen(L.TRAY);
          const d = Math.hypot(ev.clientX - trayS.x, ev.clientY - trayS.y);
          if (d < 110) {
            payCoinWrap.remove();
            res();
          } else {
            // もとの位置へ戻る
            payCoinWrap.style.left = homeX + 'px';
            payCoinWrap.style.top = homeY + 'px';
            payCoinWrap.style.animation = '';
            payCoinWrap.style.transform = '';
          }
        };
        payCoinWrap.addEventListener('pointermove', move);
        payCoinWrap.addEventListener('pointerup', up, { once: true });
      });
    });
    hint(null);

    // 3Dの100円玉がトレーに落ちる「チャリン」
    const c = coin3D(100);
    c.position.copy(L.TRAY).add(new T.Vector3(0, 0.4, 0));
    scene.add(c);
    await tw(0.3, k => {
      c.position.y = L.TRAY.y + 0.4 - k * 0.37;
      c.rotation.z = k * 0.5;
    }, t => t * t);
    c.rotation.z = 0;
    SND.play('coin');
    const s1 = toScreen(L.TRAY);
    sparkle(s1.x, s1.y);
    await bubble('🧑‍🍳', '100えん、おあずかりします', 2400);

    // 店員が受け取る
    await reach(cashier, 'R', -1.2, 0.3);
    await moveTo(c, cashier.position.clone().add(new T.Vector3(0, 1.1, 0.25)), 0.4, easeIO, 0.2);
    scene.remove(c);
    await unreach(cashier);

    // おつり
    const change = 100 - posState.total;
    purchasedProducts = scannedItems.map(i => i.product);
    if (change > 0) {
      const changeCoins = COINS.breakdown(change);
      await bubble('🧑‍🍳', 'おつりは ' + change + 'えんです', 2600);
      const coinMeshes = [];
      for (let i = 0; i < changeCoins.length; i++) {
        const cc = coin3D(changeCoins[i]);
        const off = new T.Vector3((i % 3 - 1) * 0.11, 0.03 + Math.floor(i / 3) * 0.03, (Math.floor(i / 3) % 2 - 0.5) * 0.1);
        cc.position.copy(L.TRAY).add(off).add(new T.Vector3(0, 0.35, 0));
        scene.add(cc);
        await tw(0.22, k => { cc.position.y -= k * 0.32; }, t => t * t);
        SND.play('coin');
        coinMeshes.push(cc);
      }
      // おつりを財布へドラッグ（3D→DOM財布）
      hint('おつりを おさいふへ！');
      await collectCoins(coinMeshes, changeCoins);
      hint(null);
      walletBump();
    }
  }

  /* 3D硬貨 → DOM財布 へのドラッグ回収 */
  function collectCoins(coinMeshes, values) {
    return new Promise(resolve => {
      let remaining = coinMeshes.length;
      dragArm = {
        items: coinMeshes.slice(),
        target: () => null, // 3D内ドロップ先なし（財布はDOM）
        onGrab: (obj) => {
          $walletHud.classList.add('drop-hot');
          const homePos = obj.position.clone();
          obj.visible = false;
          // DOMゴースト
          const ghost = document.createElement('div');
          ghost.className = 'coin-ghost';
          ghost.appendChild(COINS.coinEl(obj.userData.value));
          document.body.appendChild(ghost);
          const move = ev => {
            ghost.style.left = ev.clientX + 'px';
            ghost.style.top = ev.clientY + 'px';
          };
          const up = ev => {
            window.removeEventListener('pointermove', move);
            ghost.remove();
            $walletHud.classList.remove('drop-hot');
            obj.position.copy(homePos); // 3D位置はトレー上へ戻す
            const r = $walletHud.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const near = ev.clientX > r.left - 70 && ev.clientX < r.right + 70 && ev.clientY < r.bottom + 70;
            if (near) {
              SND.play('coin');
              walletCoins.push(obj.userData.value);
              walletCoins.sort((a, b) => b - a);
              walletHUD();
              walletBump();
              scene.remove(obj);
              const i = dragArm.items.indexOf(obj);
              if (i >= 0) dragArm.items.splice(i, 1);
              remaining -= 1;
              sparkle(cx, cy);
              if (remaining === 0) { dragArm = null; dragging = null; resolve(); }
            } else {
              obj.visible = true;
            }
            dragging = null;
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up, { once: true });
        },
        onDrop: () => {} // 実処理はDOM側のpointerupで行う
      };
    });
  }

  /* ---------------------------------------------- レシート */
  async function receiptPhase() {
    const u = refs.register.userData;
    SND.play('receipt');
    // 紙が伸びる
    const paper = new T.Mesh(
      new T.PlaneGeometry(0.13, 0.3),
      new T.MeshBasicMaterial({ color: 0xFFFFFF, side: T.DoubleSide })
    );
    paper.position.copy(u.printer.getWorldPosition(new T.Vector3())).add(new T.Vector3(0, 0.08, 0.1));
    paper.rotation.x = -0.25;
    paper.scale.y = 0.05;
    scene.add(paper);
    await tw(0.6, k => {
      paper.scale.y = 0.05 + k * 0.95;
      paper.position.y += k * 0.002;
    });
    hint('レシートを タップ！');
    showMarker(paper.position.clone().add(new T.Vector3(0, 0.45, 0)));
    await armTap([{ obj: paper, pad: 60 }]);
    hideMarker(); hint(null);
    SND.play('take');
    await reach(hero, 'R', -1.4, 0.25);
    await moveTo(paper, hero.position.clone().add(new T.Vector3(0.15, 1.0, 0.3)), 0.4, easeIO, 0.25);
    const sp = toScreen(paper.position);
    sparkle(sp.x, sp.y);
    scene.remove(paper);
    await unreach(hero);
    await bubble('🧑‍🍳', 'ありがとうございました！', 2400);
  }

  /* ---------------------------------------------- 袋詰め */
  function heroHold(obj, offset) {
    hero.add(obj);
    obj.position.copy(offset);
    obj.rotation.set(0, 0, 0);
  }

  async function baggingPhase() {
    // スキャン済みカゴを持ってサッカー台へ
    scene.attach(doneBasket);
    await tw(0.5, k => {
      doneBasket.position.lerp(new T.Vector3(2.6, 0.7, 2.2), k);
    });
    heroHold(doneBasket, new T.Vector3(0, 0.5, 0.45));
    doneBasket.scale.setScalar(0.85);
    await walkTo(hero, [new T.Vector3(1.6, 0, 3.4), L.SACKER_STAND], { follow: true, face: 0 });
    // カゴを台に置く
    scene.attach(doneBasket);
    doneBasket.scale.setScalar(1);
    await moveTo(doneBasket, new T.Vector3(L.SACKER.x - 0.45, 0.88, L.SACKER.z), 0.4, easeOut, 0.2);
    doneBasket.rotation.set(0, 0, 0);
    SND.play('koto');
    await camGoto('sacker', 0.9);

    // 商品を1つずつ袋へ
    hint('しょうひんを ふくろへ いれよう！');
    const bagWorld = () => bag.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0.25, 0));
    let packed = 0;
    while (scannedItems.length > 0) {
      const meshes = scannedItems.map(i => i.mesh);
      const dropped = await armDragOnce(meshes, {
        target: () => ({ pos: bagWorld(), r: 0.55, ringY: bagWorld().y + 0.25 }),
        onGrab: () => { hint(null); reach(hero, 'L', -1.3, 0.2); }
      });
      const idx = scannedItems.findIndex(i => i.mesh === dropped);
      const it = scannedItems.splice(idx, 1)[0];
      unreach(hero);
      // 袋の中へ
      SND.play('rustle');
      const inside = bag.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0.12 + packed * 0.07, 0));
      await tw(0.3, k => { dropped.position.lerp(inside, k); }, t => t * t);
      bag.attach(dropped);
      dropped.scale.setScalar(0.62);
      // 袋がふくらむ
      packed += 1;
      tw(0.3, k => {
        const b = 1 + Math.sin(k * Math.PI) * 0.12;
        bag.scale.set(b, 1 + packed * 0.02, b);
      });
      purchasedMeshKeep.push(dropped);
    }
    hint(null);
    // 主人公が袋を持つ
    await sleep(300);
    scene.attach(bag);
    await moveTo(bag, hero.position.clone().add(new T.Vector3(0.3, 0.55, 0.3)), 0.45, easeIO, 0.25);
    heroHold(bag, new T.Vector3(0.26, 0.45, 0.2));
    bag.scale.setScalar(0.8);
    SND.play('rustle');
    bubble('👧', 'できた〜！', 1800);
  }
  const purchasedMeshKeep = [];

  /* ---------------------------------------------- カゴ返却 */
  async function returnBasketPhase(useBasket) {
    await camGoto('returnP', 0.9);
    // カゴを返しやすい位置へ（主人公の手元）
    scene.attach(useBasket);
    useBasket.rotation.set(0, 0, 0);
    useBasket.scale.setScalar(1);
    useBasket.position.set(hero.position.x - 0.4, 0.6, hero.position.z + 0.2);
    hint('カゴを かえそう！');
    const stackTop = () => {
      const b = new T.Box3().setFromObject(refs.returnStack);
      return new T.Vector3(L.RETURN.x, b.max.y + 0.06, L.RETURN.z);
    };
    showMarker(stackTop().add(new T.Vector3(0, 0.7, 0)));
    await armDragOnce([useBasket], {
      target: () => ({ pos: stackTop(), r: 0.8, ringY: stackTop().y + 0.03 }),
      onGrab: () => { hideMarker(); hint(null); }
    });
    hideMarker(); hint(null);
    await moveTo(useBasket, stackTop(), 0.25, t => t * t);
    useBasket.rotation.set(0, 0, 0);
    SND.play('kakon');
    // スタックが弾む
    tw(0.3, k => {
      refs.returnStack.scale.y = 1 - Math.sin(k * Math.PI) * 0.06;
    });
    refs.returnStack.attach(useBasket);
    const st = toScreen(stackTop());
    sparkle(st.x, st.y);
    await sleep(300);
  }

  /* ---------------------------------------------- 終幕 */
  async function finale() {
    await camGoto('finale', 1.2);
    hero.rotation.y = 0; // カメラ（観客）の方を向く

    // 買ったものを3Dで並べる
    purchasedMeshKeep.forEach((m, i) => {
      scene.attach(m);
      const n = purchasedMeshKeep.length;
      const x = (i - (n - 1) / 2) * 0.8;
      m.rotation.set(0, 0, 0);
      m.scale.setScalar(1.15);
      const from = m.position.clone();
      const to = new T.Vector3(x, 2.0, 13.0);
      tw(0.8, k => {
        m.position.lerpVectors(from, to, k);
      }, easeOutBack);
      m.userData.finaleSpin = true;
    });

    const fin = document.createElement('div');
    fin.className = 'finale';
    const bought = purchasedProducts.length;
    const coinsHTML = walletCoins.length
      ? walletCoins.map(() => '').join('')
      : '';
    fin.innerHTML =
      '<div class="f-caption">' + (bought > 0 ? 'きょうの おかいもの！' : 'きょうは かわなかったよ') + '</div>' +
      '<div class="f-coins"><span>おさいふ：</span><span class="fc-coins"></span></div>' +
      '<button class="btn-again">もういちど あそぶ</button>';
    $overlay.appendChild(fin);
    const fc = fin.querySelector('.fc-coins');
    if (walletCoins.length === 0) {
      fc.innerHTML = '<span>おかね ぜんぶ つかった！</span>';
    } else {
      walletCoins.forEach(v => fc.appendChild(COINS.coinEl(v, { tiny: true })));
      const total = walletCoins.reduce((a, b) => a + b, 0);
      const lbl = document.createElement('span');
      lbl.textContent = ' のこり ' + total + 'えん';
      fc.appendChild(lbl);
    }
    SND.play('tada');
    sparkle(window.innerWidth / 2, window.innerHeight / 3);
    fin.querySelector('.btn-again').addEventListener('click', () => location.reload());
  }

  /* ============================================== 常時アニメーション */
  let npcDir = 1;
  const clock = new T.Clock();

  function animate() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    tickTweens(dt);
    tickTags();

    // アイドル演技（世界は静止しない）
    [hero, cashier, npcQueue].forEach(p => {
      if (p && p.parent && !p.userData.acting) W.idleAnim(p, time);
    });
    // 遠くを歩く客
    if (npcWalker) {
      npcWalker.position.z += dt * 0.55 * npcDir;
      if (npcWalker.position.z > 4.5) { npcDir = -1; npcWalker.rotation.y = Math.PI; }
      if (npcWalker.position.z < -8) { npcDir = 1; npcWalker.rotation.y = 0; }
      W.walkAnim(npcWalker, dt, 0.5);
    }
    // 看板ゆれ・マーカー
    if (refs) {
      refs.signOkashi.position.y = 2.5 + Math.sin(time * 1.3) * 0.05;
      refs.signRegister.position.y = 2.6 + Math.sin(time * 1.1 + 1) * 0.05;
      refs.signOkashi.userData.plate.quaternion.copy(camera.quaternion);
      refs.signRegister.userData.plate.quaternion.copy(camera.quaternion);
      // 冷蔵ケースの光ゆらぎ・レジランプ
      refs.freezerGlow.material.emissiveIntensity = 0.9 + Math.sin(time * 2.2) * 0.15;
      refs.register.userData.lamp.material.emissiveIntensity = 0.9 + Math.sin(time * 3) * 0.25;
    }
    if (marker.visible) {
      marker.position.copy(markerBase);
      marker.position.y += Math.sin(time * 4) * 0.08;
      markerRing.scale.setScalar(1 + Math.sin(time * 4) * 0.12);
    }
    if (dropRing.visible) {
      dropRing.material.opacity = 0.7 + Math.sin(time * 6) * 0.25;
    }
    // 終幕の商品スピン
    scene.traverse(o => {
      if (o.userData && o.userData.finaleSpin) o.rotation.y += dt * 1.2;
    });

    tickCamera(dt);
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(animate);

  /* ============================================== 起動 */
  SND.setEnabled(true);
  document.addEventListener('pointerdown', function unlock() {
    SND.unlock();
    document.removeEventListener('pointerdown', unlock);
  });

  DATA.loadDB().then(({ products }) => {
    if (!products || products.length === 0) {
      document.getElementById('btn-start').textContent = 'データが よみこめません';
      return;
    }
    main().catch(e => console.error('flow error', e));
  });

  /* 開発・自動テスト用の内部フック（ゲームプレイには不使用） */
  window.__T = {
    toScreen, L, camera, scene,
    get refs() { return refs; },
    get hero() { return hero; },
    get cashier() { return cashier; },
    get shelfSlots() { return shelfSlots; },
    get basket() { return basket; },
    get doneBasket() { return doneBasket; },
    get basketItems() { return basketItems; },
    get scannedItems() { return scannedItems; },
    get posState() { return posState; },
    get walletCoins() { return walletCoins; },
    get bag() { return bag; },
    get tapArm() { return tapArm; },
    get dragArm() { return dragArm; }
  };
})();
