import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const root = process.env.KNORVIA_OWNER_BASELINE ?? "packages/desktop/src/main/browserView";
const json = (value) => JSON.parse(JSON.stringify(value));
const scripts = Object.fromEntries(
  ["RESOLVE", "CHECK", "SELECT", "ELEMENT_AT_POINT", "SNAPSHOT", "EVALUATE"].map((name) => [
    name + "_SCRIPT",
    (...args) => ({ name, args }),
  ]),
);
scripts.VIEWPORT_SCRIPT = "opaque viewport";
function load(name, ports = {}, globals = {}) {
  const module = { exports: {} };
  const file = path.join(
    name === "browserPlaywrightExecutor" ? "packages/desktop/src/main/browserView" : root,
    name + ".ts",
  );
  const emitted = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(
    emitted,
    {
      module,
      exports: module.exports,
      require: (request) => {
        if (request === "./browserCommandScripts.js") return scripts;
        if (request in ports) return ports[request];
        throw new Error("Uninjected dependency: " + request);
      },
      Error,
      DOMException,
      Date,
      URL,
      process: { platform: "linux" },
      ...globals,
    },
    { filename: file },
  );
  return module.exports;
}
const errors = {
  executionError: (message) => ({ ok: false, error: { code: "execution_error", message } }),
  refNotFound: (ref) => ({ ok: false, error: { code: "ref_not_found", message: ref } }),
};
function harness(extra = {}) {
  const calls = [],
    state = { url: "https://synthetic.invalid/" },
    sentinel = { elapsedMs: 17 };
  const done = (value) => {
    calls.push(["done", value]);
    Object.assign(sentinel, value);
    return sentinel;
  };
  const view = {
    webContents: {
      getURL: () => state.url,
      loadURL: async (url) => {
        state.url = url;
      },
      executeJavaScript: async () => null,
    },
    cdp: {
      send: async (...args) => {
        calls.push(args);
        return {};
      },
    },
  };
  const ports = {
    "./browserCommandState.js": {
      readState: (web) => {
        assert.equal(web, view.webContents);
        return state;
      },
      DEFAULT_NAVIGATE_SETTLE_MS: 10000,
      isAllowedBrowserUrl: () => true,
      settleNavigation: async (promise) => promise,
      BrowserNavigationTimeoutError: class extends Error {},
    },
    "./browserCommandResult.js": errors,
    ...extra,
  };
  return { view, calls, state, sentinel, done, ports };
}
export { assert, fs, path, vm, test, ts, root, json, scripts, load, errors, harness };
