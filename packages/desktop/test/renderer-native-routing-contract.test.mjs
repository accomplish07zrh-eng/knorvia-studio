import assert from "node:assert/strict";
import test from "node:test";
import { loadRendererOwner } from "./renderer-owner-fixture.mjs";

// Authored and unrun: all File/preload/DOM/gesture boundaries are supplied.
test("platform keeps live receivers, fixed arguments and old-preload capability/fallback behavior", async () => {
  const trace = [];
  const state = {
    trace, File: class FixtureFile {},
    window: { knorvia: {}, __KNORVIA_DEVICE_ID__: "frame-id" },
    navigator: { language: "ZH-cn" },
    recordArms: (payload) => trace.push(["e2e", payload]),
  };
  const modules = {
    "@knorvia/shared": 'export const DesktopCommandIds={OpenFeedback:"feedback",OpenCommunity:"community"}; export const buildLocalMediaPreviewUrl=(path)=>"fixture:"+path;',
    "@knorvia/ui": "export const recordArmsCustomEventForE2E=port.recordArms;",
  };
  const { createDesktopPlatform } = await loadRendererOwner("src/desktopPlatform.ts", state, modules);
  const platform = createDesktopPlatform({ isLocalDevelopmentRuntime: true });
  assert.equal(platform.printPageToPdf, undefined);
  assert.equal(platform.getRendererActionTraceConfig, undefined);
  assert.notEqual(platform.onOpenWorkspace(() => {}), platform.onOpenWorkspace(() => {}));
  assert.notEqual(await platform.selectFiles(), await platform.selectFiles());
  assert.equal(await platform.getSystemLocale(), "zh-CN");
  assert.deepEqual(await platform.browserViewAttachGuest({}), { ok: false, reason: "not-found", recoveryRequested: false });
  assert.deepEqual(await platform.importChromeBrowserData(), {
    success: false, cookies: { imported: 0, skipped: 0, failed: 0 },
    localStorage: { originsImported: 0, entriesImported: 0, originsSkipped: 0, originsFailed: 0 },
    error: "chrome_import_not_supported",
  });
  const nativePromise = Promise.resolve("native-result");
  const live = {
    selectDirectory: function (...args) { trace.push(["directory", this, args]); return nativePromise; },
    openInEditor: function (...args) { trace.push(["editor", this, args]); return nativePromise; },
    getRendererActionTraceConfig: () => nativePromise,
    printPageToPdf: () => nativePromise,
    reportArmsCustomEvent: function (payload) { trace.push(["native-arms", this, payload]); return nativePromise; },
    activateOrSetWorkspace: () => false,
    getPathForFile: function (file) { trace.push(["file", this, file]); return "fixture-file"; },
  };
  state.window.knorvia = live;
  assert.equal(platform.selectDirectory("ignored"), nativePromise);
  assert.deepEqual(trace.at(-1), ["directory", live, []]);
  assert.equal(platform.openInEditor.length, 3);
  assert.equal(platform.openInEditor("editor", "path", undefined, "ignored"), nativePromise);
  assert.deepEqual(trace.at(-1), ["editor", live, ["editor", "path", undefined]]);
  assert.equal(platform.activateOrSetWorkspace("path"), false);
  assert.equal(platform.getRendererActionTraceConfig, undefined);
  const second = createDesktopPlatform({ isLocalDevelopmentRuntime: false });
  assert.equal(second.getRendererActionTraceConfig(), nativePromise);
  assert.equal(second.printPageToPdf, undefined); // browser snapshot belongs to module creation
  live.getRendererActionTraceConfig = undefined;
  assert.throws(() => second.getRendererActionTraceConfig(), TypeError);
  const before = trace.length;
  assert.equal(platform.getPathForFile({ path: "not-a-File" }), null);
  assert.equal(trace.length, before);
  const file = new state.File();
  assert.equal(platform.getPathForFile(file), "fixture-file");
  assert.deepEqual(trace.at(-1), ["file", live, file]);
  const payload = { name: "fixture-event" };
  assert.equal(platform.reportArmsCustomEvent(payload), nativePromise);
  assert.deepEqual(trace.slice(-2), [["e2e", payload], ["native-arms", live, payload]]);
  assert.equal(platform.getDeviceId(), "frame-id");
});

test("permission panel keeps synchronous gesture admission, captured bridge and existing copy/icon projection", async () => {
  const trace = [];
  const tileEvents = new Map();
  const pageEvents = new Map();
  const nodes = Object.fromEntries(["tile","hintPrefix","permissionLabel","hintSuffix","completion","appName","icon"].map((key) => [key, {
    textContent: "placeholder", style: { backgroundImage: "placeholder" },
    addEventListener: (name, callback) => tileEvents.set(name, callback),
  }]));
  let resolvePreparation;
  const prepared = new Promise((resolve) => { resolvePreparation = resolve; });
  let observeState;
  let failStart = false;
  const failure = new Error("native start failed");
  const bridge = {
    prepareDrag: function () { assert.equal(this, bridge); trace.push("prepare"); return prepared; },
    onState: function (callback) { assert.equal(this, bridge); observeState = callback; trace.push("subscribe"); return () => {}; },
    startDrag: function () { assert.equal(this, bridge); trace.push("start"); if (failStart) throw failure; },
    notifyDragEnded: function () { assert.equal(this, bridge); trace.push("end"); },
  };
  const state = {
    window: { cuaPermissionPanel: bridge },
    document: {
      documentElement: { lang: "" }, title: "",
      getElementById: (id) => nodes[id], querySelector: () => nodes.icon,
      addEventListener: (name, callback) => pageEvents.set(name, callback),
    },
  };
  await loadRendererOwner("cuaPermissionPanel.ts", state, {});
  assert.deepEqual(trace, ["prepare", "subscribe"]);
  pageEvents.get("mouseup")();
  assert.equal(trace.at(-1), "subscribe");
  state.window.cuaPermissionPanel = { startDrag() { throw new Error("must use captured bridge"); } };
  const gesture = { preventDefault: () => trace.push("prevent") };
  tileEvents.get("dragstart")(gesture);
  assert.deepEqual(trace.slice(-2), ["prevent", "start"]);
  tileEvents.get("dragend")();
  pageEvents.get("mouseup")();
  assert.equal(trace.filter((entry) => entry === "end").length, 1);
  failStart = true;
  assert.throws(() => tileEvents.get("dragstart")(gesture), (error) => error === failure);
  pageEvents.get("mouseup")();
  assert.equal(trace.filter((entry) => entry === "end").length, 2);
  observeState({ locale: "en-US", permission: "accessibility", iconDataUrl: "fixture-icon" });
  assert.equal(state.document.title, "Knorvia Studio Computer Use Permissions");
  assert.equal(nodes.permissionLabel.textContent, "Accessibility");
  assert.equal(nodes.icon.style.backgroundImage, 'url("fixture-icon")');
  observeState({ locale: "zh-CN", permission: "screen_recording", iconDataUrl: null });
  assert.equal(state.document.documentElement.lang, "zh-CN");
  assert.equal(nodes.permissionLabel.textContent, "屏幕录制");
  assert.equal(nodes.icon.style.backgroundImage, 'url("fixture-icon")');
  resolvePreparation({ helperDisplayName: "Knorvia Helper Dev" });
  await prepared;
  await Promise.resolve();
  assert.equal(nodes.appName.textContent, "Knorvia Helper Dev");
});
