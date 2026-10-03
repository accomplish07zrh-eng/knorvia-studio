import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const product = "packages/desktop/src/main/browserView";
const root = process.env.KNORVIA_OWNER_BASELINE ?? product;
const json = (value) => JSON.parse(JSON.stringify(value));
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function load(name, ports = {}, globals = {}) {
  const file = path.join(
    ["browserTabResidencyPolicy", "browserCommandInteractionHandlers"].includes(name)
      ? product
      : root,
    name + ".ts",
  );
  const module = { exports: {} };
  const emitted = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(
    emitted,
    {
      module,
      exports: module.exports,
      require: (key) => {
        if (key in ports) return ports[key];
        throw new Error("Uninjected port " + key);
      },
      Error,
      TypeError,
      Date,
      URL,
      Buffer,
      ...globals,
    },
    { filename: file },
  );
  return module.exports;
}
const policy = load("browserTabResidencyPolicy");
const candidate = (id, windowId = 1) => ({
  tabId: id,
  windowId,
  sessionId: "synthetic",
  residency: "live-background",
  guestAttached: false,
  openedAt: 1,
  lastActivityAt: 1,
  lastSelectedAt: null,
  preferred: false,
  currentTask: false,
  selected: false,
  visible: false,
  operationActive: false,
  captureActive: false,
  audible: false,
  mediaActive: false,
  loading: false,
  downloadActive: false,
});
const shell = (id, extra = {}) => ({
  schemaVersion: 1,
  tabId: id,
  windowBindingId: null,
  workspaceKey: "synthetic-workspace",
  sessionId: "synthetic-session",
  origin: "user",
  lifecycle: "active",
  restoreUrl: null,
  title: null,
  faviconUrl: null,
  viewport: { width: 12, height: 8 },
  openedAt: 1,
  lastSelectedAt: null,
  updatedAt: 1,
  ...extra,
});
function recoveryFixture(options = {}) {
  let disk,
    nextWriteError,
    loaded = false,
    sequence = 0;
  const calls = [];
  const ports = {
    readFile: async (...args) => {
      calls.push(["read", ...args]);
      if (!loaded) throw Object.assign(new Error("missing synthetic"), { code: "ENOENT" });
      return disk;
    },
    mkdir: async (...args) => calls.push(["mkdir", ...args]),
    writeFile: async (...args) => {
      calls.push(["write", ...args]);
      if (nextWriteError) {
        const e = nextWriteError;
        nextWriteError = null;
        throw e;
      }
      disk = args[1];
    },
    rename: async (...args) => calls.push(["rename", ...args]),
    unlink: async (...args) => {
      calls.push(["unlink", ...args]);
      throw new Error("synthetic cleanup rejection");
    },
  };
  const { BrowserTabRecoveryStore } = load("browserTabRecoveryStore", {
    "node:crypto": { randomUUID: () => String(++sequence) },
    "node:fs/promises": ports,
    "node:path": { dirname: () => "/synthetic" },
  });
  const store = new BrowserTabRecoveryStore("/synthetic/recovery", options);
  return {
    store,
    calls,
    ports,
    setDisk: (value) => {
      loaded = true;
      disk = value;
    },
    failWrite: (e) => {
      nextWriteError = e;
    },
  };
}
function clipboardFixture(handler) {
  let now = 0,
    uuid = 0;
  const calls = [];
  const view = {
    webContents: { getURL: () => "https://synthetic.invalid/" },
    cdp: {
      send: async (...args) => {
        calls.push(args);
        return handler(...args);
      },
    },
  };
  const constant = "__syntheticToken";
  const clipboard = load(
    "browserVirtualClipboard",
    {
      "node:crypto": { randomUUID: () => "synthetic-" + ++uuid },
      "./browserVirtualClipboardPageScript.js": {
        IAB_INPUT_TARGET_TOKEN_PROPERTY: constant,
        VIRTUAL_PASTE_PAGE_FUNCTION:
          "async (options) => { globalThis.forwarded = options; return null; }",
      },
    },
    {
      Date: { now: () => now },
      setTimeout: (callback, ms) => {
        now += ms;
        callback();
      },
    },
  );
  return { view, calls, clipboard, constant, now: () => now };
}
export {
  assert,
  fs,
  path,
  vm,
  test,
  ts,
  product,
  root,
  json,
  tick,
  load,
  policy,
  candidate,
  shell,
  recoveryFixture,
  clipboardFixture,
};
