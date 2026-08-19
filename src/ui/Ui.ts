/**
 * The DOM layer. Deliberately tiny: four progress dots, one pointing hand and
 * the three picture buttons at the end. During the final reveal every one of
 * them is hidden, because the brief is explicit that nothing may sit between a
 * 4-year-old and the view.
 */
export class Ui {
  private boot = document.getElementById('boot') as HTMLDivElement;
  private startBtn = document.getElementById('startBtn') as HTMLButtonElement;
  private bar = document.querySelector('#loadBar i') as HTMLElement;
  private hand = document.getElementById('hand') as HTMLImageElement;
  private dots = document.getElementById('dots') as HTMLDivElement;
  private end = document.getElementById('end') as HTMLDivElement;
  private flash = document.getElementById('flash') as HTMLDivElement;
  private dotEls: HTMLElement[];
  private handTarget = { x: 0, y: 0 };
  private handShown = false;

  onStart?: () => void;
  onAgain?: () => void;
  onColor?: () => void;
  onField?: () => void;

  constructor() {
    this.dotEls = Array.from(this.dots.querySelectorAll('b'));
    this.startBtn.addEventListener('click', () => this.onStart?.());
    document.getElementById('btnAgain')!.addEventListener('click', () => this.onAgain?.());
    document.getElementById('btnColor')!.addEventListener('click', () => this.onColor?.());
    document.getElementById('btnField')!.addEventListener('click', () => this.onField?.());
  }

  progress(v: number) { this.bar.style.width = `${Math.round(v * 100)}%`; }

  hideBoot() {
    this.boot.classList.add('hidden');
    window.setTimeout(() => { this.boot.style.display = 'none'; }, 700);
  }

  showBoot() {
    this.boot.style.display = '';
    requestAnimationFrame(() => this.boot.classList.remove('hidden'));
  }

  /** Point the hand at a screen position (css px), or hide it with `show=false`. */
  showHand(show: boolean, x = 0, y = 0) {
    if (show) {
      this.handTarget.x = x; this.handTarget.y = y;
      this.hand.style.transform = `translate(${x}px, ${y}px) translate(-50%, -12%)`;
      if (!this.handShown) { this.hand.classList.add('on'); this.handShown = true; }
    } else if (this.handShown) {
      this.hand.classList.remove('on');
      this.handShown = false;
    }
  }

  setDots(total: number, done: number, visible: boolean) {
    this.dots.classList.toggle('on', visible);
    this.dotEls.forEach((el, i) => {
      el.style.display = i < total ? '' : 'none';
      el.classList.toggle('done', i < done);
    });
  }

  showEnd(v: boolean) { this.end.classList.toggle('on', v); }

  /** A single soft white bloom, used when the first flower opens. */
  pulse(strength = 0.35, ms = 700) {
    this.flash.style.transition = 'none';
    this.flash.style.opacity = String(strength);
    requestAnimationFrame(() => {
      this.flash.style.transition = `opacity ${ms}ms ease-out`;
      this.flash.style.opacity = '0';
    });
  }
}
