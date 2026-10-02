import assert from "node:assert/strict";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import nodeTest from "node:test";
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7);
const test = (name, fn) => {
  if (!only || name.startsWith(only)) nodeTest(name, fn);
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../");
const source = process.argv.includes("--baseline")
  ? "/tmp/knorvia-cli-managed-browser-baseline"
  : path.join(root, "apps/cli/packages/adapters/src/browser");
const tick = async () => {
  for (let i = 0; i < 24; i++) await Promise.resolve();
};
const gate = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function events(target = {}) {
  const listeners = new Map();
  target.on = (name, fn) => {
    const rows = listeners.get(name) ?? [];
    rows.push(fn);
    listeners.set(name, rows);
    return target;
  };
  target.emit = (name, ...args) => {
    for (const fn of listeners.get(name) ?? []) fn(...args);
  };
  target.listenerCount = (name) => (listeners.get(name) ?? []).length;
  return target;
}
async function load(name, ports = {}) {
  let uuid = 0;
  const timers = new Map();
  const sandbox = {
    module: { exports: {} },
    exports: {},
    URL,
    AbortController,
    DOMException,
    Buffer,
    process: { platform: "linux" },
    Date: { now: () => 100 },
    setTimeout: (fn) => {
      const key = {};
      timers.set(key, fn);
      return key;
    },
    clearTimeout: (key) => timers.delete(key),
    ports,
    uuid: () => `synthetic-${++uuid}`,
  };
  sandbox.exports = sandbox.module.exports;
  const generated = await build({
    entryPoints: [path.join(source, `${name}.ts`)],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        name: "virtual-browser-public-ports",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) =>
            args.kind === "entry-point" ? undefined : { path: args.path, namespace: "synthetic" },
          );
          build.onLoad({ filter: /.*/, namespace: "synthetic" }, (args) => {
            if (args.path === "node:crypto")
              return { contents: "export const randomUUID=()=>globalThis.uuid();", loader: "js" };
            if (!(args.path in ports)) throw new Error(`Unexpected runtime import: ${args.path}`);
            return {
              contents: Object.keys(ports[args.path])
                .map(
                  (key) =>
                    `export const ${key}=globalThis.ports[${JSON.stringify(args.path)}][${JSON.stringify(key)}];`,
                )
                .join("\n"),
              loader: "js",
            };
          });
        },
      },
    ],
  });
  vm.runInNewContext(generated.outputFiles[0].text, sandbox, { filename: `${name}-virtual.cjs` });
  return {
    api: sandbox.module.exports,
    expire: () => {
      const pending = [...timers];
      timers.clear();
      for (const [, fn] of pending) fn();
    },
    timers,
  };
}

test("tab owner preserves page identity, active/dialog ownership and close failure ordering", async () => {
  const { api } = await load("session");
  const calls = [];
  const closeFailure = new Error("synthetic close failure");
  const page = (label) =>
    events({
      isClosed: () => false,
      url: () => `https://example.invalid/${label}`,
      title: async () => {
        throw new Error("synthetic title failure");
      },
      viewportSize: () => null,
      bringToFront: async () => calls.push(`front:${label}`),
      close: async (options) => {
        calls.push(["close", label, options]);
        throw closeFailure;
      },
      setViewportSize: async (value) => calls.push(["viewport", value]),
    });
  const first = page("first"),
    second = page("second");
  const context = events({
    pages: () => [first, first],
    browser: () => ({ isConnected: () => true }),
    newPage: async () => {
      context.emit("page", second);
      return second;
    },
    close: async () => {
      calls.push("context-close");
      throw closeFailure;
    },
  });
  const owner = new api.ManagedCdpSession(context);
  assert.equal(owner.context, context);
  assert.deepEqual([...owner.tabIds], ["tab:synthetic-1"]);
  assert.equal(first.listenerCount("close"), 1);
  const one = await owner.ensureTab();
  assert.equal(await owner.ensureTab(one.id), one);
  const two = await owner.createTab();
  assert.equal(second.listenerCount("close"), 1);
  assert.deepEqual([...owner.tabIds], ["tab:synthetic-1", "tab:synthetic-2"]);
  assert.equal(owner.activeTabId, two.id);
  const dialog = { synthetic: true };
  second.emit("dialog", dialog);
  assert.equal(owner.dialogFor(two.id), dialog);
  const rows = await owner.listTabs();
  assert.equal(rows[0].title, "");
  assert.equal(rows[0].viewport, rows[1].viewport);
  assert.equal("active" in rows[0], false);
  assert.equal(rows[1].active, true);
  await assert.rejects(owner.closeTab(two.id), (error) => error === closeFailure);
  assert.equal(owner.dialogFor(two.id), undefined);
  assert.deepEqual([...owner.tabIds], [one.id]);
  assert.equal(owner.activeTabId, two.id);
  assert.equal(await owner.ensureTab(), one);
  assert.equal(owner.activeTabId, two.id);
  assert.equal(calls.at(-1)[2].runBeforeUnload, false);
  await owner.close();
  assert.deepEqual([...owner.tabIds], []);
  assert.equal(owner.activeTabId, two.id);
  assert.equal(calls.at(-1), "context-close");
});

