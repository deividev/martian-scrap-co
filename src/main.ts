import './style.css';
import { createPlatformAdapter } from './platform/platformAdapter';
import { createTestYardScene } from './presentation/testYardScene';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
  throw new Error('Missing #game canvas');
}

createTestYardScene(canvas, document.querySelector<HTMLElement>('#input-hint')).catch((error: unknown) => {
  canvas.dataset['sceneError'] = error instanceof Error ? error.message : String(error);
  console.error('Scene failed to start', error);
});

const platform = createPlatformAdapter();
const status = document.querySelector<HTMLElement>('#platform-status');
if (status) {
  void platform.getAppInfo().then((info) => {
    status.textContent = info
      ? `Electron ${info.electron} · ${info.platform} · v${info.version}`
      : 'Browser build · native features unavailable';
    status.dataset['platform'] = platform.kind;
  });
}
