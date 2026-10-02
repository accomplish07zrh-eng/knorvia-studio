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
check(
  "index",
  "public facade, promise/cancellation identity and buffered callback lifetime",
  async () => {
    const f = indexFixture(),
      ready = f.calls.find(
        ([tag, channel]) =>
          tag === "send" && channel === PlatformChannels.WindowControlsOverlayReady,
      );
    assert.deepEqual(plain(ready[2]), { zoomLevel: 2, metrics: { leftPaddingPx: 79 } });
    assert.ok(f.calls.indexOf(ready) < f.calls.findIndex(([tag]) => tag === "on"));
    assert.equal(f.processPort.title, "synthetic-renderer:virtual-title");
    assert.equal(f.exposed.__knorviaFinalArmsCustomEventsE2E, undefined);
    const promise = Promise.resolve("result"),
      target = { type: "synthetic" },
      context = { workspacePath: "/virtual", workspaceIdentity: "identity", requestId: "override" };
    f.results.set(PlatformChannels.ConnectRemote, promise);
    assert.equal(f.api.connectRemote(target, "request", context), promise);
    assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "invoke").slice(1)), [
      PlatformChannels.ConnectRemote,
      { target, requestId: "override", workspacePath: "/virtual", workspaceIdentity: "identity" },
    ]);
    f.api.cancelPendingRemoteConnection();
    const cancel = f.calls.findLast(([tag]) => tag === "invoke");
    assert.ok(Object.hasOwn(cancel[2], "requestId"));
    assert.equal(cancel[2].requestId, undefined);
    assert.equal(f.api.getPathForFile({ syntheticPath: "  /virtual/file  " }), "/virtual/file");
    f.emit(PlatformChannels.OpenWorkspacePath, {}, "");
    f.emit(PlatformChannels.OpenWorkspacePath, {}, "/first");
    f.emit(PlatformChannels.OpenWorkspacePath, {}, "/second");
    const seen = [],
      callback = (value) => seen.push(value),
      dispose = f.api.onOpenWorkspacePath(callback);
    assert.deepEqual(seen, ["/first", "/second"]);
    const otherDispose = f.api.onOpenWorkspacePath(callback);
    f.emit(PlatformChannels.OpenWorkspacePath, {}, "/live");
    assert.deepEqual(seen, ["/first", "/second", "/live"]);
    assert.equal(dispose(), true);
    assert.equal(otherDispose(), false);
    f.emit(PlatformChannels.OpenWorkspacePath, {}, "/queued");
    f.api.onOpenWorkspacePath(callback);
    assert.equal(seen.at(-1), "/queued");
    const eventValues = [],
      payload = { synthetic: true },
      unsub = f.api.onRemoteSessionClosed((v) => eventValues.push(v));
    const registered = f.handlers.get(PlatformChannels.RemoteSessionClosed)[0];
    f.emit(PlatformChannels.RemoteSessionClosed, { sender: "hidden" }, payload, "extra");
    assert.equal(eventValues[0], payload);
    unsub();
    unsub();
    assert.equal(f.calls.findLast(([tag]) => tag === "remove")[2], registered);
    f.emit(PlatformChannels.RemoteSessionClosed, {}, payload);
    assert.equal(eventValues.length, 1);
    const zooms = [],
      stopZoom = f.api.onDesktopZoomLevelChanged((v) => zooms.push(plain(v)));
    f.emit(PlatformChannels.DesktopZoomLevelChanged, {}, { zoomLevel: Infinity });
    f.emit(PlatformChannels.DesktopZoomLevelChanged, {}, { zoomLevel: -10 });
    stopZoom();
    assert.deepEqual(zooms, [{ zoomLevel: 2 }, { zoomLevel: -3 }]);
    assert.deepEqual(plain(await f.api.getDesktopZoomLevel()), { zoomLevel: 5 });
    const metrics = { leftPaddingPx: 42 };
    f.emit(PlatformChannels.WindowControlsOverlayChanged, {}, metrics);
    assert.equal(f.api.getWindowControlsOverlayMetrics(), metrics);
    assert.equal(f.api.reportRendererHeapSample({ synthetic: true }), "sentinel-send");
    assert.equal(f.api.browserViewScreenshotSurfaceReady({ synthetic: true }), undefined);
    const traceStart = f.calls.length;
    assert.equal(f.api.syncTelemetryContext({}), undefined);
    await f.api.reportTelemetryEvent({});
    await f.api.reportArmsCustomEvent({});
    const updateEvents = [];
    f.api.onUpdateReady((value) => updateEvents.push(value))();
    assert.deepEqual(plain(await f.api.getUpdateState()), { kind: "idle", enabled: false });
    assert.deepEqual(plain(await f.api.getAutoUpdatePreferences()), {
      autoDownloadAndInstallUpdates: false,
    });
    assert.equal(f.calls.length, traceStart);
    assert.deepEqual(updateEvents, []);
    const gated = indexFixture({ platform: "win32", gated: true });
    assert.deepEqual(Object.keys(gated.exposed.__knorviaFinalArmsCustomEventsE2E), [
      "read",
      "clear",
      "configure",
    ]);
    assert.deepEqual(
      plain(
        gated.calls.find(
          ([tag, channel]) =>
            tag === "send" && channel === PlatformChannels.WindowControlsOverlayReady,
        )[2],
      ),
      { zoomLevel: 2, metrics: { rightPaddingPx: 112, titleBarHeightPx: 58 } },
    );
  },
);
check("index", "exact sender/channel/schema admission and first-port closure/transfer", () => {
  const f = indexFixture(),
    closed = [],
    first = { close: () => closed.push("first") },
    second = { close: () => closed.push("second") },
    data = { startupId: "synthetic" };
  f.calls.length = 0;
  f.emit(InternalChannels.ServicePort, { ports: [first, second] }, { valid: false });
  assert.deepEqual(closed, ["first"]);
  assert.equal(
    f.calls.some(([tag]) => tag === "post"),
    false,
  );
  f.emit(InternalChannels.ServicePort, { ports: [first, second] }, { valid: true, data });
  const post = f.calls.findLast(([tag]) => tag === "post");
  assert.deepEqual(plain(post[1]), { type: InternalChannels.ServicePort, ...data });
  assert.equal(post[2], "*");
  assert.equal(post[3][0], first);
  assert.equal(post[3].length, 1);
  f.emit(
    InternalChannels.ScopedServicePort,
    { ports: [first] },
    { attachmentId: "a", sessionId: "s" },
  );
  const scoped = f.calls.findLast(([tag]) => tag === "post");
  assert.ok(Object.hasOwn(scoped[1], "target"));
  assert.equal(scoped[1].target, undefined);
  f.calls.length = 0;
  const valid = {
    type: InternalChannels.ScopedServicePortReady,
    attachmentId: " a ",
    sessionId: "s",
    extra: "drop",
  };
  f.message(valid, {});
  f.message({ ...valid, attachmentId: "" });
  f.message({ ...valid, sessionId: 1 });
  f.message(null);
  f.message({ ...valid, type: "other" });
  assert.equal(
    f.calls.some(([tag]) => tag === "send"),
    false,
  );
  f.message(valid);
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "send").slice(1)), [
    InternalChannels.ScopedServicePortReady,
    { attachmentId: " a ", sessionId: "s" },
  ]);
  f.calls.length = 0;
  const command = { kind: "synthetic" };
  f.message(
    { type: InternalChannels.DatabaseStartupControl, control: { valid: true, data: command } },
    {},
  );
  f.message({ type: InternalChannels.DatabaseStartupControl, control: { valid: false } });
  assert.equal(
    f.calls.some(([tag]) => tag === "send"),
    false,
  );
  f.message({
    type: InternalChannels.DatabaseStartupControl,
    control: { valid: true, data: command },
  });
  assert.equal(f.calls.findLast(([tag]) => tag === "send")[2], command);
  f.emit(PlatformChannels.TaskNotificationSound, {}, "ignored");
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "post").slice(1)), [
    InternalChannels.TaskNotificationSound,
    "*",
  ]);
  f.emit(InternalChannels.DatabaseStartupState, {}, { valid: false });
  f.emit(InternalChannels.DatabaseStartupState, {}, { valid: true, data: command });
  assert.equal(f.calls.findLast(([tag]) => tag === "post")[1].state, command);
});

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
check("wheel", "axis consumption, RTL, modes and bounded pixel forwarding", () => {
  const f = wheelFixture(),
    scroller = {
      nodeType: 1,
      scrollWidth: 200,
      clientWidth: 100,
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 50,
      scrollLeft: -50,
      style: { overflowX: "auto", overflowY: "auto", direction: "rtl" },
    };
  f.fire(f.event({ deltaX: 10, deltaY: 10 }, [scroller]));
  assert.equal(f.queue.length, 0);
  scroller.scrollTop = 100;
  f.fire(f.event({ deltaX: 10, deltaY: 2, deltaMode: 1 }, [scroller]));
  f.flush();
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "host").slice(1)), [
    EmbeddedBrowserWebviewChannels.WheelBoundary,
    { deltaX: 0, deltaY: 80 },
  ]);
  f.fire(f.event({ deltaY: 20, shiftKey: true, deltaMode: 2 }));
  f.flush();
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "host")[2]), {
    deltaX: 2000,
    deltaY: 0,
  });
  f.fire(f.event({ deltaX: Infinity, deltaY: 1e6 }));
  f.flush();
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "host")[2]), {
    deltaX: 0,
    deltaY: 10000,
  });
  const before = f.calls.length;
  f.fire(f.event({ deltaX: 0.01, deltaY: -0.01, deltaMode: 2 }));
  f.flush();
  assert.equal(f.calls.length, before);
});
check("wheel", "deferred preventDefault, captured payload and uncancelled queued send", () => {
  const f = wheelFixture(),
    blocked = f.event({ deltaY: 12 });
  f.fire(blocked);
  blocked.defaultPrevented = true;
  f.flush();
  assert.equal(
    f.calls.some(([tag]) => tag === "host"),
    false,
  );
  const admitted = f.event({ deltaY: 15 });
  f.fire(admitted);
  admitted.deltaY = 999;
  f.dispose();
  f.dispose();
  f.flush();
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "host")[2]), {
    deltaX: 0,
    deltaY: 15,
  });
  const added = f.calls.find(([tag]) => tag === "add"),
    removed = f.calls.find(([tag]) => tag === "remove");
  assert.equal(added[1], "wheel");
  assert.deepEqual(plain(added[3]), { passive: true });
  assert.equal(removed[2], added[2]);
  assert.equal(removed.length, 3);
});

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
check("dialog", "isolated bridge admission, boolean filtering and sync fallback", () => {
  const f = dialogFixture();
  assert.deepEqual(
    f.calls.map(([tag]) => tag),
    ["wheel", "expose", "execute"],
  );
  const show = f.exposed.__knorviaEmbeddedBrowserJavaScriptDialog__.show;
  assert.deepEqual(plain(show("confirm", "text")), { handled: true, value: false });
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "sync").slice(1)), [
    PlatformChannels.EmbeddedBrowserJavaScriptDialog,
    { type: "confirm", message: "text" },
  ]);
  f.respond({ handled: true, value: "bad", extra: "drop" });
  assert.deepEqual(plain(show("alert", "")), { handled: true });
  for (const value of [null, 1, false, { handled: 1 }]) {
    f.respond(value);
    assert.deepEqual(plain(show("alert", "")), { handled: false });
  }
  f.fail(new Error("sync down"));
  assert.deepEqual(plain(show("confirm", "")), { handled: false });
  const wheel = f.calls[0];
  wheel[2]("synthetic-channel", {});
  assert.equal(f.calls.at(-1)[0], "host");
});
check(
  "dialog",
  "serialized main-world frame lifetimes, native receivers and confirm identity guard",
  () => {
    const f = dialogFixture(),
      calls = [],
      observers = [],
      mainEvents = [],
      frameEvents = [];
    const makeWindow = (id) => {
      const w = { document: { documentElement: {}, querySelectorAll: () => [] } };
      w.alert = function (value) {
        assert.equal(this, w);
        calls.push(["native-alert", id, value]);
      };
      w.confirm = function (value) {
        assert.equal(this, w);
        calls.push(["native-confirm", id, value]);
        return true;
      };
      return w;
    };
    const child = makeWindow("child"),
      frame = { contentWindow: child, addEventListener: (...args) => frameEvents.push(args) },
      main = makeWindow("main");
    main.document.querySelectorAll = () => [frame];
    main.addEventListener = (...args) => mainEvents.push(args);
    main.MutationObserver = class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(...args) {
        this.args = args;
      }
    };
    let result = { handled: false };
    main.__knorviaEmbeddedBrowserJavaScriptDialog__ = {
      show: (type, value) => {
        calls.push(["bridge", type, value]);
        return result;
      },
    };
    const serialized = "(" + f.getExecute().func.toString() + ")(...args)";
    vm.runInNewContext(serialized, {
      window: main,
      args: f.getExecute().args,
      String,
      WeakMap,
      WeakSet,
    });
    assert.equal(frameEvents.length, 1);
    assert.equal(frameEvents[0][0], "load");
    assert.equal(frameEvents[0][2], true);
    assert.equal(observers.length, 1);
    assert.deepEqual(plain(observers[0].args[1]), { childList: true, subtree: true });
    main.alert();
    assert.deepEqual(calls.slice(-2), [
      ["bridge", "alert", ""],
      ["native-alert", "main", ""],
    ]);
    assert.equal(child.confirm(42), true);
    assert.equal(calls.at(-1)[2], "42");
    result = { handled: true, value: false };
    assert.equal(main.confirm("handled"), false);
    const firstConfirm = main.confirm,
      replacementAlert = () => calls.push(["replacement-alert"]);
    main.alert = replacementAlert;
    observers[0].callback();
    assert.equal(main.confirm, firstConfirm);
    assert.equal(main.alert, replacementAlert);
    assert.equal(frameEvents.length, 1);
    main.confirm = () => false;
    observers[0].callback();
    assert.notEqual(main.confirm, firstConfirm);
    frameEvents[0][1]();
    assert.equal(frameEvents.length, 1);
    assert.equal(mainEvents.length, 0);
  },
);

