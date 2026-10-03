import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const root = process.env.KNORVIA_OWNER_BASELINE ?? "packages/desktop/src/main/browserView";
const json = (value) => JSON.parse(JSON.stringify(value));
// Only synthetic page objects and injected dependency ports execute in these VM contexts.
function load(name, ports = {}) {
  const cache = new Map();
  function read(file) {
    if (cache.has(file)) return cache.get(file);
    const source = fs.readFileSync(file, "utf8");
    const module = { exports: {} };
    cache.set(file, module.exports);
    const emitted = ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(
      emitted,
      {
        module,
        exports: module.exports,
        require: (request) => {
          if (request in ports) return ports[request];
          if (request.startsWith("./")) {
            const target = path.resolve(path.dirname(file), request.replace(/\.js$/, ".ts"));
            if (target.startsWith(path.resolve(root) + path.sep) && fs.existsSync(target))
              return read(target);
          }
          throw new Error(`Uninjected dependency: ${request}`);
        },
        Date,
        DOMException,
        Error,
        AbortController,
        setTimeout,
        clearTimeout,
        process: { platform: "linux" },
      },
      { filename: file },
    );
    return module.exports;
  }
  return read(path.join(root, name + ".ts"));
}
function pageFixture({ failRootChild = false, snapshot = false, snapshotText } = {}) {
  const calls = [];
  const contexts = new Map();
  const element = {
    isConnected: true,
    checked: false,
    textContent: "synthetic",
    innerText: "synthetic",
    matches: () => true,
    scrollIntoView: () => {},
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 20, height: 10 }),
    getAttribute: () => null,
    ownerDocument: { defaultView: { requestAnimationFrame: (callback) => callback() } },
  };
  let lastContext;
  let sequence = 10;
  const world = (frame) => {
    const engine = {
      parseSelector: (selector) => selector,
      querySelectorAll: () => [element],
      checkDeprecatedSelectorUsage: () => {},
      strictModeViolationError: () => new Error("strict synthetic"),
      elementState: () => ({ matches: true }),
      fill: () => "needsinput",
      retarget: (target) => target,
      focusNode: () => "done",
      expectHitTarget: () => "done",
      incrementalAriaSnapshot: () =>
        frame === "main"
          ? {
              full:
                snapshotText ??
                '- generic [ref=g]:\n  - button "Go" [ref=b] [cursor=pointer]\n  - iframe [ref=f]\n  - img [ref=empty]',
              iframeRefs: snapshotText === undefined ? ["f"] : [],
              iframeDepths: { f: 1 },
            }
          : { full: '- group:\n  - link "Child" [ref=c]', iframeRefs: [], iframeDepths: {} },
    };
    return vm.createContext({
      __knorviaPlaywrightInjected: engine,
      document: { body: {}, documentElement: {} },
      innerWidth: 100,
      innerHeight: 100,
      setTimeout,
    });
  };
  const view = {
    webContents: {
      getURL: () => "https://synthetic.invalid/",
      executeJavaScript: async () => ({ readyState: "complete" }),
    },
    cdp: {
      send: async (method, params, sessionId) => {
        calls.push({ method, params, sessionId });
        if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "main" } } };
        if (method === "Page.createIsolatedWorld") {
          assert.equal(params.grantUniveralAccess, false);
          if (failRootChild && params.frameId === "child" && !sessionId)
            throw new Error("synthetic cross-process frame");
          const id = ++sequence;
          contexts.set(id, world(params.frameId));
          return { executionContextId: id };
        }
        if (method === "Runtime.evaluate") {
          lastContext = params.contextId;
          if (params.returnByValue === false) return { result: { objectId: "handle" } };
          return {
            result: {
              value: await vm.runInContext(params.expression, contexts.get(params.contextId)),
            },
          };
        }
        if (method === "DOM.describeNode") return { node: { frameId: "child", backendNodeId: 7 } };
        if (method === "DOM.getContentQuads") return { quads: [[0, 0, 100, 0, 100, 100, 0, 100]] };
        if (method === "Target.attachToTarget") return { sessionId: "owned-session" };
        if (method === "Runtime.releaseObject" || method === "Target.detachFromTarget")
          throw new Error("synthetic cleanup rejection");
        return {};
      },
    },
  };
  return { view, calls, element, contexts, snapshot, lastContext: () => lastContext };
}
const scriptPort = {
  "./playwrightInjectedScriptSource.js": {
    getPlaywrightInjectedScriptSource: () => {
      throw new Error("opaque engine must already be injected in this fixture");
    },
  },
};
function locatorPorts(events, fixture) {
  let assertedContext;
  return {
    ...scriptPort,
    "../logger.js": { logger: { debug: () => {} } },
    "./browserCommandInput.js": {
      modifiersBitmask: (modifiers) => {
        events.push(["modifiers", json(modifiers)]);
        return 3;
      },
      dispatchClickAt: async (...args) => {
        events.push(["click", args]);
      },
      dispatchKey: async (...args) => {
        events.push(["key", args]);
      },
    },
    "./browserVirtualClipboard.js": {
      IAB_INPUT_TARGET_TOKEN_PROPERTY: "syntheticToken",
      createInputTargetToken: () => {
        events.push(["token"]);
        return "synthetic-token";
      },
      assertFocusedInputTarget: async (view, target, token) => {
        assert.equal(view, fixture.view);
        assert.equal(target.contextId, fixture.lastContext());
        assert.equal(token, "synthetic-token");
        assertedContext = target;
        events.push(["assert"]);
      },
      pasteTextIntoFocusedTarget: async (view, text, options) => {
        assert.equal(view, fixture.view);
        events.push(["paste", text, json(options)]);
      },
      get assertedContext() {
        return assertedContext;
      },
    },
  };
}
function executorPorts(overrides = {}) {
  return {
    "./browserCommandPageHandlers.js": {
      buildViewportScreenshotParams: async () => ({ synthetic: true }),
    },
    "./browserScreenshotCapture.js": {
      captureScreenshotWithCssPixelCorrection: async () => ({ data: "synthetic-png" }),
    },
    "./browserPlaywrightDomSnapshot.js": {
      captureBrowserDomSnapshot: async () => "synthetic snapshot",
    },
    "./browserPlaywrightLocatorExecutor.js": {
      executeIabPlaywrightLocator: async () => ({ kind: "done", value: "synthetic locator" }),
    },
    "./browserPlaywrightTimeout.js": { normalizePlaywrightTimeout: (value) => value ?? 100 },
    ...overrides,
  };
}
export {
  assert,
  fs,
  path,
  vm,
  test,
  ts,
  root,
  json,
  load,
  pageFixture,
  scriptPort,
  locatorPorts,
  executorPorts,
};
