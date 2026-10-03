import assert from "node:assert/strict";
import { deferred, fixture, load, plain, trace } from "./mcp-config-fixture-20261003.mjs";
const mode = process.argv[2];
let groups = 0;
async function group(name, run) {
  await run();
  groups++;
  console.log("ok " + name);
}
await group(
  "captured authority requires trusted stdio identity and exact private authority",
  async () => {
    const f = fixture(),
      api = await load(mode, f);
    const env = {
      KNORVIA_PLUGIN_ID: " COMPUTER-USE@KNORVIA-PLUGINS-BUNDLED ",
      KNORVIA_CUA_PLUGIN_AUTHORITY: " owned-authority ",
    };
    const servers = {
      admitted: { type: "stdio", env },
      spoof: { type: "stdio", env },
      network: { type: "http", env },
      mismatch: { type: "stdio", env: { ...env, KNORVIA_CUA_PLUGIN_AUTHORITY: "other" } },
    };
    assert.deepEqual(
      [...api.computeOfficialCuaServerNames(servers, new Set(["admitted", "network", "mismatch"]))],
      ["admitted"],
    );
    assert.equal(f.calls.filter(([n]) => n === "credentials").length, 1);
    const denied = fixture();
    denied.modules["@knorvia/shared"].getCapturedKnorviaCuaBrokerCredentials = () => ({});
    const noAuthority = await load(mode, denied);
    assert.deepEqual(
      [...noAuthority.computeOfficialCuaServerNames(servers, new Set(Object.keys(servers)))],
      [],
    );
  },
);
await group(
  "startup has one captured native lifetime and discovery/configured receiver semantics",
  async () => {
    const f = fixture(),
      pending = deferred(),
      tools = [{ name: "owned" }],
      statuses = { owned: { status: "connected" } };
    f.runtime.mcpPort = {
      status() {
        assert.equal(this, f.runtime.mcpPort);
        f.calls.push(["status"]);
        return pending.promise;
      },
      listTools() {
        assert.equal(this, f.runtime.mcpPort);
        f.calls.push(["tools"]);
        return Promise.resolve(tools);
      },
    };
    await load(mode, f);
    const startup = f.runtime.startMcpStartup(trace);
    assert.equal(startup, f.runtime.mcpStartupPromise);
    assert.equal(f.runtime.startMcpStartup(trace), startup);
    assert.deepEqual(
      f.calls.map(([n]) => n),
      ["status", "tools", "track"],
    );
    pending.resolve(statuses);
    const discovered = await startup;
    assert.equal(discovered.statuses, statuses);
    assert.equal(discovered.tools, tools);
    assert.deepEqual(Object.keys(discovered), ["statuses", "tools"]);
    const configured = fixture(),
      connection = deferred(),
      snapshot = { statuses, tools };
    const servers = { owned: { type: "stdio", command: "owned-synthetic" } };
    configured.runtime.config = {
      mcp: { servers },
      workspaceIdentity: { toString: () => "owned-workspace" },
    };
    configured.runtime.mcpPort = {
      connectConfiguredServers(received, options) {
        assert.equal(this, configured.runtime.mcpPort);
        assert.equal(received, servers);
        assert.deepEqual(Object.keys(options), [
          "oauthAuthorizationTimeoutMs",
          "trace",
          "workingDirectory",
          "workspaceIdentity",
        ]);
        assert.equal(options.oauthAuthorizationTimeoutMs, 15000);
        assert.equal(options.trace, trace);
        assert.equal(options.workingDirectory, "/owned/cwd");
        assert.equal(options.workspaceIdentity, "owned-workspace");
        configured.calls.push(["connect"]);
        return connection.promise;
      },
    };
    await load(mode, configured);
    const outcome = configured.runtime.startMcpStartup(trace);
    assert.equal(outcome, configured.runtime.mcpStartupPromise);
    assert.deepEqual(
      configured.calls.map(([n]) => n),
      ["clock", "connect", "track", "debug"],
    );
    connection.resolve(snapshot);
    assert.equal(await outcome, snapshot);
    assert.equal(configured.clock.reads, 2);
    const info = configured.calls.find(([n]) => n === "info");
    assert.equal(info[1], "MCP startup completed");
    assert.equal(info[2].durationMs, 20);
    assert.deepEqual(Object.keys(info[2]), [
      "ownedTrace",
      "durationMs",
      "event",
      "module",
      "serverCount",
      "status",
      "statusCounts",
      "toolCount",
    ]);
  },
);
await group(
  "registration retains captured port, trust options, concurrent admission and failure phases",
  async () => {
    const f = fixture(),
      connection = deferred(),
      registry = f.runtime.registry;
    const tools = [{ name: "one" }],
      port = {};
    f.runtime.mcpPort = port;
    f.runtime.config = {
      toolAllowlist: ["one"],
      toolDisallowlist: ["denied"],
      runtimeFeatures: { computerUse: false },
      mcp: { trustedWindowsComputerUseServerNames: ["must-not-trust"], servers: {} },
    };
    await load(mode, f);
    f.runtime.startMcpStartup = function (received) {
      assert.equal(this, f.runtime);
      assert.equal(received, trace);
      return connection.promise;
    };
    const invalidate = f.runtime.invalidateToolCache;
    f.runtime.invalidateToolCache = function () {
      assert.equal(this, f.runtime);
      f.calls.push(["invalidate"]);
      return invalidate.call(this);
    };
    const first = f.runtime.initializeMcp(trace),
      second = f.runtime.initializeMcp(trace);
    assert.equal(f.runtime.mcpToolsRegistered, false);
    f.runtime.mcpPort = { ownedReplacement: true };
    connection.resolve({ statuses: {}, tools });
    await Promise.all([first, second]);
    const registrations = f.calls.filter(([n]) => n === "register");
    assert.equal(registrations.length, 2);
    for (const [, receivedRegistry, receivedPort, receivedTools, options] of registrations) {
      assert.equal(receivedRegistry, registry);
      assert.equal(receivedPort, port);
      assert.equal(receivedTools, tools);
      assert.equal(options.allowedTools, f.runtime.config.toolAllowlist);
      assert.equal(options.disallowedTools, f.runtime.config.toolDisallowlist);
      assert.deepEqual([...options.trustedWindowsComputerUseServerNames], []);
      assert.deepEqual(Object.keys(options), [
        "allowedTools",
        "disallowedTools",
        "trustedWindowsComputerUseServerNames",
        "officialCuaServerNames",
      ]);
    }
    assert.equal(f.calls.filter(([n]) => n === "invalidate").length, 2);
    assert.equal(f.runtime.mcpToolsRegistered, true);
    const before = f.calls.length;
    await f.runtime.initializeMcp(trace);
    assert.equal(f.calls.length, before);
    const failed = fixture(),
      original = Error("owned registration failure");
    failed.runtime.mcpPort = {};
    failed.modules["runtime/deps.js"].registerMcpTools = () => {
      throw original;
    };
    await load(mode, failed);
    failed.runtime.startMcpStartup = () => Promise.resolve({ statuses: {}, tools: [] });
    await failed.runtime.initializeMcp(trace);
    assert.equal(failed.runtime.mcpToolsRegistered, true);
    assert.equal(failed.calls.find(([n]) => n === "warn")[2].error, original.message);
    const synchronous = fixture();
    synchronous.runtime.mcpPort = {};
    await load(mode, synchronous);
    synchronous.runtime.startMcpStartup = () => {
      throw original;
    };
    await assert.rejects(synchronous.runtime.initializeMcp(trace), (error) => error === original);
    assert.equal(synchronous.runtime.mcpToolsRegistered, false);
  },
);
await group(
  "cancelled async connection falls back, synchronous startup failures remain original",
  async () => {
    const f = fixture(),
      cancelled = Object.assign(Error("owned cancellation"), { name: "AbortError" });
    f.runtime.config.mcp = { servers: { owned: { type: "stdio" } } };
    f.runtime.mcpPort = { connectConfiguredServers: () => Promise.reject(cancelled) };
    await load(mode, f);
    await f.runtime.initializeMcp(trace);
    const warn = f.calls.find(([n]) => n === "warn");
    assert.equal(warn[1], "MCP startup failed");
    assert.equal(warn[2].error, cancelled.message);
    assert.equal(f.runtime.mcpToolsRegistered, true);
    assert.equal(f.calls.find(([n]) => n === "register")[3].length, 0);
    const throwing = fixture();
    throwing.runtime.config.mcp = f.runtime.config.mcp;
    throwing.runtime.mcpPort = {
      connectConfiguredServers() {
        throw cancelled;
      },
    };
    await load(mode, throwing);
    assert.throws(
      () => throwing.runtime.startMcpStartup(trace),
      (error) => error === cancelled,
    );
    assert.equal(throwing.runtime.mcpInitialized, true);
    assert.equal(throwing.runtime.mcpToolsRegistered, false);
    const disabled = fixture();
    disabled.runtime.config.mcp = { enabled: false };
    await load(mode, disabled);
    assert.equal(disabled.runtime.startMcpStartup(trace), undefined);
    assert.equal(disabled.runtime.mcpToolsRegistered, true);
    assert.deepEqual(disabled.calls, []);
  },
);
await group(
  "configuration keeps execution write delegation and actual parent authority/event identities",
  async () => {
    const f = fixture(),
      api = await load(mode, f),
      originalConfig = f.runtime.config;
    f.runtime.updateConfig({
      planEnabled: true,
      language: "owned-language",
      outputStyle: undefined,
    });
    assert.equal(f.runtime.config, originalConfig);
    assert.equal(f.runtime.needsPlanModeExitReminder, false);
    assert.equal(f.calls.filter(([n]) => n === "prefix").length, 2);
    assert.equal("outputStyle" in originalConfig, true);
    f.runtime.activeTurn = {};
    f.runtime.updateConfig({ language: "next", outputStyle: "owned" });
    assert.equal(f.calls.filter(([n]) => n === "prefix").length, 2);
    const cancelled = Object.assign(Error("owned write cancellation"), { name: "AbortError" });
    const failed = fixture();
    failed.modules["runtime/execution-state.js"].applyRuntimeExecutionState = (
      owner,
      input,
      cause,
    ) => {
      assert.equal(owner, failed.runtime);
      assert.deepEqual(Object.keys(cause), ["source", "traceContext"]);
      assert.equal(cause.source, "command");
      assert.equal(cause.traceContext, trace);
      return Promise.reject(cancelled);
    };
    await load(mode, failed);
    await assert.rejects(
      failed.runtime.setExecutionState({ planEnabled: false }, trace),
      (error) => error === cancelled,
    );
    const broker = {
        listPendingRequests() {
          assert.equal(this, broker);
          return requests;
        },
      },
      requests = [{}],
      headers = {};
    f.runtime.permissionBroker = broker;
    f.runtime.providerRuntimeHeadersPort = headers;
    assert.equal(f.runtime.getPendingPermissionRequests(), requests);
    assert.equal(
      f.runtime.createChildClientPorts({ childSessionId: "owned-child", parentSessionId: "spoof" })
        .permissionBroker,
      broker,
    );
    const child = f.calls.find(([n]) => n === "child-ports");
    assert.equal(child[2].parentSessionId, "owned-parent");
    assert.equal(child[1].providerRuntimeHeadersPort, headers);
    const event = {};
    await f.runtime.notifyExternalChildSessionEvent({
      childSessionId: "owned-child",
      event,
      traceContext: trace,
    });
    const notification = f.calls.find(([n]) => n === "notify");
    assert.equal(notification[1], event);
    assert.equal(notification[2].sessionId, "owned-child");
    await f.runtime.ensureSessionPersistedForExternalActivity("owned synthetic input");
    assert.equal(f.calls.find(([n]) => n === "persist")[2], trace);
    const sink = () => {},
      unsubscribe = api.subscribeEvents.call(f.runtime, sink),
      oldSinks = f.runtime.eventSinks;
    f.runtime.eventSinks = new Set([sink]);
    unsubscribe();
    assert.equal(oldSinks.has(sink), true);
    assert.equal(f.runtime.eventSinks.has(sink), false);
  },
);
await group(
  "tool visibility projects only after selection and lazy context preserves single-owner references",
  async () => {
    const f = fixture(),
      web = { name: "WebSearch" },
      ordinary = { name: "Owned" },
      contracts = [ordinary, web, web];
    const model = { properties: { supportsNativeWebSearch: true } };
    f.runtime.registry = {
      toContracts() {
        assert.equal(this, f.runtime.registry);
        f.calls.push(["contracts"]);
        return contracts;
      },
      get(name) {
        assert.equal(this, f.runtime.registry);
        return { name };
      },
    };
    f.modules["tool/model-contract.js"].projectToolModelContract = (contract, entry, context) => {
      assert.equal(context.model, model);
      model.properties.supportsNativeWebSearch = false;
      return contract;
    };
    await load(mode, f);
    const first = f.runtime.getTools(model);
    assert.deepEqual([...first], [web, web, ordinary]);
    assert.deepEqual([...f.runtime.getTools(model)], [ordinary]);
    assert.equal(f.calls.filter(([n]) => n === "contracts").length, 1);
    f.runtime.invalidateToolCache();
    f.runtime.getTools(model);
    assert.equal(f.calls.filter(([n]) => n === "contracts").length, 2);
    const snapshot = {},
      builder = {};
    f.runtime.createConfigOnlyContextSnapshot = function (cwd) {
      assert.equal(this, f.runtime);
      assert.equal(cwd, "/owned/cwd");
      return snapshot;
    };
    f.runtime.createContextBuilderFromSnapshot = function (received, memory, options) {
      assert.equal(this, f.runtime);
      assert.equal(received, snapshot);
      assert.equal(memory, undefined);
      assert.deepEqual(plain(options), { persistEnvInfo: false });
      return builder;
    };
    assert.equal(f.runtime.getContextBuilder(), builder);
    assert.equal(f.runtime.getContextBuilder(), builder);
    assert.equal("messageHistory" in f.runtime, false);
    f.runtime.setWorkingDirectory("/owned/new-cwd");
    assert.equal(f.runtime.getProjectId(), "owned-project:/owned/workspace");
  },
);
console.log(
  JSON.stringify({
    mode,
    syntheticAuthorityLifecycleGroups: groups,
    realOperations: 0,
    publicMethodConsumersIncluded: true,
  }),
);
