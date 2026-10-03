import assert from "node:assert/strict";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodeTest from "node:test";
import { build } from "esbuild";
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7);
const test = (name, fn) => {
  if (!only || name.startsWith(only)) nodeTest(name, fn);
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../");
const source = process.argv.includes("--baseline")
  ? "/tmp/knorvia-cli-browser-dependency-baseline"
  : path.join(root, "apps/cli/packages/adapters/src/browser");
async function load(name, ports = {}, platform = "linux") {
  const sandbox = {
    module: { exports: {} },
    exports: {},
    ports,
    process: { platform, env: {} },
    importEvaluations: 0,
  };
  sandbox.exports = sandbox.module.exports;
  const output = await build({
    entryPoints: [path.join(source, `${name}.ts`)],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        name: "synthetic-public-ports",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (arg) =>
            arg.kind === "entry-point" ? undefined : { path: arg.path, namespace: "synthetic" },
          );
          build.onLoad({ filter: /.*/, namespace: "synthetic" }, (arg) => {
            if (!(arg.path in ports)) throw new Error(`Unexpected runtime import ${arg.path}`);
            const prefix =
              arg.path === "playwright-core" ? "globalThis.importEvaluations++;\n" : "";
            return {
              contents:
                prefix +
                Object.keys(ports[arg.path])
                  .map(
                    (key) =>
                      `export const ${key}=globalThis.ports[${JSON.stringify(arg.path)}][${JSON.stringify(key)}];`,
                  )
                  .join("\n"),
              loader: "js",
            };
          });
        },
      },
    ],
  });
  vm.runInNewContext(output.outputFiles[0].text, sandbox, { filename: `${name}-synthetic.cjs` });
  return { api: sandbox.module.exports, sandbox };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
function syntheticNode(tag, attrs = {}, rect = { x: 1, y: 2, width: 8, height: 10 }) {
  const node = {
    tagName: tag.toUpperCase(),
    id: attrs.id ?? "",
    innerText: attrs.text ?? "",
    textContent: attrs.text ?? "",
    outerHTML: `<${tag}>synthetic</${tag}>`,
    style: {},
    children: [],
    parentElement: null,
    isConnected: true,
    getAttribute: (key) => attrs[key] ?? null,
    hasAttribute: (key) => key in attrs,
    getBoundingClientRect: () => ({
      ...rect,
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
    }),
    matches: () => true,
  };
  return node;
}
function syntheticDOM() {
  const html = syntheticNode("html"),
    body = syntheticNode("body");
  html.clientWidth = 800;
  html.clientHeight = 600;
  const parent = syntheticNode("button", { id: "synthetic", text: "  Parent \n label  " });
  const child = syntheticNode(
    "input",
    { type: "checkbox", placeholder: " child  input " },
    { x: 1.5, y: 2.5, width: 5.5, height: 6.5 },
  );
  child.checked = false;
  child.disabled = false;
  child.value = 0;
  const hidden = syntheticNode("button", { text: "hidden" });
  hidden.style.opacity = "0";
  const thin = syntheticNode("button", { text: "thin" }, { x: 4, y: 5, width: 0, height: 6 });
  const attach = (ancestor, node) => {
    node.parentElement = ancestor;
    ancestor.children.push(node);
  };
  attach(html, body);
  attach(body, parent);
  attach(parent, child);
  attach(body, hidden);
  attach(body, thin);
  const markers = [],
    calls = [];
  html.append = (node) => {
    markers.push(node);
    calls.push("append-marker");
  };
  const document = {
    documentElement: html,
    body,
    title: "synthetic page",
    elementsFromPoint: () => [parent],
    createElement: () => ({
      style: {},
      setAttribute: (key, value) => calls.push(["marker", key, value]),
      remove: () => calls.push("remove-marker"),
    }),
    querySelectorAll: (selector) =>
      selector.startsWith("[data-knorvia-element-screenshot]")
        ? markers
        : selector.includes("[onclick]")
          ? [parent, child, hidden, thin]
          : [body, parent, child, hidden, thin],
  };
  const window = {
    innerWidth: 800,
    innerHeight: 600,
    getComputedStyle: (node) => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      ...node.style,
    }),
  };
  const context = { document, window, location: { href: "https://example.invalid/synthetic" } };
  return { context, parent, child, hidden, thin, markers, calls };
}
function serializeRun(fn, arg, context) {
  return vm.runInNewContext(
    `(${fn.toString()})(argument)`,
    { ...context, argument: arg },
    { filename: "synthetic-dom-callback.js" },
  );
}

