import assert from "node:assert/strict";
import test from "node:test";
import { loadRendererOwner } from "./renderer-owner-fixture.mjs";

// Deferred supplied-collector/DOM/IPC scenarios. No actual collector or IO proof.
test("trace lifetime keeps captured bare calls, pagehide and late configuration behavior", async () => {
  const trace = [];
  const listeners = new Map();
  let resolveConfiguration;
  const configuration = new Promise((resolve) => { resolveConfiguration = resolve; });
  const platform = {
    reportRendererActionTraceBatch: function (batch) { trace.push(["send", this, batch]); },
    getRendererActionTraceConfig: function () { trace.push(["get", this]); return configuration; },
    onRendererActionTraceConfigChanged: function (callback) {
      trace.push(["subscribe", this]); this.configure = callback;
      return function () { trace.push(["off", this]); };
    },
  };
  const state = {
    trace,
    crypto: { randomUUID: () => "renderer-instance" },
    window: {
      addEventListener(name, callback, options) { listeners.set(name, callback); trace.push(["listen", name, options]); },
      removeEventListener(name, callback) { assert.equal(listeners.get(name), callback); listeners.delete(name); trace.push(["remove", name]); },
    },
  };
  const modules = {
    "@knorvia/shared": 'export const DISABLED_RENDERER_ACTION_TRACE_CONFIG={enabled:false},RENDERER_ACTION_TRACE_SERVICE_NAME="renderer",KNORVIA_ENV="production",KNORVIA_VERSION="";',
    "@knorvia/ui": [
      'export class RendererUserActionTelemetry{constructor(options){port.telemetry=this;this.options=options;port.trace.push(["construct",options]);} updateConfig(config){port.trace.push(["config",config]);} shutdown(){port.trace.push(["shutdown"]);return Promise.resolve();}}',
      'export const setUserActionTelemetry=(value)=>port.trace.push(["publish",value]);',
    ].join("\n"),
  };
  const { initializeDesktopUserActionTrace } = await loadRendererOwner("src/userActionTraceBootstrap.ts", state, modules);
  const release = initializeDesktopUserActionTrace({ platform, isLocalDevelopmentRuntime: true });
  assert.equal(trace.find(([name]) => name === "get")[1], undefined);
  assert.equal(trace.find(([name]) => name === "subscribe")[1], platform);
  assert.equal(state.telemetry.options.resource.serviceVersion, "unknown");
  assert.equal(state.telemetry.options.resource.deploymentEnvironment, "development");
  state.telemetry.options.sendBatch({ batch: 1 });
  assert.equal(trace.find(([name]) => name === "send")[1], undefined);
  listeners.get("pagehide")();
  release();
  assert.equal(trace.find(([name]) => name === "off")[1], undefined);
  assert.equal(trace.filter(([name]) => name === "shutdown").length, 2);
  resolveConfiguration({ enabled: true });
  await configuration;
  await Promise.resolve();
  assert.deepEqual(trace.at(-1), ["config", { enabled: true }]);
  const count = trace.filter(([name]) => name === "construct").length;
  initializeDesktopUserActionTrace({ platform: {}, isLocalDevelopmentRuntime: false })();
  assert.equal(trace.filter(([name]) => name === "construct").length, count);
  assert.deepEqual(trace.at(-1), ["publish", null]);
});

test("TTFT bounds FIFO publication and retains drops, live missing methods and release order", async () => {
  const trace = [];
  const packets = [];
  const events = new Map();
  let timer;
  const state = {
    trace, packets,
    crypto: { randomUUID: () => "ttft-instance" },
    window: {
      addEventListener: (name, callback) => events.set(name, callback),
      removeEventListener: (name) => { events.delete(name); trace.push(["remove", name]); },
    },
    document: {
      visibilityState: "hidden", hasFocus: () => false,
      addEventListener: (name, callback) => events.set(name, callback),
      removeEventListener: (name) => { events.delete(name); trace.push(["remove", name]); },
    },
    setInterval: (callback, ms) => { assert.equal(ms, 1000); timer = callback; return 7; },
    clearInterval: (id) => { assert.equal(id, 7); trace.push(["clear-timer"]); },
  };
  const platform = {
    reportLocalTtftBatch: function (packet) {
      assert.equal(this, platform); packets.push(packet); trace.push(["batch", packet.sequence]);
      if (packet.sequence === 0) throw new Error("first send failed");
    },
    getRendererActionTraceConfig: function () { assert.equal(this, platform); return Promise.resolve({ localTtftEnabled: true }); },
    onRendererActionTraceConfigChanged: function (callback) {
      assert.equal(this, platform); this.configure = callback;
      return function () { assert.equal(this, undefined); trace.push(["off"]); };
    },
  };
  const modules = {
    "@knorvia/ui": [
      'export class LocalTtftObserver{constructor(record,_clock,_limits,predicate){port.record=record;port.observer=this;this.predicate=predicate;} sampleClock(){port.trace.push(["sample"]);} expire(){port.trace.push(["expire"]);} background(){port.trace.push(["background"]);} foreground(){port.trace.push(["foreground"]);} interrupt(){port.trace.push(["interrupt"]);port.record({id:"interrupted"});}}',
      'export const setLocalTtftObserver=(value)=>port.trace.push(["publish",value]);',
    ].join("\n"),
  };
  const { initializeDesktopLocalTtft } = await loadRendererOwner("src/localTtftBootstrap.ts", state, modules);
  const release = initializeDesktopLocalTtft(platform);
  await Promise.resolve();
  assert.equal(state.observer.enabled, true);
  assert.equal(trace.some(([name]) => name === "background"), true);
  for (let id = 0; id < 130; id++) state.record({ id });
  platform.configure({ localTtftEnabled: false });
  timer();
  assert.deepEqual(packets.map((packet) => [packet.sequence, packet.records.length, packet.dropped]), [[0,32,2],[1,32,34],[2,32,0],[3,32,0]]);
  assert.deepEqual(packets.flatMap((packet) => packet.records.map((record) => record.id)), Array.from({ length: 128 }, (_, id) => id));
  const send = platform.reportLocalTtftBatch;
  platform.reportLocalTtftBatch = undefined;
  state.record({ id: "discarded-without-live-method" });
  timer();
  platform.reportLocalTtftBatch = send;
  events.get("focus")();
  assert.equal(trace.some(([name]) => name === "foreground"), false);
  state.document.visibilityState = "visible";
  events.get("visibilitychange")();
  assert.equal(trace.at(-1)[0], "foreground");
  release();
  assert.equal(packets.at(-1).sequence, 4);
  assert.deepEqual(packets.at(-1).records, [{ id: "interrupted" }]);
  assert.deepEqual(trace.slice(-10).map(([name]) => name), ["interrupt","sample","expire","batch","clear-timer","off","publish","remove","remove","remove"]);
  assert.equal(events.size, 0);
});
