/**
 * Local development: the API server (with watch) and the Vite dev server together.
 * Ctrl+C, or either one stopping, stops both.
 */
import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', '--import', 'tsx', '--watch', 'server/index.ts'], {
    stdio: 'inherit',
    env: process.env,
  }),
  spawn('npx', ['vite'], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' }),
];

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}

for (const child of children) child.on('exit', (code) => stopAll(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => stopAll(0));
process.on('exit', () => {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
});
