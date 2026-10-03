import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
const baseline = process.argv.includes("--baseline");
const selectedCase = process.argv.find((arg) => arg.startsWith("--case="))?.slice(7);
const selected = process.argv.find((arg) => arg.startsWith("--owner="))?.slice(8);
const names = {
  index: "index",
  wheel: "embeddedBrowserWheel",
  dialog: "embeddedBrowserJavaScriptDialog",
};
const channelSet = (prefix) => new Proxy({}, { get: (_target, key) => prefix + "." + String(key) });
const PlatformChannels = channelSet("Platform"),
  InternalChannels = channelSet("Internal"),
  EmbeddedBrowserWebviewChannels = channelSet("Webview");
const plain = (value) => JSON.parse(JSON.stringify(value));
function run(owner, ports, globals = {}) {
  const file = baseline
    ? "/tmp/knorvia-preload-baseline/" + names[owner] + ".ts"
    : path.join(process.cwd(), "packages/desktop/src/preload/" + names[owner] + ".ts");
  const text = fs.readFileSync(file, "utf8");
  const code = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {},
    context = {
      exports,
      module: { exports },
      Error,
      Number,
      Math,
      Object,
      Array,
      Set,
      WeakSet,
      WeakMap,
      String,
      Promise,
      require: (id) => {
        if (Object.hasOwn(ports, id)) return ports[id];
        throw new Error("Unprovided product port " + id);
      },
      ...globals,
    };
  vm.runInNewContext(code, context, { filename: file });
  return exports;
}
function check(owner, name, fn) {
  if ((!selected || selected === owner) && (!selectedCase || name.includes(selectedCase)))
    test(owner + ": " + name, fn);
}
console.log(
  "sourceMode=" +
    (baseline ? "frozen-baseline" : "installed-candidate") +
    "; owner=" +
    (selected ?? "all"),
);
function indexFixture({ platform = "darwin", gated = false } = {}) {
  const calls = [],
    handlers = new Map(),
    winHandlers = new Map(),
    exposed = {},
    results = new Map();
  let zoomFactor = 1.1 ** 2;
  const renderer = {
    on: (channel, listener) => {
      calls.push(["on", channel, listener]);
      const list = handlers.get(channel) ?? [];
      list.push(listener);
      handlers.set(channel, list);
    },
    removeListener: (channel, listener) => {
      calls.push(["remove", channel, listener]);
      const list = handlers.get(channel) ?? [];
      const i = list.indexOf(listener);
      if (i >= 0) list.splice(i, 1);
    },
    invoke: (channel, ...args) => {
      calls.push(["invoke", channel, ...args]);
      return results.get(channel) ?? Promise.resolve({ zoomLevel: 7 });
    },
    send: (channel, ...args) => {
      calls.push(["send", channel, ...args]);
      return "sentinel-send";
    },
  };
  const targetWindow = {
    addEventListener: (name, listener, options) => {
      calls.push(["window.on", name, options]);
      const list = winHandlers.get(name) ?? [];
      list.push(listener);
      winHandlers.set(name, list);
    },
    postMessage: (...args) => calls.push(["post", ...args]),
  };
  const processPort = { env: { SYNTHETIC_ONLY: "yes" }, platform, title: "" };
  const schemas = {
    databaseStartupPortPayloadSchema: {
      safeParse: (value) => {
        calls.push(["portSchema", value]);
        return value?.valid ? { success: true, data: value.data } : { success: false };
      },
    },
    databaseStartupStateSchema: {
      safeParse: (value) => {
        calls.push(["stateSchema", value]);
        return value?.valid ? { success: true, data: value.data } : { success: false };
      },
    },
    databaseStartupControlSchema: {
      safeParse: (value) => {
        calls.push(["controlSchema", value]);
        return value?.valid ? { success: true, data: value.data } : { success: false };
      },
    },
  };
  run(
    "index",
    {
      electron: {
        ipcRenderer: renderer,
        contextBridge: {
          exposeInMainWorld: (key, bridge) => {
            calls.push(["expose", key]);
            exposed[key] = bridge;
          },
        },
        webFrame: {
          getZoomFactor: () => {
            calls.push(["zoom"]);
            return zoomFactor;
          },
        },
        webUtils: { getPathForFile: (file) => file.syntheticPath },
      },
      "@knorvia/shared": {
        PlatformChannels,
        InternalChannels,
        ...schemas,
        shouldEnableE2ETestBridge: (env) => {
          calls.push(["gate", env]);
          assert.equal(env, processPort.env);
          return gated;
        },
        formatKnorviaRendererProcessName: (title) => "synthetic-renderer:" + title,
      },
    },
    { window: targetWindow, document: { title: "virtual-title" }, process: processPort },
  );
  const emit = (channel, event, ...args) => {
    for (const h of (handlers.get(channel) ?? []).slice()) h(event, ...args);
  };
  const message = (data, source = targetWindow) => {
    for (const h of (winHandlers.get("message") ?? []).slice()) h({ data, source });
  };
  return {
    calls,
    handlers,
    exposed,
    api: exposed.knorvia,
    renderer,
    window: targetWindow,
    processPort,
    emit,
    message,
    results,
    setZoom: (value) => {
      zoomFactor = value;
    },
  };
}
function wheelFixture() {
  const calls = [],
    queue = [];
  let listener;
  const root = {
    nodeType: 1,
    scrollWidth: 100,
    clientWidth: 100,
    scrollHeight: 100,
    clientHeight: 100,
    scrollTop: 0,
    scrollLeft: 0,
    style: { overflow: "visible", direction: "ltr" },
  };
  const win = {
    innerWidth: 100,
    innerHeight: 200,
    document: { scrollingElement: root },
    getComputedStyle: (element) => element.style,
    queueMicrotask: (fn) => queue.push(fn),
    addEventListener: (...args) => {
      calls.push(["add", ...args]);
      listener = args[1];
    },
    removeEventListener: (...args) => calls.push(["remove", ...args]),
  };
  const m = run("wheel", { "@knorvia/shared": { EmbeddedBrowserWebviewChannels } });
  const dispose = m.installEmbeddedBrowserWheelForwarding(win, (...args) =>
    calls.push(["host", ...args]),
  );
  const event = (properties = {}, elements = []) => ({
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    shiftKey: false,
    defaultPrevented: false,
    composedPath: () => elements,
    ...properties,
  });
  return {
    calls,
    queue,
    win,
    root,
    dispose,
    event,
    fire: (evt) => listener(evt),
    flush: () => {
      while (queue.length) queue.shift()();
    },
  };
}
function dialogFixture() {
  const calls = [],
    exposed = {};
  let execute,
    response = { handled: true, value: false },
    failure;
  run(
    "dialog",
    {
      electron: {
        contextBridge: {
          exposeInMainWorld: (key, value) => {
            calls.push(["expose", key]);
            exposed[key] = value;
          },
          executeInMainWorld: (input) => {
            calls.push(["execute"]);
            execute = input;
          },
        },
        ipcRenderer: {
          sendSync: (...args) => {
            calls.push(["sync", ...args]);
            if (failure) throw failure;
            return response;
          },
          sendToHost: (...args) => calls.push(["host", ...args]),
        },
      },
      "@knorvia/shared": { PlatformChannels },
      "./embeddedBrowserWheel.js": {
        installEmbeddedBrowserWheelForwarding: (win, send) => {
          calls.push(["wheel", win, send]);
          return () => {
            throw new Error("not disposed");
          };
        },
      },
    },
    { window: { synthetic: true } },
  );
  return {
    calls,
    exposed,
    getExecute: () => execute,
    respond: (v) => {
      response = v;
    },
    fail: (v) => {
      failure = v;
    },
  };
}
export {
  fs,
  path,
  vm,
  assert,
  test,
  ts,
  baseline,
  selectedCase,
  selected,
  names,
  channelSet,
  PlatformChannels,
  InternalChannels,
  EmbeddedBrowserWebviewChannels,
  plain,
  run,
  check,
  indexFixture,
  wheelFixture,
  dialogFixture,
};
