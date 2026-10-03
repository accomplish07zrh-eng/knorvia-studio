import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Deferred in-memory loading with supplied ports. The retained DataRootLock and
// real filesystem/process/clock APIs are never executed by these scenarios.
let fixtureNumber = 0;

export function ports() {
  const state = {
    journal: [], reads: [], locks: [], writes: [], renameFailures: [], timers: [],
    clock: 0,
    layout: { statusFile: "/fixture/status.json", lockFile: "/fixture/server.lock" },
    now: () => state.clock,
    setTimeout(callback, ms) { state.timers.push({ callback, ms }); },
    async readFile(path, encoding) {
      state.journal.push(["read", path, encoding]);
      const read = state.reads.shift();
      if (read instanceof Error || (read && typeof read === "object")) throw read;
      return read ?? '{"state":"stopped","updatedAt":11}';
    },
    parseStatus(value) { return value; },
    async writeFile(...args) {
      state.journal.push(["write", ...args]);
      state.writes.push(args);
      if (state.writeGate) await state.writeGate(args);
    },
    async rename(...args) {
      state.journal.push(["rename", ...args]);
      const error = state.renameFailures.shift();
      if (error) throw error;
    },
    async inspect(path) {
      state.journal.push(["inspect", path]);
      return state.locks.shift() ?? { state: "missing" };
    },
    describe(lock) { state.journal.push(["describe", lock]); return `fixture ${lock.state} lock`; },
  };
  return state;
}

export async function loadOwner(name, state = ports()) {
  const key = `knorvia.native.status.deferred.${++fixtureNumber}`;
  const root = fileURLToPath(new URL("../src/runtime/", import.meta.url));
  globalThis[Symbol.for(key)] = state;
  const binding = `const supplied = globalThis[Symbol.for(${JSON.stringify(key)})];`;
  const replacements = {
    "node:fs/promises": `${binding}
      export const readFile = (...args) => supplied.readFile(...args);
      export const writeFile = (...args) => supplied.writeFile(...args);
      export const rename = (...args) => supplied.rename(...args);`,
    "../contracts.js": `${binding} export const serverStatusSchema = {parse: value => supplied.parseStatus(value)};`,
    "./paths.js": `${binding} export const resolveServerLayout = () => supplied.layout;`,
    "./lock.js": `${binding} export class DataRootLock {
      constructor(path) { this.path = path; supplied.journal.push(['new-lock', path]); }
      inspect() { return supplied.inspect(this.path); }
    }`,
    "./uninstallGuard.js": `${binding} export const describeLockInspection = lock => supplied.describe(lock);`,
  };
  try {
    const output = await build({
      entryPoints: [`${root}${name}.ts`],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      logLevel: "silent",
      banner: { js: `const suppliedClock = globalThis[Symbol.for(${JSON.stringify(key)})]; const Date = {now: suppliedClock.now}; const process = {pid: 7301}; const setTimeout = suppliedClock.setTimeout;` },
      plugins: [{
        name: "deferred-status-ports",
        setup(plugin) {
          plugin.onResolve({ filter: /^(?:node:|\.\.\/contracts\.js$|\.\/(?:paths|lock|uninstallGuard)\.js$)/ }, ({ path }) => {
            assert.ok(Object.hasOwn(replacements, path), `unexpected external port ${path}`);
            return { path, namespace: "status-port" };
          });
          plugin.onLoad({ filter: /.*/, namespace: "status-port" }, ({ path }) => ({
            contents: replacements[path], loader: "js",
          }));
        },
      }],
    });
    return await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
  } finally {
    delete globalThis[Symbol.for(key)];
  }
}

export async function flush() {
  for (let turn = 0; turn < 12; turn++) await Promise.resolve();
}

export function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}
