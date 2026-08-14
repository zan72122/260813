/**
 * One module = one verb. A module owns its camera shot, its gesture and the
 * single piece of the factory it drives; it tells the game when it is finished.
 */
export class Module {
  /** @param {import('../game.js').Ctx} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.done = false;
  }

  enter() {}
  update() {}
  down() {}
  move() {}
  up() {}
  exit() {}

  finish(delay = 0.6) {
    if (this.done) return;
    this.done = true;
    this.ctx.hud.show(null);
    this.ctx.tween.wait(delay, () => this.ctx.next());
  }
}
