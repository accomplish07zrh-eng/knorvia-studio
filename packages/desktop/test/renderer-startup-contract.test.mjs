import assert from "node:assert/strict";
import test from "node:test";
import { loadRendererOwner } from "./renderer-owner-fixture.mjs";

// Both scenarios authored, unrun. Supplied parsers are not actual schema evidence.
const schemaPorts = {
  "@knorvia/shared": [
    'export const databaseStartupPortPayloadSchema={safeParse(value){return typeof value?.databaseStartupId==="string" && value.databaseStartupId ? {success:true,data:value}:{success:false};}};',
    "export const databaseStartupStateSchema={safeParse(value){return value?.invalid ? {success:false}:{success:true,data:value};}};",
    'export const InternalChannels={DatabaseStartupState:"state",DatabaseStartupControl:"control",ServicePort:"local",ScopedServicePort:"remote",ScopedServicePortReady:"ready",TaskNotificationSound:"sound"};',
    'export const DEFAULT_LOCALE="en-US",LAUNCH_MARKS_QUERY_KEY="marks"; export const parseLaunchMarks=()=>null;',
    'export const DesktopCommandIds={OpenFeedback:"feedback",OpenCommunity:"community"}; export const buildLocalMediaPreviewUrl=(path)=>path;',
  ].join("\n"),
};

test("startup admission replaces one resource and consumes only its ready generation", async () => {
  const { DatabaseStartupAdmission } = await loadRendererOwner(
    "src/databaseStartupAdmission.ts",
    {},
    schemaPorts,
  );
  const admission = new DatabaseStartupAdmission();
  const calls = [];
  const a = { close: () => calls.push("close-a") };
  const b = { close: () => calls.push("close-b") };
  const invalid = { close: () => calls.push("close-invalid") };
  admission.acceptPort({ databaseStartupId: "a" }, a);
  admission.acceptPort({ databaseStartupId: "a" }, a);
  admission.acceptPort({}, invalid);
  assert.deepEqual(calls, ["close-invalid"]);
  assert.equal(admission.acceptState({ startupId: "a", sequence: 3, phase: "ready" }), true);
  assert.equal(admission.acceptState({ startupId: "a", sequence: 2, phase: "ready" }), false);
  admission.acceptPort({ databaseStartupId: "b" }, b);
  assert.deepEqual(calls, ["close-invalid", "close-a"]);
  assert.equal(admission.takeReadyPort(), undefined);
  assert.equal(admission.acceptState({ startupId: "b", sequence: 0, phase: "ready" }), true);
  assert.equal(admission.takeReadyPort(), b);
  assert.equal(admission.takeReadyPort(), undefined);
  const failure = new Error("close failed");
  const held = {
    close() {
      throw failure;
    },
  };
  admission.acceptPort({ databaseStartupId: "b" }, held);
  assert.throws(
    () => admission.acceptPort({ databaseStartupId: "c" }, a),
    (error) => error === failure,
  );
  assert.equal(admission.takeReadyPort(), held);
});

