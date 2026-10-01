// Explicit opt-in Linux acceptance with owned local shells; not part of offline CI.
// Build node-pty from the installed pinned source in separate temporary storage first.
import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { readFileSync } from "node:fs";
const root = fileURLToPath(new URL("../../", import.meta.url));
assert.equal(process.platform, "linux", "This acceptance probe is Linux-only");
const allowedEnvironment = new Set([
  "PATH",
  "HOME",
  "SHELL",
  "LANG",
  "NODE_TEST_CONTEXT",
  "TSX_TSCONFIG_PATH",
  "KNORVIA_NATIVE_TEST_TARGET",
  "KNORVIA_NATIVE_PTY_ROOT",
  "KNORVIA_NATIVE_TEST_HOME",
]);
assert.deepEqual(
  Object.keys(process.env).filter((name) => !allowedEnvironment.has(name)),
  [],
  "Use the documented env -i allowlist; arbitrary environment must not reach the native shell",
);

const nativeRoot = process.env.KNORVIA_NATIVE_PTY_ROOT;
const home = process.env.KNORVIA_NATIVE_TEST_HOME;
assert.ok(nativeRoot && home, "Provide an owned compiled node-pty root and isolated HOME");
assert.equal(resolve(process.env.HOME ?? ""), resolve(home));
assert.equal(process.env.SHELL, "/bin/sh");
assert.equal(process.env.ENV, undefined);
assert.equal(process.env.BASH_ENV, undefined);
assert.equal(JSON.parse(readFileSync(join(nativeRoot, "package.json"), "utf8")).version, "1.1.0");
assert.ok(["source", "dist"].includes(process.env.KNORVIA_NATIVE_TEST_TARGET ?? "source"));
const emitted = process.env.KNORVIA_NATIVE_TEST_TARGET === "dist";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "node-pty")
      return nextResolve(pathToFileURL(join(nativeRoot, "lib/index.js")).href, context);
    return nextResolve(specifier, context);
  },
});
const base = `${root}/packages/services/${emitted ? "dist" : "src"}`;
const ext = emitted ? "js" : "ts";
const { createTerminalService } = await import(
  pathToFileURL(`${base}/terminal/terminalService.${ext}`).href
);
const { collectServiceMemoryDiagnostics } = await import(
  pathToFileURL(`${base}/memoryDiagnostics.${ext}`).href
);
const { ProxyChannel } = await import(
  pathToFileURL(`${root}/packages/rpc/${emitted ? "dist/index.js" : "src/index.ts"}`).href
);
const settings = {
  get: async () => ({ terminalInheritSystemProfile: false, terminalFontFamily: "monospace" }),
};
function factory(t) {
  const s = createTerminalService({ settingService: settings });
  t.after(() => s.disposeAll());
  return s;
}
function observer(s, id) {
  let text = "";
  const waiting = [];
  const data = s.onDynamicData(id)((v) => {
    text += v;
    assert.ok(text.length < 16384);
    // Resolving a match removes it; iterate a snapshot so later waiters are not skipped.
    for (const w of waiting.slice())
      if (w.pattern.test(text)) {
        clearTimeout(w.timer);
        waiting.splice(waiting.indexOf(w), 1);
        w.resolve();
      }
  });
  const exits = [];
  let end;
  const exited = new Promise((resolve) => (end = resolve));
  const exit = s.onDynamicExit(id)((code) => {
    exits.push(code);
    end(code);
  });
  return {
    exits,
    exited,
    text: () => text,
    dispose() {
      for (const w of waiting) clearTimeout(w.timer);
      waiting.length = 0;
      data.dispose();
      exit.dispose();
    },
    until(pattern) {
      if (pattern.test(text)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const w = {
          pattern,
          resolve,
          timer: setTimeout(() => reject(new Error("owned native output deadline")), 5000),
        };
        waiting.push(w);
      });
    },
  };
}
for (const remote of [false, true])
  test(
    `owned Linux PTY ${remote ? "real RPC" : "direct"} read/write/resize/exit`,
    { timeout: 10000 },
    async (t) => {
      const s = factory(t);
      const channel = ProxyChannel.fromService(s);
      const port = remote
        ? ProxyChannel.toService({
            call: (command, args) => channel.call("owned Linux native acceptance", command, args),
            listen: (event, args) => channel.listen("owned Linux native acceptance", event, args),
          })
        : s;
      const { id, shell } = await port.create({ cols: 80, rows: 24, cwd: home });
      assert.equal(shell, "/bin/sh");
      const o = observer(port, id);
      t.after(() => o.dispose());
      await port.resize({ id, cols: 91, rows: 33 });
      await port.write({
        id,
        data: 'printf "\\nNATIVE_SIZE:"; stty size; printf "NATIVE_READY\\n"\n',
      });
      await o.until(/\r?\nNATIVE_SIZE:33 91\r?\nNATIVE_READY\r?\n/);
      await port.write({ id, data: "exit 7\n" });
      assert.equal(await o.exited, 7);
      assert.deepEqual(o.exits, [7]);
      await assert.rejects(port.write({ id, data: "never sent" }), {
        message: `Terminal not found: ${id}`,
      });
      await port.dispose({ id });
      console.log(
        JSON.stringify({
          mode: emitted ? "dist" : "source",
          remote,
          shell,
          resizeVerified: true,
          exitCode: 7,
          diagnostics: collectServiceMemoryDiagnostics(),
        }),
      );
    },
  );
test(
  "owned native bulk disposal retires admission and supports service reuse",
  { timeout: 10000 },
  async (t) => {
    const s = factory(t);
    const ids = [];
    for (let i = 0; i < 2; i++) {
      const { id } = await s.create({ cols: 80, rows: 24, cwd: home });
      ids.push(id);
      const o = observer(s, id);
      t.after(() => o.dispose());
      await s.write({ id, data: 'printf "\\nOWNED_IDLE\\n"\n' });
      await o.until(/\r?\nOWNED_IDLE\r?\n/);
    }
    s.disposeAll();
    s.disposeAll();
    for (const id of ids)
      await assert.rejects(s.resize({ id, cols: 90, rows: 30 }), {
        message: `Terminal not found: ${id}`,
      });
    const next = await s.create({ cols: 80, rows: 24, cwd: home });
    assert.ok(!ids.includes(next.id));
    const o = observer(s, next.id);
    t.after(() => o.dispose());
    await s.write({ id: next.id, data: "exit 0\n" });
    assert.equal(await o.exited, 0);
    s.disposeAll();
    assert.equal(collectServiceMemoryDiagnostics()["terminal.open"], undefined);
  },
);
