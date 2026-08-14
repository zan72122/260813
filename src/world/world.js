import * as THREE from 'three';
import { L, headX, biscuitX } from './layout.js';
import {
  Strip,
  makeBottomTexture,
  makeDoughBump,
  makeDrumTexture,
  makeBlobTexture,
  makeBackdropTexture,
} from '../art/textures.js';
import { makeBiscuitMaterials, makeChocoMaterial, makeStripMaterial } from '../art/materials.js';
import { biscuitGeometry, fillingGeometry, plateGeometry } from '../art/geometry.js';
import { ANIMAL_IDS } from '../art/animals.js';
import { clamp01, makeRandom } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function box(w, h, d, color, extra = {}) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshPhongMaterial({ color, shininess: 24, ...extra }),
  );
}

function cyl(rt, rb, h, seg, color, extra = {}) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, h, seg),
    new THREE.MeshPhongMaterial({ color, shininess: 40, ...extra }),
  );
}

function beltTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#6f7f8c';
  x.fillRect(0, 0, 128, 32);
  x.fillStyle = '#5d6c78';
  for (let i = 0; i < 128; i += 32) x.fillRect(i, 0, 16, 32);
  x.fillStyle = 'rgba(255,255,255,0.10)';
  x.fillRect(0, 0, 128, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(28, 1);
  return t;
}

export class World {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.rnd = makeRandom(20240813);
    this.time = 0;
    this.beltScroll = 0;
    this.beltSpeed = 0;

    this.strip = new Strip({ cells: L.cells, cellPx: quality === 'low' ? 192 : 256 });
    // uv of the injection hole = where L.holeX lands inside the lid's uv box
    const uvHalf = L.biscuitW / 2 - L.heroBevel;
    this.bottomTex = makeBottomTexture(
      quality === 'low' ? 128 : 256,
      (L.holeX + uvHalf) / (uvHalf * 2),
      0.5,
    );
    this.bumpTex = makeDoughBump(128);
    this.blobTex = makeBlobTexture();

