/* =========================================================
 * world.js — 『おかいものシアター』舞台装置
 *
 * 店・棚・商品・キャラクター・レジ・サッカー台など、
 * すべてThree.jsプリミティブによるLow-polyプロップとして構築する。
 * 商品は10種前後の形状タイプ（stick/pouch/bar/box/cup/bigpouch…）を
 * 再利用し、ラベルはcanvasテクスチャ。将来実テクスチャへ差し替え可能。
 *
 * モバイル配慮: Lambert材質・影なし（擬似ブロブ影）・低ポリ・共有マテリアル。
 * ========================================================= */
(function () {
  'use strict';

  const T = THREE;

  /* ---------------------------------------------- 店内レイアウト定数 */
  const L = {
    DOOR: new T.Vector3(0, 0, 9),
    OUTSIDE: new T.Vector3(0, 0, 12.8),
    INSIDE: new T.Vector3(0, 0, 7.0),
    CART_STATION: new T.Vector3(-3.6, 0, 6.2),
    CART_GRAB: new T.Vector3(-2.7, 0, 6.2),
    SHELF: new T.Vector3(-4.5, 0, -4.2),      // お菓子棚（前面は+z向き）
    SHELF_FRONT: new T.Vector3(-5.55, 0, -2.45), // 主人公が立つ位置（棚を隠さない左寄り）
    CART_PARK: new T.Vector3(-3.95, 0, -1.5),    // カートを停める位置（縦画面でも見える）
    QUEUE: new T.Vector3(3.2, 0, 4.2),         // レジ待ち位置
    PAY: new T.Vector3(3.2, 0, 1.9),           // 会計位置
    REGISTER: new T.Vector3(4.2, 0, 0.5),      // カウンター中心
    TRAY: new T.Vector3(3.55, 1.0, 0.92),      // 支払いトレー上面
    SCANNER: new T.Vector3(4.05, 1.0, 0.55),
    DONE_BASKET: new T.Vector3(5.05, 0.98, 0.5),
    BASKET_PLACE: new T.Vector3(3.15, 0.98, 0.55),
    SACKER: new T.Vector3(0.6, 0, 5.0),        // サッカー台
    SACKER_STAND: new T.Vector3(0.6, 0, 3.8),
    RETURN: new T.Vector3(-2.9, 0, 6.2),       // カゴ返却
    RETURN_STAND: new T.Vector3(-1.9, 0, 6.2)
  };

  /* ---------------------------------------------- 共有マテリアル */
  const MAT = {};
  function mat(color, opts) {
    const key = color + JSON.stringify(opts || {});
    if (!MAT[key]) MAT[key] = new T.MeshLambertMaterial(Object.assign({ color }, opts));
    return MAT[key];
  }

  function box(w, h, d, color, opts) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color, opts));
    return m;
  }
  function cyl(rt, rb, h, color, seg, opts) {
    return new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 10), mat(color, opts));
  }
  function sph(r, color, seg) {
    return new T.Mesh(new T.SphereGeometry(r, seg || 12, seg || 10), mat(color));
  }

  /* ---------------------------------------------- canvasテクスチャ */
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new T.CanvasTexture(c);
    tex.anisotropy = 2;
    return tex;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 商品ラベル（絵文字＋ひらがな短縮名）— 識別用プレースホルダー */
  function labelTex(product, bg) {
    return canvasTex(128, 128, (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      roundRect(ctx, 10, 10, w - 20, h - 20, 18);
      ctx.fill();
      ctx.font = '56px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(VIS.emojiFor(product), w / 2, h / 2 - 12);
      ctx.fillStyle = '#4A3A2C';
      ctx.font = 'bold 17px sans-serif';
      const name = VIS.shortName(product, 7);
      ctx.fillText(name, w / 2, h - 26);
    });
  }

  /* バーコード（スキャン面） */
  let _barcodeTex = null;
  function barcodeTex() {
    if (_barcodeTex) return _barcodeTex;
    _barcodeTex = canvasTex(64, 40, (ctx, w, h) => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#222';
      let x = 6;
      while (x < w - 6) {
        const bw = 1 + Math.floor(Math.random() * 3);
        ctx.fillRect(x, 6, bw, h - 12);
        x += bw + 1 + Math.floor(Math.random() * 3);
      }
    });
    return _barcodeTex;
  }

  /* 値札プレート（「16えん」/「100えんより たかい」） */
  function priceTagMesh(product) {
    const cheap = product.price <= 100;
    const tex = canvasTex(256, 128, (ctx, w, h) => {
      ctx.fillStyle = cheap ? '#FFF8E1' : '#EDE7F6';
      roundRect(ctx, 4, 4, w - 8, h - 8, 22);
      ctx.fill();
      ctx.strokeStyle = cheap ? '#F5B93D' : '#B39DDB';
      ctx.lineWidth = 7;
      roundRect(ctx, 8, 8, w - 16, h - 16, 18);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#4A3A2C';
      if (cheap) {
        ctx.font = '900 62px sans-serif';
        ctx.fillText(product.price + 'えん', w / 2, h / 2 + 2);
      } else {
        ctx.fillStyle = '#7E57C2';
        ctx.font = '900 40px sans-serif';
        ctx.fillText('100えんより', w / 2, h / 2 - 24);
        ctx.fillText('たかい', w / 2, h / 2 + 26);
      }
    });
    const m = new T.Mesh(
      new T.PlaneGeometry(0.52, 0.26),
      new T.MeshBasicMaterial({ map: tex, transparent: true })
    );
    return m;
  }

  /* 看板（売場ランドマーク・レジ） */
  function signMesh(emoji, text, color) {
    const tex = canvasTex(512, 256, (ctx, w, h) => {
      ctx.fillStyle = color;
      roundRect(ctx, 6, 6, w - 12, h - 12, 46);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      roundRect(ctx, 18, 18, w - 36, h - 36, 36);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '110px sans-serif';
      ctx.fillText(emoji, w / 2, h / 2 - 42);
      ctx.fillStyle = '#3E3428';
      ctx.font = '900 72px sans-serif';
      ctx.fillText(text, w / 2, h / 2 + 58);
    });
    const g = new T.Group();
    const plate = new T.Mesh(
      new T.PlaneGeometry(1.9, 0.95),
      new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.DoubleSide })
    );
    g.add(plate);
    g.userData.plate = plate;
    return g;
  }

  /* ---------------------------------------------- 商品モデル（形状タイプ） */
  function productMesh(product, def) {
    const g = new T.Group();
    const bodyColor = def.colors.body;
    const accColor = def.colors.accent;
    const lt = labelTex(product, '#' + accColor.toString(16).padStart(6, '0'));
    const labelMat = new T.MeshLambertMaterial({ map: lt });
    let body, dims;

    switch (def.shape) {
      case 'stick': { // 細長い駄菓子（うまい棒）
        body = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.5, 8), mat(bodyColor));
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.06;
        const wrapL = sph(0.055, accColor, 8); wrapL.position.set(-0.26, 0.06, 0); wrapL.scale.x = 0.5;
        const wrapR = sph(0.055, accColor, 8); wrapR.position.set(0.26, 0.06, 0); wrapR.scale.x = 0.5;
        const lbl = new T.Mesh(new T.PlaneGeometry(0.26, 0.26), labelMat);
        lbl.position.set(0, 0.07, 0.056);
        g.add(body, wrapL, wrapR, lbl);
        dims = { w: 0.56, h: 0.14, d: 0.12 };
        break;
      }
      case 'pouch': { // 小袋スナック
        body = box(0.3, 0.36, 0.1, bodyColor);
        body.position.y = 0.18;
        body.scale.set(1, 1, 1);
        const crimp = box(0.32, 0.05, 0.03, accColor);
        crimp.position.y = 0.375;
        const lbl = new T.Mesh(new T.PlaneGeometry(0.26, 0.26), labelMat);
        lbl.position.set(0, 0.19, 0.052);
        g.add(body, crimp, lbl);
        dims = { w: 0.32, h: 0.4, d: 0.12 };
        break;
      }
      case 'bar': { // チョコバー
        body = box(0.26, 0.07, 0.13, bodyColor);
        body.position.y = 0.035;
        const stripe = box(0.075, 0.075, 0.135, accColor);
        stripe.position.set(-0.07, 0.035, 0);
        const lbl = new T.Mesh(new T.PlaneGeometry(0.16, 0.1), labelMat);
        lbl.rotation.x = -Math.PI / 2;
        lbl.position.set(0.04, 0.074, 0);
        g.add(body, stripe, lbl);
        dims = { w: 0.28, h: 0.09, d: 0.15 };
        break;
      }
      case 'box': { // 小箱（グミ等）
        body = box(0.26, 0.3, 0.1, bodyColor);
        body.position.y = 0.15;
        const top = box(0.27, 0.05, 0.11, accColor);
        top.position.y = 0.285;
        const lbl = new T.Mesh(new T.PlaneGeometry(0.22, 0.22), labelMat);
        lbl.position.set(0, 0.15, 0.052);
        g.add(body, top, lbl);
        dims = { w: 0.28, h: 0.32, d: 0.12 };
        break;
      }
      case 'cup': { // カップ（ゼリー等）
        body = cyl(0.11, 0.085, 0.17, bodyColor, 12);
        body.position.y = 0.085;
        const lid = cyl(0.115, 0.115, 0.02, accColor, 12);
        lid.position.y = 0.18;
        const lbl = new T.Mesh(new T.PlaneGeometry(0.16, 0.13), labelMat);
        lbl.position.set(0, 0.1, 0.108);
        g.add(body, lid, lbl);
        dims = { w: 0.23, h: 0.2, d: 0.23 };
        break;
      }
      case 'bigpouch':
      default: { // 連包パウチ
        body = box(0.36, 0.44, 0.14, bodyColor);
        body.position.y = 0.22;
        const crimp = box(0.38, 0.06, 0.04, accColor);
        crimp.position.y = 0.46;
        const lbl = new T.Mesh(new T.PlaneGeometry(0.3, 0.3), labelMat);
        lbl.position.set(0, 0.24, 0.072);
        g.add(body, crimp, lbl);
        dims = { w: 0.38, h: 0.5, d: 0.16 };
        break;
      }
    }

    // バーコード面（背面下部）— スキャン時に店員がここを探す
    const bc = new T.Mesh(
      new T.PlaneGeometry(0.14, 0.09),
      new T.MeshBasicMaterial({ map: barcodeTex() })
    );
    bc.rotation.y = Math.PI;
    bc.position.set(0, dims.h * 0.3, -dims.d / 2 - 0.002);
    g.add(bc);

    g.userData = { product, def, dims };
    return g;
  }

  /* ---------------------------------------------- カゴ */
  function basketMesh(color) {
    const g = new T.Group();
    const c = color || 0xE05B4B;
    const bottom = box(0.62, 0.04, 0.42, c);
    bottom.position.y = 0.02;
    g.add(bottom);
    const wallMat = mat(c, { transparent: true, opacity: 0.92 });
    function wall(w, h, d, x, z, tiltX, tiltZ) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, 0.16, z);
      m.rotation.x = tiltX; m.rotation.z = tiltZ;
      g.add(m);
    }
    wall(0.68, 0.3, 0.03, 0, 0.22, -0.16, 0);
    wall(0.68, 0.3, 0.03, 0, -0.22, 0.16, 0);
    wall(0.03, 0.3, 0.46, 0.33, 0, 0, -0.16);
    wall(0.03, 0.3, 0.46, -0.33, 0, 0, 0.16);
    // 持ち手
    const handleMat = mat(0x8C3B30);
    const h1 = new T.Mesh(new T.TorusGeometry(0.16, 0.02, 6, 12, Math.PI), handleMat);
    h1.position.set(0, 0.32, 0.2);
    const h2 = h1.clone();
    h2.position.z = -0.2;
    g.add(h1, h2);
    g.userData.isBasket = true;
    return g;
  }

  /* ---------------------------------------------- カート */
  function cartMesh() {
    const g = new T.Group();
    const frame = mat(0x9FB6C6);
    // 下フレーム
    const base = new T.Mesh(new T.BoxGeometry(0.7, 0.04, 0.5), frame);
    base.position.y = 0.28;
    g.add(base);
    // 支柱
    [[-0.32, 0.22], [0.32, 0.22], [-0.32, -0.22], [0.32, -0.22]].forEach(([x, z]) => {
      const p = new T.Mesh(new T.BoxGeometry(0.04, 0.55, 0.04), frame);
      p.position.set(x, 0.55, z);
      g.add(p);
    });
    // カゴ受け
    const rack = new T.Mesh(new T.BoxGeometry(0.74, 0.03, 0.54), frame);
    rack.position.y = 0.82;
    g.add(rack);
    // 取っ手
    const handle = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.6, 8), mat(0xE05B4B));
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0.98, 0.42);
    g.add(handle);
    [[-0.28], [0.28]].forEach(([x]) => {
      const bar = new T.Mesh(new T.BoxGeometry(0.035, 0.22, 0.035), frame);
      bar.position.set(x, 0.9, 0.4);
      bar.rotation.x = 0.35;
      g.add(bar);
    });
    // 車輪
    const wheels = [];
    [[-0.3, 0.2], [0.3, 0.2], [-0.3, -0.2], [0.3, -0.2]].forEach(([x, z]) => {
      const w = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.045, 10), mat(0x37474F));
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.07, z);
      g.add(w);
      wheels.push(w);
    });
    g.userData.wheels = wheels;
    g.userData.handle = handle;
    return g;
  }

  /* ---------------------------------------------- 人物（低ポリ） */
  function person(opts) {
    const o = Object.assign({
      height: 1.15, skin: 0xFFD8B5, shirt: 0xFF8FAB, pants: 0xFFE082,
      hair: 0x6D4C41, cap: null, apron: null, hairStyle: 'bob'
    }, opts || {});
    const s = o.height / 1.15;
    const g = new T.Group();

    // 脚
    const legL = new T.Group(), legR = new T.Group();
    [legL, legR].forEach((leg, i) => {
      const l = new T.Mesh(new T.CylinderGeometry(0.055 * s, 0.05 * s, 0.34 * s, 8), mat(o.pants));
      l.position.y = -0.17 * s;
      const shoe = box(0.11 * s, 0.06 * s, 0.16 * s, 0x795548);
      shoe.position.set(0, -0.36 * s, 0.03 * s);
      leg.add(l, shoe);
      leg.position.set((i === 0 ? -0.08 : 0.08) * s, 0.4 * s, 0);
      g.add(leg);
    });

    // 胴体
    const body = new T.Mesh(new T.CylinderGeometry(0.16 * s, 0.19 * s, 0.42 * s, 12), mat(o.shirt));
    body.position.y = 0.6 * s;
    g.add(body);
    if (o.apron) {
      const ap = box(0.3 * s, 0.34 * s, 0.02, o.apron);
      ap.position.set(0, 0.56 * s, 0.17 * s);
      g.add(ap);
    }

    // 腕（肩から）
    const armL = new T.Group(), armR = new T.Group();
    [armL, armR].forEach((arm, i) => {
      const a = new T.Mesh(new T.CylinderGeometry(0.045 * s, 0.04 * s, 0.32 * s, 8), mat(o.shirt));
      a.position.y = -0.15 * s;
      const hand = sph(0.05 * s, o.skin, 8);
      hand.position.y = -0.32 * s;
      arm.add(a, hand);
      arm.position.set((i === 0 ? -0.2 : 0.2) * s, 0.78 * s, 0);
      arm.userData.hand = hand;
      g.add(arm);
    });

    // 頭
    const headG = new T.Group();
    const head = sph(0.17 * s, o.skin, 14);
    headG.add(head);
    // 目・ほっぺ・口
    [-0.06, 0.06].forEach(x => {
      const eye = sph(0.02 * s, 0x37322D, 6);
      eye.position.set(x * s, 0.02 * s, 0.155 * s);
      headG.add(eye);
      const cheek = sph(0.022 * s, 0xF8A8A0, 6);
      cheek.position.set(x * 1.8 * s, -0.045 * s, 0.14 * s);
      headG.add(cheek);
    });
    const mouth = new T.Mesh(new T.TorusGeometry(0.035 * s, 0.008 * s, 5, 10, Math.PI), mat(0xC2564A));
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.045 * s, 0.155 * s);
    headG.add(mouth);
    // 髪
    if (o.hairStyle === 'bob') {
      const hair = sph(0.185 * s, o.hair, 14);
      hair.scale.set(1, 0.85, 1);
      hair.position.y = 0.045 * s;
      const back = sph(0.18 * s, o.hair, 12);
      back.scale.set(0.95, 1, 0.6);
      back.position.set(0, -0.02 * s, -0.09 * s);
      headG.add(hair, back);
    } else {
      const hair = sph(0.18 * s, o.hair, 12);
      hair.scale.set(1, 0.6, 1);
      hair.position.y = 0.09 * s;
      headG.add(hair);
    }
    if (o.cap) {
      const capTop = new T.Mesh(new T.SphereGeometry(0.185 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), mat(o.cap));
      capTop.position.y = 0.07 * s;
      const brim = cyl(0.19 * s, 0.19 * s, 0.02 * s, o.cap, 12);
      brim.position.set(0, 0.1 * s, 0.09 * s);
      brim.rotation.x = 0.15;
      headG.add(capTop, brim);
    }
    headG.position.y = 1.0 * s;
    g.add(headG);

    // 擬似影
    const shadow = new T.Mesh(
      new T.CircleGeometry(0.3 * s, 16),
      new T.MeshBasicMaterial({ color: 0x33291F, transparent: true, opacity: 0.18 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    g.add(shadow);

    g.userData = {
      legL, legR, armL, armR, headG, body,
      handL: armL.userData.hand, handR: armR.userData.hand,
      s,
      walkPhase: 0
    };
    return g;
  }

  /* 歩行サイクル（毎フレーム呼ぶ） */
  function walkAnim(p, dt, speedFactor) {
    const u = p.userData;
    u.walkPhase += dt * 9 * (speedFactor || 1);
    const a = Math.sin(u.walkPhase) * 0.55;
    u.legL.rotation.x = a;
    u.legR.rotation.x = -a;
    u.armL.rotation.x = -a * 0.7;
    u.armR.rotation.x = a * 0.7;
    p.position.y = Math.abs(Math.sin(u.walkPhase)) * 0.03;
  }
  function idleAnim(p, time) {
    const u = p.userData;
    u.legL.rotation.x *= 0.9;
    u.legR.rotation.x *= 0.9;
    u.armL.rotation.x *= 0.9;
    u.armR.rotation.x *= 0.9;
    p.position.y = Math.sin(time * 1.7 + (u.idleSeed || 0)) * 0.012;
    u.headG.rotation.z = Math.sin(time * 0.8 + (u.idleSeed || 0)) * 0.05;
  }

  /* ---------------------------------------------- 棚（ゴンドラ） */
  function shelfMesh(opts) {
    const o = Object.assign({ w: 3.0, h: 1.55, d: 0.7, color: 0xF3F0E8, boards: [0.38, 0.8, 1.22] }, opts || {});
    const g = new T.Group();
    const back = box(o.w, o.h, 0.05, 0xDDD6C8);
    back.position.set(0, o.h / 2, -o.d / 2 + 0.02);
    g.add(back);
    [[-1], [1]].forEach(([sx]) => {
      const side = box(0.05, o.h, o.d, o.color);
      side.position.set(sx * (o.w / 2 - 0.02), o.h / 2, 0);
      g.add(side);
    });
    const base = box(o.w, 0.16, o.d, 0xCFC8B8);
    base.position.y = 0.08;
    g.add(base);
    o.boards.forEach(y => {
      const b = box(o.w - 0.08, 0.035, o.d - 0.08, o.color);
      b.position.y = y;
      g.add(b);
      // 値札レール
      const rail = box(o.w - 0.08, 0.07, 0.02, 0xB9CEDD);
      rail.position.set(0, y - 0.045, o.d / 2 - 0.045);
      g.add(rail);
    });
    g.userData.boards = o.boards;
    g.userData.dims = o;
    return g;
  }

  /* 背景棚（遠景用・カラフルな商品ブロックをインスタンシング） */
  function bgShelf(seed) {
    const g = shelfMesh({ w: 3.4 });
    const rnd = mulberry(seed);
    const geo = new T.BoxGeometry(0.26, 0.3, 0.18);
    const count = 3 * 9;
    const inst = new T.InstancedMesh(geo, new T.MeshLambertMaterial(), count);
    const palette = [0xF08A24, 0xE53935, 0x8BC34A, 0x42A5F5, 0xF5C542, 0xAB47BC, 0x26A69A, 0xFF7043];
    const m4 = new T.Matrix4();
    let i = 0;
    g.userData.boards.forEach(y => {
      for (let k = 0; k < 9; k++) {
        const x = -1.45 + k * 0.36 + (rnd() - 0.5) * 0.05;
        m4.makeTranslation(x, y + 0.17, 0.05 + (rnd() - 0.5) * 0.1);
        inst.setMatrixAt(i, m4);
        inst.setColorAt(i, new T.Color(palette[Math.floor(rnd() * palette.length)]));
        i++;
      }
    });
    inst.instanceMatrix.needsUpdate = true;
    g.add(inst);
    return g;
  }

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------------------------------------- レジ */
  function registerMesh() {
    const g = new T.Group();
    // カウンター（+z側が客側）
    const counter = box(2.6, 0.92, 1.1, 0xEDE3D2);
    counter.position.set(0, 0.46, 0);
    const top = box(2.7, 0.06, 1.2, 0xD8CCB8);
    top.position.set(0, 0.95, 0);
    const front = box(2.6, 0.5, 0.04, 0xC9E4F5);
    front.position.set(0, 0.5, 0.56);
    g.add(counter, top, front);

    // スキャナー（埋込みガラス）
    const scanBed = box(0.42, 0.03, 0.34, 0x263238);
    scanBed.position.set(-0.15, 0.985, 0.05);
    const scanGlass = new T.Mesh(
      new T.BoxGeometry(0.3, 0.015, 0.24),
      new T.MeshLambertMaterial({ color: 0x4FC3F7, emissive: 0x1A6985 })
    );
    scanGlass.position.set(-0.15, 1.0, 0.05);
    g.add(scanBed, scanGlass);
    // スキャンビーム（赤い光・普段は非表示）
    const beam = new T.Mesh(
      new T.PlaneGeometry(0.34, 0.3),
      new T.MeshBasicMaterial({ color: 0xFF5252, transparent: true, opacity: 0, side: T.DoubleSide })
    );
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(-0.15, 1.02, 0.05);
    g.add(beam);

    // POSディスプレイ（canvas・動的更新）
    const posCanvas = document.createElement('canvas');
    posCanvas.width = 256; posCanvas.height = 160;
    const posTex = new T.CanvasTexture(posCanvas);
    const posScreen = new T.Mesh(
      new T.PlaneGeometry(0.62, 0.39),
      new T.MeshBasicMaterial({ map: posTex })
    );
    const pole = cyl(0.03, 0.03, 0.5, 0x616161, 8);
    pole.position.set(0.75, 1.2, -0.3);
    posScreen.position.set(0.75, 1.5, -0.28);
    posScreen.rotation.y = Math.PI * 0.06;
    g.add(pole, posScreen);

    function drawPOS(state) {
      const ctx = posCanvas.getContext('2d');
      const w = posCanvas.width, h = posCanvas.height;
      ctx.fillStyle = '#10281E';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      if (!state) {
        ctx.fillStyle = '#69D2A0';
        ctx.font = '900 44px sans-serif';
        ctx.fillText('レジ', w / 2, 92);
      } else if (state.over) {
        ctx.fillStyle = '#C9B6F2';
        ctx.font = '900 40px sans-serif';
        ctx.fillText('100えんより', w / 2, 70);
        ctx.fillText('たかい', w / 2, 120);
      } else {
        ctx.fillStyle = '#9CE7C3';
        ctx.font = '900 30px sans-serif';
        ctx.fillText('ピッ ×' + state.count, w / 2, 46);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 64px sans-serif';
        ctx.fillText(state.total + 'えん', w / 2, 122);
      }
      posTex.needsUpdate = true;
    }
    drawPOS(null);

    // 支払いトレー
    const tray = new T.Group();
    const trayBase = box(0.4, 0.03, 0.3, 0x4E7A9B);
    const trayRim = box(0.44, 0.05, 0.34, 0x3E6480);
    trayRim.position.y = -0.005;
    tray.add(trayRim, trayBase);
    tray.position.set(-0.65, 0.98, 0.42);
    g.add(tray);

    // レジランプ
    const lampPole = cyl(0.025, 0.025, 1.0, 0x90A4AE, 8);
    lampPole.position.set(1.15, 1.45, 0.2);
    const lamp = new T.Mesh(
      new T.SphereGeometry(0.09, 10, 8),
      new T.MeshLambertMaterial({ color: 0x7ED8B4, emissive: 0x2E8B62 })
    );
    lamp.position.set(1.15, 2.0, 0.2);
    g.add(lampPole, lamp);

    // レシートプリンター
    const printer = box(0.24, 0.16, 0.2, 0x546E7A);
    printer.position.set(0.35, 1.03, -0.25);
    g.add(printer);
    const receipt = new T.Mesh(
      new T.PlaneGeometry(0.13, 0.001),
      new T.MeshBasicMaterial({ color: 0xFFFFFF, side: T.DoubleSide })
    );
    receipt.position.set(0.35, 1.12, -0.14);
    receipt.rotation.x = -0.3;
    g.add(receipt);

    g.userData = { beam, drawPOS, tray, lamp, printer, receipt, scanGlass };
    return g;
  }

  /* ---------------------------------------------- サッカー台と袋 */
  function sackerMesh() {
    const g = new T.Group();
    const top = box(1.5, 0.06, 0.8, 0xD8CCB8);
    top.position.y = 0.82;
    [[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]].forEach(([x, z]) => {
      const leg = cyl(0.035, 0.035, 0.8, 0xA1887F, 8);
      leg.position.set(x, 0.4, z);
      g.add(leg);
    });
    g.add(top);

    // 買い物袋（紙袋・口が開いている）
    const bag = new T.Group();
    const bagMat = mat(0xE8C9A0);
    const bagBottom = box(0.4, 0.03, 0.3, 0xD9B588);
    bagBottom.position.y = 0.015;
    bag.add(bagBottom);
    [[0, 0.17, 0.44, 0.03, 0], [0, -0.17, 0.44, 0.03, 0], [0.21, 0, 0.03, 0.34, 1], [-0.21, 0, 0.03, 0.34, 1]].forEach(([x, z, w, d]) => {
      const m = new T.Mesh(new T.BoxGeometry(w, 0.42, d), bagMat);
      m.position.set(x, 0.21, z);
      bag.add(m);
    });
    const handleMat2 = mat(0xB98F63);
    [-0.15, 0.15].forEach(z => {
      const h = new T.Mesh(new T.TorusGeometry(0.09, 0.014, 5, 10, Math.PI), handleMat2);
      h.position.set(0, 0.44, z);
      bag.add(h);
    });
    bag.position.set(0.35, 0.85, 0);
    g.add(bag);
    g.userData = { bag };
    return g;
  }

  /* ---------------------------------------------- 店全体 */
  function buildStore(scene) {
    const refs = {};

    // 床（タイル）
    const floorTex = canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#F2EBDD';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(160,140,110,.25)';
      ctx.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(w, i * 64); ctx.stroke();
      }
    });
    floorTex.wrapS = floorTex.wrapT = T.RepeatWrapping;
    floorTex.repeat.set(12, 11);
    const floor = new T.Mesh(new T.PlaneGeometry(26, 24), new T.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -1);
    scene.add(floor);

    // 外の地面と歩道
    const ground = new T.Mesh(new T.PlaneGeometry(30, 10), mat(0xB9C7A8));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.01, 14);
    const walkway = new T.Mesh(new T.PlaneGeometry(6, 10), mat(0xCFC8B8));
    walkway.rotation.x = -Math.PI / 2;
    walkway.position.set(0, 0, 14);
    scene.add(ground, walkway);

    // 壁
    const wallMat = mat(0xF7F3EA);
    const wallN = box(26, 4, 0.3, 0xF7F3EA); wallN.position.set(0, 2, -13); scene.add(wallN);
    const wallW = box(0.3, 4, 24, 0xF7F3EA); wallW.position.set(-13, 2, -1); scene.add(wallW);
    const wallE = box(0.3, 4, 24, 0xF7F3EA); wallE.position.set(13, 2, -1); scene.add(wallE);
    // 南壁（入口を開ける）
    const wallS1 = box(10.6, 4, 0.3, 0xF7F3EA); wallS1.position.set(-7.7, 2, 9); scene.add(wallS1);
    const wallS2 = box(10.6, 4, 0.3, 0xF7F3EA); wallS2.position.set(7.7, 2, 9); scene.add(wallS2);
    const lintel = box(5, 1.4, 0.3, 0xF7F3EA); lintel.position.set(0, 3.3, 9); scene.add(lintel);
    // 店名看板（非公式であることが分かる架空店名）
    const storeSign = signMesh('🏪', 'す〜ぱ〜', '#7ED8B4');
    storeSign.position.set(0, 3.4, 9.25);
    storeSign.scale.set(1.6, 1.6, 1);
    scene.add(storeSign);

    // 自動ドア（ガラス2枚）
    const doorMat = new T.MeshLambertMaterial({ color: 0xAEDCEF, transparent: true, opacity: 0.45 });
    const doorFrameMat = mat(0x78909C);
    const doorL = new T.Group(), doorR = new T.Group();
    [doorL, doorR].forEach((d, i) => {
      const glass = new T.Mesh(new T.BoxGeometry(1.22, 2.5, 0.06), doorMat);
      glass.position.y = 1.3;
      const frame = new T.Mesh(new T.BoxGeometry(1.3, 0.1, 0.1), doorFrameMat);
      frame.position.y = 2.58;
      const frameB = frame.clone(); frameB.position.y = 0.08;
      const stile = new T.Mesh(new T.BoxGeometry(0.08, 2.5, 0.1), doorFrameMat);
      stile.position.set(i === 0 ? 0.61 : -0.61, 1.3, 0);
      d.add(glass, frame, frameB, stile);
      d.position.set(i === 0 ? -0.63 : 0.63, 0, 9);
      scene.add(d);
    });
    refs.doorL = doorL; refs.doorR = doorR;

    // 天井照明（吊り下げ発光バー）
    for (let i = -2; i <= 2; i++) {
      const bar = new T.Mesh(
        new T.BoxGeometry(4.4, 0.08, 0.5),
        new T.MeshLambertMaterial({ color: 0xFFFFFF, emissive: 0xBFBFAF })
      );
      bar.position.set(i * 4.6, 3.7, -2);
      scene.add(bar);
      const bar2 = bar.clone();
      bar2.position.z = -8;
      scene.add(bar2);
    }

    // お菓子棚（主役）
    const shelf = shelfMesh();
    shelf.position.copy(L.SHELF);
    scene.add(shelf);
    refs.shelf = shelf;

    // 売場看板（棚の上・控えめなサイズ）
    const signOkashi = signMesh('🍬', 'おかし', '#FF8FAB');
    signOkashi.position.set(L.SHELF.x, 2.55, L.SHELF.z + 0.4);
    signOkashi.scale.setScalar(0.8);
    scene.add(signOkashi);
    refs.signOkashi = signOkashi;

    const signRegister = signMesh('🛎️', 'レジ', '#8ECDF3');
    signRegister.position.set(L.REGISTER.x, 2.6, L.REGISTER.z);
    signRegister.scale.setScalar(0.85);
    scene.add(signRegister);
    refs.signRegister = signRegister;

    // 背景棚（遠景・通路の向こう）
    const bgPositions = [
      [-9.5, -8, 0], [-9.5, -3, 0], [-9.5, 2, 0],
      [9.5, -8, 0], [9.5, -3.4, 0],
      [-1.5, -10.8, 1], [3.5, -10.8, 1], [-6.5, -10.8, 1],
      [0.8, -6.5, 1], [-3.8, -8.6, 1] // 店中央の島（歩行時に横を通り過ぎる）
    ];
    bgPositions.forEach(([x, z, rot], i) => {
      const s = bgShelf(i * 7 + 3);
      s.position.set(x, 0, z);
      s.rotation.y = rot ? 0 : (x < 0 ? Math.PI / 2 : -Math.PI / 2);
      scene.add(s);
    });

    // 冷蔵ケース（西壁沿い・光る）
    const freezer = new T.Group();
    const fbody = box(6, 1.9, 0.9, 0xCFD8DC);
    fbody.position.y = 0.95;
    const fglow = new T.Mesh(
      new T.BoxGeometry(5.6, 1.2, 0.05),
      new T.MeshLambertMaterial({ color: 0xB3E5FC, emissive: 0x5FA8C7 })
    );
    fglow.position.set(0, 1.1, 0.46);
    freezer.add(fbody, fglow);
    freezer.position.set(6.5, 0, -11.5);
    scene.add(freezer);
    refs.freezerGlow = fglow;

    // レジ
    const register = registerMesh();
    register.position.set(L.REGISTER.x, 0, L.REGISTER.z);
    scene.add(register);
    refs.register = register;

    // サッカー台
    const sacker = sackerMesh();
    sacker.position.set(L.SACKER.x, 0, L.SACKER.z);
    scene.add(sacker);
    refs.sacker = sacker;

    // カート置場（列になったカート）＋主人公用カート
    const cart = cartMesh();
    cart.position.copy(L.CART_STATION);
    cart.rotation.y = Math.PI / 2; // 取っ手が+x側（通路側）
    scene.add(cart);
    refs.cart = cart;
    for (let i = 1; i <= 2; i++) {
      const c2 = cartMesh();
      c2.position.set(L.CART_STATION.x - i * 0.62, 0, L.CART_STATION.z);
      c2.rotation.y = Math.PI / 2;
      scene.add(c2);
    }

    // カゴ返却スタック
    const returnStack = new T.Group();
    for (let i = 0; i < 3; i++) {
      const b = basketMesh(0x4E8FBF);
      b.position.y = i * 0.12;
      returnStack.add(b);
    }
    returnStack.position.copy(L.RETURN);
    scene.add(returnStack);
    refs.returnStack = returnStack;

    return refs;
  }

  window.WORLD = {
    L, mat, box, cyl, sph,
    canvasTex, roundRect, labelTex, priceTagMesh, signMesh,
    productMesh, basketMesh, cartMesh, person, walkAnim, idleAnim,
    shelfMesh, registerMesh, sackerMesh, buildStore
  };
})();
