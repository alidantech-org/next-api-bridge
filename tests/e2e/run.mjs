import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const fixture = resolve(root, 'tests/fixtures/next-app');
const backendFile = resolve(root, 'tests/fixtures/backend/server.mjs');
const packDir = resolve(root, '.e2e-pack');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const nextVersion = process.env.NEXT_E2E_VERSION ?? '15';
const env = {
  ...process.env,
  API_URL: 'http://127.0.0.1:4100/v1',
  BACKEND_PORT: '4100',
  NEXT_APP_URL: 'http://127.0.0.1:3100',
  NEXT_TELEMETRY_DISABLED: '1',
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? env,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
}

async function waitFor(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Service is not ready yet.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let backend;
let next;
try {
  run(npm, ['run', 'build']);
  rmSync(packDir, { recursive: true, force: true });
  mkdirSync(packDir, { recursive: true });
  run(npm, ['pack', '--ignore-scripts', '--pack-destination', packDir]);
  const tarballName = readdirSync(packDir).find((name) => name.endsWith('.tgz'));
  if (!tarballName) throw new Error('npm pack did not create a tarball');
  const tarball = resolve(packDir, tarballName);
  if (!existsSync(tarball)) throw new Error('npm pack tarball is missing');

  rmSync(resolve(fixture, 'node_modules'), { recursive: true, force: true });
  rmSync(resolve(fixture, '.next'), { recursive: true, force: true });
  rmSync(resolve(fixture, 'package-lock.json'), { force: true });
  run(npm, [
    'install', '--no-save', '--no-package-lock',
    tarball,
    `next@${nextVersion}`,
    'react@19',
    'react-dom@19',
    '@playwright/test',
    'typescript@5.8.2',
    '@types/react@19',
    '@types/react-dom@19',
  ], { cwd: fixture });

  run(npx, ['playwright', 'install', ...(process.env.CI ? ['--with-deps'] : []), 'chromium'], { cwd: fixture });

  backend = spawn(process.execPath, [backendFile], { cwd: root, env, stdio: 'inherit' });
  await waitFor('http://127.0.0.1:4100/v1/empty');
  run(npm, ['run', 'build'], { cwd: fixture });
  next = spawn(npm, ['run', 'start', '--', '-p', '3100'], { cwd: fixture, env, stdio: 'inherit' });
  await waitFor('http://127.0.0.1:3100');
  run(npx, ['playwright', 'test'], { cwd: fixture });
} finally {
  next?.kill('SIGTERM');
  backend?.kill('SIGTERM');
}
