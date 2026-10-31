import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const children = [];
let stopping = false;

function start(label, script) {
  const child = spawn(node, [script], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  children.push(child);
  child.on('error', (err) => {
    console.error(`[${label}] 실행 실패: ${err.message}`);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping && code !== 0) {
      console.error(`[${label}] 종료됨 (코드 ${code ?? 'unknown'})`);
      stop(code || 1);
    }
  });
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exitCode = code;
}

start('PDF 프록시', path.join(root, 'server', 'pdf-proxy.js'));
start('Vite', path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'));

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
