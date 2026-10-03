import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./recordingOwnerTestPorts.mjs";

test("video transaction retains phase order, live dimensions and failure identity", async () => {
  const events = [];
  const ports = {
    "node:fs/promises": {
      async stat(file) {
        events.push(["stat", file]);
        return { isFile: () => true, size: 5 };
      },
      async rm(file, options) {
        events.push(["rm", file, options.force]);
      },
    },
  };
  const { recordBrowserVideo } = load("video", ports);
  const viewport = { width: 640, height: 480 };
  const frame = {};
  const controller = new AbortController();
  let clock = 100;
  const input = {
    targetFrame: frame,
    tempRoot: "/synthetic",
    recordingId: "capture",
    viewport,
    fps: 25,
    signal: controller.signal,
    now: () => clock,
    async createRecorder(factoryInput) {
      assert.equal(this, input);
      assert.equal(factoryInput.targetFrame, frame);
      assert.equal(factoryInput.viewport, viewport);
      assert.equal(factoryInput.signal, controller.signal);
      events.push(["create"]);
      return {
        async stop() {
          events.push(["stop"]);
        },
        async cancel() {
          events.push(["cancel"]);
        },
      };
    },
    onPhase(phase) {
      assert.equal(this, input);
      events.push([phase]);
    },
    onCaptureComplete() {
      assert.equal(this, input);
      events.push(["complete"]);
    },
    async executeScenario() {
      assert.equal(this, input);
      events.push(["scenario"]);
      clock = 1100.4;
      viewport.width = 700;
    },
  };
  const artifact = await recordBrowserVideo(input);
  assert.deepEqual(JSON.parse(JSON.stringify(artifact)), {
    path: "/synthetic/capture.webm",
    mimeType: "video/webm",
    width: 700,
    height: 480,
    fps: 25,
    durationMs: 1000,
    frameCount: 25,
  });
  assert.deepEqual(
    events.map((entry) => entry[0]),
    ["create", "capturing", "scenario", "complete", "finalizing", "stop", "stat"],
  );
  events.length = 0;
  const original = new Error("synthetic scenario failure");
  input.executeScenario = async () => {
    throw original;
  };
  await assert.rejects(recordBrowserVideo(input), (error) => error === original);
  assert.deepEqual(
    events.map((entry) => entry[0]),
    ["create", "capturing", "cancel", "rm"],
  );
  events.length = 0;
  controller.abort();
  await assert.rejects(
    recordBrowserVideo(input),
    (error) => error.name === "AbortError" && error.message === "Browser recording cancelled",
  );
  assert.deepEqual(
    events.map((entry) => entry[0]),
    ["rm"],
  );
});

test("transparent bootstrap releases presentation once and yields focus ownership", () => {
  const {
    startBrowserScreenshotTransparentWindowBootstrap: start,
    TRANSPARENT_WINDOW_PRESENTATION_GRACE_MS,
  } = load("bootstrap");
  assert.equal(TRANSPARENT_WINDOW_PRESENTATION_GRACE_MS, 100);
  function fixture() {
    const events = [];
    let focusListener;
    const win = {
      isDestroyed: () => false,
      isVisible: () => false,
      isMinimized: () => false,
      isFocused: () => false,
      getOpacity() {
        assert.equal(this, win);
        return 0.7;
      },
      setOpacity(value) {
        assert.equal(this, win);
        events.push(["opacity", value]);
      },
      showInactive() {
        assert.equal(this, win);
        events.push(["show"]);
      },
      hide() {
        assert.equal(this, win);
        events.push(["hide"]);
      },
      setSkipTaskbar(value) {
        assert.equal(this, win);
        events.push(["taskbar", value]);
      },
      on(event, listener) {
        assert.equal(this, win);
        assert.equal(event, "focus");
        focusListener = listener;
        events.push(["on"]);
      },
      removeListener(event, listener) {
        assert.equal(this, win);
        assert.equal(listener, focusListener);
        events.push(["remove"]);
      },
    };
    const options = {
      win,
      enabled: true,
      windowId: 1,
      webContentsId: 2,
      requestId: "synthetic",
      hideTaskbarDuringBootstrap: true,
    };
    return { events, win, options, focus: () => focusListener() };
  }
  const ordinary = fixture();
  const bootstrap = start(ordinary.options);
  bootstrap.release();
  bootstrap.release();
  assert.deepEqual(ordinary.events, [
    ["taskbar", true],
    ["opacity", 0],
    ["on"],
    ["show"],
    ["remove"],
    ["hide"],
    ["opacity", 0.7],
    ["taskbar", false],
  ]);
  const focused = fixture();
  const other = start(focused.options);
  focused.focus();
  other.release();
  assert.deepEqual(focused.events, [
    ["taskbar", true],
    ["opacity", 0],
    ["on"],
    ["show"],
    ["remove"],
    ["opacity", 0.7],
    ["taskbar", false],
  ]);
  const failed = fixture();
  failed.win.showInactive = () => {
    throw new Error("synthetic show failure");
  };
  assert.equal(start(failed.options), false);
  assert.deepEqual(failed.events, [
    ["taskbar", true],
    ["opacity", 0],
    ["on"],
    ["remove"],
    ["opacity", 0.7],
    ["taskbar", false],
  ]);
});
