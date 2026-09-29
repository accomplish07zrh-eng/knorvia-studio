// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export const FIXTURE_WORLD_ACCESS = String.raw`
const WORLD_KEY = Symbol.for("knorvia.exec.contract.fixture-world");
function world() {
  const value = globalThis[WORLD_KEY];
  if (!value) throw new Error("No execution fixture world is installed");
  return value;
}
`;

const FILE_SYSTEM_SEAM = `${FIXTURE_WORLD_ACCESS}
export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1, O_APPEND: 8, O_CREAT: 512, O_EXCL: 2048, O_NOFOLLOW: 131072, O_RDWR: 2, O_TRUNC: 1024, O_WRONLY: 1 };
export const promises = new Proxy({}, {
  get(_target, property) {
    const value = world().fileSystem[property];
    return typeof value === "function" ? value.bind(world().fileSystem) : value;
  }
});
const fs = new Proxy({ constants, promises }, {
  get(target, property, receiver) {
    if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
    const value = world().fileSystem[property];
    return typeof value === "function" ? value.bind(world().fileSystem) : value;
  }
});
export const accessSync = (...args) => fs.accessSync(...args);
export const appendFileSync = (...args) => fs.appendFileSync(...args);
export const chmodSync = (...args) => fs.chmodSync(...args);
export const closeSync = () => undefined;
export const createReadStream = (...args) => fs.createReadStream(...args);
export const createWriteStream = (...args) => fs.createWriteStream(...args);
export const existsSync = (...args) => fs.existsSync(...args);
export const mkdirSync = (...args) => fs.mkdirSync(...args);
export const openSync = (...args) => fs.openSync(...args);
export const readFileSync = (...args) => fs.readFileSync(...args);
export const realpathSync = (...args) => fs.realpathSync(...args);
export const statSync = (...args) => fs.statSync(...args);
export const truncateSync = (...args) => fs.truncateSync(...args);
export const unlinkSync = (...args) => fs.unlinkSync(...args);
export const writeFileSync = (...args) => fs.writeFileSync(...args);
export const access = (...args) => fs.access(...args);
export const lstat = (...args) => fs.lstat(...args);
export const mkdir = (...args) => fs.mkdir(...args);
export const open = (...args) => fs.open(...args);
export const readdir = (...args) => fs.readdir(...args);
export const rm = (...args) => fs.rm(...args);
export const stat = (...args) => fs.stat(...args);
export const statfs = (...args) => fs.statfs(...args);
export const truncate = (...args) => fs.truncate(...args);
export const unlink = (...args) => fs.unlink(...args);
export const writeFile = (...args) => fs.writeFile(...args);
export default fs;
`;

const CHILD_PROCESS_SEAM = `${FIXTURE_WORLD_ACCESS}
export function spawn(file, args = [], options = {}) {
  return world().spawn(file, args, options);
}
export function execFile(file, args, options, callback) {
  if (!Array.isArray(args) || typeof options !== "object" || typeof callback !== "function") {
    throw new Error("fixture execFile requires file, args, options, callback");
  }
  if (world().usePendingExecFile) return world().execFilePending(file, args, options, callback);
  return world().execFile(file, args, options, callback);
}
execFile[Symbol.for("nodejs.util.promisify.custom")] = function execFilePromise(file, args, options) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
};
export function exec(command, options, callback) {
  return execFile("fixture-shell", [command], options, callback);
}
export function execFileSync(file, args = [], options = {}) {
  world().retainedCalls.push({ name: "execFileSync", args: [file, args, options] });
  return typeof options.encoding === "string" ? world().execFileSyncResult : Buffer.from(world().execFileSyncResult);
}
export function spawnSync(file, args = [], options = {}) {
  world().retainedCalls.push({ name: "spawnSync", args: [file, args, options] });
  const stdout = typeof options.encoding === "string" ? world().execFileSyncResult : Buffer.from(world().execFileSyncResult);
  return { pid: 0, output: [null, stdout, ""], signal: null, status: 0, stderr: "", stdout };
}
`;

const OS_SEAM = `${FIXTURE_WORLD_ACCESS}
export const EOL = "\\n";
export const arch = () => world().process.arch;
export const freemem = () => world().freeMemoryBytes;
export const homedir = () => "/virtual/home";
export const platform = () => world().process.platform;
export const tmpdir = () => "/virtual/tmp";
export const totalmem = () => 16 * 1024 * 1024;
export default { EOL, arch, freemem, homedir, platform, tmpdir, totalmem };
`;

const CRYPTO_SEAM = `${FIXTURE_WORLD_ACCESS}
export const randomUUID = () => world().randomUUID();
export function createHash(algorithm) {
  let data = "";
  return {
    update(value) { data += Buffer.from(value).toString("hex"); return this; },
    digest(encoding) {
      let hash = 2166136261;
      for (const char of algorithm + data) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
      const hex = (hash >>> 0).toString(16).padStart(8, "0").repeat(8);
      return encoding === "hex" ? hex : Buffer.from(hex, "hex");
    }
  };
}
`;

const PROCESS_SEAM = `${FIXTURE_WORLD_ACCESS}
const memoryUsage = () => world().process.memoryUsage();
memoryUsage.rss = () => world().process.memoryUsage().rss;
const processProxy = new Proxy({}, {
  get(_target, property) {
    const state = world().process;
    if (property === "cwd") return () => state.cwd;
    if (property === "kill") return (pid, signal) => world().signal(pid, signal);
    if (property === "memoryUsage") return memoryUsage;
    if (property === "nextTick") return (callback, ...args) => queueMicrotask(() => callback(...args));
    if (property in state) return state[property];
    throw new Error("Unapproved process property: " + String(property));
  }
});
export const env = new Proxy({}, { get: (_target, property) => world().process.env[property], ownKeys: () => Reflect.ownKeys(world().process.env), getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true }) });
export const cwd = () => world().process.cwd;
export const kill = (pid, signal) => world().signal(pid, signal);
export { memoryUsage };
export const platform = world().process.platform;
export default processProxy;
`;

const TIMERS_SEAM = `${FIXTURE_WORLD_ACCESS}
export const setTimeout = (...args) => world().clock.setTimeout(...args);
export const clearTimeout = (handle) => world().clock.clear(handle);
export const setInterval = (...args) => world().clock.setInterval(...args);
export const clearInterval = (handle) => world().clock.clear(handle);
export const setImmediate = (...args) => world().clock.setImmediate(...args);
export const clearImmediate = (handle) => world().clock.clear(handle);
export default { setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate };
`;

const TIMERS_PROMISES_SEAM = `${FIXTURE_WORLD_ACCESS}
export function setTimeout(delay, value, options = {}) {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(options.signal.reason); return; }
    const handle = world().clock.setTimeout(() => resolve(value), delay);
    options.signal?.addEventListener("abort", () => { world().clock.clear(handle); reject(options.signal.reason); }, { once: true });
  });
}
`;

const PERF_SEAM = `${FIXTURE_WORLD_ACCESS}
export const performance = { now: () => world().clock.nowMs, timeOrigin: 0 };
`;

const ICONV_SEAM = `${FIXTURE_WORLD_ACCESS}
export const encodingExists = (encoding) => ["gb18030", "cp932", "cp949", "cp866", "cp437"].includes(String(encoding).toLowerCase());
export const decode = (buffer, encoding) => world().decodeLegacy(buffer, encoding);
export default { decode, encodingExists };
`;

const SHARED_SEAM = `${FIXTURE_WORLD_ACCESS}
export const BACKGROUND_BASH_OUTPUT_MAX_BYTES = 8192;
export const BASH_RESOURCE_SAMPLE_INTERVAL_MS = 15000;
export const BASH_RESOURCE_MAX_SAMPLES = 20;
export function sanitizeKnorviaRuntimeEnvInPlace(env) {
  world().retainedCalls.push({ name: "sanitizeKnorviaRuntimeEnvInPlace", args: [Object.keys(env)] });
  for (const key of Object.keys(env)) {
    if (key.toUpperCase().startsWith("KNORVIA_RUNTIME_")) delete env[key];
  }
}
`;

const SHARED_NODE_SEAM = `${FIXTURE_WORLD_ACCESS}
export function resolveKnorviaDataRoot(env = {}) {
  world().retainedCalls.push({ name: "resolveKnorviaDataRoot", args: [env] });
  return env.KNORVIA_STORAGE_DIR || "/virtual/data";
}
`;

const CONTRACTS_SEAM = `${FIXTURE_WORLD_ACCESS}
export function windowsPathToGitBashPath(value) {
  world().retainedCalls.push({ name: "windowsPathToGitBashPath", args: [value] });
  return value.replace(/^([A-Za-z]):[\\\\/]/, (_match, drive) => "/" + drive.toLowerCase() + "/").replaceAll("\\\\", "/");
}
export function gitBashPathToWindowsPath(value) {
  world().retainedCalls.push({ name: "gitBashPathToWindowsPath", args: [value] });
  return value.replace(/^[/]([a-zA-Z])[/]/, (_match, drive) => drive.toUpperCase() + ":\\\\").replaceAll("/", "\\\\");
}
`;

const NETWORK_SEAM = `${FIXTURE_WORLD_ACCESS}
export function applyNetworkEgressEnv(env, options = {}) {
  world().retainedCalls.push({ name: "applyNetworkEgressEnv", args: [options] });
  const network = options.network || {};
  if (network.httpProxy) { env.HTTP_PROXY = network.httpProxy; env.HTTPS_PROXY = network.httpProxy; }
  if (network.noProxy) env.NO_PROXY = network.noProxy;
  if (network.caCertFile) env.NODE_EXTRA_CA_CERTS = network.caCertFile;
  return env;
}
`;

const PROBE_SEAM = `${FIXTURE_WORLD_ACCESS}
export const PROCESS_PROBE_SAMPLE_TIMEOUT_MS = 1000;
export function createProcessProbe() {
  world().retainedCalls.push({ name: "createProcessProbe", args: [] });
  return world().processProbe;
}
`;

export const SEAM_SOURCES: Readonly<Record<string, string>> = {
  "@knorvia/contracts": CONTRACTS_SEAM,
  "@knorvia/shared": SHARED_SEAM,
  "@knorvia/shared/node": SHARED_NODE_SEAM,
  "iconv-lite": ICONV_SEAM,
  "node:child_process": CHILD_PROCESS_SEAM,
  "node:crypto": CRYPTO_SEAM,
  "node:fs": FILE_SYSTEM_SEAM,
  "node:fs/promises": FILE_SYSTEM_SEAM,
  "node:os": OS_SEAM,
  "node:perf_hooks": PERF_SEAM,
  "node:process": PROCESS_SEAM,
  "node:timers": TIMERS_SEAM,
  "node:timers/promises": TIMERS_PROMISES_SEAM,
  "retained:network/subprocess-env": NETWORK_SEAM,
  "retained:device/process-probe": PROBE_SEAM,
  "retained:device/process-probe-shared": PROBE_SEAM,
};
