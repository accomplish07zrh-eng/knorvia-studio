import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import test from "node:test";

// Authored and unrun. No actual lock/file, process.kill, UUID or native timer is
// used; a bounded in-memory path map supplies every IO/process/clock boundary.
let fixtureId = 0;
function ports() {
  const state = { files: new Map(), journal: [], clock: 41, ids: 0, pid: 123, killErrors: new Map() };
  const missing = () => Object.assign(new Error("fixture missing"), { code: "ENOENT" });
  state.readFile = async (path, encoding) => { state.journal.push(["read", path, encoding]); if (state.readFailure) throw state.readFailure;
    if (!state.files.has(path)) throw missing(); return state.files.get(path); };
  state.mkdir = async (...args) => { state.journal.push(["mkdir", ...args]); };
  state.open = async (path, flags, mode) => {
    state.journal.push(["open", path, flags, mode]);
    if (state.files.has(path)) throw Object.assign(new Error("fixture exists"), { code: "EEXIST" });
    state.files.set(path, "");
    return { async writeFile(raw) { state.journal.push(["write", path, raw]); state.files.set(path, raw); },
      async close() { state.journal.push(["close", path]); } };
  };
  state.rename = async (from, to) => { state.journal.push(["rename", from, to]); state.beforeRename?.(from, to);
    if (!state.files.has(from)) throw missing(); state.files.set(to, state.files.get(from)); state.files.delete(from); };
  state.rm = async (path, options) => { state.journal.push(["remove", path, options]); state.files.delete(path); };
  state.uuid = () => `fixture-${++state.ids}`;
  state.now = () => state.clock;
  state.timer = (callback, ms) => { state.journal.push(["wait", ms]); callback(); };
  state.process = { pid: state.pid, kill(pid, signal) { state.journal.push(["kill", pid, signal]); const error = state.killErrors.get(pid); if (error) throw error; } };
  return state;
}
async function load(state) {
  const key = `knorvia.native.lock.deferred.${++fixtureId}`; globalThis[Symbol.for(key)] = state;
  const binding = `const port=globalThis[Symbol.for(${JSON.stringify(key)})];`;
  const replacement = {
    "node:crypto": `${binding} export const randomUUID=port.uuid;`,
    "node:fs/promises": `${binding} export const mkdir=port.mkdir,open=port.open,readFile=port.readFile,rename=port.rename,rm=port.rm;`,
  };
  try {
    const result = await build({ entryPoints: [fileURLToPath(new URL("../src/runtime/lock.ts", import.meta.url))], bundle: true, write: false,
      platform: "node", format: "esm", logLevel: "silent", banner: { js: `${binding} const process=port.process,Date={now:port.now},setTimeout=port.timer;` },
      plugins: [{ name: "deferred-lock-ports", setup(plugin) {
        plugin.onResolve({ filter: /^node:/ }, ({ path }) => { if (path === "node:path") return { path, external: true };
          assert.ok(Object.hasOwn(replacement, path), `unsupplied native boundary ${path}`); return { path, namespace: "lock-port" }; });
        plugin.onLoad({ filter: /.*/, namespace: "lock-port" }, ({ path }) => ({ contents: replacement[path], loader: "js" }));
      } }] });
    return await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  } finally { delete globalThis[Symbol.for(key)]; }
}

test("lock preserves exclusive receipt, inspection/liveness observations and token-owned release", async () => {
  const state = ports(); const { DataRootLock } = await load(state); const path = join("fixture-root", "server.lock");
  const lock = new DataRootLock(path); assert.deepEqual(await lock.inspect(), { state: "missing" });
  await lock.acquire(); const raw = state.files.get(path); assert.equal(raw, '{"pid":123,"acquiredAt":41,"ownerToken":"fixture-1"}\n');
  assert.deepEqual(await lock.inspect(), { state: "active", pid: 123 });
  state.killErrors.set(77, Object.assign(new Error("fixture permission"), { code: "EPERM" }));
  state.killErrors.set(78, Object.assign(new Error("fixture missing process"), { code: "ESRCH" }));
  assert.equal(lock.isHolderAlive(undefined), false); assert.equal(lock.isHolderAlive(77), true); assert.equal(lock.isHolderAlive(78), false);
  await lock.release(); assert.equal(state.files.has(path), false);
  assert.equal(state.journal.filter(([event, value]) => event === "close" && value === path).length, 1);
  state.files.set(path, "invalid JSON"); assert.deepEqual(await lock.inspect(), { state: "invalid" });
  const failure = { code: "ENOENT" }; state.readFailure = failure;
  assert.deepEqual(await lock.inspect(), { state: "unreadable", error: failure });
});

test("stale recovery uses a double-closed gate and a post-rename later owner is restored rather than removed", async () => {
  const state = ports(); const { DataRootLock } = await load(state); const path = join("fixture-root", "server.lock");
  state.files.set(path, '{"pid":77,"ownerToken":"fixture-stale"}\n');
  state.killErrors.set(77, Object.assign(new Error("fixture stale process"), { code: "ESRCH" }));
  const lock = new DataRootLock(path); await lock.acquire();
  assert.equal(JSON.parse(state.files.get(path)).pid, 123); assert.equal(state.files.has(path + ".recovery"), false);
  assert.equal(state.journal.filter(([event, value]) => event === "close" && value === path + ".recovery").length, 2);
  assert.ok(state.journal.some(([event, value, options]) => event === "remove" && value.startsWith(path + ".stale-") && options.force));
  const later = '{"pid":321,"ownerToken":"fixture-later"}\n';
  state.beforeRename = (from, to) => { if (from === path && to.startsWith(path + ".release-")) { state.files.set(path, later); state.beforeRename = undefined; } };
  await lock.release(); assert.equal(state.files.get(path), later);
  assert.equal(state.journal.some(([event, value]) => event === "remove" && value.startsWith(path + ".release-")), false);
  assert.ok(state.journal.some(([event, from, to]) => event === "rename" && from.startsWith(path + ".release-") && to === path));
});
