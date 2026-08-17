/* ============================================================
   "The Mystery Animal" — a word-morphing 3D picture book
   Target sentence:
   "Putting it all together, I'd say it's a medium-sized female
    who hops every few steps!"
   Every word (tap to advance) turns into an object that acts
   out its meaning, building up to the final scene.
   ============================================================ */
(function () {
  'use strict';

  // ---------- mode / determinism ----------
  var PARAMS = new URLSearchParams(location.search);
  var TEST = PARAMS.has('test');
  var SPEED = TEST ? 25 : 1;
  var _seed = 123456789;
  function rand() {
    _seed = (_seed * 1664525 + 1013904223) >>> 0;
    return _seed / 4294967296;
  }

  // ---------- sentence data ----------
  var TOKENS = ['Putting', 'it', 'all', 'together,', "I'd", 'say', "it's",
    'a', 'medium-sized', 'female', 'who', 'hops', 'every', 'few', 'steps!'];
  var BARE = TOKENS.map(function (t) { return t.replace(/[,!]/g, ''); });

  var WORD_COLORS = ['#ff6b6b', '#ff9f43', '#feca57', '#1dd1a1', '#54a0ff',
    '#5f27cd', '#ff6b81', '#10ac84', '#ee5253', '#f368e0', '#0abde3',
    '#ff9f43', '#1dd1a1', '#54a0ff', '#ff6b6b', '#ee5253'];

  // ---------- three.js basics ----------
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fdcff);
  scene.fog = new THREE.Fog(0x9fdcff, 22, 45);

  var camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 3.4, 10.5);
  camera.lookAt(0, 1.6, 0);

  var renderer = new THREE.WebGLRenderer({ antialias: !TEST });
  renderer.setPixelRatio(TEST ? 1 : Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(innerWidth, innerHeight);
  document.getElementById('stage').appendChild(renderer.domElement);

  window.addEventListener('resize', function () {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  scene.add(new THREE.HemisphereLight(0xffffff, 0x88bb77, 0.95));
  var sun = new THREE.DirectionalLight(0xfff3d6, 0.85);
  sun.position.set(5, 10, 6);
  scene.add(sun);

  // ---------- helpers ----------
  function mat(color, opts) {
    var params = Object.assign({ color: color }, opts || {});
    return new THREE.MeshLambertMaterial(params);
  }
  function mesh(geo, material, x, y, z) {
    var m = new THREE.Mesh(geo, material);
    if (x !== undefined) m.position.set(x, y, z);
    return m;
  }
  function easeInOut(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  function easeOutBack(k) {
    var c = 1.70158;
    return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
  }
  function linear(k) { return k; }

  var tweens = [];
  function tw(dur, fn, ease) {
    ease = ease || easeInOut;
    return new Promise(function (res) {
      tweens.push({ el: 0, dur: Math.max(dur / SPEED, 0.001), fn: fn, ease: ease, res: res });
    });
  }
  function wait(dur) { return tw(dur, function () { }, linear); }
  function updateTweens(dt) {
    for (var i = tweens.length - 1; i >= 0; i--) {
      var t = tweens[i];
      t.el += dt;
      var p = Math.min(1, t.el / t.dur);
      t.fn(t.ease(p), p);
      if (p >= 1) { tweens.splice(i, 1); t.res(); }
    }
  }

  function puff(pos, color, n) {
    color = color || 0xffffff;
    n = n || 9;
    var g = new THREE.Group();
    g.position.copy(pos);
    scene.add(g);
    var parts = [];
    for (var i = 0; i < n; i++) {
      var s = mesh(new THREE.SphereGeometry(0.1 + rand() * 0.09, 8, 8), mat(color));
      var a = rand() * Math.PI * 2, b = (rand() - 0.3) * Math.PI;
      parts.push({ m: s, dx: Math.cos(a) * Math.cos(b), dy: Math.sin(b) + 0.6, dz: Math.sin(a) * Math.cos(b) });
      g.add(s);
    }
    tw(0.6, function (k) {
      parts.forEach(function (p) {
        p.m.position.set(p.dx * k * 1.3, p.dy * k * 1.3, p.dz * k * 1.3);
        p.m.scale.setScalar(Math.max(0.001, 1 - k));
      });
    }, linear).then(function () { scene.remove(g); });
  }

  function popIn(obj, dur, target) {
    target = target || 1;
    obj.scale.setScalar(0.001);
    return tw(dur || 0.55, function (k) {
      obj.scale.setScalar(Math.max(0.001, target * easeOutBack(k)));
    }, linear);
  }

  // ---------- 3D word (canvas texture, fake extrusion) ----------
  function makeWord(text, color, height) {
    height = height || 1.05;
    var c = document.createElement('canvas');
    var ctx = c.getContext('2d');
    var font = '900 150px "Arial Rounded MT Bold","Hiragino Maru Gothic ProN",Verdana,sans-serif';
    ctx.font = font;
    var twd = ctx.measureText(text).width;
    c.width = Math.ceil(twd + 90);
    c.height = 230;
    ctx = c.getContext('2d');
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 30;
    ctx.strokeStyle = color;
    ctx.strokeText(text, c.width / 2, c.height / 2 + 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, c.width / 2, c.height / 2 + 6);
    var tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    var w = Math.min(7.5, height * c.width / c.height);
    var geo = new THREE.PlaneGeometry(w, height);
    var front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    var back = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: 0x444444 }));
    back.position.set(0.045, -0.05, -0.06);
    var g = new THREE.Group();
    g.add(back); g.add(front);
    return g;
  }

  var WORD_POS = new THREE.Vector3(0, 3.6, 2.2);
  function showWord(text, colorIdx) {
    var wm = makeWord(text, WORD_COLORS[colorIdx % WORD_COLORS.length], 1.15);
    wm.position.copy(WORD_POS);
    scene.add(wm);
    return popIn(wm, 0.6).then(function () {
      return tw(0.9, function (k) {
        wm.rotation.z = Math.sin(k * Math.PI * 3) * 0.07;
        wm.scale.setScalar(1 + Math.sin(k * Math.PI * 2) * 0.06);
      }, linear);
    }).then(function () { return wm; });
  }

  function morphInto(wordMesh, targetPos, buildFn, targetScale) {
    // word flies to target while spinning/shrinking, object pops out of a puff
    var p0 = wordMesh.position.clone();
    return tw(0.65, function (k) {
      wordMesh.position.lerpVectors(p0, targetPos, k);
      wordMesh.rotation.y = k * Math.PI * 2;
      wordMesh.scale.setScalar(Math.max(0.001, 1 - k));
    }).then(function () {
      scene.remove(wordMesh);
      puff(targetPos, 0xffffff, 10);
      var obj = buildFn();
      return popIn(obj, 0.6, targetScale || 1).then(function () { return obj; });
    });
  }

  // ---------- scenery ----------
  (function buildScenery() {
    var ground = mesh(new THREE.CircleGeometry(34, 48), mat(0x8fd97a));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    // hills
    [[-11, 0.4, -14, 7], [9, 0.2, -15, 9], [0, 0, -19, 12]].forEach(function (h) {
      var m = mesh(new THREE.SphereGeometry(h[3], 24, 16), mat(0x79c96a), h[0], h[1] - h[3] * 0.55, h[2]);
      m.scale.y = 0.6;
      scene.add(m);
    });
    // sun
    var sunDisc = mesh(new THREE.CircleGeometry(1.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe27a }), -8.5, 8.2, -18);
    scene.add(sunDisc);
    // clouds
    window.__clouds = [];
    for (var i = 0; i < 4; i++) {
      var cl = new THREE.Group();
      for (var j = 0; j < 3; j++) {
        var s = mesh(new THREE.SphereGeometry(0.9 - j * 0.18, 14, 10),
          new THREE.MeshBasicMaterial({ color: 0xffffff }), (j - 1) * 0.95, (j % 2) * 0.25, 0);
        cl.add(s);
      }
      cl.position.set(-12 + i * 6.5, 6.3 + (i % 2) * 1.4, -12 - i);
      cl.scale.setScalar(0.9 + (i % 3) * 0.25);
      scene.add(cl);
      window.__clouds.push(cl);
    }
    // little flowers
    for (var f = 0; f < 12; f++) {
      var fx = -9 + rand() * 18, fz = -6 + rand() * 4;
      var fl = new THREE.Group();
      fl.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35), mat(0x4f9e43), 0, 0.17, 0));
      fl.add(mesh(new THREE.SphereGeometry(0.11, 8, 8),
        mat([0xff8fc8, 0xffe066, 0xffffff][f % 3]), 0, 0.4, 0));
      fl.position.set(fx, 0, fz);
      scene.add(fl);
    }
  })();

  // ============================================================
  //  Builders for actors
  // ============================================================
  function makeHand() {
    var g = new THREE.Group();
    var skin = mat(0xffd9b0);
    var palm = mesh(new THREE.SphereGeometry(0.42, 16, 12), skin);
    palm.scale.set(1, 0.55, 1.15);
    g.add(palm);
    for (var i = 0; i < 4; i++) {
      var f = mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8), skin, -0.3 + i * 0.2, 0, 0.5);
      f.rotation.x = Math.PI / 2;
      g.add(f);
    }
    var th = mesh(new THREE.CapsuleGeometry(0.1, 0.22, 4, 8), skin, 0.45, 0, 0.1);
    th.rotation.z = -0.9;
    g.add(th);
    return g;
  }

  function makeBlock(color) {
    return mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), mat(color));
  }

  function makeMysteryBox() {
    var g = new THREE.Group();
    var body = mesh(new THREE.BoxGeometry(1.35, 1.05, 1.15), mat(0x9b59d0), 0, 0.52, 0);
    g.add(body);
    var lid = new THREE.Group();
    var lidM = mesh(new THREE.BoxGeometry(1.5, 0.28, 1.3), mat(0x7a3fb0), 0.75, 0.14, 0);
    lid.add(lidM);
    lid.position.set(-0.75, 1.05, 0);
    g.add(lid);
    var qm = makeWord('?', '#ffe066', 0.62);
    qm.position.set(0, 0.55, 0.6);
    g.add(qm);
    g.userData.lid = lid;
    g.userData.qm = qm;
    return g;
  }

  function makePuzzlePiece(color) {
    var g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.52, 0.52, 0.24), mat(color)));
    g.add(mesh(new THREE.SphereGeometry(0.13, 10, 10), mat(color), 0.29, 0, 0));
    g.add(mesh(new THREE.SphereGeometry(0.13, 10, 10), mat(color), 0, 0.29, 0));
    return g;
  }

  function makeDetective() {
    var g = new THREE.Group();
    var body = mesh(new THREE.ConeGeometry(0.48, 0.95, 20), mat(0x4a7fd6), 0, 0.62, 0);
    g.add(body);
    var head = mesh(new THREE.SphereGeometry(0.34, 18, 14), mat(0xffd9b0), 0, 1.35, 0);
    g.add(head);
    var hat = mesh(new THREE.SphereGeometry(0.36, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.3), mat(0x8a5a2b), 0, 1.42, 0);
    g.add(hat);
    var brim1 = mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.1, 12), mat(0x8a5a2b), 0, 1.58, 0.3);
    brim1.rotation.x = 0.5; g.add(brim1);
    var eyeL = mesh(new THREE.SphereGeometry(0.05, 8, 8), mat(0x222222), -0.12, 1.38, 0.3);
    var eyeR = mesh(new THREE.SphereGeometry(0.05, 8, 8), mat(0x222222), 0.12, 1.38, 0.3);
    g.add(eyeL); g.add(eyeR);
    // magnifying glass
    var glass = new THREE.Group();
    var ring = mesh(new THREE.TorusGeometry(0.22, 0.05, 10, 24), mat(0x777788));
    glass.add(ring);
    var lens = mesh(new THREE.CircleGeometry(0.2, 20),
      new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.55 }));
    glass.add(lens);
    var handle = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 10), mat(0x8a5a2b), 0, -0.36, 0);
    glass.add(handle);
    glass.position.set(-0.55, 0.9, 0.35);
    glass.rotation.z = 0.5;
    g.add(glass);
    g.userData.glass = glass;
    return g;
  }

  function makeBubble() {
    var g = new THREE.Group();
    var body = mesh(new THREE.SphereGeometry(1, 24, 18), mat(0xffffff, { emissive: 0x333333 }));
    body.scale.set(1.75, 1.2, 0.85);
    g.add(body);
    [[0.9, -1.15, 0.28], [1.25, -1.6, 0.18], [1.5, -1.95, 0.11]].forEach(function (b) {
      g.add(mesh(new THREE.SphereGeometry(b[2], 10, 10), mat(0xffffff, { emissive: 0x333333 }), b[0], b[1], 0));
    });
    return g;
  }

  function makeKangaroo(opts) {
    opts = opts || {};
    var sil = !!opts.silhouette;
    var body = sil ? mat(0x5a5a66) : mat(0xc98a4b);
    var belly = sil ? mat(0x5a5a66) : mat(0xeccb9d);
    var dark = sil ? mat(0x5a5a66) : mat(0x9c6836);
    var g = new THREE.Group();

    var torso = mesh(new THREE.SphereGeometry(0.62, 20, 16), body, 0, 1.02, 0);
    torso.scale.set(0.88, 1.18, 0.8);
    g.add(torso);
    var tummy = mesh(new THREE.SphereGeometry(0.45, 18, 14), belly, 0, 0.92, 0.26);
    tummy.scale.set(0.8, 1.05, 0.7);
    g.add(tummy);

    var head = mesh(new THREE.SphereGeometry(0.33, 18, 14), body, 0, 1.95, 0.13);
    g.add(head);
    var snout = mesh(new THREE.SphereGeometry(0.2, 14, 12), belly, 0, 1.86, 0.4);
    snout.scale.set(0.8, 0.7, 1.15);
    g.add(snout);
    var nose = mesh(new THREE.SphereGeometry(0.07, 8, 8), mat(0x442e1c), 0, 1.9, 0.58);
    g.add(nose);
    if (!sil) {
      g.add(mesh(new THREE.SphereGeometry(0.055, 8, 8), mat(0x222222), -0.15, 2.02, 0.38));
      g.add(mesh(new THREE.SphereGeometry(0.055, 8, 8), mat(0x222222), 0.15, 2.02, 0.38));
    }
    [-1, 1].forEach(function (s) {
      var ear = mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 10), body, s * 0.17, 2.34, 0.02);
      ear.rotation.z = -s * 0.28;
      g.add(ear);
    });
    // arms
    [-1, 1].forEach(function (s) {
      var arm = mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 10), dark, s * 0.4, 1.28, 0.3);
      arm.rotation.x = 0.9; arm.rotation.z = -s * 0.3;
      g.add(arm);
    });
    // haunches + feet
    [-1, 1].forEach(function (s) {
      var h = mesh(new THREE.SphereGeometry(0.34, 16, 12), body, s * 0.42, 0.52, -0.05);
      h.scale.set(0.8, 1.05, 1);
      g.add(h);
      var foot = mesh(new THREE.CapsuleGeometry(0.12, 0.55, 4, 10), dark, s * 0.4, 0.12, 0.3);
      foot.rotation.x = Math.PI / 2;
      g.add(foot);
    });
    // tail
    var tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.75, -0.45),
      new THREE.Vector3(0, 0.42, -0.95),
      new THREE.Vector3(0, 0.14, -1.45)
    ]);
    var tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 10, 0.16, 10), body.clone ? body : body);
    g.add(tail);

    // pouch + joey
    var pouch = mesh(new THREE.SphereGeometry(0.4, 18, 14), belly, 0, 0.78, 0.42);
    pouch.scale.set(0.95, 0.8, 0.55);
    pouch.visible = false;
    g.add(pouch);
    var joey = new THREE.Group();
    var jhead = mesh(new THREE.SphereGeometry(0.17, 14, 12), mat(0xd89f63), 0, 0, 0);
    joey.add(jhead);
    joey.add(mesh(new THREE.SphereGeometry(0.05, 8, 8), mat(0x222222), -0.07, 0.05, 0.14));
    joey.add(mesh(new THREE.SphereGeometry(0.05, 8, 8), mat(0x222222), 0.07, 0.05, 0.14));
    joey.add(mesh(new THREE.SphereGeometry(0.045, 8, 8), mat(0x442e1c), 0, -0.03, 0.17));
    [-1, 1].forEach(function (s) {
      var e = mesh(new THREE.CapsuleGeometry(0.045, 0.16, 4, 8), mat(0xd89f63), s * 0.09, 0.2, 0);
      e.rotation.z = -s * 0.25;
      joey.add(e);
    });
    joey.position.set(0, 1.05, 0.55);
    joey.visible = false;
    g.add(joey);

    g.userData = { pouch: pouch, joey: joey, torso: torso };
    if (opts.scale) g.scale.setScalar(opts.scale);
    return g;
  }

  function makeFootprintPair(kind) {
    var g = new THREE.Group();
    var c = mat(0x77543a);
    [-1, 1].forEach(function (s) {
      var f = mesh(new THREE.CapsuleGeometry(0.085, kind === 'hop' ? 0.5 : 0.34, 4, 8), c, s * 0.18, 0.03, 0);
      f.rotation.x = Math.PI / 2;
      f.scale.y = 0.25;
      g.add(f);
    });
    return g;
  }

  function makeArrow() {
    var g = new THREE.Group();
    var shaft = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 10), mat(0xee5253), 0, 0.55, 0);
    g.add(shaft);
    var tip = mesh(new THREE.ConeGeometry(0.24, 0.45, 12), mat(0xee5253), 0, 0, 0);
    tip.rotation.x = Math.PI;
    g.add(tip);
    return g;
  }

  function makeSpring() {
    var pts = [];
    for (var i = 0; i <= 40; i++) {
      var a = i / 40 * Math.PI * 2 * 4;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.32, i / 40 * 1.1, Math.sin(a) * 0.32));
    }
    var curve = new THREE.CatmullRomCurve3(pts);
    var m = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.05, 8), mat(0x54a0ff));
    var g = new THREE.Group();
    g.add(m);
    return g;
  }

  function makeNumber(n, color) {
    var w = makeWord(String(n), color, 0.62);
    return w;
  }

  function makeStar(color) {
    var shape = new THREE.Shape();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 === 0 ? 0.3 : 0.13;
      var a = i / 10 * Math.PI * 2 - Math.PI / 2;
      var x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    return new THREE.Mesh(new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide }));
  }

  // ============================================================
  //  Path (footprints + finale keyframes)
  // ============================================================
  var PATH_Z = 1.1;
  function buildPath() {
    var prints = [], frames = [];
    var x = -6.2, t = 0.15;
    while (x < 5.6) {
      for (var s = 0; s < 3 && x < 5.6; s++) {
        var nx = x + 0.8;
        frames.push({ t0: t, t1: t + 0.34, x0: x, x1: nx, h: 0.26, big: false });
        t += 0.34 + 0.14;
        prints.push({ x: nx, kind: 'walk' });
        x = nx;
      }
      var hx = x + 2.2;
      frames.push({ t0: t, t1: t + 0.72, x0: x, x1: hx, h: 1.75, big: true });
      t += 0.72 + 0.3;
      prints.push({ x: hx, kind: 'hop' });
      x = hx;
    }
    return { prints: prints, frames: frames, total: t + 0.6, startX: -6.2 };
  }
  var PATH = buildPath();

  // ============================================================
  //  World state
  // ============================================================
  var W = {};             // persistent actors
  var world = { loop: null, onExit: null };
  var elapsed = 0;

  // ============================================================
  //  Scenes
  // ============================================================
  var scenes = [];

  function defScene(word, run) { scenes.push({ word: word, run: run }); }

  // --- 1. Putting -------------------------------------------------
  defScene('Putting', function () {
    return showWord('Putting', 0).then(function (wm) {
      var pos = new THREE.Vector3(0, 1.4, 1);
      return morphInto(wm, pos, function () {
        var g = new THREE.Group();
        var hand = makeHand();
        hand.rotation.x = 0.35;
        g.add(hand);
        var stack = [];
        for (var i = 0; i < 3; i++) {
          var b = makeBlock([0xff6b6b, 0xfeca57, 0x54a0ff][i]);
          b.visible = false;
          b.position.set(0.02 * i, 0.31 + i * 0.63, 0);
          g.add(b);
          stack.push(b);
        }
        var carry = makeBlock(0x1dd1a1);
        g.add(carry);
        g.position.set(-0.4, 0, 1);
        scene.add(g);
        W.hands = g;
        world.loop = function (t) {
          var cyc = 6.0, ph = (t % cyc) / cyc;
          stack.forEach(function (b, i) { b.visible = ph > (i + 1) / 3.5; });
          var n = Math.min(2, Math.floor(ph * 3.5));
          var target = 0.31 + Math.min(3, Math.floor(ph * 3.5)) * 0.63;
          var sub = (ph * 3.5) % 1;
          var hy, hx = 0.9;
          if (sub < 0.55) { hy = 3 - (3 - target - 0.5) * easeInOut(sub / 0.55); }
          else { hy = target + 0.5 + (3 - target - 0.5) * easeInOut((sub - 0.55) / 0.45); }
          hand.position.set(hx * 0.2, hy, 0);
          carry.position.set(hx * 0.2, hy - 0.45, 0.1);
          carry.visible = sub < 0.55 && ph * 3.5 < 3;
        };
        return g;
      });
    });
  });

  // --- 2. it ------------------------------------------------------
  defScene('it', function () {
    // hands pack away
    var exitP = W.hands ? tw(0.5, function (k) {
      W.hands.scale.setScalar(Math.max(0.001, 1 - k));
    }).then(function () { scene.remove(W.hands); W.hands = null; }) : Promise.resolve();
    world.loop = null;
    return exitP.then(function () { return showWord('it', 1); }).then(function (wm) {
      var pos = new THREE.Vector3(0, 0.4, 0.8);
      return morphInto(wm, pos, function () {
        var box = makeMysteryBox();
        box.position.set(0, 0, 0.8);
        scene.add(box);
        W.box = box;
        world.loop = function (t) {
          var ph = t % 2.4;
          if (ph < 0.5) {
            box.rotation.z = Math.sin(ph * 30) * 0.06;
            box.position.y = Math.abs(Math.sin(ph * 15)) * 0.12;
          } else { box.rotation.z *= 0.9; box.position.y *= 0.9; }
        };
        return box;
      });
    });
  });

  // --- 3. all -----------------------------------------------------
  defScene('all', function () {
    world.loop = null;
    // park the box on the left
    var boxSlide = tw(0.6, function (k) {
      W.box.position.x = -3.4 * k;
      W.box.rotation.z = 0; W.box.position.y = Math.sin(k * Math.PI) * 0.4;
    });
    return boxSlide.then(function () { return showWord('all', 2); }).then(function (wm) {
      var pos = new THREE.Vector3(0, 2.5, 0.8);
      return morphInto(wm, pos, function () {
        var g = new THREE.Group();
        scene.add(g);
        W.pieces = [];
        var cols = [0xff6b6b, 0xff9f43, 0xfeca57, 0x1dd1a1, 0x54a0ff, 0x5f27cd, 0xff6b81,
          0x10ac84, 0xee5253, 0xf368e0, 0x0abde3, 0x54a0ff, 0xff9f43, 0x1dd1a1, 0xff6b6b];
        for (var i = 0; i < 15; i++) {
          var p = makePuzzlePiece(cols[i]);
          var tx = -4 + rand() * 8, tz = -0.5 + rand() * 3;
          p.position.set(tx, 7 + rand() * 4, tz);
          p.rotation.set(rand() * 2, rand() * 2, rand() * 2);
          p.userData.ty = 0.26;
          g.add(p);
          W.pieces.push(p);
        }
        W.pieceGroup = g;
        // raining down, staggered
        W.pieces.forEach(function (p, i) {
          var y0 = p.position.y;
          wait(i * 0.09).then(function () {
            return tw(0.7, function (k) {
              p.position.y = y0 + (p.userData.ty - y0) * k;
              p.rotation.x += 0.05; p.rotation.z += 0.04;
            }, linear);
          }).then(function () { p.rotation.set(0, rand() * 6, 0); puffSmall(p.position); });
        });
        return g;
      }).then(function () { return wait(1.6); });
    });
  });
  function puffSmall(pos) {
    if (rand() < 0.4) puff(new THREE.Vector3(pos.x, pos.y + 0.2, pos.z), 0xffffff, 4);
  }

  // --- 4. together ------------------------------------------------
  defScene('together,', function () {
    world.loop = null;
    return showWord('together', 3).then(function (wm) {
      var center = new THREE.Vector3(0, 1.1, 0.8);
      return tw(0.65, function (k) {
        wm.position.lerpVectors(WORD_POS, new THREE.Vector3(0, 2.9, 0.8), k);
        wm.scale.setScalar(1 - 0.35 * k);
      }).then(function () {
        // pieces fly together into a ball
        var starts = W.pieces.map(function (p) { return p.position.clone(); });
        return tw(1.0, function (k) {
          W.pieces.forEach(function (p, i) {
            var a = i / 15 * Math.PI * 2;
            var r = 0.62;
            var tgt = new THREE.Vector3(center.x + Math.cos(a) * r,
              center.y + Math.sin(a * 2) * 0.45, center.z + Math.sin(a) * r);
            p.position.lerpVectors(starts[i], tgt, easeOutBack(k));
          });
        }, linear);
      }).then(function () {
        puff(center, 0xffe066, 14);
        return tw(0.5, function (k) {
          wm.scale.setScalar(Math.max(0.001, 0.65 * (1 - k)));
          wm.position.y = 2.9 - k * 1.2;
        });
      }).then(function () {
        scene.remove(wm);
        world.loop = function (t) {
          W.pieceGroup.rotation.y = t * 0.7;
          var s = 1 + Math.sin(t * 3) * 0.04;
          W.pieceGroup.scale.setScalar(s);
          W.pieceGroup.position.y = Math.abs(Math.sin(t * 2)) * 0.18;
        };
      });
    });
  });

  // --- 5. I'd -----------------------------------------------------
  defScene("I'd", function () {
    world.loop = null;
    // puzzle ball hops into the mystery box (the clues go in)
    var jump = tw(0.8, function (k) {
      var p = W.pieceGroup.position;
      p.x = -3.4 * k;
      p.y = Math.sin(k * Math.PI) * 2.2;
      W.pieceGroup.scale.setScalar(Math.max(0.001, 1 - 0.7 * k));
      W.pieceGroup.rotation.y += 0.15;
    }).then(function () {
      puff(new THREE.Vector3(-3.4, 1, 0.8), 0xffe066, 12);
      scene.remove(W.pieceGroup);
      W.pieceGroup = null; W.pieces = null;
    });
    return jump.then(function () {
      // split intro: "I" + "'d"
      var wi = makeWord('I', WORD_COLORS[4], 1.15);
      var wd = makeWord("'d", WORD_COLORS[4], 1.15);
      wi.position.set(-0.8, 3.6, 2.2);
      wd.position.set(0.75, 3.6, 2.2);
      scene.add(wi); scene.add(wd);
      return Promise.all([popIn(wi, 0.5), popIn(wd, 0.5)]).then(function () {
        return tw(0.7, function (k) {
          var sp = Math.sin(k * Math.PI) * 0.9;
          wi.position.x = -0.8 - sp;
          wd.position.x = 0.75 + sp;
        });
      }).then(function () {
        var pos = new THREE.Vector3(3.3, 0.8, 0.6);
        var pi = tw(0.6, function (k) {
          wi.position.lerpVectors(new THREE.Vector3(-0.8, 3.6, 2.2), pos, k);
          wi.rotation.y = k * 6; wi.scale.setScalar(Math.max(0.001, 1 - k));
        });
        var pd = tw(0.6, function (k) {
          wd.position.lerpVectors(new THREE.Vector3(0.75, 3.6, 2.2), pos, k);
          wd.rotation.y = -k * 6; wd.scale.setScalar(Math.max(0.001, 1 - k));
        });
        return Promise.all([pi, pd]).then(function () {
          scene.remove(wi); scene.remove(wd);
          puff(pos, 0xffffff, 10);
          var det = makeDetective();
          det.position.set(3.3, 0, 0.6);
          det.rotation.y = -0.55;
          scene.add(det);
          W.det = det;
          return popIn(det, 0.6).then(function () {
            world.loop = function (t) {
              det.position.y = Math.abs(Math.sin(t * 2.2)) * 0.1;
              det.userData.glass.position.x = -0.55 + Math.sin(t * 1.5) * 0.25;
              det.userData.glass.rotation.z = 0.5 + Math.sin(t * 1.5) * 0.3;
            };
          });
        });
      });
    });
  });

  // --- 6. say -----------------------------------------------------
  defScene('say', function () {
    world.loop = function (t) {
      if (W.det) W.det.position.y = Math.abs(Math.sin(t * 2.2)) * 0.06;
    };
    return showWord('say', 5).then(function (wm) {
      var pos = new THREE.Vector3(1.1, 3.4, 0.6);
      return morphInto(wm, pos, function () {
        var b = makeBubble();
        b.position.copy(pos);
        scene.add(b);
        W.bubble = b;
        var base = world.loop;
        world.loop = function (t) {
          if (base) base(t);
          b.scale.setScalar(1 + Math.sin(t * 2.8) * 0.035);
        };
        return b;
      });
    });
  });

  // --- 7. it's ----------------------------------------------------
  defScene("it's", function () {
    var wi = makeWord('it', WORD_COLORS[6], 1.15);
    var ws = makeWord("'s", WORD_COLORS[6], 1.15);
    wi.position.set(-0.7, 3.6, 2.2); ws.position.set(0.65, 3.6, 2.2);
    scene.add(wi); scene.add(ws);
    return Promise.all([popIn(wi, 0.5), popIn(ws, 0.5)]).then(function () {
      return tw(0.7, function (k) {
        var sp = Math.sin(k * Math.PI) * 0.8;
        wi.position.x = -0.7 - sp; ws.position.x = 0.65 + sp;
      });
    }).then(function () {
      var tgt = W.bubble.position.clone();
      var p1 = tw(0.6, function (k) {
        wi.position.lerpVectors(new THREE.Vector3(-0.7, 3.6, 2.2), tgt, k);
        wi.scale.setScalar(Math.max(0.001, 1 - k));
      });
      var p2 = tw(0.6, function (k) {
        ws.position.lerpVectors(new THREE.Vector3(0.65, 3.6, 2.2), tgt, k);
        ws.scale.setScalar(Math.max(0.001, 1 - k));
      });
      return Promise.all([p1, p2]);
    }).then(function () {
      scene.remove(wi); scene.remove(ws);
      // mystery box flies up into the bubble and glows
      var b0 = W.box.position.clone();
      var tgt = W.bubble.position.clone();
      return tw(0.9, function (k) {
        W.box.position.lerpVectors(b0, new THREE.Vector3(tgt.x, tgt.y - 0.5, tgt.z + 1.05), k);
        W.box.position.y += Math.sin(k * Math.PI) * 1.2;
        W.box.scale.setScalar(1 - 0.45 * k);
        W.box.rotation.y = k * Math.PI * 2;
      });
    }).then(function () {
      puff(W.box.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xffe066, 8);
      // lid cracks open with wobble + glow
      var lid = W.box.userData.lid;
      return tw(0.8, function (k) {
        lid.rotation.z = Math.sin(k * Math.PI) * 0.5 + k * 0.35;
        W.box.userData.qm.scale.setScalar(1 + Math.sin(k * Math.PI * 4) * 0.25);
      });
    }).then(function () {
      world.loop = function (t) {
        if (W.det) W.det.position.y = Math.abs(Math.sin(t * 2.2)) * 0.06;
        if (W.box) {
          W.box.rotation.z = Math.sin(t * 5) * 0.05;
          W.box.userData.qm.rotation.y = Math.sin(t * 2) * 0.4;
        }
      };
    });
  });

  // --- 8. a -------------------------------------------------------
  defScene('a', function () {
    return showWord('a', 7).then(function (wm) {
      var pos = new THREE.Vector3(0, 4.6, 0.3);
      return morphInto(wm, pos, function () {
        var g = new THREE.Group();
        var cone = new THREE.Mesh(new THREE.ConeGeometry(2.3, 5.2, 32, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0xfff3a0, transparent: true, opacity: 0.28,
            side: THREE.DoubleSide, depthWrite: false
          }));
        cone.position.y = -2.6;
        g.add(cone);
        var lamp = mesh(new THREE.SphereGeometry(0.4, 14, 10), mat(0x555566), 0, 0.1, 0);
        g.add(lamp);
        var disc = new THREE.Mesh(new THREE.CircleGeometry(2.1, 32),
          new THREE.MeshBasicMaterial({ color: 0xfff8c9, transparent: true, opacity: 0.75 }));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = -4.55;
        g.add(disc);
        g.position.copy(pos);
        scene.add(g);
        W.spot = g;
        var base = world.loop;
        world.loop = function (t) {
          if (base) base(t);
          g.rotation.z = Math.sin(t * 1.8) * 0.05;
        };
        return g;
      });
    });
  });

  // --- 9. medium-sized -------------------------------------------
  defScene('medium-sized', function () {
    return showWord('medium-sized', 8).then(function (wm) {
      var pos = new THREE.Vector3(0, 1, 0.3);
      return tw(0.6, function (k) {
        wm.position.lerpVectors(WORD_POS, pos, k);
        wm.rotation.y = k * Math.PI * 2;
        wm.scale.setScalar(Math.max(0.001, 1 - k));
      }).then(function () {
        scene.remove(wm);
        var sizes = [{ x: -2.5, s: 0.55 }, { x: 0, s: 0.95 }, { x: 2.4, s: 1.4 }];
        W.sils = sizes.map(function (cfg) {
          var kg = makeKangaroo({ silhouette: true, scale: cfg.s });
          kg.position.set(cfg.x, 0, 0.3);
          scene.add(kg);
          return kg;
        });
        // pop in one by one
        return W.sils.reduce(function (p, kg, i) {
          return p.then(function () { puff(kg.position.clone().setY(1), 0xffffff, 6); return popIn(kg, 0.4, [0.55, 0.95, 1.4][i]); });
        }, Promise.resolve());
      }).then(function () {
        return wait(0.9);
      }).then(function () {
        // sides shrink away — the MEDIUM one stays
        return tw(0.7, function (k) {
          W.sils[0].scale.setScalar(Math.max(0.001, 0.55 * (1 - k)));
          W.sils[2].scale.setScalar(Math.max(0.001, 1.4 * (1 - k)));
          W.sils[1].position.y = Math.abs(Math.sin(k * Math.PI * 2)) * 0.25;
        });
      }).then(function () {
        scene.remove(W.sils[0]); scene.remove(W.sils[2]);
        W.roo = W.sils[1];
        W.sils = null;
        world.loop = function (t) {
          if (W.roo) W.roo.position.y = Math.abs(Math.sin(t * 2.4)) * 0.07;
        };
      });
    });
  });

  // --- 10. female -------------------------------------------------
  defScene('female', function () {
    return showWord('female', 9).then(function (wm) {
      var pos = new THREE.Vector3(0, 0.9, 0.75);
      return tw(0.65, function (k) {
        wm.position.lerpVectors(WORD_POS, pos, k);
        wm.rotation.y = k * Math.PI * 2;
        wm.scale.setScalar(Math.max(0.001, 1 - k));
      }).then(function () {
        scene.remove(wm);
        puff(new THREE.Vector3(0, 1.2, 0.6), 0xf7b7d0, 16);
        // silhouette becomes the real colored girl kangaroo
        var real = makeKangaroo({ scale: 0.95 });
        real.position.copy(W.roo.position).setY(0);
        scene.remove(W.roo);
        W.roo = real;
        scene.add(real);
        return popIn(real, 0.55, 0.95);
      }).then(function () {
        // pouch appears
        var ud = W.roo.userData;
        ud.pouch.visible = true;
        ud.pouch.scale.setScalar(0.001);
        return tw(0.5, function (k) {
          ud.pouch.scale.set(0.95 * easeOutBack(k), 0.8 * easeOutBack(k), 0.55 * easeOutBack(k));
        }, linear);
      }).then(function () {
        // joey pops out
        var ud = W.roo.userData;
        ud.joey.visible = true;
        ud.joey.scale.setScalar(0.001);
        puff(W.roo.position.clone().add(new THREE.Vector3(0, 1.1, 0.6)), 0xffffff, 8);
        return popIn(ud.joey, 0.55);
      }).then(function () {
        // spotlight, bubble and box have done their job
        var s = W.spot, b = W.bubble, bx = W.box;
        tw(0.6, function (k) {
          if (s) s.children.forEach(function (c) { if (c.material) c.material.opacity = (c.material.opacity || 1) * (1 - k * 0.2); });
          if (s) s.scale.setScalar(Math.max(0.001, 1 - k));
          if (b) b.scale.setScalar(Math.max(0.001, 1 - k));
          if (bx) bx.scale.setScalar(Math.max(0.001, 0.55 * (1 - k)));
        }).then(function () {
          if (s) scene.remove(s); if (b) scene.remove(b); if (bx) scene.remove(bx);
          W.spot = W.bubble = W.box = null;
        });
        world.loop = function (t) {
          rooIdle(t);
        };
      });
    });
  });

  function rooIdle(t) {
    if (!W.roo) return;
    W.roo.position.y = Math.abs(Math.sin(t * 2.4)) * 0.06;
    var j = W.roo.userData.joey;
    if (j.visible) j.position.y = 1.05 + Math.sin(t * 3) * 0.05;
    if (W.det) W.det.position.y = Math.abs(Math.sin(t * 2.1)) * 0.05;
  }

  // --- 11. who ----------------------------------------------------
  defScene('who', function () {
    return showWord('who', 10).then(function (wm) {
      // becomes a big "?" that orbits her, then an arrow pointing at her
      var q = makeWord('?', '#0abde3', 1.3);
      var start = wm.position.clone();
      return tw(0.5, function (k) {
        wm.scale.setScalar(Math.max(0.001, 1 - k));
        wm.rotation.y = k * 5;
      }).then(function () {
        scene.remove(wm);
        q.position.copy(start);
        scene.add(q);
        return popIn(q, 0.4, 1);
      }).then(function () {
        return tw(2.2, function (k) {
          var a = k * Math.PI * 4 + Math.PI / 2;
          var r = 2.1 - k * 0.5;
          q.position.set(Math.cos(a) * r, 1.6 + Math.sin(k * Math.PI) * 1.2, 0.3 + Math.sin(a) * r);
          q.rotation.y = Math.sin(a) * 0.5;
        });
      }).then(function () {
        var top = new THREE.Vector3(0, 3.3, 0.3);
        return tw(0.5, function (k) {
          q.position.lerp(top, k);
          q.scale.setScalar(Math.max(0.001, 1 - k));
        }).then(function () {
          scene.remove(q);
          puff(top, 0xee5253, 8);
          var ar = makeArrow();
          ar.position.copy(top);
          scene.add(ar);
          W.arrow = ar;
          return popIn(ar, 0.4);
        });
      }).then(function () {
        world.loop = function (t) {
          rooIdle(t);
          if (W.arrow) W.arrow.position.y = 3.3 + Math.abs(Math.sin(t * 3.2)) * 0.3;
        };
      });
    });
  });

  // --- 12. hops ---------------------------------------------------
  defScene('hops', function () {
    // arrow leaves
    if (W.arrow) {
      var ar = W.arrow;
      tw(0.4, function (k) { ar.scale.setScalar(Math.max(0.001, 1 - k)); })
        .then(function () { scene.remove(ar); });
      W.arrow = null;
    }
    return showWord('hops', 11).then(function (wm) {
      // the word itself boings like a spring before morphing
      return tw(1.1, function (k) {
        var b = Math.abs(Math.sin(k * Math.PI * 3));
        wm.position.y = WORD_POS.y + b * 0.8;
        wm.scale.set(1 + (1 - b) * 0.25, 0.7 + b * 0.45, 1);
      }, linear).then(function () { return wm; });
    }).then(function (wm) {
      var pos = new THREE.Vector3(-1.9, 0, 0.5);
      return morphInto(wm, pos.clone().setY(0.6), function () {
        var sp = makeSpring();
        sp.position.copy(pos);
        scene.add(sp);
        W.spring = sp;
        world.loop = function (t) {
          rooIdle(0);
          var cyc = 1.7, ph = (t % cyc) / cyc;
          var y = 0, sq = 1;
          if (ph < 0.18) { sq = 1 - 0.3 * Math.sin(ph / 0.18 * Math.PI); }
          else if (ph < 0.58) {
            var p = (ph - 0.18) / 0.4;
            y = 1.6 * 4 * p * (1 - p);
            sq = 1 + 0.15 * Math.sin(p * Math.PI);
          } else if (ph < 0.75) { sq = 1 - 0.2 * Math.sin((ph - 0.58) / 0.17 * Math.PI); }
          if (W.roo) {
            W.roo.position.y = y;
            W.roo.scale.set(0.95 * (2 - sq) * 0.5 + 0.475, 0.95 * sq, 0.95);
          }
          sp.scale.y = sq < 1 ? sq * 0.8 : 1;
          sp.position.y = 0;
        };
        return sp;
      });
    });
  });

  // --- 13. every --------------------------------------------------
  defScene('every', function () {
    // spring bounces away, kangaroo calms down
    if (W.spring) {
      var sp = W.spring;
      tw(0.5, function (k) {
        sp.position.y = Math.sin(k * Math.PI) * 1.5;
        sp.position.x = -1.9 - k * 3;
        sp.scale.setScalar(Math.max(0.001, 1 - k));
      }).then(function () { scene.remove(sp); });
      W.spring = null;
    }
    if (W.roo) { W.roo.scale.setScalar(0.95); W.roo.position.y = 0; }
    return showWord('every', 12).then(function (wm) {
      // first group of prints appears with a tick-tock rhythm
      var group0 = PATH.prints.slice(0, 4);
      var pos = new THREE.Vector3(group0[0].x, 0.1, PATH_Z);
      return morphInto(wm, pos, function () {
        W.prints = [];
        var g = new THREE.Group();
        scene.add(g);
        W.printGroup = g;
        group0.forEach(function (pr) {
          var fp = makeFootprintPair(pr.kind);
          fp.position.set(pr.x, 0.02, PATH_Z);
          fp.scale.setScalar(0.001);
          g.add(fp);
          W.prints.push(fp);
        });
        world.loop = function (t) {
          rooIdle(t);
          // rhythmic pulse: each print pops in sequence, endlessly
          var cyc = 2.8;
          var ph = (t % cyc) / cyc;
          W.prints.forEach(function (fp, i) {
            var st = i * 0.18;
            var k = Math.min(1, Math.max(0, (ph - st) / 0.12));
            var s = easeOutBack(k);
            fp.scale.setScalar(Math.max(0.001, s * (1 + Math.max(0, 0.4 - Math.abs(ph - st - 0.12) * 4))));
          });
        };
        return g;
      }, 1);
    });
  });

  // --- 14. few ----------------------------------------------------
  defScene('few', function () {
    // freeze prints at full size
    world.loop = function (t) { rooIdle(t); };
    W.prints.forEach(function (fp) { fp.scale.setScalar(1); });
    return showWord('few', 13).then(function (wm) {
      return tw(0.5, function (k) {
        wm.scale.setScalar(Math.max(0.001, 1 - k));
        wm.rotation.y = k * 5;
      }).then(function () { scene.remove(wm); });
    }).then(function () {
      // numbers 1,2,3 drop on the three walk prints
      W.numbers = [];
      var walks = W.prints.slice(0, 3);
      return walks.reduce(function (p, fp, i) {
        return p.then(function () {
          var num = makeNumber(i + 1, ['#ff6b6b', '#ff9f43', '#1dd1a1'][i]);
          num.position.set(fp.position.x, 3, PATH_Z);
          scene.add(num);
          W.numbers.push(num);
          puff(new THREE.Vector3(fp.position.x, 0.8, PATH_Z), 0xffffff, 5);
          return tw(0.45, function (k) {
            num.position.y = 3 - (3 - 0.85) * easeOutBack(k);
          }, linear);
        });
      }, Promise.resolve()).then(function () {
        world.loop = function (t) {
          rooIdle(t);
          W.numbers.forEach(function (n, i) {
            var b = Math.max(0, Math.sin(t * 2.4 - i * 0.9));
            n.position.y = 0.85 + b * 0.3;
            n.scale.setScalar(1 + b * 0.2);
          });
        };
      });
    });
  });

  // --- 15. steps --------------------------------------------------
  defScene('steps!', function () {
    // numbers float away
    if (W.numbers) {
      W.numbers.forEach(function (n, i) {
        tw(0.5, function (k) {
          n.position.y += 0.06;
          n.scale.setScalar(Math.max(0.001, 1 - k));
        }).then(function () { scene.remove(n); });
      });
      W.numbers = null;
    }
    world.loop = function (t) { rooIdle(t); };
    return showWord('steps', 14).then(function (wm) {
      // morphs into a big stamping foot that finishes the trail
      var startPr = PATH.prints[4];
      var pos = new THREE.Vector3(startPr.x, 0.9, PATH_Z);
      return morphInto(wm, pos, function () {
        var foot = new THREE.Group();
        var f = mesh(new THREE.CapsuleGeometry(0.16, 0.7, 4, 10), mat(0x9c6836), 0, 0, 0);
        f.rotation.x = Math.PI / 2;
        f.scale.y = 0.45;
        foot.add(f);
        foot.position.copy(pos);
        scene.add(foot);
        return foot;
      }).then(function (foot) {
        // stamp remaining prints one by one
        var rest = PATH.prints.slice(4);
        return rest.reduce(function (p, pr) {
          return p.then(function () {
            return tw(0.22, function (k) {
              foot.position.x += (pr.x - foot.position.x) * k;
              foot.position.y = 0.9 - Math.sin(k * Math.PI / 2) * 0.75;
            }, linear).then(function () {
              var fp = makeFootprintPair(pr.kind);
              fp.position.set(pr.x, 0.02, PATH_Z);
              W.printGroup.add(fp);
              W.prints.push(fp);
              puffSmall(new THREE.Vector3(pr.x, 0.2, PATH_Z));
              return tw(0.1, function (k) { foot.position.y = 0.15 + k * 0.75; }, linear);
            });
          });
        }, Promise.resolve()).then(function () {
          return tw(0.4, function (k) {
            foot.scale.setScalar(Math.max(0.001, 1 - k));
            foot.position.y += 0.05;
          }).then(function () { scene.remove(foot); });
        });
      });
    });
  });

  // --- 16. finale “!” --------------------------------------------
  defScene('!', function () {
    return showWord('!', 15).then(function (wm) {
      return tw(0.5, function (k) {
        wm.scale.setScalar(1 + k * 1.2);
        wm.rotation.z = Math.sin(k * Math.PI * 2) * 0.2;
      }).then(function () {
        return tw(0.4, function (k) { wm.scale.setScalar(Math.max(0.001, 2.2 * (1 - k))); });
      }).then(function () { scene.remove(wm); });
    }).then(function () {
      // starburst + confetti
      var burst = new THREE.Group();
      scene.add(burst);
      var stars = [];
      for (var i = 0; i < 10; i++) {
        var st = makeStar([0xffe066, 0xff6b6b, 0x54a0ff, 0x1dd1a1, 0xf368e0][i % 5]);
        st.position.set(0, 3.4, 1.5);
        burst.add(st);
        stars.push({ m: st, a: i / 10 * Math.PI * 2 });
      }
      tw(1.1, function (k) {
        stars.forEach(function (s) {
          s.m.position.set(Math.cos(s.a) * k * 5, 3.4 + Math.sin(s.a) * k * 2.6 - k * k * 2, 1.5);
          s.m.rotation.z = k * 6;
          s.m.scale.setScalar(Math.max(0.001, 1.4 * (1 - k * 0.7)));
        });
      }, linear).then(function () { scene.remove(burst); });

      // confetti rain (fewer under test)
      var conf = new THREE.Group();
      scene.add(conf);
      W.confetti = [];
      var N = TEST ? 20 : 90;
      var cols = [0xff6b6b, 0xff9f43, 0xfeca57, 0x1dd1a1, 0x54a0ff, 0xf368e0];
      for (var c = 0; c < N; c++) {
        var pm = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.2),
          new THREE.MeshBasicMaterial({ color: cols[c % 6], side: THREE.DoubleSide }));
        pm.position.set(-8 + rand() * 16, rand() * 9 + 2, -1 + rand() * 4);
        pm.userData = { vy: 0.5 + rand() * 0.8, vr: 1 + rand() * 3, ph: rand() * 6 };
        conf.add(pm);
        W.confetti.push(pm);
      }

      // kangaroo moves to path start and does the walk-walk-walk-HOP loop
      var r0 = W.roo.position.clone();
      return tw(0.9, function (k) {
        W.roo.position.x = r0.x + (PATH.startX - r0.x) * k;
        W.roo.position.z = r0.z + (PATH_Z - r0.z) * k;
        W.roo.position.y = Math.abs(Math.sin(k * Math.PI * 2)) * 0.5;
        W.roo.rotation.y = k * Math.PI / 2;
      }).then(function () {
        W.roo.rotation.y = Math.PI / 2;
        world.loop = function (t) {
          // travel along keyframes
          var tt = t % PATH.total;
          var x = PATH.startX, y = 0, sq = 1;
          for (var i = 0; i < PATH.frames.length; i++) {
            var fr = PATH.frames[i];
            if (tt >= fr.t1) { x = fr.x1; continue; }
            if (tt < fr.t0) break;
            var p = (tt - fr.t0) / (fr.t1 - fr.t0);
            x = fr.x0 + (fr.x1 - fr.x0) * p;
            y = fr.h * 4 * p * (1 - p);
            sq = 1 + (fr.big ? 0.22 : 0.1) * Math.sin(p * Math.PI);
            break;
          }
          if (W.roo) {
            W.roo.position.x = x;
            W.roo.position.y = y;
            W.roo.scale.set(0.95 * (2 - sq) * 0.5 + 0.475, 0.95 * sq, 0.95);
            var j = W.roo.userData.joey;
            j.position.y = 1.05 + y * 0.04 + Math.sin(t * 4) * 0.04;
          }
          if (W.det) W.det.position.y = Math.abs(Math.sin(t * 3)) * 0.18;
          W.confetti.forEach(function (pm) {
            pm.position.y -= pm.userData.vy * 0.016 * 2.2;
            pm.position.x += Math.sin(t * 2 + pm.userData.ph) * 0.008;
            pm.rotation.x += pm.userData.vr * 0.01;
            pm.rotation.y += pm.userData.vr * 0.013;
            if (pm.position.y < 0.05) pm.position.y = 9 + rand() * 2;
          });
        };
        // reveal replay button
        document.getElementById('replay').classList.add('show');
        document.getElementById('hint').classList.add('hidden');
      });
    });
  });

  // ============================================================
  //  UI: sentence bar / hint / title / replay
  // ============================================================
  var barEl = document.getElementById('bar');
  TOKENS.forEach(function (t, i) {
    var s = document.createElement('span');
    s.textContent = t;
    s.id = 'tok' + i;
    barEl.appendChild(s);
  });
  function setBar(idx, all) {
    TOKENS.forEach(function (t, i) {
      var el = document.getElementById('tok' + i);
      el.className = all ? 'done' : (i < idx ? 'done' : (i === idx ? 'now' : ''));
    });
  }

  // ============================================================
  //  Flow control
  // ============================================================
  var idx = -1;
  var busy = false;
  var started = false;

  window.__state = { ready: false, scene: -1, word: null, busy: false };

  function advance() {
    if (busy) return;
    if (idx >= scenes.length - 1) return;
    if (!started) {
      started = true;
      document.getElementById('title').classList.add('gone');
    }
    busy = true;
    window.__state.busy = true;
    document.getElementById('hint').classList.add('hidden');
    idx++;
    var isFinale = idx === scenes.length - 1;
    setBar(Math.min(idx, TOKENS.length - 1), isFinale);
    window.__state.scene = idx;
    window.__state.word = scenes[idx].word;
    scenes[idx].run().then(function () {
      busy = false;
      window.__state.busy = false;
      if (!isFinale) document.getElementById('hint').classList.remove('hidden');
    }).catch(function (e) {
      console.error(e);
      busy = false;
      window.__state.busy = false;
    });
  }
  window.__advance = advance;

  function onTap() { advance(); }
  window.addEventListener('pointerdown', function (e) {
    if (e.target.id === 'replay') return;
    onTap();
  });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'Enter') onTap();
  });
  document.getElementById('replay').addEventListener('click', function (e) {
    e.stopPropagation();
    location.reload();
  });

  // ============================================================
  //  Main loop
  // ============================================================
  var last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;
    updateTweens(dt);
    if (world.loop) { try { world.loop(elapsed); } catch (e) { console.error(e); world.loop = null; } }
    window.__clouds.forEach(function (c, i) {
      c.position.x += dt * (0.12 + i * 0.03);
      if (c.position.x > 15) c.position.x = -15;
    });
    camera.position.x = Math.sin(elapsed * 0.25) * 0.15;
    camera.lookAt(0, 1.6, 0);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  window.__state.ready = true;
})();