    this._buildLights();
    this._buildRoom();
    this._buildBelt();
    this._buildPrinter();
    this._buildCutter();
    this._buildOven();
    this._buildBand();
    this._buildLine();
    this._buildHero();
    this._buildTray();
    this._buildParticles();
  }

  // ---------------------------------------------------------------- scenery
  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xfff4e2, 0xffd8b0, 1.0));
    const key = new THREE.DirectionalLight(0xfff1dc, 1.35);
    key.position.set(8, 14, 12);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd9ff, 0.55);
    rim.position.set(-10, 6, -8);
    this.scene.add(rim);
    // bounce from below: the underside of a biscuit is a hero surface here
    const bounce = new THREE.DirectionalLight(0xffe9cd, 0.5);
    bounce.position.set(2, -8, 10);
    this.scene.add(bounce);
    // a soft light from the lens side: the cross-section of a broken biscuit
    // faces the camera, and nothing else in the rig would reach it
    const front = new THREE.DirectionalLight(0xfff4e6, 0.45);
    front.position.set(4, 6, 18);
    this.scene.add(front);
    this.ovenGlow = new THREE.PointLight(0xff8a2c, 0, 9, 2);
    this.ovenGlow.position.set(L.bakeLine, 1.1, 0);
    this.scene.add(this.ovenGlow);
  }

  _buildRoom() {
    this.scene.background = new THREE.Color(0xd9eef7);
    this.scene.fog = new THREE.Fog(0xd9eef7, 30, 70);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 70),
      new THREE.MeshPhongMaterial({ color: 0x8ecfc6, shininess: 6 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.2;
    this.scene.add(floor);

    // a few soft floor tiles give the wide shots some rhythm
    for (let i = 0; i < 14; i++) {
      const tile = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 2.6),
        new THREE.MeshBasicMaterial({ color: 0x7cc3ba, transparent: true, opacity: 0.5 }),
      );
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(-16 + i * 4, -2.18, (i % 2 ? 5.2 : -5.6));
      this.scene.add(tile);
    }

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 34),
      new THREE.MeshBasicMaterial({ map: makeBackdropTexture(), toneMapped: false }),
    );
    wall.position.set(8, 9, -17);
    this.scene.add(wall);

    // A factory wall right behind the line. Every side-on shot then has a
    // clean, close background instead of a band of distant floor.
    const panel = new THREE.Group();
    const back = box(46, 8.4, 0.4, 0xfaf1e2, { shininess: 8 });
    back.position.set(3, 2.0, -4.6);
    panel.add(back);
    const skirt = box(46, 1.5, 0.5, 0x9fdcd4, { shininess: 12 });
    skirt.position.set(3, -1.6, -4.5);
    panel.add(skirt);
    const stripe = box(46, 0.36, 0.5, 0xffc247, { shininess: 12 });
    stripe.position.set(3, 3.1, -4.45);
    panel.add(stripe);
    for (let x = -18; x <= 24; x += 4.2) {
      const rivet = cyl(0.14, 0.14, 0.16, 8, 0xe7dccb);
      rivet.rotation.x = Math.PI / 2;
      rivet.position.set(x, 3.1, -4.3);
      panel.add(rivet);
    }
    // abstract wall decor — shapes only: a picture of the product up here would
    // give the whole game away in the first ten seconds
    const decor = [0xffc9d8, 0xffd98a, 0xa8e6d0, 0xc9d9ff];
    for (let i = 0; i < 10; i++) {
      const disc = cyl(0.62, 0.62, 0.12, 18, decor[i % decor.length]);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(-17 + i * 4.6, 4.3 + (i % 2) * 0.9, -4.3);
      panel.add(disc);
      const bar = box(1.9, 0.22, 0.1, 0xe7dccb);
      bar.position.set(-15 + i * 4.6, 5.4 - (i % 2) * 0.7, -4.3);
      panel.add(bar);
    }
    this.scene.add(panel);

    // Overhead plumbing. A phone in portrait shows a tall, narrow slice of the
    // world, so the space above the line has to earn its keep.
    const ceiling = new THREE.Group();
    const pipe = cyl(0.28, 0.28, 46, 10, 0xbfe3ef);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(5, 5.1, -2.6);
    ceiling.add(pipe);
    for (let x = -12; x <= 24; x += 6) {
      const drop = cyl(0.13, 0.13, 1.5, 8, 0xdfeef4);
      drop.position.set(x, 5.9, -2.6);
      ceiling.add(drop);
      const cord = cyl(0.05, 0.05, 1.1, 6, 0xcfe0e8);
      cord.position.set(x + 3, 5.3, 0.6);
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.62, 0.6, 14, 1, true),
        new THREE.MeshPhongMaterial({ color: 0xffc247, side: THREE.DoubleSide, shininess: 40 }),
      );
      shade.position.set(x + 3, 4.5, 0.6);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff3c4 }),
      );
      bulb.position.set(x + 3, 4.25, 0.6);
      ceiling.add(cord, shade, bulb);
    }
    this.scene.add(ceiling);

    // Foreground crates. On a tall phone screen the strip below the conveyor
    // is otherwise dead space; these give it depth without hiding the line.
    const crates = new THREE.Group();
    const colors = [0xffc9d8, 0xffd98a, 0xa8e6d0, 0xc9d9ff];
    for (let i = 0; i < 9; i++) {
      const w = 1.5 + this.rnd() * 0.5;
      const hgt = 1.0 + this.rnd() * 0.4;
      const crate = box(w, hgt, 1.4, colors[i % colors.length], { shininess: 14 });
      crate.position.set(-15 + i * 4.6 + this.rnd(), -2.2 + hgt / 2, 3.3 + this.rnd() * 0.5);
      crate.rotation.y = (this.rnd() - 0.5) * 0.5;
      crates.add(crate);
      const lid = box(w * 0.9, 0.16, 1.25, 0xffffff, { shininess: 20 });
      lid.position.copy(crate.position);
      lid.position.y += hgt / 2;
      lid.rotation.y = crate.rotation.y;
      crates.add(lid);
    }
    this.scene.add(crates);
  }

  _buildBelt() {
    const g = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(44, 0.16, L.beltHalfW * 2),
      new THREE.MeshPhongMaterial({ map: beltTexture(), shininess: 18 }),
    );
    this.beltMap = top.material.map;
    top.position.set(5, -0.08, 0);
    g.add(top);

    for (const s of [-1, 1]) {
      const rail = box(44, 0.34, 0.14, 0xf2f6f9);
      rail.position.set(5, -0.02, s * (L.beltHalfW + 0.09));
      g.add(rail);
    }
    for (let x = -14; x <= 24; x += 5.5) {
      const leg = cyl(0.16, 0.16, 2.2, 8, 0xdfe8ef);
      leg.position.set(x, -1.25, -0.55);
      g.add(leg);
      const leg2 = leg.clone();
      leg2.position.z = 0.55;
      g.add(leg2);
    }
    // dough supply roll at the far left — it unwinds as the band feeds out
    this.supplyRoll = new THREE.Group();
    this.supplyRoll.position.set(L.rollX, 1.1, 0);
    const roll = cyl(1.7, 1.7, 1.3, 24, 0xefd9a9);
    roll.rotation.x = Math.PI / 2;
    this.supplyRoll.add(roll);
    for (const s of [-1, 1]) {
      const cap = cyl(1.85, 1.85, 0.16, 24, 0xff9f4a);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(0, 0, s * 0.72);
      this.supplyRoll.add(cap);
      for (let i = 0; i < 4; i++) {
        const spoke = box(0.16, 3.0, 0.1, 0xffc247);
        spoke.rotation.z = (i / 4) * Math.PI;
        spoke.position.z = s * 0.82;
        this.supplyRoll.add(spoke);
      }
    }
    g.add(this.supplyRoll);
    // A full cabinet under the belt rather than thin legs: on a tall phone the
    // area below the line would otherwise be a dead band of floor.
    const table = box(44, 2.1, 3.4, 0x7cc2dd, { shininess: 26 });
    table.position.set(5, -1.35, 0);
    g.add(table);
    const lip = box(44, 0.26, 3.7, 0xeaf7fb, { shininess: 40 });
    lip.position.set(5, -0.34, 0);
    g.add(lip);
    for (let x = -15; x <= 24; x += 3.9) {
      const doorPanel = box(3.0, 1.2, 0.12, 0x9fd8ee, { shininess: 30 });
      doorPanel.position.set(x, -1.45, 1.72);
      g.add(doorPanel);
      const knob = cyl(0.09, 0.09, 0.14, 8, 0xffc247);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(x + 1.2, -1.45, 1.8);
      g.add(knob);
    }
    this.scene.add(g);
  }

  _buildPrinter() {
    const g = new THREE.Group();
    g.position.set(L.printX, 0, 0);
    const drum = new THREE.Group();
    const body = cyl(L.printR, L.printR, 1.34, 28, 0xffffff, {
      map: makeDrumTexture(L.cells, 192),
      shininess: 60,
    });
    body.rotation.x = Math.PI / 2;
    body.rotation.y = Math.PI / 2;
    drum.add(body);
    for (const s of [-1, 1]) {
      const cap = cyl(L.printR + 0.08, L.printR + 0.08, 0.14, 24, 0xffb43a);
      cap.rotation.x = Math.PI / 2;
      cap.position.z = s * 0.74;
      drum.add(cap);
      // chunky grip knobs so it reads as "something you turn"
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const knob = cyl(0.12, 0.12, 0.16, 10, 0xff8b2e);
        knob.rotation.x = Math.PI / 2;
        knob.position.set(Math.cos(a) * 0.52, Math.sin(a) * 0.52, s * 0.84);
        drum.add(knob);
      }
    }
    drum.position.y = L.printR + 0.08;
    this.printDrum = drum;
    g.add(drum);

    // support only from behind: a frame on the camera side would sit across
    // the one thing the child has to touch
    const frame = box(0.3, 2.4, 0.26, 0xf6fafd);
    frame.position.set(0, 0.95, -0.95);
    g.add(frame);
    const hat = box(1.5, 0.5, 2.0, 0xffb03a);
    hat.position.set(0, 2.15, 0);
    g.add(hat);
    const hatTop = box(1.0, 0.26, 1.6, 0xff8b2e);
    hatTop.position.set(0, 2.5, 0);
    g.add(hatTop);
    this.printLamp = cyl(0.18, 0.18, 0.2, 12, 0xff6b6b, { emissive: 0x000000 });
    this.printLamp.position.set(0, 2.72, 0);
    g.add(this.printLamp);
    this.scene.add(g);
    this.printerGroup = g;
  }

  _buildCutter() {
    const g = new THREE.Group();
    g.position.set(L.cutX, 0, 0);
    const drum = new THREE.Group();
    const body = cyl(L.cutR, L.cutR, 1.3, 20, 0xcfe0ec, { shininess: 80 });
    body.rotation.x = Math.PI / 2;
    body.rotation.y = Math.PI / 2;
    drum.add(body);
    // blades: thin discs around the drum
    for (let i = 0; i < 5; i++) {
      const blade = new THREE.Mesh(
        new THREE.TorusGeometry(L.cutR + 0.04, 0.035, 6, 22),
        new THREE.MeshPhongMaterial({ color: 0x9fb6c6, shininess: 100 }),
      );
      blade.rotation.y = Math.PI / 2;
      blade.position.z = -0.6 + i * 0.3;
      drum.add(blade);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bar = box(0.1, 0.1, 1.3, 0x7d97aa);
      bar.position.set(Math.cos(a) * L.cutR, Math.sin(a) * L.cutR, 0);
      bar.rotation.z = a;
      drum.add(bar);
    }
    for (const s of [-1, 1]) {
      const cap = cyl(L.cutR + 0.1, L.cutR + 0.1, 0.14, 20, 0x64d2c0);
      cap.rotation.x = Math.PI / 2;
      cap.position.z = s * 0.72;
      drum.add(cap);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const knob = cyl(0.1, 0.1, 0.16, 8, 0x2fb6a0);
        knob.rotation.x = Math.PI / 2;
        knob.position.set(Math.cos(a) * 0.38, Math.sin(a) * 0.38, s * 0.82);
        drum.add(knob);
      }
    }
    drum.position.y = L.cutR + 0.08;
    this.cutDrum = drum;
    g.add(drum);
    const cutFrame = box(0.3, 2.0, 0.26, 0xeaf3f9);
    cutFrame.position.set(0, 0.8, -1.0);
    g.add(cutFrame);
    this.scene.add(g);
  }

  _buildOven() {
    const g = new THREE.Group();
    const len = L.ovenX1 - L.ovenX0;
    const midX = (L.ovenX0 + L.ovenX1) / 2;

    const hood = box(len, 0.5, 2.6, 0xff9f5a);
    hood.position.set(midX, 2.15, -0.1);
    g.add(hood);
    // dark interior: without it the arch just shows more orange and the oven
    // reads as a solid block instead of a tunnel
    const back = box(len, 2.4, 0.24, 0x6d2f10);
    back.position.set(midX, 1.15, -1.28);
    g.add(back);
    const inFloor = box(len, 0.12, 2.4, 0x8a4418);
    inFloor.position.set(midX, -0.12, -0.1);
    g.add(inFloor);
    const inTop = box(len, 0.12, 2.4, 0x8a4418);
    inTop.position.set(midX, 1.86, -0.1);
    g.add(inTop);

    // end walls with an arch so the biscuits can travel through
    for (const x of [L.ovenX0, L.ovenX1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-1.3, 0);
      shape.lineTo(1.3, 0);
      shape.lineTo(1.3, 2.2);
      shape.lineTo(-1.3, 2.2);
      shape.closePath();
      const hole = new THREE.Path();
      hole.moveTo(-0.95, 0.05);
      hole.lineTo(0.95, 0.05);
      hole.lineTo(0.95, 0.95);
      hole.lineTo(-0.95, 0.95);
      hole.closePath();
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
      geo.rotateY(Math.PI / 2);
      const wall = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0xff8f4a, shininess: 20 }));
      wall.position.set(x, 0, 0);
      g.add(wall);
      // a bright lip around the mouth so the opening pops
      const lip = box(0.16, 0.22, 2.1, 0xffd35a);
      lip.position.set(x + (x < midX ? 0.35 : -0.05), 1.02, 0);
      g.add(lip);
    }

    // heating coils
    this.coils = [];
    for (const z of [-0.62, 0.5]) {
      for (const y of [1.55]) {
        const coil = cyl(0.075, 0.075, len - 0.7, 8, 0x8a3b12, { emissive: 0x000000 });
        coil.rotation.z = Math.PI / 2;
        coil.position.set(midX, y, z);
        this.coils.push(coil);
        g.add(coil);
      }
    }
    const sign = cyl(0.34, 0.34, 0.12, 16, 0xffd35a);
    sign.rotation.x = Math.PI / 2;
    sign.position.set(midX, 2.62, 0.9);
    g.add(sign);
    this.scene.add(g);
    this.ovenGroup = g;
  }

  // ------------------------------------------------------------------ band
  _buildBand() {
    const geo = new THREE.BoxGeometry(L.stripLen, 0.1, 1.0);
    const face = makeStripMaterial(this.strip.texture);
    const edge = new THREE.MeshPhongMaterial({ color: 0xe6cd9b, shininess: 8 });
    this.band = new THREE.Mesh(geo, [edge, edge, face, edge, edge, edge]);
    this.band.position.set(headX(0) - L.stripLen / 2, 0.05, 0);
    this.scene.add(this.band);

    // remember which vertices carry the top face's u so the band can be
    // shortened from the head while the cutter eats it
    const nrm = geo.attributes.normal;
    const uv = geo.attributes.uv;
    this._topUv = [];
    for (let i = 0; i < nrm.count; i++) {
      if (nrm.getY(i) > 0.9) this._topUv.push([i, uv.getX(i)]);
    }
    this.setBand(0, 0);
  }

  /**
   * @param {number} advance how far the band has rolled out (0..8 cells)
   * @param {number} cut     how much of it the cutter has eaten (0..8 cells)
   */
  setBand(advance, _cut) {
    const head = Math.min(headX(advance), L.cutX);
    const tail = headX(advance) - L.stripLen;
    const len = Math.max(0, head - tail);
    const frac = clamp01(len / L.stripLen);
    this.band.visible = len > 0.02;
    this.supplyRoll.rotation.z = -headX(advance) / 1.7;
    this.band.scale.x = len / L.stripLen;
    this.band.position.x = (tail + head) / 2;
    const uv = this.band.geometry.attributes.uv;
    // the remaining band is the tail end of the texture: u in [0, frac]
    for (const [i, u0] of this._topUv) uv.setX(i, u0 * frac);
    uv.needsUpdate = true;
  }

  // ------------------------------------------------------- biscuits on line
  _buildLine() {
    const geo = biscuitGeometry({
      w: L.biscuitW,
      h: L.biscuitH,
      thickness: L.thickness,
      curveSegments: this.quality === 'low' ? 3 : 5,
      bevelSegments: this.quality === 'low' ? 1 : 2,
    });
    const cells = new Float32Array(L.cells);
    for (let i = 0; i < L.cells; i++) cells[i] = L.cells - 1 - i;
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
    this.lineMats = makeBiscuitMaterials({
      map: this.strip.texture,
      bottomMap: this.bottomTex,
      instanced: true,
      key: 'line',
    });
    this.line = new THREE.InstancedMesh(geo, this.lineMats, L.cells);
    this.line.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.line.frustumCulled = false;
    this.line.count = 0;
    this.scene.add(this.line);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this.lineOffset = 0;
    this.cutCount = 0;
    this.lineHidden = -1;
  }

  /** Place the biscuits that have already been cut off the band. */
  setLine(cut, extraOffset = 0) {
    const n = Math.floor(cut);
    this.cutCount = n;
    this.line.count = n;
    this.lineOffset = extraOffset;
    this.lineCut = cut;
    for (let i = 0; i < n; i++) {
      if (this.lineHidden === i) continue;
      const x = biscuitX(i, cut) + extraOffset;
      const drop = clamp01((cut - (i + 1)) * 3);
      this._q.setFromAxisAngle(V(0, 1, 0), (i % 3) * 0.02 - 0.02);
      this._m.compose(
        V(x, L.thickness / 2 + 0.03 + (1 - drop) * 0.26, (i % 2 ? 1 : -1) * 0.012),
        this._q,
        this._s.set(1, 0.9 + drop * 0.1, 1),
      );
      this.line.setMatrixAt(i, this._m);
    }
    this.line.instanceMatrix.needsUpdate = true;
    this.line.computeBoundingSphere();
  }

  /** Take one biscuit off the line (it becomes the hero biscuit). */
  hideLineInstance(i) {
    this._q.identity();
    this._m.compose(V(0, -99, 0), this._q, this._s.set(0.0001, 0.0001, 0.0001));
    this.line.setMatrixAt(i, this._m);
    this.line.instanceMatrix.needsUpdate = true;
    this.lineHidden = i;
  }

  // ------------------------------------------------------------ hero pieces
  _buildHero() {
    const b = L.heroBevel;
    const opt = {
      w: L.biscuitW,
      h: L.biscuitH,
      thickness: L.bakedThickness,
      bevel: b,
      curveSegments: 7,
      bevelSegments: 3,
      uvBox: {
        x0: -L.biscuitW / 2 + b,
        x1: L.biscuitW / 2 - b,
        y0: -L.biscuitH / 2 + b,
        y1: L.biscuitH / 2 - b,
      },
    };
    this.heroMats = makeBiscuitMaterials({
      map: this.strip.texture,
      bottomMap: this.bottomTex,
      bump: this.bumpTex,
      baked: true,
      xray: true,
      key: 'hero',
    });
    this.choco = makeChocoMaterial();
    this.choco.setFill(0);
    this.choco.setHole(L.holeX, 0);

    this.hero = new THREE.Group();
    this.hero.position.set(L.heroX, L.heroY, 0);
    this.hero.visible = false;
    this.heroPivot = new THREE.Group();
    this.hero.add(this.heroPivot);

    // Intact biscuit: one seamless mesh, so nothing hints that it can open.
    const fillOpt = {
      w: L.biscuitW,
      h: L.biscuitH,
      thickness: L.bakedThickness - 0.13,
      inset: 0.1,
    };
    this.heroWhole = new THREE.Group();
    this.heroWhole.add(
      new THREE.Mesh(biscuitGeometry(opt), this.heroMats),
      new THREE.Mesh(fillingGeometry(fillOpt), this.choco),
    );
    this.heroPivot.add(this.heroWhole);

    // Broken biscuit: only ever seen apart, so the two halves are free to
    // overlap generously — and the filling overlaps further still, which is
    // what puts a band of chocolate proud of the crumb at the break.
    this.halves = [];
    for (const side of ['left', 'right']) {
      const g = new THREE.Group();
      g.add(
        new THREE.Mesh(biscuitGeometry({ ...opt, side, overlap: 0.08 }), this.heroMats),
        new THREE.Mesh(fillingGeometry({ ...fillOpt, side, overlap: 0.12 }), this.choco),
      );
      this.heroPivot.add(g);
      this.halves.push(g);
    }
    this.setBroken(false);
    this.scene.add(this.hero);

    // chocolate nozzle + tank
    this.nozzle = new THREE.Group();
    const tip = cyl(0.055, 0.1, 0.3, 12, 0x8f5a2a, { shininess: 70 });
    tip.position.y = 0.15;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.035, 8, 16),
      new THREE.MeshPhongMaterial({ color: 0x3c2a1e, shininess: 30 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.26;
    const collar = cyl(0.135, 0.135, 0.08, 12, 0xff8b2e);
    const bodyN = cyl(0.11, 0.11, 0.44, 12, 0xffc247);
    bodyN.position.y = -0.25;
    // no hose on the nozzle itself: anything hanging off it ends up pointing
    // down the barrel of the macro camera once the claw tips the biscuit
    this.nozzle.add(tip, ring, collar, bodyN);
    this.nozzle.visible = false;
    this.dockLocal = new THREE.Vector3(L.holeX, -L.bakedThickness / 2 - 0.28, 0);
    this.nozzleDock = new THREE.Vector3();
    this.nozzleHome = new THREE.Vector3(L.heroX + L.holeX, L.heroY - 1.15, 0.45);
    this.nozzle.position.copy(this.nozzleHome);
    this.scene.add(this.nozzle);

    // the little claw that holds the biscuit up while it is filled
    this.holder = new THREE.Group();
    for (const s of [-1, 1]) {
      const pad = box(0.1, 0.26, 0.42, 0x8fd8ff, { shininess: 70 });
      pad.position.set(s * (L.biscuitW / 2 + 0.01), 0, 0);
      const arm = box(0.13, 2.4, 0.16, 0xeaf3f9);
      arm.position.set(s * (L.biscuitW / 2 + 0.06), 1.3, -0.3);
      this.holder.add(pad, arm);
    }
    this.holder.position.set(L.heroX, L.heroY, 0);
    this.holder.visible = false;
    this.scene.add(this.holder);

    // cooling fan, switched on for the cool-down beat
    this.fan = new THREE.Group();
    const hub = cyl(0.16, 0.16, 0.2, 12, 0xdfeef4);
    hub.rotation.x = Math.PI / 2;
    this.fanBlades = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const blade = box(0.72, 0.2, 0.06, 0x8fd8ff, { shininess: 60 });
      blade.position.set(Math.cos((i / 4) * Math.PI * 2) * 0.38, Math.sin((i / 4) * Math.PI * 2) * 0.38, 0);
      blade.rotation.z = (i / 4) * Math.PI * 2;
      this.fanBlades.add(blade);
    }
    const ringF = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.07, 8, 20),
      new THREE.MeshPhongMaterial({ color: 0x64d2c0, shininess: 60 }),
    );
    this.fan.add(hub, this.fanBlades, ringF);
    this.fan.position.set(L.heroX - 1.55, L.heroY + 0.15, -0.15);
    this.fan.rotation.y = 0.5;
    this.fan.visible = false;
    this.scene.add(this.fan);

    // dark backing plate: the cutaway biscuit is translucent, and it needs
    // something to be translucent *against*
    const backing = box(3.4, 3.0, 0.3, 0x2f6f74, { shininess: 20 });
    backing.position.set(L.heroX, L.heroY + 0.15, -1.5);
    const backingTrim = box(3.7, 0.24, 0.34, 0x64d2c0, { shininess: 40 });
    backingTrim.position.set(L.heroX, L.heroY + 1.72, -1.5);

    const gantry = new THREE.Group();
    gantry.add(backing, backingTrim);
    const beam = box(2.9, 0.34, 0.55, 0xffb03a);
    beam.position.set(L.heroX, L.heroY + 2.35, -0.95);
    gantry.add(beam);
    for (const s of [-1, 1]) {
      const post = box(0.3, 5.6, 0.36, 0xeaf3f9);
      post.position.set(L.heroX + s * 1.3, L.heroY - 0.5, -0.95);
      gantry.add(post);
    }
    const lamp = cyl(0.2, 0.2, 0.18, 12, 0x64d2c0);
    lamp.position.set(L.heroX, L.heroY + 2.62, -0.95);
    gantry.add(lamp);
    gantry.visible = false;
    this.gantry = gantry;
    this.scene.add(gantry);

    // The chocolate tank sits in frame during the macro shots: the child has to
    // see where the brown stuff is coming from.
    const tank = new THREE.Group();
    const jar = cyl(0.42, 0.36, 0.8, 16, 0x4a2410, { shininess: 90 });
    const glass = cyl(0.45, 0.4, 0.86, 16, 0xffffff, {
      shininess: 100,
      transparent: true,
      opacity: 0.25,
    });
    const lid = cyl(0.5, 0.5, 0.14, 16, 0xffd35a);
    lid.position.y = 0.46;
    const spout = cyl(0.1, 0.1, 0.7, 10, 0xffc247);
    spout.position.set(0.28, 0.5, 0);
    spout.rotation.z = -0.6;
    tank.add(jar, glass, lid, spout);
    tank.position.set(L.heroX - 1.05, L.heroY - 1.5, 0.5);
    tank.visible = false;
    this.tank = tank;
    this.scene.add(tank);

  }

  /** World position of the injection hole's docking point, tilt included. */
  updateDock() {
    this.heroPivot.updateWorldMatrix(true, false);
    this.nozzleDock.copy(this.dockLocal).applyMatrix4(this.heroPivot.matrixWorld);
    return this.nozzleDock;
  }

  /** Swap the seamless biscuit for the two halves (only at the moment it snaps). */
  setBroken(broken) {
    this.broken = broken;
    this.heroWhole.visible = !broken;
    this.halves[0].visible = broken;
    this.halves[1].visible = broken;
    if (!broken) {
      for (const h of this.halves) {
        h.position.set(0, 0, 0);
        h.rotation.set(0, 0, 0);
      }
      this.heroWhole.scale.set(1, 1, 1);
      this.heroWhole.rotation.set(0, 0, 0);
    }
  }

  /** Park the nozzle in the hole and let it ride with the biscuit. */
  dockNozzleNow() {
    this.updateDock();
    this.heroPivot.add(this.nozzle);
    this.nozzle.position.copy(this.dockLocal);
    this.nozzle.rotation.set(0, 0, 0);
    this.nozzle.visible = true;
  }

  setHeroCell(cell) {
    this.heroCell = cell;
    this.heroMats.setCell(cell);
  }

  // ------------------------------------------------------------------ tray
  _buildTray() {
    const cols = 9;
    const rows = 6;
    const n = cols * rows;
    const geo = biscuitGeometry({
      w: L.biscuitW,
      h: L.biscuitH,
      thickness: L.bakedThickness,
      curveSegments: this.quality === 'low' ? 3 : 5,
      bevelSegments: this.quality === 'low' ? 1 : 2,
    });
    const cells = new Float32Array(n);
    for (let i = 0; i < n; i++) cells[i] = i % L.cells;
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
    this.trayMats = makeBiscuitMaterials({
      map: this.strip.texture,
      bottomMap: this.bottomTex,
      instanced: true,
      baked: true,
      key: 'tray',
    });
    this.trayMesh = new THREE.InstancedMesh(geo, this.trayMats, n);
    this.trayMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trayMesh.frustumCulled = false;
    this.trayMesh.count = n;

    this.trayCells = cells;
    this.trayPos = [];
    this.trayRot = [];
    this.trayShow = new Float32Array(n);
    this.trayAlive = new Uint8Array(n).fill(1);
    for (let i = 0; i < n; i++) {
      const cx = i % cols;
      const cz = Math.floor(i / cols);
      this.trayPos.push(
        V(
          L.trayX + (cx - (cols - 1) / 2) * 1.02 + (this.rnd() - 0.5) * 0.06,
          L.bakedThickness / 2 + 0.04,
          L.trayZ + (cz - (rows - 1) / 2) * 1.02 + (this.rnd() - 0.5) * 0.06,
        ),
      );
      this.trayRot.push((this.rnd() - 0.5) * 0.22);
    }

    this.tray = new THREE.Group();
    const plate = new THREE.Mesh(
      plateGeometry(cols * 1.05 + 0.8, rows * 1.05 + 0.8, 0.5, 0.22),
      new THREE.MeshPhongMaterial({ color: 0xffd9e6, shininess: 60 }),
    );
    plate.position.set(L.trayX, 0.02, L.trayZ);
    const trayTable = new THREE.Mesh(
      plateGeometry(cols * 1.05 + 3.2, rows * 1.05 + 3.0, 0.7, 1.9),
      new THREE.MeshPhongMaterial({ color: 0x8fd0e8, shininess: 30 }),
    );
    trayTable.position.set(L.trayX, -0.2, L.trayZ);
    this.tray.add(plate, trayTable, this.trayMesh);
    this.tray.visible = false;
    this.scene.add(this.tray);
    this.setTrayReveal(0);
  }

  /** k = 0 no biscuits yet, 1 = the whole tray is full (the big reveal). */
  setTrayReveal(k) {
    const n = this.trayMesh.count;
    for (let i = 0; i < n; i++) {
      const order = ((i * 7) % n) / n; // scattered arrival, not row by row
      const t = clamp01((k - order * 0.75) * 4);
      this.trayShow[i] = t;
      const s = this.trayAlive[i] ? t : 0;
      this._q.setFromAxisAngle(V(0, 1, 0), this.trayRot[i]);
      const p = this.trayPos[i];
      this._m.compose(
        V(p.x, p.y + (1 - t) * 2.2, p.z),
        this._q,
        this._s.set(s, s * (0.7 + 0.3 * t), s),
      );
      this.trayMesh.setMatrixAt(i, this._m);
    }
    this.trayMesh.instanceMatrix.needsUpdate = true;
    this.trayMesh.computeBoundingSphere();
  }

  hideTrayInstance(i) {
    this.trayAlive[i] = 0;
    this._q.setFromAxisAngle(V(0, 1, 0), 0);
    this._m.compose(V(0, -99, 0), this._q, this._s.set(0.0001, 0.0001, 0.0001));
    this.trayMesh.setMatrixAt(i, this._m);
    this.trayMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------- particles
  _buildParticles() {
    const n = this.quality === 'low' ? 60 : 140;
    this.pCount = n;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    this.pVel = new Float32Array(n * 3);
    this.pLife = new Float32Array(n);
    this.pMax = new Float32Array(n);
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.PointsMaterial({
      size: 0.22,
      map: this.blobTex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.pHead = 0;
    this.scene.add(this.points);
  }

  puff(pos, { count = 8, color = 0xffffff, spread = 0.5, speed = 1, life = 0.8, size = 0.2 } = {}) {
    const c = new THREE.Color(color);
    const P = this.points.geometry.attributes;
    for (let k = 0; k < count; k++) {
      const i = this.pHead++ % this.pCount;
      P.position.setXYZ(
        i,
        pos.x + (this.rnd() - 0.5) * spread,
        pos.y + (this.rnd() - 0.5) * spread,
        pos.z + (this.rnd() - 0.5) * spread,
      );
      P.color.setXYZ(i, c.r, c.g, c.b);
      P.size.setX(i, size * (0.6 + this.rnd() * 0.8));
      this.pVel[i * 3] = (this.rnd() - 0.5) * speed;
      this.pVel[i * 3 + 1] = (0.4 + this.rnd()) * speed;
      this.pVel[i * 3 + 2] = (this.rnd() - 0.5) * speed;
      this.pLife[i] = life;
      this.pMax[i] = life;
    }
    P.position.needsUpdate = true;
    P.color.needsUpdate = true;
    P.size.needsUpdate = true;
  }

  _updateParticles(dt) {
    const P = this.points.geometry.attributes;
    let touched = false;
    for (let i = 0; i < this.pCount; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      touched = true;
      const j = i * 3;
      this.pVel[j + 1] -= 1.4 * dt;
      P.position.setXYZ(
        i,
        P.position.getX(i) + this.pVel[j] * dt,
        P.position.getY(i) + this.pVel[j + 1] * dt,
        P.position.getZ(i) + this.pVel[j + 2] * dt,
      );
      const k = clamp01(this.pLife[i] / this.pMax[i]);
      P.size.setX(i, P.size.getX(i) * (0.9 + 0.1 * k));
      if (this.pLife[i] <= 0) P.position.setY(i, -999);
    }
    if (touched) {
      P.position.needsUpdate = true;
      P.size.needsUpdate = true;
    }
  }

  // --------------------------------------------------------------- runtime
  setOvenHeat(k) {
    this.ovenGlow.intensity = k * 3.4;
    const c = new THREE.Color().setHSL(0.045, 1, 0.12 + k * 0.32);
    for (const coil of this.coils) coil.material.emissive.copy(c);
  }

  update(dt) {
    this.time += dt;
    this.beltScroll += this.beltSpeed * dt;
    this.beltMap.offset.x = -this.beltScroll * 0.6;
    this.beltSpeed *= Math.exp(-4 * dt);
    if (this.fan.visible) this.fanBlades.rotation.z += dt * 9;
    this.strip.flush(dt);
    this._updateParticles(dt);
    this.printLamp.material.emissive.setScalar(
      0.25 + 0.25 * Math.sin(this.time * 4) * (this.beltSpeed > 0.05 ? 1 : 0.2),
    );
  }

  reset() {
    this.strip.reset();
    this.lineHidden = -1;
    this.setBand(0, 0);
    this.setLine(0, 0);
    this.setTrayReveal(0);
    this.trayAlive.fill(1);
    this.tray.visible = false;
    this.hero.visible = false;
    this.scene.add(this.nozzle); // it may have been parented to the biscuit
    this.nozzle.visible = false;
    this.nozzle.rotation.set(0, 0, 0);
    this.nozzle.position.copy(this.nozzleHome);
    this.holder.rotation.set(0, 0, 0);
    this.tank.visible = false;
    this.holder.visible = false;
    this.gantry.visible = false;
    this.fan.visible = false;
    this.line.visible = true;
    this.choco.userData.fill.uFlow.value = 1;
    this.choco.setFill(0);
    this.heroMats.setCutaway(0);
    this.setBroken(false);
    this.heroPivot.rotation.set(0, 0, 0);
    this.setOvenHeat(0);
    this.lineMats.setBake(1e4, 0);
    for (let i = 0; i < this.pCount; i++) this.pLife[i] = 0;
  }

  animalFor(cell) {
    return ANIMAL_IDS[(L.cells - 1 - cell) % ANIMAL_IDS.length];
  }
}