test("executable authority preserves explicit admission, candidate order, platform probes and lazy import", async () => {
  const calls = [],
    usable = new Set(),
    denied = new Set();
  const chromium = {
    executablePath: () => {
      calls.push("pinned-path");
      return "/synthetic/pinned";
    },
  };
  const fs = {
    constants: { X_OK: 1 },
    existsSync: (value) => {
      calls.push(["exists", value]);
      return usable.has(value);
    },
    statSync: (value) => {
      calls.push(["stat", value]);
      return { isFile: () => true };
    },
    accessSync: (value, mode) => {
      calls.push(["access", value, mode]);
      if (denied.has(value)) throw new Error("synthetic access denied");
    },
  };
  const { api, sandbox } = await load("executable", {
    "node:fs": fs,
    "node:path": { isAbsolute: path.posix.isAbsolute, join: path.posix.join },
    "playwright-core": { chromium },
  });
  assert.equal(sandbox.importEvaluations, 0);
  assert.equal(api.validateExplicitBrowserExecutable(undefined), undefined);
  assert.equal(calls.length, 0);
  assert.throws(
    () => api.validateExplicitBrowserExecutable("relative"),
    /must be absolute: relative/,
  );
  assert.equal(calls.length, 0);
  usable.add("/synthetic/explicit");
  assert.equal(
    api.resolveInstalledBrowserExecutable({ chromium }, { executablePath: "/synthetic/explicit" }),
    "/synthetic/explicit",
  );
  assert.equal(calls.includes("pinned-path"), false);
  denied.add("/synthetic/explicit");
  assert.throws(
    () => api.validateExplicitBrowserExecutable("/synthetic/explicit"),
    /missing or not executable/,
  );
  calls.length = 0;
  usable.add("/usr/bin/chromium");
  assert.equal(
    api.resolveInstalledBrowserExecutable({ chromium }, { platform: "unknown" }),
    "/usr/bin/chromium",
  );
  assert.deepEqual(
    calls.filter((row) => Array.isArray(row) && row[0] === "exists").map((row) => row[1]),
    [
      "/synthetic/pinned",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
    ],
  );
  const module = await api.loadPlaywrightChromium();
  assert.equal(module.chromium, chromium);
  assert.equal(sandbox.importEvaluations, 1);
  const roots = [],
    windowsCalls = [],
    winFile = path.win32.join("C:\\Synthetic", "Microsoft", "Edge", "Application", "msedge.exe");
  const env = {
    get PROGRAMFILES() {
      roots.push("PROGRAMFILES");
      return "C:\\Synthetic";
    },
    get ["PROGRAMFILES(X86)"]() {
      roots.push("PROGRAMFILES(X86)");
      return "  ";
    },
    get LOCALAPPDATA() {
      roots.push("LOCALAPPDATA");
      return undefined;
    },
  };
  const windows = await load(
    "executable",
    {
      "node:fs": {
        constants: { X_OK: 1 },
        existsSync: (value) => {
          windowsCalls.push(value);
          return value === winFile;
        },
        statSync: () => ({ isFile: () => true }),
        accessSync: () => {
          throw new Error("win32 must not probe execute access");
        },
      },
      "node:path": { isAbsolute: path.win32.isAbsolute, join: path.win32.join },
      "playwright-core": { chromium },
    },
    "win32",
  );
  assert.equal(windows.api.resolveInstalledBrowserExecutable({ chromium }, { env }), winFile);
  assert.deepEqual(roots, ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"]);
  assert.deepEqual(windowsCalls, [
    "/synthetic/pinned",
    path.win32.join("C:\\Synthetic", "Google", "Chrome", "Application", "chrome.exe"),
    path.win32.join("C:\\Synthetic", "Chromium", "Application", "chrome.exe"),
    winFile,
  ]);
});

test("Playwright authority preserves CDP bytes/error detach, unavailable gates and screenshot cleanup", async () => {
  const { api } = await load("playwright-command");
  const calls = [],
    value = { synthetic: true },
    failure = new Error("synthetic page failure");
  let raw = { result: { value } };
  const page = {
    context: () => ({
      newCDPSession: async () => ({
        send: async (...args) => {
          calls.push(["send", ...args]);
          return raw;
        },
        detach: async () => calls.push("detach"),
      }),
    }),
  };
  assert.equal(await api.evaluatePage(page, "syntheticFn", "function", undefined, 17), value);
  assert.deepEqual(plain(calls[0]), [
    "send",
    "Runtime.evaluate",
    {
      expression: "(syntheticFn)(undefined)",
      awaitPromise: true,
      returnByValue: true,
      timeout: 17,
    },
  ]);
  assert.equal(calls.at(-1), "detach");
  raw = { exceptionDetails: { exception: { description: "" }, text: "unused" } };
  await assert.rejects(
    api.evaluatePage(page, "synthetic", "string", null, 1),
    /playwright.evaluate failed: $/,
  );
  assert.equal(calls.at(-1), "detach");
  const cycle = {};
  cycle.self = cycle;
  calls.length = 0;
  await assert.rejects(api.evaluatePage(page, "syntheticFn", "function", cycle, 1));
  assert.deepEqual(calls, ["detach"]);
  const gatedPage = new Proxy(
    {},
    {
      get: () => {
        throw failure;
      },
    },
  );
  await assert.rejects(
    api.executeManagedPlaywrightAction(gatedPage, {
      name: "waitForLoadState",
      state: "networkidle",
    }),
    /does not support networkidle/,
  );
  await assert.rejects(
    api.executeManagedPlaywrightAction(gatedPage, {
      name: "waitForURL",
      url: "https://example.invalid",
      waitUntil: "networkidle",
    }),
    /does not support networkidle/,
  );
  await assert.rejects(
    api.executeManagedPlaywrightAction(gatedPage, { name: "waitForEvent", event: "download" }),
    /is unavailable/,
  );
  const clickCalls = [];
  const locatorPage = {
    locator: (selector) => {
      clickCalls.push(selector);
      return { click: async (options) => clickCalls.push(options) };
    },
  };
  const clickResult = await api.executeManagedPlaywrightAction(locatorPage, {
    name: "locator",
    selector: "synthetic",
    operation: "click",
    modifiers: ["ControlOrMeta", "Shift", "Shift"],
    timeoutMs: 2.9,
  });
  assert.deepEqual(plain(clickResult), { ok: true });
  assert.deepEqual(plain(clickCalls[1]), { modifiers: ["Control", "Shift", "Shift"], timeout: 2 });
  assert.deepEqual(Object.keys(clickCalls[1]), ["button", "force", "modifiers", "timeout"]);
  const dom = syntheticDOM();
  const screenshotPage = {
    evaluate: async (fn, arg) => serializeRun(fn, arg, dom.context),
    screenshot: async () => {
      dom.calls.push("screenshot");
      throw failure;
    },
  };
  await assert.rejects(
    api.executeManagedPlaywrightAction(screenshotPage, { name: "elementScreenshot", x: 1, y: 2 }),
    (error) => error === failure,
  );
  assert.deepEqual(
    dom.calls.filter((row) => typeof row === "string"),
    ["append-marker", "screenshot", "remove-marker"],
  );
  assert.equal(dom.markers[0].style.border, "2px solid #ff2d55");
  assert.equal(dom.markers[0].style.pointerEvents, "none");
  const info = await api.executeManagedPlaywrightAction(screenshotPage, {
    name: "elementInfo",
    x: 1,
    y: 2,
  });
  assert.equal(info.value[0].tagName, "button");
  assert.equal(info.value[0].selector.primary, "#synthetic");
  assert.equal(info.value[0].visibleText, "Parent \n label");
});

function snapshotPage(dom) {
  const trace = [],
    handles = [],
    captured = [];
  let generation = 0;
  let rejectOld;
  function wrap(value, label) {
    const element = value?.tagName
      ? {
          label,
          evaluate: async (fn) => serializeRun(fn, value, {}),
          scrollIntoViewIfNeeded: async () => trace.push(`scroll:${label}`),
          boundingBox: async () => {
            trace.push(`box:${label}`);
            return value.getBoundingClientRect();
          },
          dispose: async () => {
            trace.push(`dispose:${label}`);
            if (rejectOld === label) throw failure;
          },
        }
      : undefined;
    const handle = {
      getProperty: async (key) => wrap(value[key], `${label}.${key}`),
      jsonValue: async () => {
        if (value?.url && value?.elements) captured.push(value);
        return value;
      },
      getProperties: async () => {
        const entries = new Map(
          Object.entries(value).map(([key, entry]) => [
            key,
            wrap(entry, `g${generation}:element-${key}`),
          ]),
        );
        entries.set("synthetic-nonnumeric", wrap(dom.thin, `g${generation}:invalid`));
        return entries;
      },
      asElement: () => {
        if (element) handles.push(element);
        return element ?? null;
      },
      dispose: async () => trace.push(`dispose:${label}`),
    };
    if (element) handle.dispose = element.dispose;
    return handle;
  }
  const failure = new Error("synthetic old-handle disposal failure");
  const page = {
    evaluateHandle: async (fn, options) => {
      generation++;
      trace.push(["collect", plain(options)]);
      return wrap(serializeRun(fn, options, dom.context), `g${generation}:collection`);
    },
  };
  return {
    page,
    trace,
    handles,
    captured,
    failure,
    rejectDisposal: (label) => {
      rejectOld = label;
    },
  };
}

test("snapshot ownership preserves synthetic DOM data, page isolation and replacement before failed disposal", async () => {
  const { api } = await load("snapshot");
  const dom = syntheticDOM(),
    fixture = snapshotPage(dom);
  const snapshot = await api.captureManagedCdpSnapshot(fixture.page, 2.9);
  assert.equal(snapshot, fixture.captured[0]);
  assert.equal(snapshot.truncated, true);
  assert.equal(snapshot.domTruncated, false);
  assert.deepEqual(plain(snapshot.elements.map((item) => item.ref)), ["e1", "e2"]);
  assert.equal(snapshot.elements[0].name, "Parent label");
  assert.equal(snapshot.elements[0].selector, "#synthetic");
  const child = snapshot.elements[1];
  assert.equal(child.parentRef, "e1");
  assert.equal(child.value, "0");
  assert.equal(child.checked, false);
  assert.equal("disabled" in child, false);
  assert.equal(child.role, "checkbox");
  assert.equal(child.name, "child input");
  assert.deepEqual(plain(child.rect), { x: 2, y: 3, width: 6, height: 7 });
  assert.equal(child.xpath, "/html[0]/body[1]/button[1]/input[1]");
  assert.equal(snapshot.dom[0].depth, 1);
  assert.equal(snapshot.dom.find((item) => item.tag === "input").depth, 1);
  const old = await api.resolveSnapshotElement(fixture.page, "e1");
  assert.equal(await api.resolveSnapshotElement({}, "e1"), undefined);
  assert.deepEqual(plain(await api.resolveSnapshotRef(fixture.page, "e2")), { x: 4, y: 6 });
  assert.equal(fixture.trace.at(-2).startsWith("scroll:"), true);
  assert.equal(fixture.trace.at(-1).startsWith("box:"), true);
  dom.child.isConnected = false;
  assert.equal(await api.resolveSnapshotElement(fixture.page, "e2"), undefined);
  fixture.rejectDisposal(old.label);
  fixture.trace.length = 0;
  await assert.rejects(
    api.captureManagedCdpSnapshot(fixture.page, 1, true),
    (error) => error === fixture.failure,
  );
  const next = await api.resolveSnapshotElement(fixture.page, "e1");
  assert.notEqual(next, old);
  assert.equal(
    fixture.trace.some((row) => typeof row === "string" && row.endsWith(":collection")),
    false,
    "failed old disposal must not reach aggregate collection cleanup",
  );
  assert.equal(
    Object.keys(dom.context).some((key) => key.includes("ref")),
    false,
  );
});

test("snapshot regression preserves DOM id property as selector authority", async () => {
  const { api } = await load("snapshot");
  const dom = syntheticDOM();
  dom.parent.id = "synthetic-property";
  const fixture = snapshotPage(dom);
  const report = await api.captureManagedCdpSnapshot(fixture.page, 1);
  assert.equal(report.elements[0].selector, "#synthetic-property");
  assert.equal(report.elements[0].attributes.id, "synthetic");
});

test("snapshot regression attempts all previous disposals when one port throws synchronously", async () => {
  const { api } = await load("snapshot");
  const fixture = snapshotPage(syntheticDOM());
  await api.captureManagedCdpSnapshot(fixture.page, 2);
  const first = await api.resolveSnapshotElement(fixture.page, "e1");
  const second = await api.resolveSnapshotElement(fixture.page, "e2");
  const attempts = [],
    failure = new Error("synthetic synchronous dispose failure");
  first.dispose = () => {
    attempts.push("first");
    throw failure;
  };
  second.dispose = () => {
    attempts.push("second");
    return Promise.resolve();
  };
  await assert.rejects(
    api.captureManagedCdpSnapshot(fixture.page, 1),
    (error) => error === failure,
  );
  assert.deepEqual(attempts, ["first", "second"]);
  assert.notEqual(await api.resolveSnapshotElement(fixture.page, "e1"), first);
});