test("page owner retains navigation gate, ref priority, cleanup/error identity and CDP detach", async () => {
  const calls = [];
  const pointerFailure = new Error("synthetic pointer failure");
  const cdpFailure = new Error("synthetic CDP failure");
  const delegate = { ok: true, value: { synthetic: true } };
  const { api } = await load("page-command", {
    "./playwright-command.js": {
      executeManagedPlaywrightAction: async () => delegate,
      evaluatePage: async (...args) => {
        calls.push(["evaluate-port", ...args.slice(1)]);
        return 7;
      },
    },
    "./snapshot.js": {
      captureManagedCdpSnapshot: async () => ({ elements: [] }),
      resolveSnapshotRef: async (_, ref) => {
        calls.push(["ref", ref]);
        return { x: 9, y: 11 };
      },
      resolveSnapshotElement: async () => undefined,
    },
  });
  const page = {
    keyboard: {
      down: async (key) => calls.push(["down", key]),
      up: async (key) => calls.push(["up", key]),
    },
    mouse: {
      click: async (...args) => {
        calls.push(["click", ...args]);
        throw pointerFailure;
      },
    },
    context: () => ({
      newCDPSession: async () => ({
        send: async () => {
          throw cdpFailure;
        },
        detach: async () => calls.push("detach"),
      }),
    }),
  };
  for (const url of [
    "file:///synthetic.txt",
    "javascript:synthetic",
    "data:text/plain,synthetic",
    "bad url",
  ]) {
    assert.equal(api.isAllowedManagedBrowserUrl(url), false);
    const result = await api.executeManagedPageCommand(page, { method: "navigate", url });
    assert.equal(result.error.code, "navigation_blocked");
    assert.equal(result.error.message, `Navigation URL is not allowed: ${url}`);
  }
  assert.equal(calls.length, 0);
  for (const url of [
    "about:blank",
    "https://user:synthetic@example.invalid/",
    "http://example.invalid/",
  ])
    assert.equal(api.isAllowedManagedBrowserUrl(url), true);
  assert.equal(api.isAllowedManagedBrowserUrl("about:blank#fragment"), false);
  await assert.rejects(
    api.executeManagedPageCommand(page, {
      method: "click",
      ref: "synthetic-ref",
      x: 0,
      y: 0,
      modifiers: ["ControlOrMeta", "Shift", "Shift"],
    }),
    (error) => error === pointerFailure,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["ref", "synthetic-ref"],
    ["down", "Control"],
    ["down", "Shift"],
    ["down", "Shift"],
    ["click", 9, 11, { clickCount: 1 }],
    ["up", "Shift"],
    ["up", "Shift"],
    ["up", "Control"],
  ]);
  calls.length = 0;
  await assert.rejects(
    api.executeManagedPageCommand(page, { method: "getState" }),
    (error) => error === cdpFailure,
  );
  assert.deepEqual(calls, ["detach"]);
  assert.equal(
    await api.executeManagedPageCommand(page, {
      method: "playwright",
      action: { name: "domSnapshot" },
    }),
    delegate,
  );
  await assert.rejects(
    api.executeManagedPageCommand(page, { method: "fill", ref: "missing", value: "synthetic" }),
    /Take a fresh snapshot before retrying/,
  );
});