test("entry waits for the matching local generation then registers early remote ports before ready", async () => {
  const trace = [];
  const listeners = new Map();
  const renders = [];
  const localServices = {
    fileService: "local-file",
    settingService: "settings",
    broadcastService: "broadcast",
  };
  const remoteServices = { fileService: "remote-file", hooksService: "remote-hooks" };
  const state = {
    trace,
    localServices,
    remoteServices,
    window: {
      location: { search: "?locale=zh-CN&initialWorkspacePurpose=conversation" },
      knorvia: {},
      addEventListener: (name, handler) => listeners.set(name, handler),
      postMessage: (message) => trace.push(["post", message]),
      matchMedia: () => ({ matches: false }),
    },
    document: {
      getElementById: () => ({}),
      documentElement: { classList: { add() {}, toggle() {} } },
    },
    navigator: { userAgent: "Windows", language: "en-US", clipboard: { writeText() {} } },
    localStorage: { getItem: () => null },
    Date: { now: () => 1234 },
    setTimeout: (handler, ms) => ({ handler, ms }),
    clearTimeout: () => trace.push(["clear-timeout"]),
    createRoot: () => ({ render: (view) => renders.push(view) }),
    registerBase: (services) => trace.push(["base", services]),
    registerRemote: (params) => trace.push(["remote", params]),
    connection: (port) => {
      trace.push(["connection", port]);
      return { services: remoteServices, dispose: (reason) => trace.push(["dispose", reason]) };
    },
    connect: (port) => {
      trace.push(["connect", port]);
      return localServices;
    },
    sound: () => trace.push(["sound"]),
  };
  const modules = {
    ...schemaPorts,
    "@knorvia/ui/styles.css": "",
    "@knorvia/ui/e2e-store-bridge": "export const registerE2EStoreBridges=()=>{};",
    "@knorvia/ui": [
      'export const AppErrorBoundary="boundary",Root="root",GlobalDatabaseStartupLoading="loading",KnorviaIntlProvider="intl";',
      "export const registerBaseWorkspaceServices=port.registerBase,registerRemoteWorkspaceSession=port.registerRemote;",
      'export const createRemoteWorkspaceDisconnectedError=()=>new Error("disconnected"),playTaskNotificationSound=port.sound;',
      "export const recordArmsCustomEventForE2E=()=>{};",
    ].join("\n"),
    "@knorvia/client":
      "export const connectViaMessagePort=port.connect,createMessagePortServiceConnection=port.connection;",
    react: "export const useEffect=()=>{};",
    "react-dom/client": "export const createRoot=port.createRoot;",
    "react/jsx-runtime": "export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;",
  };
  await loadRendererOwner("src/main.tsx", state, modules);
  const receive = listeners.get("message");
  const remotePort = {
    close() {
      throw new Error("must not close");
    },
  };
  receive({
    source: {},
    data: {
      type: "remote",
      attachmentId: "attachment",
      sessionId: "session",
      target: { type: "ssh" },
    },
    ports: [remotePort],
  });
  assert.equal(
    trace.some(([name]) => name === "remote"),
    false,
  );
  const localPort = {
    close() {
      throw new Error("must not close");
    },
  };
  receive({
    source: state.window,
    data: { type: "local", databaseStartupId: "b" },
    ports: [localPort],
  });
  receive({
    source: state.window,
    data: { type: "state", state: { startupId: "a", sequence: 3, phase: "ready" } },
    ports: [],
  });
  assert.equal(
    trace.some(([name]) => name === "connect"),
    false,
  );
  receive({
    source: state.window,
    data: { type: "state", state: { startupId: "b", sequence: 0, phase: "ready" } },
    ports: [],
  });
  const connectAt = trace.findIndex(([name]) => name === "connect");
  const baseAt = trace.findIndex(([name]) => name === "base");
  const remoteAt = trace.findIndex(([name]) => name === "remote");
  const readyAt = trace.findIndex(([name, message]) => name === "post" && message.type === "ready");
  assert.ok(connectAt < baseAt && baseAt < remoteAt && remoteAt < readyAt);
  assert.equal(trace[remoteAt][1].services.fileService, "remote-file");
  assert.equal(trace[remoteAt][1].services.settingService, "settings");
  assert.deepEqual(trace[readyAt][1], {
    type: "ready",
    attachmentId: "attachment",
    sessionId: "session",
  });
  assert.equal(renders.at(-1).props.children.props.children[1].type, "root");
  const renderCount = renders.length;
  receive({ source: state.window, data: { type: "state", state: { invalid: true } }, ports: [] });
  assert.equal(renders.length, renderCount);
  receive({ source: {}, data: "sound", ports: [] });
  assert.deepEqual(trace.at(-1), ["sound"]);
});
