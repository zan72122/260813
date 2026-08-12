import { App } from './app/App';

function bootstrap(): void {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('#app container not found');
  }
  const app = new App(container);
  app.start();

  // Dev-only convenience: dispose cleanly on Vite HMR before the module is replaced.
  const hot = (import.meta as ImportMeta & { hot?: { dispose(cb: () => void): void } }).hot;
  hot?.dispose(() => app.dispose());
}

bootstrap();