check("dialog", "reply observation fallback and frame-load raw error boundary", () => {
  const f = dialogFixture(),
    raw = new Error("reply getter failed");
  let reads = 0;
  f.respond({
    handled: true,
    get value() {
      if (++reads === 2) throw raw;
      return true;
    },
  });
  assert.deepEqual(
    plain(f.exposed.__knorviaEmbeddedBrowserJavaScriptDialog__.show("confirm", "x")),
    { handled: false },
  );
  assert.equal(reads, 2);
});
check("dialog", "frame-load raw error boundary and deferred document readiness", () => {
  const f = dialogFixture(),
    raw = new Error("frame getter failed");
  const frameEvents = [],
    events = [],
    observed = [];
  let throwFrame = false;
  const frame = {
    get contentWindow() {
      if (throwFrame) throw raw;
      return undefined;
    },
    addEventListener: (...args) => frameEvents.push(args),
  };
  const main = {
    alert() {},
    confirm() {
      return true;
    },
    document: { documentElement: undefined, querySelectorAll: () => [frame] },
    addEventListener: (...args) => events.push(args),
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
      }
      observe(...args) {
        observed.push(args);
      }
    },
    __knorviaEmbeddedBrowserJavaScriptDialog__: { show: () => ({ handled: true }) },
  };
  vm.runInNewContext("(" + f.getExecute().func.toString() + ")(...args)", {
    window: main,
    args: f.getExecute().args,
    String,
    WeakMap,
    WeakSet,
  });
  assert.equal(events[0][0], "DOMContentLoaded");
  assert.deepEqual(plain(events[0][2]), { once: true });
  assert.equal(observed.length, 0);
  main.document.documentElement = {};
  events[0][1]();
  assert.equal(observed.length, 1);
  throwFrame = true;
  assert.throws(
    () => frameEvents[0][1](),
    (error) => error === raw,
  );
});
