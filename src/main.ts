import './style.css';
import { createPlatformAdapter } from './platform/platformAdapter';
import { createSmokeScene } from './presentation/smokeScene';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
  throw new Error('Missing #game canvas');
}

createSmokeScene(canvas);

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
