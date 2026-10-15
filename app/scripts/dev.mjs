// Runs the library assistant relay and the Vite dev server together.
import { spawn } from 'node:child_process';

const procs = [
  // The relay always takes 5181 in dev (Vite proxies /api to it), whatever PORT the shell sets.
  spawn(process.execPath, ['--watch', 'server/index.ts'], { stdio: 'inherit', env: { ...process.env, RELAY_PORT: '5181' } }),
  spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--strictPort'], { stdio: 'inherit' }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) stop(); });
