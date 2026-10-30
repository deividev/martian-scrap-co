import './style.css';
import { I18n } from './i18n/i18n';
import { createPlatformAdapter } from './platform/platformAdapter';
import { runBenchmarkScene } from './presentation/benchmarkScene';
import { createTestYardScene } from './presentation/testYardScene';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
  throw new Error('Missing #game canvas');
}

// Language: saved choice, else the system language; L switches English/Spanish at any time.
const i18n = I18n.detect(
  (() => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  })(),
  navigator.language,
);
const languageLabel = document.querySelector<HTMLElement>('#language-status');
const applyLanguage = (): void => {
  document.documentElement.lang = i18n.locale;
  if (languageLabel) languageLabel.textContent = i18n.t('language.current');
  updatePlatformStatus();
};
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyL' && !event.repeat) {
    i18n.toggle();
    applyLanguage();
  }
});

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
    i18n,
    feedback: document.querySelector<HTMLElement>('#target-feedback'),
    container: document.querySelector<HTMLElement>('#container-status'),
  }).catch((error: unknown) => {
    canvas.dataset['sceneError'] = error instanceof Error ? error.message : String(error);
    console.error('Scene failed to start', error);
  });
}

const platform = createPlatformAdapter();
const status = document.querySelector<HTMLElement>('#platform-status');
let appInfo: Awaited<ReturnType<typeof platform.getAppInfo>> = null;
function updatePlatformStatus(): void {
  if (!status) return;
  status.textContent = appInfo
    ? i18n.t('platform.electron', { electron: appInfo.electron, platform: appInfo.platform, version: appInfo.version })
    : i18n.t('platform.browser');
  status.dataset['platform'] = platform.kind;
}
void platform.getAppInfo().then((info) => {
  appInfo = info;
  updatePlatformStatus();
});
applyLanguage();
