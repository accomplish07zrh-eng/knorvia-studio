import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { EventEmitter } from "node:events";
import test from "node:test";
import { load } from "./recordingOwnerTestPorts.mjs";

const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

// 物理路径遵循宿主规则；显式绝对根避免把 POSIX 字面量误当作 Windows 契约。
const pathVariants = [
  ["native", path, path.resolve("synthetic")],
  ["POSIX", path.posix, "/synthetic"],
  ["Win32", path.win32, "C:\\synthetic"],
];
for (const [variant, pathApi, fixtureRoot] of pathVariants) {
  test(
    "WebM fake authority gate, FIFO backpressure and cancellation lifetime remain bounded" +
      (variant === "native" ? "" : ` (${variant} paths)`),
    async () => {
      const events = [];
      const messages = [];
      const diagnostics = [];
      let mutableMessage;
      const timers = new Map();
      let timerId = 0,
        displayHandler,
        recorderWindow,
        html,
        finishWrite;
      let firstWrite = true;
      let firstWritePending = new Promise((resolve) => {
        finishWrite = resolve;
      });
      const targetFrame = { isDestroyed: () => false, detached: false };
      const ownFrame = { isDestroyed: () => false, detached: false };
      const fakeSession = {
        setDisplayMediaRequestHandler(handler) {
          assert.equal(this, fakeSession);
          displayHandler = handler;
          events.push(handler ? "handler:set" : "handler:clear");
        },
      };
      class Port extends EventEmitter {
        start() {
          events.push("port:start");
        }
        close() {
          events.push("port:close");
          this.emit("close");
        }
        postMessage(message) {
          messages.push(message);
          if (message.type === "start")
            this.emit("message", { data: { type: "started", mimeType: "video/webm;codecs=vp8" } });
          if (message.type === "stop") this.emit("message", { data: { type: "stopped" } });
        }
      }
      let mainPort;
      class Channel {
        constructor() {
          this.port1 = mainPort = new Port();
          this.port2 = new Port();
        }
      }
      class Window {
        constructor(options) {
          recorderWindow = this;
          assert.equal(options.show, false);
          assert.equal(options.webPreferences.session, fakeSession);
          assert.equal(options.webPreferences.sandbox, true);
          assert.equal(options.webPreferences.contextIsolation, true);
          assert.equal(options.webPreferences.nodeIntegration, false);
          assert.equal(options.webPreferences.webSecurity, true);
          this.destroyed = false;
          this.webContents = new EventEmitter();
          this.webContents.mainFrame = ownFrame;
          this.webContents.setWindowOpenHandler = (handler) => {
            assert.equal(handler().action, "deny");
          };
          this.webContents.postMessage = (channel, data, ports) => {
            assert.equal(channel, "knorvia-browser-video-recorder:port");
            assert.equal(data, null);
            assert.equal(ports.length, 1);
            mainPort.emit("message", { data: { type: "ready" } });
          };
        }
        async loadFile(file) {
          events.push(["load", file]);
        }
        isDestroyed() {
          return this.destroyed;
        }
        destroy() {
          this.destroyed = true;
          events.push("window:destroy");
        }
      }
      const handle = {
        async write(buffer) {
          assert.equal(this, handle);
          events.push(["write", buffer]);
          if (firstWrite) {
            firstWrite = false;
            await firstWritePending;
          }
          return { bytesWritten: 1, buffer };
        },
        async close() {
          assert.equal(this, handle);
          events.push("file:close");
        },
      };
      const afterAwaitRoot = pathApi.join(fixtureRoot, "after-await");
      const input = {
        outputPath: pathApi.join(fixtureRoot, "output.webm"),
        targetFrame,
        viewport: { width: 320, height: 240 },
        fps: 25,
        signal: new AbortController().signal,
      };
      const ports = {
        "node:path": pathApi,
        electron: {
          BrowserWindow: Window,
          MessageChannelMain: Channel,
          session: { fromPartition: () => fakeSession },
        },
        "node:crypto": { randomUUID: () => "synthetic-id" },
        "node:fs/promises": {
          async mkdir() {
            events.push("mkdir");
            input.outputPath = pathApi.join(afterAwaitRoot, "output.webm");
          },
          async writeFile(file, contents, options) {
            events.push(["document", file]);
            html = contents;
            assert.equal(options.mode, 0o600);
          },
          async open(file, mode) {
            assert.equal(file, input.outputPath);
            assert.equal(mode, "w");
            return handle;
          },
          async rm(file, options) {
            events.push(["remove", file]);
            assert.equal(options.force, true);
          },
        },
        setTimeout(callback, delay) {
          assert.equal(delay, 15000);
          const id = ++timerId;
          timers.set(id, callback);
          return id;
        },
        clearTimeout(id) {
          timers.delete(id);
        },
      };
      const exports = load("webm", ports);
      assert.equal(
        exports.defaultElectronBrowserWebmRecorder,
        exports.createElectronBrowserWebmRecorder,
      );
      const recorder = await exports.createElectronBrowserWebmRecorder(input, (message) => {
        diagnostics.push(message);
        if (mutableMessage) {
          mutableMessage.type = "diagnostic";
          mutableMessage = undefined;
        }
      });
      assert.equal(
        events.find((entry) => Array.isArray(entry) && entry[0] === "document")[1],
        pathApi.join(afterAwaitRoot, ".synthetic-id-browser-video-recorder.html"),
      );
      assert.match(html, /default-src 'none'; script-src 'unsafe-inline'/);
      const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];
      new vm.Script(inlineScript, { filename: "synthetic-recorder-renderer.js" });
      // This parses the generated renderer only; it does not run browser/media APIs.
      function authorize(request) {
        let result;
        displayHandler(request, (answer) => {
          result = answer;
        });
        return result;
      }
      const request = { frame: ownFrame, videoRequested: true, audioRequested: false };
      assert.equal(authorize(request).video, targetFrame);
      for (const denied of [
        { ...request, frame: {} },
        { ...request, videoRequested: false },
        { ...request, audioRequested: true },
      ])
        assert.equal(Object.keys(authorize(denied)).length, 0);
      targetFrame.detached = true;
      assert.equal(Object.keys(authorize(request)).length, 0);
      targetFrame.detached = false;
      targetFrame.isDestroyed = () => true;
      assert.equal(Object.keys(authorize(request)).length, 0);
      targetFrame.isDestroyed = () => false;
      mutableMessage = { type: "synthetic-unknown", message: "mutation visible" };
      mainPort.emit("message", { data: mutableMessage });
      assert.ok(diagnostics.includes("[browser-recording] mutation visible"));
      const functionMessage = Object.assign(() => {}, {
        type: "diagnostic",
        message: "synthetic function message",
      });
      mainPort.emit("message", { data: functionMessage });
      assert.ok(diagnostics.includes("[browser-recording] synthetic function message"));
      recorderWindow.webContents.emit("console-message", {});
      assert.ok(
        diagnostics.includes("[browser-recording] recorder console level=unknown message="),
      );
      mainPort.emit("message", { data: { type: "chunk", data: null } });
      assert.ok(diagnostics.some((message) => message.includes("[object Null]")));
      const bytes = new Uint8Array([1, 2, 3]);
      mainPort.emit("message", { data: { type: "chunk", data: bytes.subarray(1) } });
      mainPort.emit("message", { data: { type: "chunk", data: new Uint8Array([4]) } });
      await tick();
      assert.equal(
        events.filter((entry) => Array.isArray(entry) && entry[0] === "write").length,
        1,
      );
      bytes[1] = 9;
      const buffer = events.find((entry) => Array.isArray(entry) && entry[0] === "write")[1];
      assert.equal(buffer[0], 9);
      let stopped = false;
      const stopping = recorder.stop().then(() => {
        stopped = true;
      });
      await tick();
      assert.equal(stopped, false);
      assert.equal(events.includes("file:close"), false);
      // A second stop joins the stopped acknowledgement, not the first write-drain promise.
      await recorder.stop();
      assert.equal(stopped, false);
      finishWrite();
      await stopping;
      assert.equal(
        events.filter((entry) => Array.isArray(entry) && entry[0] === "write").length,
        2,
      );
      assert.ok(events.indexOf("file:close") < events.indexOf("handler:clear"));
      assert.ok(events.indexOf("handler:clear") < events.indexOf("window:destroy"));
      assert.equal(timers.size, 0);
      assert.equal(mainPort.listenerCount("message"), 0);
      assert.equal(recorderWindow.webContents.listenerCount("render-process-gone"), 0);
      await recorder.cancel();
      assert.equal(messages.filter((message) => message.type === "cancel").length, 0);
      await assert.rejects(
        recorder.stop(),
        (error) => error.message === "Electron WebM recorder failed: recorder is already closed",
      );
      firstWrite = true;
      firstWritePending = new Promise((resolve) => {
        finishWrite = resolve;
      });
      const cancellable = await exports.createElectronBrowserWebmRecorder(input);
      mainPort.emit("message", { data: { type: "chunk", data: new Uint8Array([8]) } });
      await tick();
      let cancelled = false;
      const cancelling = cancellable.cancel().then(() => {
        cancelled = true;
      });
      await tick();
      assert.equal(cancelled, false);
      assert.equal(Object.keys(authorize(request)).length, 0);
      await cancellable.cancel();
      assert.equal(cancelled, false);
      finishWrite();
      await cancelling;
      assert.equal(messages.filter((message) => message.type === "cancel").length, 1);
    },
  );
}
