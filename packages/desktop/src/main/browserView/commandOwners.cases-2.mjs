import { assert, test, json, load, harness } from "./commandOwners.fixture.mjs";

test("navigation: admission, committed redirect recovery, abort and error identity with fake clock", async () => {
  const h = harness();
  let now = 0,
    loads = 0,
    settles = [],
    reads = 0;
  class Timeout extends Error {}
  h.ports["./browserCommandState.js"].BrowserNavigationTimeoutError = Timeout;
  h.ports["./browserCommandState.js"].isAllowedBrowserUrl = (url) => url !== "blocked";
  h.view.webContents.getURL = () => {
    reads++;
    return h.state.url;
  };
  h.view.webContents.loadURL = (url) => {
    loads++;
    h.state.url = url;
    return Promise.resolve();
  };
  h.ports["./browserCommandState.js"].settleNavigation = async (...args) => {
    settles.push(args);
    await args[0];
  };
  const page = load(
    "browserCommandPageHandlers",
    { ...h.ports, "@knorvia/shared": {}, "./browserScreenshotCapture.js": {} },
    {
      Date: { now: () => now },
      setTimeout: (fn, ms) => {
        now += ms;
        fn();
      },
    },
  );
  await page.handleNavigate(h.view, { method: "navigate", url: "blocked" }, h.done);
  assert.equal(loads, 0);
  assert.equal(reads, 0);
  assert.equal(h.sentinel.error.code, "navigation_blocked");
  const signal = { aborted: false };
  await page.handleNavigate(
    h.view,
    { method: "navigate", url: "https://synthetic.invalid/" },
    h.done,
    { navigateSettleMs: 0, signal },
  );
  assert.equal(settles[0][1], 0);
  assert.equal(settles[0][2], signal);
  const aborted = Object.assign(new Error("aborted"), { code: "ERR_ABORTED" });
  h.ports["./browserCommandState.js"].settleNavigation = async () => {
    throw aborted;
  };
  h.state.url = "https://prior.invalid/";
  h.view.webContents.loadURL = () => {
    h.state.url = "https://m.synthetic.invalid/path///?a=1#other";
    return Promise.resolve();
  };
  h.view.webContents.executeJavaScript = async () => ({
    href: h.state.url,
    readyState: "interactive",
  });
  assert.equal(
    await page.handleNavigate(
      h.view,
      { method: "navigate", url: "https://www.synthetic.invalid/path?a=1#original" },
      h.done,
    ),
    h.sentinel,
  );
  assert.equal(h.sentinel.ok, true);
  h.state.url = "https://prior.invalid/";
  signal.aborted = true;
  await assert.rejects(
    page.handleNavigate(
      h.view,
      { method: "navigate", url: "https://synthetic.invalid/path?a=1" },
      h.done,
      { signal },
    ),
    (err) => err instanceof DOMException && err.name === "AbortError",
  );
  const abortError = Object.assign(new Error("exact cancellation"), { name: "AbortError" });
  h.ports["./browserCommandState.js"].settleNavigation = async () => {
    throw abortError;
  };
  await assert.rejects(
    page.handleNavigate(h.view, { method: "navigate", url: "x" }, h.done),
    (err) => err === abortError,
  );
  h.ports["./browserCommandState.js"].settleNavigation = async () => {
    throw new Timeout("synthetic timeout");
  };
  await page.handleNavigate(h.view, { method: "navigate", url: "x" }, h.done);
  assert.equal(h.sentinel.error.code, "timeout");
  assert.equal(h.sentinel.error.sideEffect, "uncertain");
  h.ports["./browserCommandState.js"].settleNavigation = async () => {
    throw aborted;
  };
  h.view.webContents.executeJavaScript = async () => ({ href: h.state.url, readyState: "loading" });
  now = 0;
  await page.handleNavigate(h.view, { method: "navigate", url: "x" }, h.done);
  assert.equal(now, 525);
  assert.equal(h.sentinel.error.code, "execution_error");
  h.ports["./browserCommandState.js"].settleNavigation = async (promise) => promise;
  const doneError = new Error("done exact");
  await assert.rejects(
    page.handleNavigate(h.view, { method: "navigate", url: "x" }, () => {
      throw doneError;
    }),
    (err) => err === doneError,
  );
});
test("page: screenshot authority, CSS metric branches and schema/value/state projection", async () => {
  const h = harness();
  let captureArgs, schemaArg, scriptArg;
  const parsed = { synthetic: "snapshot" };
  const page = load("browserCommandPageHandlers", {
    ...h.ports,
    "@knorvia/shared": {
      browserSnapshotSchema: {
        safeParse: (raw) => {
          schemaArg = raw;
          return { success: true, data: parsed };
        },
      },
    },
    "./browserScreenshotCapture.js": {
      captureScreenshotWithCssPixelCorrection: async (...args) => {
        captureArgs = args;
        return { data: "synthetic png" };
      },
    },
  });
  h.view.captureViewportScreenshot = async function () {
    assert.equal(this, h.view);
    return "compositor";
  };
  await page.handleScreenshot(h.view, { method: "screenshot" }, h.done);
  assert.equal(h.sentinel.image.base64, "compositor");
  assert.equal(captureArgs, undefined);
  await page.handleScreenshot(h.view, { method: "screenshot", clip: null }, h.done);
  assert.equal(captureArgs[0], h.view);
  assert.deepEqual(json(captureArgs[1]), { format: "png", captureBeyondViewport: true });
  h.view.normalizeScreenshotToCssPixels = true;
  h.view.cdp.send = async (...args) => {
    assert.equal(args.length, 1);
    return {
      cssVisualViewport: { clientWidth: 20, clientHeight: 10, pageX: NaN, pageY: Infinity },
      cssContentSize: { width: -1, height: NaN },
      contentSize: { width: 99, height: 99 },
    };
  };
  const params = await page.buildViewportScreenshotParams(h.view);
  assert.ok(Number.isNaN(params.clip.x));
  assert.equal(params.clip.y, Infinity);
  assert.equal(params.clip.scale, 1);
  h.view.cdp.send = async () => ({
    cssVisualViewport: { width: 99, height: 99, clientWidth: 20, clientHeight: 10 },
  });
  const conflicting = await page.buildViewportScreenshotParams(h.view);
  assert.equal(conflicting.clip.width, 20);
  assert.equal(conflicting.clip.height, 10);
  h.view.cdp.send = async () => ({ cssContentSize: { width: -1, height: NaN } });
  await page.handleScreenshot(h.view, { method: "screenshot", fullPage: true }, h.done);
  assert.equal(captureArgs[1].clip.width, -1);
  assert.ok(Number.isNaN(captureArgs[1].clip.height));
  const raw = { opaque: true };
  h.view.webContents.executeJavaScript = async (script) => {
    scriptArg = script;
    return raw;
  };
  await page.handleSnapshot(h.view, { method: "snapshot" }, h.done);
  assert.equal(schemaArg, raw);
  assert.equal(h.sentinel.snapshot, parsed);
  assert.deepEqual(scriptArg.args, [undefined, undefined]);
  h.view.webContents.executeJavaScript = async () => ({
    ok: true,
    kind: "json",
    data: '{"synthetic":7}',
  });
  await page.handleEvaluate(h.view, { method: "evaluate", expression: "opaque" }, h.done);
  assert.deepEqual(json(h.sentinel.value), { synthetic: 7 });
  let dataReads = 0;
  const propertyOrder = [];
  h.view.webContents.executeJavaScript = async () => ({
    get kind() {
      propertyOrder.push("kind");
      return "json";
    },
    get data() {
      propertyOrder.push("data");
      dataReads++;
      return dataReads === 1 ? "true" : "false";
    },
  });
  await page.handleEvaluate(h.view, { method: "evaluate", expression: "opaque" }, h.done);
  assert.equal(h.sentinel.value, false);
  assert.deepEqual(propertyOrder, ["kind", "data", "data"]);
  h.view.webContents.executeJavaScript = async () => ({ ok: false, message: "" });
  await page.handleEvaluate(h.view, { method: "evaluate", expression: "opaque" }, h.done);
  assert.equal(h.sentinel.error.message, "");
  h.view.webContents.executeJavaScript = async () => ({
    scrollX: NaN,
    scrollY: Infinity,
    innerWidth: 20,
    get innerHeight() {
      throw new Error("synthetic property");
    },
  });
  await page.handleGetState(h.view, h.done);
  assert.equal(h.sentinel.state, h.state);
  assert.ok(Number.isNaN(h.state.scrollX));
  assert.equal(h.state.viewportWidth, 20);
  assert.equal("viewportHeight" in h.state, false);
});
test("composed interaction input: forwarded ref focus and failure stop at same trusted boundary", async () => {
  const h = harness();
  h.view.webContents.executeJavaScript = async () => ({ cx: 3, cy: 5 });
  const input = load("browserCommandInput");
  let paste = 0;
  const interaction = load("browserCommandInteractionHandlers", {
    ...h.ports,
    "@knorvia/shared": {},
    "./browserCommandInput.js": input,
    "./browserVirtualClipboard.js": {
      pasteTextIntoFocusedTarget: async () => {
        paste++;
      },
    },
  });
  await interaction.handleType(h.view, { method: "type", ref: "r", text: "synthetic" }, h.done);
  assert.equal(paste, 1);
  assert.deepEqual(
    h.calls.filter((c) => c[0] === "Input.dispatchMouseEvent").map((c) => c[1].type),
    ["mouseMoved", "mousePressed", "mouseReleased"],
  );
  const failure = new Error("trusted press");
  h.view.cdp.send = async (method, params) => {
    if (params.type === "mousePressed") throw failure;
  };
  await assert.rejects(
    interaction.handleType(h.view, { method: "type", ref: "r", text: "x" }, h.done),
    (err) => err === failure,
  );
  assert.equal(paste, 1);
  const page = load("browserCommandPageHandlers", {
    ...h.ports,
    "@knorvia/shared": {},
    "./browserScreenshotCapture.js": {},
  });
  let captureParams,
    probes = 0;
  h.view.normalizeScreenshotToCssPixels = true;
  h.view.cdp.send = async (method) => {
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "synthetic" } } };
    if (method === "Page.createIsolatedWorld") return { executionContextId: 7 };
    if (method === "Runtime.evaluate") {
      probes++;
      return { result: { value: null } };
    }
    if (method === "Page.getLayoutMetrics")
      return { cssVisualViewport: { clientWidth: 12, clientHeight: 8 } };
    throw new Error("Unexpected fake method " + method);
  };
  const consumer = load("browserPlaywrightExecutor", {
    "./browserCommandPageHandlers.js": page,
    "./browserScreenshotCapture.js": {
      captureScreenshotWithCssPixelCorrection: async (view, params) => {
        assert.equal(view, h.view);
        captureParams = params;
        return { data: "synthetic" };
      },
    },
    "./browserPlaywrightDomSnapshot.js": {},
    "./browserPlaywrightLocatorExecutor.js": {},
    "./browserPlaywrightTimeout.js": { normalizePlaywrightTimeout: () => 0 },
  });
  assert.equal(
    await consumer.handlePlaywrightAction(
      h.view,
      { name: "elementScreenshot", x: 1, y: 2 },
      h.done,
    ),
    h.sentinel,
  );
  assert.deepEqual(json(captureParams), {
    format: "png",
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 12, height: 8, scale: 1 },
  });
  assert.equal(probes, 2);
});
