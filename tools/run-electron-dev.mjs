// Starts Electron against the running Vite dev server (`npm run dev` in another terminal).
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, MSC_DEV_SERVER_URL: 'http://127.0.0.1:5173' },
});
child.on('exit', (code) => process.exit(code ?? 0));
