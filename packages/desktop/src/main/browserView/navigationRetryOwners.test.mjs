import test from "node:test";
import assert from "node:assert/strict";
import { owner, plain } from "./commandChainOwnerTestPorts.mjs";

test("navigation injected authority, race identity and cleanup ordering", async () => {
  let timer,
    token = 1;
  const events = [];
  const api = owner("navigation", {
    Date: { now: () => 123 },
    setTimeout(callback, delay) {
      events.push(["timer", delay]);
      timer = callback;
      return token;
    },
    clearTimeout(value) {
      events.push(["clear", value]);
    },
  });
  assert.equal(api.DEFAULT_NAVIGATE_SETTLE_MS, 10000);
  assert.equal(api.now(), 123);
  for (const url of ["about:blank", "http://synthetic.invalid", "https://synthetic.invalid/a"])
    assert.equal(api.isAllowedBrowserUrl(url), true);
  for (const url of ["about:blank#x", "file:///synthetic", "javascript:0", "invalid"])
    assert.equal(api.isAllowedBrowserUrl(url), false);
  const wc = {};
  for (const [index, method] of ["getURL", "getTitle", "canGoBack", "canGoForward"].entries())
    wc[method] = function () {
      assert.equal(this, wc);
      events.push(method);
      if (index === 1) throw new Error("synthetic");
      return index === 0 ? "synthetic:url" : index === 2;
    };
  assert.deepEqual(plain(api.readState(wc)), {
    url: "synthetic:url",
    title: "",
    canGoBack: true,
    canGoForward: false,
  });
  assert.deepEqual(events.splice(0), ["getURL", "getTitle", "canGoBack", "canGoForward"]);
  let listener;
  const signal = {
    aborted: false,
    addEventListener(type, callback, options) {
      assert.equal(this, signal);
      assert.equal(type, "abort");
      assert.equal(options.once, true);
      listener = callback;
      events.push("add");
    },
    removeEventListener(type, callback) {
      assert.equal(this, signal);
      assert.equal(type, "abort");
      assert.equal(callback, listener);
      events.push("remove");
    },
  };
  await api.settleNavigation(Promise.resolve(), 17, signal);
  assert.deepEqual(events.splice(0), [["timer", 17], "add", ["clear", 1], "remove"]);
  const failure = new Error("load identity");
  await assert.rejects(
    api.settleNavigation(Promise.reject(failure), 8, signal),
    (error) => error === failure,
  );
  events.length = 0;
  const pending = api.settleNavigation(new Promise(() => {}), 7, signal);
  timer();
  await assert.rejects(
    pending,
    (error) =>
      error instanceof api.BrowserNavigationTimeoutError &&
      error instanceof Error &&
      error.name === "BrowserNavigationTimeoutError" &&
      error.message === "Navigation timed out after 7ms",
  );
  assert.deepEqual(events.splice(0), [["timer", 7], "add", ["clear", 1], "remove"]);
  const aborted = api.settleNavigation(new Promise(() => {}), 9, signal);
  listener();
  await assert.rejects(
    aborted,
    (error) =>
      error instanceof DOMException && error.name === "AbortError" && error.message === "aborted",
  );
  events.length = 0;
  signal.aborted = true;
  await assert.rejects(api.settleNavigation(Promise.resolve(), 3, signal), {
    name: "AbortError",
    message: "aborted",
  });
  assert.deepEqual(events, []);
  signal.aborted = false;
  token = 0;
  await api.settleNavigation(Promise.resolve(), 1, signal);
  assert.deepEqual(events.splice(0), [["timer", 1], "add", "remove"]);
  const cleanup = new Error("cleanup identity");
  signal.removeEventListener = () => {
    throw cleanup;
  };
  await assert.rejects(
    api.settleNavigation(Promise.resolve(), 1, signal),
    (error) => error === cleanup,
  );
});

test("transient retry live options, clock budget and lazy bound logging", () => {
  const times = [10, 10, 11, 12, 13, 50, 50];
  const api = owner("retry", {
    Date: {
      now() {
        assert.ok(times.length);
        return times.shift();
      },
    },
  });
  assert.equal(api.isTransientScreenshotCaptureError(new Error("UnknownVizError synthetic")), true);
  assert.equal(api.isTransientScreenshotCaptureError("unknownvizerror"), false);
  const failure = new Error("conversion identity");
  assert.throws(
    () =>
      api.isTransientScreenshotCaptureError({
        toString() {
          throw failure;
        },
      }),
    (error) => error === failure,
  );
  const logs = [];
  const options = {
    delayMs: 0,
    budgetMs: 2,
    log(message) {
      assert.equal(this, options);
      logs.push(message);
    },
  };
  const retry = new api.DesktopBrowserScreenshotTransientRetry(options);
  const context = { target: "guest", windowId: 2, webContentsId: 3 };
  assert.equal(retry.retryDelayMs(), 0);
  assert.equal(retry.schedule(context), true);
  options.delayMs = 19;
  assert.equal(retry.schedule(context), true);
  assert.equal(retry.schedule(context), false);
  assert.equal(retry.schedule(context), false);
  assert.deepEqual(logs, [
    "[browser-screenshot-activity] transient capture retry scheduled target=guest windowId=2 webContentsId=3 attempt=1 delayMs=0",
    "[browser-screenshot-activity] transient capture retry scheduled target=guest windowId=2 webContentsId=3 attempt=2 delayMs=19",
    "[browser-screenshot-activity] transient capture retry budget exhausted target=guest windowId=2 webContentsId=3 attempts=3",
    "[browser-screenshot-activity] transient capture retry budget exhausted target=guest windowId=2 webContentsId=3 attempts=4",
  ]);
  retry.reset();
  options.budgetMs = null;
  options.log = undefined;
  Object.defineProperty(options, "delayMs", {
    get() {
      throw new Error("must remain lazy");
    },
  });
  assert.equal(
    retry.schedule({
      get target() {
        throw new Error("no logger");
      },
    }),
    true,
  );
  assert.equal(times.length, 0);
  assert.equal(new api.DesktopBrowserScreenshotTransientRetry().retryDelayMs(), 100);
});
