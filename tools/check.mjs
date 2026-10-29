// Local CI-equivalent runner: runs every check in order, keeps a bounded log per step and
// exits non-zero if any step fails. Usage: `npm run check` or `npm run check -- --package`.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logDir = path.join(root, '.check-logs');
const MAX_LOG_CHARS = 20_000;
const MAX_CONSOLE_LINES = 40;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const steps = [
  { name: 'format', command: npm, args: ['run', 'format:check'] },
  { name: 'lint', command: npm, args: ['run', 'lint'] },
  { name: 'typecheck', command: npm, args: ['run', 'typecheck'] },
  { name: 'test', command: npm, args: ['test'] },
  { name: 'build', command: npm, args: ['run', 'build:renderer'] },
  { name: 'build-electron', command: npm, args: ['run', 'build:electron'] },
  { name: 'docs', command: 'powershell.exe', args: ['-NoProfile', '-File', path.join('tools', 'validate-docs.ps1')] },
];
if (process.argv.includes('--package')) {
  steps.push({
    name: 'package',
    command: npm,
    args: ['exec', '--', 'electron-builder', '--win', '--config', 'electron-builder.yml'],
  });
}

/** Keeps the head and tail of long output so logs stay bounded but still show the failure. */
function bound(text, limit) {
  if (text.length <= limit) return text;
  const half = Math.floor(limit / 2);
  return `${text.slice(0, half)}\n… [${text.length - limit} characters omitted] …\n${text.slice(-half)}`;
}

function run(step) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(step.command, step.args, { cwd: root, shell: process.platform === 'win32', env: process.env });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (code) => resolve({ ...step, code: code ?? 1, output, seconds: (Date.now() - started) / 1000 }));
    child.on('error', (error) => resolve({ ...step, code: 1, output: String(error), seconds: 0 }));
  });
}

mkdirSync(logDir, { recursive: true });
const results = [];
for (const step of steps) {
  process.stdout.write(`▶ ${step.name} … `);
  const result = await run(step);
  writeFileSync(path.join(logDir, `${step.name}.log`), bound(result.output, MAX_LOG_CHARS));
  results.push(result);
  console.log(`${result.code === 0 ? 'PASS' : 'FAIL'} (${result.seconds.toFixed(1)}s)`);
  if (result.code !== 0) {
    const lines = result.output.trimEnd().split(/\r?\n/);
    console.log(lines.slice(-MAX_CONSOLE_LINES).join('\n'));
  }
}

const failed = results.filter((result) => result.code !== 0);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Logs: .check-logs/`);
if (failed.length > 0) {
  console.log(`Failed: ${failed.map((result) => result.name).join(', ')}`);
  process.exit(1);
}
