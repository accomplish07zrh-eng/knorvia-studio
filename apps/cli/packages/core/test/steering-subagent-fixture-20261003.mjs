import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const trace = {
  traceId: "owned-trace",
  turnId: "owned-turn",
  attributes: { parentToolCallId: "owned-parent-call" },
};
export async function load(mode, fixture) {
  const oldBytes = fs.readFileSync(
    path.join(repo, "apps/cli/packages/core/test/steering-subagent-baseline-20261003.json"),
  );
  assert.equal(hash(oldBytes), "ca03acb0d6b1510c32235ddc78921e27ef74bff19dba54e0bd3eab246b131151");
  const old = JSON.parse(oldBytes);
  for (const row of Object.values(old.files))
    for (const k of ["source", "compiled", "declaration"])
      assert.equal(hash(row[k]), row[k + "Sha256"]);
  let files = old.files;
  if (mode === "current") {
    const bytes = fs.readFileSync(
      path.join(repo, "docs/evidence/knorvia-steering-subagent-current-20261003.json"),
    );
    assert.equal(hash(bytes), "CURRENT_PIN");
    files = {};
    for (const [name, row] of Object.entries(JSON.parse(bytes).files)) {
      files[name] = {};
      for (const [kind, entry] of Object.entries(row)) {
        const bytes = fs.readFileSync(path.join(repo, entry.path));
        assert.equal(hash(bytes), entry.sha256);
        files[name][kind] = bytes.toString();
      }
    }
  } else if (mode === "draft") {
    const bytes = fs.readFileSync(process.argv[3]);
    assert.equal(hash(bytes), "DRAFT_PIN");
    const result = JSON.parse(bytes);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.apiEqual, true);
    files = result.files;
  } else assert.equal(mode, "baseline");
  class OwnedDate extends Date {
    constructor(value = 0) {
      super(value);
    }
    static now() {
      return 100;
    }
  }
  const context = vm.createContext({
    Date: OwnedDate,
    Error,
    Map,
    Set,
    WeakMap,
    Boolean,
    String,
    Number,
    Math,
    Array,
    Promise,
  });
  const synthetic = (id, exports) =>
    new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      },
      { context, identifier: id },
    );
  const modules = new Map(
    Object.entries(fixture.modules).map(([id, exports]) => [id, synthetic(id, exports)]),
  );
  for (const [name, row] of Object.entries(files)) {
    const id = "runtime/methods/" + name.replace(/\.ts$/u, ".js");
    modules.set(id, new vm.SourceTextModule(row.compiled, { context, identifier: id }));
  }
  const link = (specifier, parent) => {
    const id = specifier.startsWith(".")
      ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier))
      : specifier;
    assert.ok(modules.has(id), "Unselected boundary: " + id);
    return modules.get(id);
  };
  for (const name of ["steering", "subagent"]) {
    const module = modules.get("runtime/methods/" + name + ".js");
    if (module.status === "unlinked") await module.link(link);
    if (module.status === "linked") await module.evaluate();
    Object.assign(fixture.runtime, module.namespace);
  }
  return fixture.runtime;
}
export function fixture() {
  const calls = [],
    events = [],
    stored = [],
    logs = [],
    history = [],
    children = [],
    grants = new WeakMap();
  let sequence = 0,
    exploreOptions;
  const error = (type, message, options) => Object.assign(Error(message), { type, ...options });
  const event = (type, sessionId, payload, context) => ({
    id: "owned-event-" + ++sequence,
    type,
    sessionId,
    payload,
    context,
  });
  const runtime = {
    sessionId: "owned-parent",
    rootTraceContext: trace,
    config: { mode: "build", subagents: {}, dynamicWorkflowEnabled: false },
    pendingInputSequence: 0,
    pendingInputReservations: new Map(),
    pendingInputDrains: 0,
    activeTurn: undefined,
    permissionFullAccessPending: false,
    queueExternalDrainActive: false,
    queueAutoDrain: true,
    permissionService: { owned: "parent-permission" },
    permissionBroker: { owned: "parent-broker" },
    runtimeTaskRegistry: {},
    workingDirectory: "owned-cwd",
    eventStore: {},
    modelRequestAdmission: {},
    modelFactory() {
      calls.push("model");
      return model;
    },
    agentTelemetry: {
      port: {},
      captureCausation() {
        assert.equal(this, runtime.agentTelemetry);
        return { owned: "causation" };
      },
    },
    getSessionModelSelection() {
      assert.equal(this, runtime);
      return { providerId: "owned-provider", modelId: "owned-model" };
    },
    getPlanEnabled() {
      assert.equal(this, runtime);
      return runtime.plan ?? false;
    },
    getMode() {
      return runtime.config.mode;
    },
    getTools() {
      return [
        { name: "Read" },
        { name: "Agent" },
        { name: "mcp__owned__hidden", permission: { permission: "mcp" } },
      ];
    },
    async appendEvent(value, context) {
      assert.equal(this, runtime);
      calls.push("append:" + value.type);
      if (runtime.appendFailure) throw runtime.appendFailure;
      events.push([value, context]);
    },
    createEvent(type, payload, context) {
      assert.equal(this, runtime);
      return event(type, runtime.sessionId, payload, context);
    },
    async rebuildProjection() {
      assert.equal(this, runtime);
      calls.push("projection");
      return runtime.projection ?? { pendingSteerInputs: [] };
    },
    sessionStore: {
      async settleSessionInput(input) {
        assert.equal(this, runtime.sessionStore);
        calls.push("settle:" + input.id);
        if (runtime.writeFailure) throw runtime.writeFailure;
        stored.push(input);
      },
      async updateSessionInputs(input) {
        assert.equal(this, runtime.sessionStore);
        calls.push("update");
        if (runtime.writeFailure) throw runtime.writeFailure;
        stored.push(input);
      },
      async listSessionInputs(input) {
        assert.equal(this, runtime.sessionStore);
        calls.push("list");
        return runtime.admitted ?? [];
      },
    },
    messageHistory: {
      addEntries(entries) {
        assert.equal(this, runtime.messageHistory);
        calls.push("history");
        history.push(...entries);
      },
    },
    async persistUserPrompt(...args) {
      assert.equal(this, runtime);
      calls.push("persist");
      if (runtime.persistFailure) throw runtime.persistFailure;
      runtime.persisted = args;
    },
    async notifyEventSinks(value, context) {
      assert.equal(this, runtime);
      calls.push("sink:" + context.sessionId);
      runtime.notified ??= [];
      runtime.notified.push([value, context]);
    },
    enqueueBackgroundTaskNotification(value) {
      assert.equal(this, runtime);
      runtime.notification = value;
      return "ignored";
    },
    enqueueSubagentMessage(input) {
      assert.equal(this, runtime);
      return input;
    },
    logger: {
      debug(...args) {
        assert.equal(this, runtime.logger);
        logs.push(args);
      },
      warn(...args) {
        assert.equal(this, runtime.logger);
        logs.push(args);
      },
    },
  };
  const model = {
    providerId: "owned-provider",
    modelId: "owned-model",
    options: { reasoningLevel: "high" },
    properties: { contextWindow: 100 },
  };
  class OwnedChild {
    constructor(sessionId, config, deps) {
      calls.push("child");
      this.sessionId = sessionId;
      this.config = config;
      this.deps = deps;
      children.push(this);
    }
    async resumeFromStore(input) {
      calls.push("resume");
      this.resumeInput = input;
    }
    async ensureSessionPersistedForExternalActivity(prompt, input) {
      calls.push("child-persist");
      if (runtime.childPersistFailure) throw runtime.childPersistFailure;
      this.persistInput = [prompt, input];
    }
    recordPendingModelChange(input) {
      calls.push("model-boundary");
      this.boundary = input;
    }
    async emitModelSelected(input) {
      calls.push("model-event");
      this.modelEvent = input;
    }
    async executeTurn(...args) {
      calls.push("execute");
      this.executeInput = args;
      if (runtime.executeFailure) throw runtime.executeFailure;
      return result;
    }
    sealBackgroundTaskNotifications(input) {
      calls.push("seal:" + input.reason);
      this.seal = input;
    }
    async cancelRunningRuntimeBackgroundTasks(input) {
      calls.push("cancel");
      this.cancel = input;
      if (runtime.cancelFailure) throw runtime.cancelFailure;
    }
  }
  const result = { owned: "child-result" };
  const deps = {
    sessionStore: runtime.sessionStore,
    fileSystemPort: {},
    executionPort: {},
    httpClientPort: {},
    pdfDocumentPort: {},
    artifactStore: {},
  };
  const modules = {
    "@knorvia/contracts": {
      RESPOND_TO_COORDINATOR_TOOL_NAME: "RespondToCoordinator",
      parseRuntimeInputPresentation: (value) => value,
    },
    "runtime/deps.js": {
      CoreErrorType: {
        TurnInProgress: "turn_in_progress",
        ConfigurationError: "configuration_error",
        ToolExecutionFailed: "tool_execution_failed",
      },
      SessionEventType: Object.fromEntries(
        [
          "TurnSteerQueued",
          "TurnSteerRejected",
          "TurnSteerDispatchChanged",
          "TurnSteerDiscarded",
          "TurnSteerDeliveryChanged",
          "TurnSteerReordered",
          "TurnSteerDrained",
          "QueueAutoDrainChanged",
          "FollowupModeChanged",
          "ModelSelected",
          "SessionModeChanged",
        ].map((name) => [name, name]),
      ),
      createCoreError: error,
      createMessageId: () => "owned-message-" + ++sequence,
      createQueryId: () => "owned-query-" + ++sequence,
      createSessionEvent: event,
      traceContextToLogContext: (context) => ({ traceId: context.traceId, turnId: context.turnId }),
      defaultScheduler: { owned: "scheduler" },
      defaultPermissionConfig: { owned: "explore-permission-config" },
      PermissionService: class {
        constructor(config) {
          this.config = config;
        }
      },
      buildExploreAllowedTools: () => ["Read", "Bash"],
      buildExploreAgentPrompt: () => "owned-explore-prompt",
      createExploreSubagentPort(options) {
        calls.push("port");
        exploreOptions = options;
        return { owned: "port" };
      },
    },
    "runtime/permission-grant-recovery.js": {
      unpublishedPermissionGrants: grants,
      async recoverPendingPermissionGrant(owner) {
        assert.equal(owner, runtime);
        calls.push("recover");
        runtime.recover?.();
      },
    },
    "agent/runtime-input-presentation.js": {
      runtimeInputMetadata: (value) => (value ? { inputPresentation: value } : undefined),
    },
    "runtime/model-selection.js": {
      cloneModelSelection: (value) => ({
        ...value,
        ...(value.options ? { options: { ...value.options } } : {}),
      }),
    },
    "runtime/methods/runtime-model.js": { createRuntimeModel: () => model },
    "runtime/helpers/index.js": {
      buildUserContentFromTurn: (input, attachments) => ({ input, attachments }),
      measureUtf8Bytes: (value) => Buffer.byteLength(value),
      MAX_TURN_STEER_INPUT_BYTES: 32,
      previewInput: (value) => value.slice(0, 12),
      async resolveTurnAttachments(value) {
        calls.push("attachments");
        return value ?? [];
      },
    },
    "agent/message-history.js": {
      createRuntimeUserEntry: (content, metadata) => ({ content, metadata }),
      realUserRuntimeMetadata: () => ({ source: "real-user" }),
    },
    "runtime/agent-runtime.js": { AgentRuntime: OwnedChild },
    "runtime/helpers/subagent-selection.js": {
      resolveSubagentSelection: (input) => ({
        selection: input.overrideSelection ?? input.profileSelection ?? input.parentSelection,
        hasConcreteModel: Boolean(input.overrideSelection ?? input.profileSelection),
      }),
    },
    "mcp/index.js": { toMcpToolName: (descriptor) => descriptor.name },
    "mcp/windows-computer-use.js": { restrictBorrowedWindowsComputerUse: (access) => access },
    "subagent/borrowed-mcp-port.js": {
      createBorrowedSubagentMcpAccess(port, snapshot, servers, official) {
        calls.push("borrow");
        runtime.borrowedArgs = [port, snapshot, servers, official];
        return { port, snapshot };
      },
    },
    "subagent/message-steering.js": {
      createSubagentMessageSink: (child, request) => ({ child, request }),
    },
    "subagent/mcp-config.js": {
      extractRequiredMcpServerNames: (names) => names.map((name) => name.split("__")[1]),
      matchesRequiredMcpServer: (name, statuses) => statuses[name]?.status === "connected",
    },
    "subagent/tool-event-mirror.js": {
      mirrorSubagentToolEvent: (value, input) => {
        calls.push("mirror");
        runtime.mirrorInput = input;
        return runtime.mirror;
      },
    },
    "subagent/profile.js": {
      isBuiltInExploreAgentProfile: (profile) => profile.builtInExplore === true,
    },
    "subagent/tool-policy.js": {
      buildSubagentChildDisallowRules: (rules) => rules,
      filterSubagentChildToolNames: (names, rules) => names.filter((name) => !rules.includes(name)),
    },
    "tool/compat.js": { isSubagentDispatchToolName: (name) => name === "Agent" || name === "Task" },
    "embedded-search/capability.js": {
      resolveEmbeddedSearchBranchCapability: () => ({ useEmbeddedSearchBranch: true }),
    },
    "runtime/methods/session-shell-environment.js": {
      getSessionShellEnvironment: () => ({
        selection: "owned-shell",
        promptShell: "owned-shell-prompt",
      }),
    },
    "runtime/helpers/child-client-ports.js": {
      deriveChildClientPorts: (ports, identity) => {
        runtime.clientIdentity = identity;
        return ports;
      },
    },
    "subagent/coordinator-response.js": { createCoordinatorResponsePort: (options) => options },
    "runtime/methods/runtime-command-generation.js": {
      isStaleBranchRuntimeTaskEvent: (_owner, value) => value.stale === true,
    },
    "subagent/persistent-memory.js": {
      async loadPersistentAgentMemory() {
        calls.push("memory");
        return runtime.memory;
      },
    },
    "subagent/computer-use-policy.js": {
      SUBAGENT_COMPUTER_USE_UNAVAILABLE_CODE: "owned-cua-unavailable",
      SUBAGENT_COMPUTER_USE_UNAVAILABLE_MESSAGE: "Owned computer use unavailable",
      createOfficialCuaPolicy: (names) => ({
        serverNames: names,
        isOfficialSkillRequest: (name) => name === "official:owned",
        isOfficialToolRequest: (name) => name === "mcp__official__control",
        isOfficialServerSelector: (name) => name === "mcp__official__*",
        isOfficialSkill: (skill) => skill.name === "official",
      }),
    },
    "runtime/methods/mcp.js": { computeOfficialCuaServerNames: () => new Set(["official"]) },
  };
  const request = {
    profile: {},
    allowedTools: ["Read"],
    agentId: "owned-agent",
    agentType: "owned-general",
    sessionId: "owned-child",
    description: "owned-child-description",
    workingDirectory: "owned-child-cwd",
    workspaceRoot: "owned-root",
    prompt: "owned-child-prompt",
    systemPrompt: "owned-system",
    traceContext: trace,
    reportActivity() {
      calls.push("activity");
    },
    async onSessionReady() {
      calls.push("ready");
    },
    registerMessageSink(sink) {
      calls.push("message-sink");
      runtime.messageSink = sink;
    },
  };
  return {
    runtime,
    deps,
    calls,
    events,
    stored,
    logs,
    history,
    children,
    modules,
    grants,
    model,
    result,
    request,
    get exploreOptions() {
      return exploreOptions;
    },
  };
}
