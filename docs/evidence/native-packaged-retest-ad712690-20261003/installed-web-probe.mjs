import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const [suppliedRoot, suppliedLauncher, suppliedDestination] = process.argv.slice(2);
const root = await realpath(resolve(suppliedRoot));
const launcher = await realpath(resolve(suppliedLauncher));
const destination = resolve(suppliedDestination);
const fixture = await mkdtemp(join(dirname(destination), 'installed-web-'));
const workspace = join(fixture, 'workspace with spaces');
const data = join(fixture, 'data');
await mkdir(workspace);
await mkdir(data);
const env = {
  PATH: '/tmp/knorvia-native-package-acceptance-20261003/bin:/usr/bin:/bin',
  LANG: 'C.UTF-8', TERM: 'xterm-256color', NODE_PATH: '', NODE_OPTIONS: '',
  KNORVIA_ENV: 'production', KNORVIA_RUNTIME_ENV: 'production',
  KNORVIA_DATA_BASE_DIR: data, KNORVIA_HOME: join(data, '.knorvia-studio'),
  KNORVIA_STORAGE_DIR: join(data, 'cli'), KNORVIA_SESSION_DB_PATH: join(data, 'session.sqlite'),
  KNORVIA_BASE_URL: 'http://127.0.0.1:9', KNORVIA_MODEL_TELEMETRY_ENABLED: '0',
};
const report = {
  status: 'running', inputSha: 'ad712690b3eb1501574c1d29361dc801c1414373',
  fixture, root, launcher, checks: [], stdout: '', stderr: '', forcedCleanup: false,
  limits: ['Separate installed Web acceptance; original distribution-smoke TUI failure remains', 'No browser GUI, controller business flows, model requests or real user data', 'Launcher exit zero does not prove Desktop Host or Agent child-tree graceful cleanup'],
};
let web;
let socket;
let exitPromise;
let exited;

async function until(check, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await check()) return;
    if (exited) throw new Error(label + ': launcher exited early ' + JSON.stringify(exited));
    await pause(100);
  }
  throw new Error(label + ' timed out');
}

async function bounded(promise, label, milliseconds = 8000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), milliseconds); })]);
  } finally { clearTimeout(timer); }
}

try {
  report.entrySha256 = createHash('sha256').update(await readFile(join(root, 'server/entry-http.js'))).digest('hex');
  web = spawn(launcher, ['--web', '--workspace', workspace, '--no-open'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
  report.pid = web.pid;
  web.stdout.on('data', (chunk) => { report.stdout += chunk; });
  web.stderr.on('data', (chunk) => { report.stderr += chunk; });
  exitPromise = once(web, 'exit').then((value) => { exited = value; return value; });
  let base;
  await until(() => {
    base = report.stdout.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+\/)/)?.[1];
    return Boolean(base);
  }, 'Installed Web URL');
  report.baseUrl = base;
  let info;
  await until(async () => {
    try {
      const response = await fetch(new URL('api/server-info', base), { signal: AbortSignal.timeout(1000) });
      if (!response.ok) return false;
      info = await response.json();
      return true;
    } catch { return false; }
  }, 'Installed Web readiness');
  assert.equal(info.workspaces[0].path, workspace);
  report.serverInfo = info;
  report.checks.push('Installed launcher starts real HTTP entry and reports exact synthetic workspace');
  const response = await fetch(base, { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<html/i);
  report.checks.push('Installed Web serves real packaged HTML with status 200');
  const require = createRequire(join(root, 'package.json'));
  const wsPath = await realpath(require.resolve('ws'));
  assert.ok(wsPath.startsWith(root + '/'), 'WebSocket helper must come from the installed artifact');
  report.wsRuntimePath = wsPath;
  const { default: WebSocket } = await import(pathToFileURL(wsPath).href);
  socket = new WebSocket(new URL('ws', base.replace('http:', 'ws:')));
  await bounded(once(socket, 'open'), 'Real WebSocket open');
  const closed = once(socket, 'close');
  socket.close();
  await bounded(closed, 'Real WebSocket close');
  socket = undefined;
  report.checks.push('Installed artifact WebSocket opens and closes normally');
  assert.equal(web.kill('SIGTERM'), true);
  report.launcherExit = await bounded(exitPromise, 'Installed Web launcher shutdown');
  assert.deepEqual(report.launcherExit, [0, null]);
  assert.doesNotMatch(report.stdout + report.stderr, /Cannot find (?:module|package)|ERR_MODULE_NOT_FOUND|cleanup failed|shutdown(?:[- ]phase)?[^\n]*failed/i);
  web = undefined;
  report.checks.push('Installed launcher exits zero after SIGTERM with captured diagnostics; no forced cleanup');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  process.exitCode = 1;
} finally {
  socket?.terminate();
  if (web && !exited) {
    report.forcedCleanup = true;
    web.kill('SIGTERM');
    try { await bounded(exitPromise, 'Failure cleanup', 2000); }
    catch { web.kill('SIGKILL'); await bounded(exitPromise, 'Failure force cleanup', 2000); }
  }
  await rm(fixture, { recursive: true, force: true });
  report.fixtureRemoved = !existsSync(fixture);
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: report.checks, result: destination, error: report.error }));
}
