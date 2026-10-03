import {
  assert,
  vm,
  test,
  json,
  load,
  pageFixture,
  scriptPort,
  locatorPorts,
  executorPorts,
} from "./playwrightOwners.fixture.mjs";

test("snapshot: normalization, OOPIF session ownership and release survive cleanup rejection", async () => {
  const fixture = pageFixture({ failRootChild: true, snapshot: true });
  const { captureBrowserDomSnapshot } = load("browserPlaywrightDomSnapshot", scriptPort);
  assert.equal(
    await captureBrowserDomSnapshot(fixture.view),
    '- button "Go"\n- iframe:\n  - link "Child"',
  );
  const attach = fixture.calls.findIndex((call) => call.method === "Target.attachToTarget");
  assert.ok(attach > 0);
  assert.deepEqual(json(fixture.calls[attach].params), { flatten: true, targetId: "child" });
  assert.equal(fixture.calls[attach + 1].sessionId, "owned-session");
  assert.equal(fixture.calls.filter((call) => call.method === "Runtime.releaseObject").length, 1);
  assert.deepEqual(json(fixture.calls.at(-1)), {
    method: "Target.detachFromTarget",
    params: { sessionId: "owned-session" },
  });
  const aborted = new AbortController();
  aborted.abort();
  const before = fixture.calls.length;
  await assert.rejects(
    captureBrowserDomSnapshot(fixture.view, aborted.signal),
    (error) => error.name === "AbortError" && error.message === "Browser DOM snapshot aborted",
  );
  assert.equal(fixture.calls.length, before);
  const whitespace = pageFixture({
    snapshotText: '- generic []:\n  - button "Go" [ref=] [cursor=] \t',
  });
  assert.equal(
    await captureBrowserDomSnapshot(whitespace.view),
    '- generic []:\n  - button "Go" [ref=] [cursor=] \t',
  );
});
test("locator: iframe fill token/paste and press authority precede trusted dispatch", async () => {
  const fixture = pageFixture({ failRootChild: true });
  const events = [];
  const { executeIabPlaywrightLocator } = load(
    "browserPlaywrightLocatorExecutor",
    locatorPorts(events, fixture),
  );
  const selector = "iframe >> internal:control=enter-frame >> input";
  assert.deepEqual(
    json(
      await executeIabPlaywrightLocator(
        fixture.view,
        { name: "locator", operation: "fill", selector, value: "synthetic" },
        100,
      ),
    ),
    { kind: "done", value: null },
  );
  assert.deepEqual(
    events.map(([name]) => name),
    ["token", "paste"],
  );
  assert.equal(fixture.element.syntheticToken, "synthetic-token");
  assert.deepEqual(events[1][2], {
    includeRichText: false,
    initialTarget: { contextId: fixture.lastContext(), sessionId: "owned-session" },
    inputTargetToken: "synthetic-token",
    replaceInputValue: true,
  });
  events.length = 0;
  assert.deepEqual(
    json(
      await executeIabPlaywrightLocator(
        fixture.view,
        { name: "locator", operation: "press", selector, value: "ControlOrMeta+Enter" },
        100,
      ),
    ),
    { kind: "done", value: null },
  );
  assert.deepEqual(
    events.map(([name]) => name),
    ["token", "assert", "modifiers", "key"],
  );
  const key = events.at(-1)[1];
  assert.equal(key[0], fixture.view);
  assert.equal(key[1], "Enter");
  assert.equal(key[3], "owned-session");
  assert.deepEqual(events[2][1], ["Control"]);
  assert.equal(fixture.calls.filter((call) => call.method === "Target.detachFromTarget").length, 2);
  const cancelledFixture = pageFixture();
  const cancelledEvents = [];
  const controller = new AbortController();
  const raw = cancelledFixture.view.cdp.send;
  cancelledFixture.view.cdp.send = async (method, params, sessionId) => {
    const result = await raw(method, params, sessionId);
    if (method === "Runtime.evaluate" && params.expression.includes("injected.fill"))
      controller.abort();
    return result;
  };
  const cancelledOwner = load(
    "browserPlaywrightLocatorExecutor",
    locatorPorts(cancelledEvents, cancelledFixture),
  );
  await assert.rejects(
    cancelledOwner.executeIabPlaywrightLocator(
      cancelledFixture.view,
      { name: "locator", operation: "fill", selector: "input", value: "synthetic" },
      100,
      controller.signal,
    ),
    (error) => error.name === "AbortError" && error.message === "Browser locator action aborted",
  );
  assert.equal(cancelledEvents.filter(([name]) => name === "paste").length, 0);
});
test("locator: pending probe cancellation releases listeners and owned session; forced click preserves rejection", async () => {
  const fixture = pageFixture({ failRootChild: true });
  const events = [];
  const original = fixture.view.cdp.send;
  const abort = new AbortController();
  let releaseProbe;
  let probeEntered;
  const entered = new Promise((resolve) => {
    probeEntered = resolve;
  });
  fixture.view.cdp.send = async (method, params, sessionId) => {
    if (
      method === "Runtime.evaluate" &&
      params.expression.includes("scrollIntoView") &&
      !params.expression.includes("focusNode")
    ) {
      probeEntered();
      return new Promise((resolve) => {
        releaseProbe = resolve;
      });
    }
    return original(method, params, sessionId);
  };
  const { executeIabPlaywrightLocator } = load(
    "browserPlaywrightLocatorExecutor",
    locatorPorts(events, fixture),
  );
  const action = {
    name: "locator",
    operation: "click",
    selector: "iframe >> internal:control=enter-frame >> button",
  };
  const pending = executeIabPlaywrightLocator(fixture.view, action, 100, abort.signal);
  await entered;
  abort.abort();
  assert.deepEqual(json(await pending), { kind: "cancelled" });
  const terminations = fixture.calls.filter((call) => call.method === "Runtime.terminateExecution");
  assert.equal(terminations.length, 2);
  assert.ok(terminations.every((call) => call.sessionId === "owned-session"));
  assert.equal(fixture.calls.at(-1).method, "Target.detachFromTarget");
  releaseProbe({ result: { value: { count: 1, actionable: true, x: 1, y: 2 } } });
  fixture.view.cdp.send = original;
  await assert.rejects(
    executeIabPlaywrightLocator(fixture.view, { ...action, force: true }, 100),
    /Playwright pointer probe returned no click point/,
  );
  assert.equal(events.filter(([name]) => name === "click").length, 0);
});
test("executor: same-reference routing, done identity and screenshot cleanup error precedence", async () => {
  const fixture = pageFixture();
  const signal = new AbortController().signal;
  const doneValue = {};
  const params = {};
  const originalError = new Error("synthetic capture failure");
  let evaluations = 0;
  const calls = [];
  const overlays = [];
  let removed = 0;
  const button = {
    id: "synthetic-button",
    tagName: "BUTTON",
    innerText: "Go",
    outerHTML: "<button>Go</button>",
    getAttribute: () => null,
    matches: (selector) => selector.startsWith("button,"),
    getBoundingClientRect: () => ({ x: 77, y: 88, left: 10, top: 20, width: 20, height: 10 }),
  };
  const excluded = {
    getAttribute: () => null,
    matches: () => false,
    get innerText() {
      throw new Error("excluded element read");
    },
  };
  const document = {
    getElementById: () => ({
      remove: () => {
        removed++;
      },
    }),
    elementsFromPoint: () => [button],
    createElement: () => ({
      style: {},
      children: [],
      append(...values) {
        this.children.push(...values);
      },
    }),
    documentElement: {
      append: (value) => {
        overlays.push(value);
      },
    },
  };
  fixture.view.cdp.send = async (method, args) => {
    calls.push({ method, args });
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "main" } } };
    if (method === "Page.createIsolatedWorld") {
      assert.equal(args.grantUniveralAccess, false);
      return { executionContextId: 0 };
    }
    if (method === "Runtime.evaluate") {
      evaluations++;
      return { result: { value: vm.runInNewContext(args.expression, { document }) } };
    }
    return {};
  };
  let partial;
  const done = (value) => {
    partial = value;
    return doneValue;
  };
  const { handlePlaywrightAction } = load(
    "browserPlaywrightExecutor",
    executorPorts({
      "./browserPlaywrightDomSnapshot.js": {
        captureBrowserDomSnapshot: async (view, received) => {
          assert.equal(view, fixture.view);
          assert.equal(received, signal);
          return "snapshot";
        },
      },
      "./browserCommandPageHandlers.js": {
        buildViewportScreenshotParams: async (view) => {
          assert.equal(view, fixture.view);
          return params;
        },
      },
      "./browserScreenshotCapture.js": {
        captureScreenshotWithCssPixelCorrection: async (view, received) => {
          assert.equal(view, fixture.view);
          assert.equal(received, params);
          throw originalError;
        },
      },
    }),
  );
  assert.equal(
    await handlePlaywrightAction(fixture.view, { name: "domSnapshot" }, done, signal),
    doneValue,
  );
  assert.deepEqual(json(partial), { ok: true, value: "snapshot" });
  document.elementsFromPoint = () => [excluded, button];
  await handlePlaywrightAction(fixture.view, { name: "elementInfo", x: 1, y: 2 }, done);
  assert.equal(partial.value.length, 1);
  assert.equal(partial.value[0].role, "button");
  document.elementsFromPoint = () => [button];
  evaluations = 0;
  await assert.rejects(
    handlePlaywrightAction(fixture.view, { name: "elementScreenshot", x: 1, y: 2 }, done, signal),
    (error) => error === originalError,
  );
  assert.equal(evaluations, 2);
  assert.equal(calls.at(-1).args.contextId, 0);
  assert.equal(removed, 2);
  assert.equal(overlays.length, 1);
  assert.ok(overlays[0].children[0].style.cssText.includes("left:77px;top:88px"));
});