function requestPorts() {
  const abortError = () => new DOMException("Browser command cancelled", "AbortError");
  return {
    abortError,
    classifyError: (error) =>
      error.name === "AbortError"
        ? "cancelled"
        : error.name === "TimeoutError"
          ? "timeout"
          : /unavailable|closed|disconnected/iu.test(error.message)
            ? "backend_unavailable"
            : "execution_error",
    hasSideEffects: (command) => command.method === "click",
    raceWithAbort: async (promise, signal) => {
      if (signal.aborted) throw abortError();
      return new Promise((resolve, reject) => {
        const listener = () => reject(abortError());
        signal.addEventListener("abort", listener, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", listener));
      });
    },
  };
}
async function runtimeFixture({ launchFailure, contextGate } = {}) {
  const calls = [],
    dispatch = new Map();
  let connected = true;
  const viewports = [];
  const browser = events({
    isConnected: () => connected,
    close: async () => {
      calls.push("browser-close");
      connected = false;
    },
    newContext: async (options) => {
      calls.push(["new-context", options]);
      viewports.push(options.viewport);
      return contextGate ? contextGate.promise : { synthetic: true };
    },
  });
  class Session {
    constructor(context) {
      this.context = context;
      calls.push("session-admitted");
    }
    tabIds = ["synthetic-tab"];
    activeTabId = "synthetic-tab";
    async ensureTab() {
      return { id: "synthetic-tab", page: { url: () => "https://example.invalid/" } };
    }
    async close() {
      calls.push("session-close");
    }
    async setViewport(tabId, value) {
      calls.push(["viewport", tabId, value]);
    }
    dialogFor() {
      return {
        type: () => "prompt",
        message: () => {
          calls.push("dialog-message");
          return "synthetic";
        },
        defaultValue: () => {
          calls.push("dialog-default");
          return "synthetic";
        },
      };
    }
  }
  const executable = {
    validateExplicitBrowserExecutable: (value) => {
      calls.push(["validate", value]);
      return value;
    },
    resolveInstalledBrowserExecutable: (_, options) => {
      calls.push(["resolve", options.executablePath]);
      return "/synthetic/chromium";
    },
    loadPlaywrightChromium: async () => ({
      chromium: {
        launch: async (options) => {
          calls.push(["launch", options]);
          if (launchFailure) throw launchFailure;
          return browser;
        },
      },
    }),
  };
  const loaded = await load("index", {
    "./executable.js": executable,
    "./descriptor.js": {
      createManagedCdpDescriptor: (id, generation) => ({ id, generation, type: "cdp" }),
    },
    "./request.js": requestPorts(),
    "./session.js": { ManagedCdpSession: Session },
    "./page-command.js": {
      isAllowedManagedBrowserUrl: () => true,
      executeManagedPageCommand: async (_, command) => {
        const waiter = gate();
        dispatch.set(command.synthetic, waiter);
        calls.push(["dispatch", command.synthetic]);
        return waiter.promise;
      },
    },
  });
  return { ...loaded, calls, browser, dispatch, viewports };
}

test("runtime owner preserves stale admission, native error privacy, matching cancellation and late context disposal", async () => {
  const unavailable = new Error("synthetic native private cause");
  const failure = await runtimeFixture({ launchFailure: unavailable });
  const failing = failure.api.createManagedCdpBrowserRuntime({
    executablePath: "/synthetic/configured",
  });
  const stale = await failing.browserControlPort.execute({
    sessionId: "synthetic-session",
    browserId: "wrong",
    browserGeneration: 1,
    command: { method: "list" },
  });
  assert.equal(stale.error.code, "backend_unavailable");
  assert.equal("meta" in stale, false);
  assert.equal(failure.calls.length, 1);
  await assert.rejects(
    failing.browserControlPort.list({ sessionId: "synthetic-session" }),
    (error) =>
      error.cause === unavailable &&
      error.message ===
        "Managed headless Chromium is unavailable: launch failed. Verify the browser executable and OS sandbox/runtime dependencies.",
  );
  await failing.close();

  const fixture = await runtimeFixture();
  const runtime = fixture.api.createManagedCdpBrowserRuntime();
  const [descriptor] = await runtime.browserControlPort.list({ sessionId: "synthetic-session" });
  const execute = (sessionId, turnId, synthetic) =>
    runtime.browserControlPort.execute({
      sessionId,
      turnId,
      browserId: descriptor.id,
      browserGeneration: descriptor.generation,
      command: { method: "click", synthetic },
    });
  const first = execute("one", "turn", "first"),
    other = execute("one", "other-turn", "other"),
    third = execute("two", "turn", "third");
  await tick();
  assert.equal(fixture.dispatch.size, 3);
  await runtime.browserControlPort.turnEnded({ sessionId: "one", turnId: "turn" });
  const cancelled = await first;
  assert.equal(cancelled.error.code, "cancelled");
  assert.equal(cancelled.error.sideEffect, "uncertain");
  assert.equal("meta" in cancelled, false);
  fixture.dispatch.get("other").resolve({ ok: true });
  fixture.dispatch.get("third").resolve({ ok: true });
  const responses = await Promise.all([other, third]);
  assert.equal(
    responses.every((row) => row.ok),
    true,
  );
  fixture.dispatch.get("first").resolve({ ok: true });
  await runtime.close();
  assert.equal(fixture.calls.filter((row) => row === "session-close").length, 2);
  assert.equal(fixture.calls.at(-1), "browser-close");

  const admission = gate(),
    late = await runtimeFixture({ contextGate: admission });
  const closing = late.api.createManagedCdpBrowserRuntime({ closeTimeoutMs: 1 });
  const [backend] = await closing.browserControlPort.list({ sessionId: "late" });
  const pending = closing.browserControlPort.execute({
    sessionId: "late",
    browserId: backend.id,
    browserGeneration: backend.generation,
    command: { method: "click", synthetic: "late" },
  });
  await tick();
  const ending = closing.browserControlPort.closeSession({ sessionId: "late" });
  await tick();
  late.expire();
  await ending;
  admission.resolve({ close: async () => late.calls.push("late-context-close") });
  await pending;
  await tick();
  assert.equal(late.dispatch.size, 0);
  assert.equal(late.calls.includes("session-admitted"), false);
  assert.equal(late.calls.includes("late-context-close"), true);
  assert.equal(late.calls.includes("browser-close"), true);
  await closing.close();
});

test("tab registration regression preserves fresh ownership after removal of the same page", async () => {
  const { api } = await load("session");
  const page = events({
    isClosed: () => false,
    bringToFront: async () => {},
    close: async () => {},
  });
  const context = events({
    pages: () => [page],
    newPage: async () => page,
    browser: () => undefined,
  });
  const owner = new api.ManagedCdpSession(context);
  const first = await owner.ensureTab();
  await owner.closeTab(first.id);
  context.emit("page", page);
  assert.deepEqual([...owner.tabIds], ["tab:synthetic-2"]);
  const second = await owner.ensureTab();
  assert.notEqual(second, first);
  assert.notEqual(second.id, first.id);
});

test("page state response regression reads URL before title and retains fallback data", async () => {
  const calls = [];
  const { api } = await load("page-command", {
    "./playwright-command.js": {
      executeManagedPlaywrightAction: async () => ({}),
      evaluatePage: async () => undefined,
    },
    "./snapshot.js": {
      captureManagedCdpSnapshot: async () => ({}),
      resolveSnapshotRef: async () => undefined,
      resolveSnapshotElement: async () => undefined,
    },
  });
  const page = {
    context: () => ({
      newCDPSession: async () => ({
        send: async () => ({}),
        detach: async () => calls.push("detach"),
      }),
    }),
    viewportSize: () => null,
    evaluate: async () => {
      throw new Error("synthetic scroll failure");
    },
    url: () => {
      calls.push("url");
      return "https://example.invalid/";
    },
    title: async () => {
      calls.push("title");
      throw new Error("synthetic title failure");
    },
  };
  const result = await api.executeManagedPageCommand(page, { method: "getState" });
  assert.deepEqual(calls, ["url", "title", "detach"]);
  assert.equal(result.state.title, "");
  assert.equal(result.state.canGoBack, false);
  assert.equal(result.state.canGoForward, false);
  assert.equal(result.state.scrollX, 0);
  assert.equal("viewportWidth" in result.state, false);
});

test("runtime viewport and dialog regression preserves protocol dispatch and fresh context input", async () => {
  const fixture = await runtimeFixture();
  const runtime = fixture.api.createManagedCdpBrowserRuntime();
  const [descriptor] = await runtime.browserControlPort.list({ sessionId: "one" });
  const execute = (sessionId, command) =>
    runtime.browserControlPort.execute({
      sessionId,
      browserId: descriptor.id,
      browserGeneration: descriptor.generation,
      command,
    });
  const viewport = execute("one", { method: "browserViewportSet", width: 800, height: 600 });
  await tick();
  assert.equal(fixture.dispatch.size, 0, "viewport protocol method must use the session port");
  assert.equal((await viewport).ok, true);
  assert.equal((await execute("two", { method: "browserViewportReset" })).ok, true);
  assert.equal(
    fixture.calls.some((row) => Array.isArray(row) && row[0] === "viewport" && row[2] === null),
    true,
  );
  assert.notEqual(fixture.viewports[0], fixture.viewports[1]);
  fixture.calls.length = 0;
  assert.equal((await execute("one", { method: "getDialog" })).dialog.defaultPrompt, "synthetic");
  assert.deepEqual(fixture.calls, ["dialog-message", "dialog-default", "dialog-default"]);
  await runtime.close();
});

test("runtime cached browser regression retains connected-cache fast return under injected abort", async () => {
  const fixture = await runtimeFixture();
  const runtime = fixture.api.createManagedCdpBrowserRuntime();
  const [descriptor] = await runtime.browserControlPort.list({ sessionId: "cached" });
  const controller = new AbortController();
  const isConnected = fixture.browser.isConnected;
  fixture.browser.isConnected = () => {
    controller.abort("synthetic-abort");
    return isConnected();
  };
  const [cached] = await runtime.browserControlPort.list({
    sessionId: "cached",
    signal: controller.signal,
  });
  assert.equal(cached.id, descriptor.id);
  assert.equal(fixture.calls.includes("browser-close"), false);
  fixture.browser.isConnected = isConnected;
  await runtime.close();
});
