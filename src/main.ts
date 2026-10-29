import './style.css';
import { createPlatformAdapter } from './platform/platformAdapter';
import { runBenchmarkScene } from './presentation/benchmarkScene';
import { createTestYardScene } from './presentation/testYardScene';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
  throw new Error('Missing #game canvas');
}

const query = new URLSearchParams(window.location.search);
const benchmark = query.get('benchmark');
if (benchmark) {
  // MSC-019 benchmark mode: numbers only, exposed for the evidence runner.
  const seconds = Math.min(120, Math.max(5, Number(query.get('seconds') ?? '15') || 15));
  runBenchmarkScene(canvas, benchmark, seconds)
    .then((report) => {
      canvas.dataset['benchmarkReport'] = JSON.stringify(report);
      console.info('MSC benchmark report', report);
    })
    .catch((error: unknown) => {
      canvas.dataset['sceneError'] = error instanceof Error ? error.message : String(error);
    });
} else {
  createTestYardScene(canvas, {
    hint: document.querySelector<HTMLElement>('#input-hint'),
    feedback: document.querySelector<HTMLElement>('#target-feedback'),
    container: document.querySelector<HTMLElement>('#container-status'),
  }).catch((error: unknown) => {
    canvas.dataset['sceneError'] = error instanceof Error ? error.message : String(error);
    console.error('Scene failed to start', error);
  });
}

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
