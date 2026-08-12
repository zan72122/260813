/**
 * Collects disposer callbacks (event listener removals, GPU resource frees,
 * subsystem dispose() calls) so app teardown / hot-reload can release
 * everything in one place. All disposers run even if one throws.
 */
export class DisposeBag {
  private readonly disposers: Array<() => void> = [];

  add(disposer: () => void): void {
    this.disposers.push(disposer);
  }

  disposeAll(): void {
    while (this.disposers.length > 0) {
      const disposer = this.disposers.pop();
      try {
        disposer?.();
      } catch (error) {
        // Swallow so one bad disposer can't block releasing the rest;
        // surfaced via console.error so it still counts against console error budgets in dev.
        console.error('[DisposeBag] disposer threw', error);
      }
    }
  }
}
