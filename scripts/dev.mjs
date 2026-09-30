import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const worker = join(root, 'renju');
const wrangler = join(worker, 'node_modules', '.bin', 'wrangler');

if (!existsSync(wrangler)) {
  console.log('Playroom Worker 의존성을 설치합니다.');
  const install = spawnSync('npm', ['ci'], { cwd: worker, stdio: 'inherit' });
  if (install.status !== 0) process.exit(install.status ?? 1);
}

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
  process.exitCode = code;
}

function start(name, args, options = {}) {
  const child = spawn('npm', args, {
    cwd: root,
    stdio: 'inherit',
    detached: true,
    ...options,
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(`${name} 실행 실패: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`${name} 종료 (${code ?? 'signal'})`);
      stop(code || 1);
    }
  });
}

const apiUrl = process.env.PUBLIC_RENJU_API_URL || 'http://127.0.0.1:8787';
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
start('Playroom Worker', ['--prefix', 'renju', 'run', 'dev', '--', '--port', '8787']);
for (let attempt = 0; attempt < 40 && !stopping; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:8787/api/rooms');
    if (response.status === 404) break;
  } catch {
    // Wrangler is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (attempt === 39) {
    console.error('Playroom Worker가 8787 포트에서 시작되지 않았습니다.');
    stop(1);
  }
}
if (!stopping)
  start('Astro', ['run', 'dev:site', '--', ...process.argv.slice(2)], {
    env: { ...process.env, PUBLIC_RENJU_API_URL: apiUrl },
  });
