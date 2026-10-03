import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const baseline = process.argv.includes("--baseline");
const selected = process.argv.find((arg) => arg.startsWith("--case="))?.slice(7);
const plain = (value) => JSON.parse(JSON.stringify(value));
const defer = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const drain = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
function check(name, run) {
  if (!selected || selected === name) test(name, run);
}
function harness({ platform = "linux" } = {}) {
  const events = [],
    messages = [],
    processEvents = new Map(),
    protocols = [],
    scopes = [];
  const startupGate = defer(),
    phaseGate = defer(),
    taskReady = new Map(),
    terminal = new Map();
  const workspaceSubscriptions = new Map(),
    metadata = new Map();
  const symbols = {};
  for (const name of [
    "IFileService",
    "IMediaPreviewService",
    "IModelSelectionService",
    "ISettingService",
    "IStudioRuntimeService",
    "IWindowControllerService",
    "IKnorviaAgentService",
    "IKnorviaTaskService",
    "IKnorviaSessionService",
    "ICuaPipSessionService",
  ])
    symbols[name] = { channelName: name };
  const control = {
    startupGate,
    phaseGate,
    startupOptions: null,
    localOptions: null,
    remoteOptions: null,
    collectionOptions: null,
    browserOptions: null,
    registryOptions: null,
    controllerOptions: null,
    attachmentOptions: null,
    phases: null,
    exposures: [],
    attachWait: null,
    flowGate: null,
    promptGate: null,
    fixedSelection: { id: "synthetic-model", options: { reasoningLevel: "high" } },
    persistedSelection: { id: "synthetic-fixed-model", options: { reasoningLevel: "low" } },
    automations: new Map(),
    runs: new Map(),
    ledgerFailure: null,
    replacedFailure: null,
    backendLoads: 0,
    settings: {
      httpProxy: "synthetic-proxy",
      httpProxyNoProxy: "synthetic-no-proxy",
      httpProxyCaCertPath: "synthetic-ca",
    },
  };
  class Port {
    listeners = new Map();
    closed = false;
    once(name, callback) {
      const list = this.listeners.get(name) ?? [];
      list.push(callback);
      this.listeners.set(name, list);
    }
    close() {
      this.closed = true;
      events.push("port-close");
      const list = this.listeners.get("close") ?? [];
      this.listeners.delete("close");
      for (const callback of list) callback();
    }
  }
  let messageHandler,
    uuid = 0;
  const parent = {
    on(name, callback) {
      assert.equal(name, "message");
      messageHandler = callback;
      events.push("message-handler");
    },
    postMessage(message) {
      messages.push(message);
    },
  };
  const fakeProcess = {
    parentPort: parent,
    pid: 12345,
    platform,
    env: {
      KNORVIA_PROCESS_LABEL: "synthetic-window",
      KNORVIA_REMOTE_MEDIA_RANGE_PREVIEW_ENABLED: "1",
      NODE_ENV: "test",
      SYNTHETIC_PUBLIC_ENV: "value",
    },
    title: "",
    cwd: () => "/synthetic-local",
    on(name, callback) {
      processEvents.set(name, callback);
    },
    once(name, callback) {
      processEvents.set(name, callback);
    },
    exit(code) {
      events.push("exit:" + code);
    },
    memoryUsage: () => ({ arrayBuffers: 1, external: 2, heapUsed: 3, rss: 4 }),
  };
  const tokens = symbols;
  const task = {
    async createTask(input) {
      events.push(["create", input]);
      return {
        taskId: "synthetic-task",
        traceId: "creation-trace",
        workspacePath: input.workspacePath,
        workspaceIdentity: input.workspaceIdentity,
      };
    },
    async resumeTask(input) {
      events.push(["resume", input]);
      return {
        taskId: input.taskId,
        traceId: "resume-trace",
        workspacePath: input.workspacePath,
        workspaceIdentity: input.workspaceIdentity,
      };
    },
    async setAutomationSessionConfig(input) {
      events.push(["config", input]);
    },
    async setConfigOption(input) {
      events.push(["config-option", input]);
    },
    async sendPrompt(input) {
      assert.ok(this === task || this === local.get(tokens.IKnorviaTaskService));
      events.push(["prompt", input]);
      if (control.promptGate) await control.promptGate.promise;
      return { accepted: true };
    },
    async releaseWorkspacePreparation(input) {
      events.push(["release-workspace", input]);
    },
    onDynamicWorkspaceEvent(context) {
      assert.equal(this, task);
      return (listener) => {
        workspaceSubscriptions.set(context.workspaceIdentity ?? context.workspacePath, listener);
        return {
          dispose() {
            events.push("workspace-subscription-dispose");
          },
        };
      };
    },
    onDynamicTaskReady(id) {
      assert.equal(this, task);
      return (listener) => {
        taskReady.set(id, listener);
        return {
          dispose() {
            events.push("ready-dispose:" + id);
          },
        };
      };
    },
    onDynamicStreamEvent(id) {
      assert.equal(this, task);
      return (listener) => {
        control.streamListener = listener;
        return {
          dispose() {
            events.push("stream-dispose:" + id);
          },
        };
      };
    },
    onDynamicTaskTerminalOutcome(id) {
      return (listener) => {
        terminal.set(id, listener);
        return {
          dispose() {
            events.push("terminal-dispose:" + id);
          },
        };
      };
    },
    async setTaskUnread(input) {
      events.push(["unread", input]);
      return input;
    },
    async deliverSessionMessage(input) {
      return input;
    },
    async sendSessionMessageDeliveryResult(input) {
      events.push(["delivery-result", input]);
    },
    passthrough() {
      return this;
    },
  };
  class Collection {
    values = new Map();
    constructor() {
      this.values.set(tokens.IKnorviaTaskService, task);
      this.values.set(tokens.IKnorviaAgentService, { name: "synthetic-agent" });
      this.values.set(tokens.IModelSelectionService, { name: "synthetic-selection" });
      this.values.set(tokens.ISettingService, {
        async get() {
          events.push("settings-read");
          return control.settings;
        },
      });
      this.values.set(tokens.IKnorviaSessionService, {
        async initializeWorkspace(context) {
          events.push(["warmup", context]);
          return { available: true, transportKind: "synthetic" };
        },
      });
      this.values.set(tokens.IFileService, { name: "synthetic-file" });
    }
    get(token) {
      const value = this.getOptional(token);
      assert.notEqual(value, undefined, token.channelName);
      return value;
    }
    getOptional(token) {
      return this.values.get(token);
    }
    register(token, service) {
      this.values.set(token, service);
      events.push(["register", token.channelName]);
    }
    exposeOnChannelServer(server, overrides) {
      control.exposures.push({ server, overrides });
      events.push("expose");
    }
  }
  const local = new Collection(),
    remote = new Collection();
  const trackerEntries = new Map();
  let trackerReporter;
  function publishCount(meta) {
    trackerReporter({
      workspacePath: meta.workspacePath,
      workspaceIdentity: meta.workspaceIdentity,
      runningTaskCount: trackerEntries.size,
    });
  }
  const tracker = {
    begin(id, meta) {
      if (trackerEntries.has(id)) return false;
      trackerEntries.set(id, meta);
      publishCount(meta);
      return true;
    },
    finish(id, meta) {
      if (trackerEntries.delete(id)) publishCount(meta);
    },
    clearWorkspace(context) {
      for (const [id, meta] of trackerEntries)
        if (key(meta) === key(context)) trackerEntries.delete(id);
      publishCount(context);
    },
    getTotalRunningTaskCount: () => trackerEntries.size,
  };
  const key = (context) => context.workspaceIdentity?.trim() || context.workspacePath;
  const sessions = new Map();
  let remoteHandle;
  const registry = {
    async connect(input) {
      events.push(["registry-connect", input]);
      remoteHandle = await control.registryOptions.connect({
        target: input.target,
        remoteAssets: input.remoteAssets,
        signal: { aborted: false },
      });
      control.remoteHandle = remoteHandle;
      const descriptor = {
        remoteSessionId: "remote-session",
        target: input.target,
        workspacePath: input.workspacePath,
        workspaceIdentity: input.workspaceIdentity,
        generation: 1,
      };
      sessions.set(descriptor.remoteSessionId, {
        ...descriptor,
        state: "online",
        sourceAvailability: "online",
      });
      return descriptor;
    },
    cancelConnect(id) {
      events.push(["cancel", id]);
    },
    getSession: (id) => (sessions.has(id) ? { ...sessions.get(id) } : null),
    listSessions: () => [...sessions.values()].map((session) => ({ ...session })),
    findSessionForWorkspace(context) {
      return (
        [...sessions.values()].find(
          (value) =>
            value.workspacePath === context.workspacePath &&
            value.workspaceIdentity === context.workspaceIdentity,
        ) ?? null
      );
    },
    resolveScopedServices(scope) {
      events.push(["resolve-remote", scope]);
      const session = sessions.get(scope.remoteSessionId);
      if (
        !session ||
        session.workspacePath !== scope.workspacePath ||
        session.workspaceIdentity !== scope.workspaceIdentity
      )
        throw new Error("synthetic-scope-denied");
      return remoteHandle.services;
    },
    resolveScopedCapabilities(scope) {
      registry.resolveScopedServices(scope);
      return remoteHandle.capabilities;
    },
    async waitForScopedServices(scope) {
      events.push(["wait-remote", scope]);
      if (control.attachWait) await control.attachWait.promise;
      return registry.resolveScopedServices(scope);
    },
    bindWorkspaceContext(input) {
      events.push(["bind", input]);
      const session = sessions.get(input.remoteSessionId);
      if (!session) throw new Error("synthetic-missing-session");
      session.workspacePath = input.workspacePath;
      session.workspaceIdentity = input.workspaceIdentity;
      session.generation++;
      return Promise.resolve();
    },
    async disposeSession(id) {
      events.push(["dispose-session", id]);
      sessions.delete(id);
    },
    setWorkspaceRunningTaskCount(event) {
      events.push(["registry-count", event]);
    },
    getStats: () => ({ connectionCount: sessions.size, logicalSessionCount: sessions.size }),
    async dispose() {
      events.push("registry-dispose");
      if (remoteHandle) await remoteHandle.dispose();
    },
  };
  const controllerService = {
    async mutateTask(input) {
      events.push(["mutate", input]);
      return input;
    },
    async deleteArchivedTasks(input) {
      events.push(["delete-archived", input]);
      return { deletedTaskIds: input.taskIds, skippedTaskIds: [], failedTaskIds: [] };
    },
    async deleteArchivedTask(input) {
      events.push(["delete-archived-one", input]);
      return input;
    },
  };
  const controller = {
    service: controllerService,
    async resolveTaskAddress(input) {
      events.push(["address", input]);
      return { input };
    },
    createAttachmentService() {
      return {
        kind: "synthetic-controller-attachment",
        dispose() {
          events.push("controller-attachment-dispose");
        },
      };
    },
    async replaceDisconnectedSource(previous, next) {
      events.push(["replace-source", previous, next]);
      if (control.replacedFailure) throw control.replacedFailure;
    },
    disconnectSource(scope) {
      events.push(["disconnect-source", scope]);
    },
    removeSource(scope) {
      events.push(["remove-source", scope]);
    },
    dispose() {
      events.push("controller-dispose");
    },
  };
  const attachmentHandles = new Map();
  const attachment = {
    attach(input) {
      events.push(["attach", input]);
      const resolved = control.attachmentOptions.resolveScope(input.scope);
      const handle = control.attachmentOptions.expose({
        ...resolved,
        port: input.port,
        clientMode: input.clientMode,
        scope: input.scope,
      });
      attachmentHandles.set(input.attachmentId, handle);
    },
    detach(id) {
      events.push(["detach", id]);
      attachmentHandles.get(id)?.dispose();
      attachmentHandles.delete(id);
    },
    detachRemoteSessionAttachments(id) {
      events.push(["detach-remote", id]);
    },
    detachStaleRemoteSessionAttachments(id, generation) {
      events.push(["detach-stale", id, generation]);
    },
    size: () => attachmentHandles.size,
    dispose() {
      events.push("attachments-dispose");
      for (const handle of attachmentHandles.values()) handle.dispose();
      attachmentHandles.clear();
    },
  };
  class Protocol {
    constructor(port) {
      this.port = port;
      protocols.push(this);
    }
    onFlowState(listener) {
      this.listener = listener;
      return {
        dispose: () => {
          events.push("flow-unsubscribe");
          this.listener = null;
        },
      };
    }
    fire(state) {
      this.listener?.(state);
    }
    disconnect() {
      events.push("protocol-disconnect");
    }
  }
  class Server {
    constructor(protocol, name, timeout, deferInit) {
      events.push(["server", name, timeout, deferInit]);
      this.protocol = protocol;
    }
    dispose() {
      events.push("raw-server-dispose");
    }
    ready() {}
  }
  class Wrapper {
    constructor(server) {
      this.server = server;
    }
    ready() {
      this.server.ready();
    }
  }
  const realtime = {
    async acquireTaskRunLease(target) {
      events.push(["lease-acquire", target]);
      return { acquired: true };
    },
    publishStreamOp(target, operation) {
      events.push(["mirror", target, operation]);
    },
    releaseTaskRunLease(target) {
      events.push(["lease-release", target]);
    },
    dispose() {
      events.push("realtime-dispose");
    },
  };
  const backend = {
    async upload(...args) {
      events.push(["upload", ...args]);
    },
  };
  const network = {
    fetch() {
      assert.fail("real fetch invocation");
    },
  };
  const repo = {
    async get(id) {
      events.push(["automation-get", id]);
      return control.automations.get(id);
    },
    async getRun(id) {
      events.push(["run-get", id]);
      return control.runs.get(id);
    },
    async getModelSelectionForDispatch() {
      return control.fixedSelection;
    },
    async fixRunModelSelection(id, selection) {
      events.push(["model-fix", id, selection]);
      return control.persistedSelection;
    },
    async markManualRunDispatched(input) {
      events.push(["mark-manual", input]);
      if (control.ledgerFailure) throw control.ledgerFailure;
    },
    close() {
      events.push("repo-close");
    },
  };
  const shared = {
    HostMessageTypes: new Proxy({}, { get: (_target, property) => property }),
    HostResponseTypes: new Proxy({}, { get: (_target, property) => property }),
    KNORVIA_VERSION: "synthetic-version",
    resolveWorkspaceKey: key,
    formatLogPrefix: () => "synthetic-prefix",
    formatKnorviaHostProcessName: (label) => "host-" + label,
    formatZodError: () => "synthetic-invalid",
    buildRemoteWorkspaceIdentity: (workspace) => "remote:" + workspace,
    isRemoteWorkspaceIdentity: (identity) => identity.startsWith("remote:"),
    formatModelPickerValue: (selection) => "model:" + selection.id,
    redactDiagnosticValue: (...args) => {
      assert.equal(args.length, 1, "redaction public call must receive exactly one original value");
      return args[0];
    },
  };
  function proxyState() {
    const metas = new Map(),
      subscriptions = new Map(),
      ready = new Map();
    return {
      rememberTaskMeta(meta) {
        metas.set(meta.taskId, meta);
        metadata.set(meta.taskId, meta);
      },
      getTaskMeta: (id) => control.taskMetadataOverride ?? metas.get(id),
      ensureWorkspaceSubscription(context, subscribe) {
        const id = key(context);
        if (subscriptions.has(id)) return false;
        subscriptions.set(id, subscribe());
        return true;
      },
      trackTaskReady(id, context, subscribe, onReady) {
        const disposable = subscribe(() => {
          this.disposeTaskReadySubscription(id);
          onReady();
        });
        ready.get(id)?.dispose();
        ready.set(id, disposable);
      },
      disposeTaskReadySubscription(id) {
        const disposable = ready.get(id);
        ready.delete(id);
        disposable?.dispose();
      },
      clearWorkspace(context) {
        const id = key(context);
        subscriptions.get(id)?.dispose();
        subscriptions.delete(id);
        for (const [taskId, meta] of metas)
          if (key(meta) === id) {
            metas.delete(taskId);
            this.disposeTaskReadySubscription(taskId);
          }
      },
    };
  }
  const noop = () => {};
  const ports = {
    "node:crypto": { randomUUID: () => "synthetic-" + ++uuid },
    "@knorvia/shared": shared,
    "@knorvia/rpc": {
      MessagePortProtocol: Protocol,
      ChannelServer: Server,
      LoggingChannelServer: Wrapper,
      NetworkTelemetryChannelServer: Wrapper,
    },
    "@knorvia/services": {
      ...tokens,
      ServiceCollection: Collection,
      collectServiceMemoryDiagnostics: () => ({}),
      createKnorviaAgentConnectionScope(_agent, options) {
        const scope = {
          options,
          service: { connection: options.connectionId },
          async setTransportFlowState(state) {
            events.push(["flow", options.connectionId, state]);
            if (control.flowGate && state === "saturated") await control.flowGate.promise;
          },
          dispose() {
            events.push(["scope-dispose", options.connectionId]);
          },
        };
        scopes.push(scope);
        return scope;
      },
    },
    "@knorvia/services/node": {
      AutomationRepo: class {
        constructor() {
          events.push("factory:repo");
          return repo;
        }
      },
      createLocalServices(options) {
        control.localOptions = options;
        events.push("local-create");
        return local;
      },
      createSettingServiceWithMigrations: () => ({ service: local.get(tokens.ISettingService) }),
      createHostApiNetworkTransport(supplier) {
        control.networkSettingsSupplier = supplier;
        return network;
      },
      createServiceLogger: () => {
        events.push("factory:logger");
        return { debug: noop };
      },
      disposeServiceResources(collection) {
        events.push(["services-dispose-sync", collection === local ? "local" : "remote"]);
      },
      async disposeServiceResourcesAndWait(collection) {
        events.push(["services-dispose", collection === local ? "local" : "remote"]);
      },
    },
    "@knorvia/server/remote": {
      async createRemoteBackend(target) {
        control.backendLoads++;
        events.push(["backend", target]);
        return backend;
      },
      pickRemoteRuntimeEnv(env) {
        assert.equal(env, fakeProcess.env);
        return { SYNTHETIC_PUBLIC_ENV: env.SYNTHETIC_PUBLIC_ENV };
      },
      async connectRemote(received, options) {
        assert.equal(received, backend);
        control.remoteOptions = options;
        events.push("remote-connect");
        return {
          services: remote,
          async disposeAndWait(input) {
            events.push(["connection-dispose", input]);
          },
        };
      },
    },
    "@knorvia/server/remote/remoteConnectionProgressContext.js": {
      createRemoteConnectionProgressContext: () => ({
        report: noop,
        run: (id, callback) => {
          events.push(["progress", id]);
          return callback();
        },
      }),
    },
    "./hostDatabaseStartup.js": {
      createHostDatabaseStartup(options) {
        control.startupOptions = options;
        const coordinator = {
          snapshot: { phase: "pending", attemptId: "attempt" },
          publish() {
            options.publish(this.snapshot);
          },
          async retry(id) {
            events.push(["retry", id]);
          },
          async start() {
            events.push("startup-start");
            await startupGate.promise;
            await options.initializeServices();
            this.snapshot = { phase: "ready", attemptId: "attempt" };
            options.publish(this.snapshot);
          },
        };
        return {
          coordinator,
          dispose() {
            events.push("startup-dispose");
          },
        };
      },
    },
    "./hostNetworkTelemetry.js": {
      registerHostNetworkTelemetry: () => events.push("factory:network"),
      stopHostNetworkTelemetry: () => events.push("network-stop"),
    },
    "./hostServiceResourceTelemetry.js": {
      registerHostServiceResourceTelemetry(options) {
        events.push(["resource-subscribe", options.runtimeSurface]);
        return {
          dispose() {
            events.push(["resource-dispose", options.runtimeSurface]);
          },
        };
      },
    },
    "./hostResourceTelemetryEnvironment.js": {
      resolveResourceTelemetryEnvironmentKey: () => "synthetic-environment",
    },
    "./hostSessionCreateTelemetry.js": {
      reportHostSessionCreate(_parent, input) {
        events.push(["session-create", input]);
      },
    },
    "./browserControlMainBridge.js": {
      createBrowserControlMainBridge(options) {
        control.browserOptions = options;
        events.push("factory:browser");
        return { handleResult: noop };
      },
    },
    "./studioWorkflowSchedule.js": {
      async submitScheduledStudioWorkflow(input) {
        events.push(["studio-submit", input]);
        return "synthetic-studio-run";
      },
    },
    "./studioScheduleOutcome.js": {
      StudioScheduleOutcomeObserver: class {
        recover() {}
        observe() {}
        dispose() {}
      },
    },
    "./browserRecordingArtifactMaterializer.js": {
      async materializeBrowserRecordingArtifact(input) {
        events.push(["recording", input]);
        return input.artifact;
      },
    },
    "./hostResourceUsage.js": {
      createHostResourceUsageResponder: () => {
        events.push("factory:usage");
        return { handleRequest: noop, cancelRequest: noop };
      },
    },
    "./hostMessagePortGuard.js": {
      parseHostIncomingMessageEvent(event) {
        if (event.invalid) return { success: false, error: "invalid" };
        return { success: true, data: event.data };
      },
      rejectUnavailableAttachedServicePort(port, flag) {
        events.push(["reject-port", flag]);
        port.close();
      },
    },
    "./electronPort.js": { wrapElectronPort: (port) => port },
    "./taskRealtimeBridge.js": { createTaskRealtimeBridgeForHostInit: () => realtime },
    "./rpcLogLevel.js": { resolveRpcLogLevel: () => "info" },
    "./hostWorkspaceTaskTracker.js": {
      createHostWorkspaceTaskTracker(callback) {
        trackerReporter = callback;
        events.push("factory:tracker");
        return tracker;
      },
    },
    "./remoteMediaPreviewProxy.js": {
      createRemoteMediaPreviewProxy(options) {
        control.mediaOptions = options;
        events.push(["media-create", options.scope]);
        return {
          service: { media: true },
          async dispose() {
            events.push("media-dispose");
          },
        };
      },
    },
    "./hostRemoteWorkspaceProxyState.js": { createHostRemoteWorkspaceProxyState: proxyState },
    "./remoteWorkspaceServiceCollection.js": {
      createRemoteWorkspaceServiceCollection(options) {
        control.collectionOptions = options;
        const wrapped = options.createReportingRemoteKnorviaTaskService(
          options.createRemotePromptAttachmentTaskService(remote.get(tokens.IKnorviaTaskService)),
        );
        options.createRemotePromptAttachmentSessionService({});
        remote.register(tokens.IKnorviaTaskService, wrapped);
        return remote;
      },
    },
    "./promptAttachmentTransferService.js": {
      createRemotePromptAttachmentTransferService: () => ({ synthetic: true }),
    },
    "./hostLog.js": {
      stringifyHostLogArg: (value) => (typeof value === "string" ? value : "synthetic-object"),
      shouldReportHostConsoleError: () => true,
    },
    "./e2eCoverage.js": { flushHostE2ECoverage: () => events.push("coverage-flush") },
    "./hostShutdownPhases.js": {
      async runHostShutdownPhases(phases, options) {
        control.phases = phases;
        control.phaseOptions = options;
        events.push("phases-start");
        await phaseGate.promise;
        for (const phase of phases) await phase.run();
        return { exitCode: 0, failedPhases: [], timedOutPhases: [] };
      },
    },
    "./hostInitialization.js": {
      async initializeHostApiNetworkTransportOwner(options) {
        events.push("network-owner");
        return options.establishOwner();
      },
    },
    "./hostUncaughtExceptionGuard.js": {
      createHostUncaughtExceptionHandler: (options) => options.onFatal,
    },
    "./cronRunLifecycle.js": {
      async recordCronRunOutcomeBestEffort(input) {
        events.push(["outcome", input]);
      },
      startManualClaimHeartbeat(input) {
        events.push(["heartbeat", input]);
        return {
          dispose() {
            events.push("heartbeat-dispose");
          },
        };
      },
      async settleCronRunTerminalOutcome(input) {
        events.push(["terminal", input]);
      },
      async settleManualDispatchFailureBestEffort(input) {
        events.push(["manual-failure", input]);
      },
    },
    "./remotePromptAttachments.js": {
      createRemotePromptAttachmentSessionService: (service, options) => {
        control.sessionMaterializer = options.materializePromptAttachments;
        return service;
      },
      createRemotePromptAttachmentTaskService: (service, options) => {
        control.taskMaterializer = options.materializePromptAttachments;
        return service;
      },
      async materializeRemotePromptAttachments(input, options) {
        assert.equal(options.backend, backend);
        events.push(["materialize", input]);
        return { ...input, content: "prepared:" + input.content };
      },
    },
    "./windowHostAttachmentRegistry.js": {
      createWindowHostAttachmentRegistry(options) {
        control.attachmentOptions = options;
        events.push("factory:attachment");
        return attachment;
      },
    },
    "./windowRemoteConnectionRegistry.js": {
      createWindowRemoteConnectionRegistry(options) {
        control.registryOptions = options;
        events.push("factory:registry");
        return registry;
      },
    },
    "./windowHostControllerService.js": {
      createWindowHostControllerRuntime(options) {
        control.controllerOptions = options;
        events.push("factory:controller");
        return controller;
      },
    },
    "./automationModelSelection.js": {
      async resolveAutomationSubmissionModelSelection(input) {
        events.push(["model-resolve", input]);
        return input.fixedSelection ?? input.selection ?? (await input.readSelection());
      },
    },
    "./hostSelfResourceTelemetry.js": {
      startHostSelfResourceTelemetry: () => {
        events.push("factory:self");
        return { stop: () => events.push("self-stop") };
      },
    },
  };
  const source = baseline
    ? "/tmp/knorvia-host-index-baseline/index.ts"
    : path.join(process.cwd(), "packages/desktop/src/host/index.ts");
  const output = ts.transpileModule(fs.readFileSync(source, "utf8"), {
    fileName: source,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  assert.equal(
    output.diagnostics.filter((value) => value.category === ts.DiagnosticCategory.Error).length,
    0,
  );
  const exports = {},
    fakeConsole = { log: noop, warn: noop, error: noop };
  vm.runInNewContext(
    output.outputText,
    {
      exports,
      module: { exports },
      process: fakeProcess,
      console: fakeConsole,
      require(id) {
        assert.ok(Object.hasOwn(ports, id), "uninjected product import " + id);
        return ports[id];
      },
      Error,
      Promise,
      Map,
      Set,
      Object,
      Array,
      Proxy,
      Reflect,
      String,
      Number,
      Math,
      Date: class extends Date {
        static now() {
          return 1700000000000;
        }
      },
    },
    { filename: source },
  );
  const send = (data, port) => messageHandler({ data, ports: port ? [port] : [] });
  const init = async (extra = {}) => {
    const base = new Port(),
      pending = send(
        {
          type: "InitLocal",
          databaseStartupId: "startup",
          workspacePath: "/local",
          workspaceIdentity: "local",
          ...extra,
        },
        base,
      );
    startupGate.resolve();
    await pending;
    return base;
  };
  const connect = async () => {
    await send({
      type: "ConnectRemoteWorkspace",
      requestId: "connect",
      target: { kind: "ssh", username: "synthetic-user", host: "synthetic.invalid" },
      remoteAssets: { mockCdnDir: "synthetic-assets" },
      workspacePath: "/remote",
      workspaceIdentity: "remote:identity",
    });
    await drain();
    assert.ok(control.remoteHandle);
    return registry.getSession("remote-session");
  };
  return {
    events,
    messages,
    processEvents,
    protocols,
    scopes,
    control,
    Port,
    parent,
    fakeProcess,
    fakeConsole,
    tokens,
    local,
    remote,
    task,
    taskReady,
    terminal,
    trackerEntries,
    sessions,
    registry,
    attachment,
    controller,
    metadata,
    send,
    init,
    connect,
    invalid: () =>
      messageHandler({
        invalid: true,
        get ports() {
          assert.fail("invalid event port read");
        },
      }),
  };
}

check("startup", async () => {
  const h = harness({ platform: "win32" });
  assert.equal(h.fakeProcess.title, "host-synthetic-window");
  for (const level of ["log", "warn", "error"])
    h.fakeConsole[level]({ synthetic: true }, { second: true });
  assert.deepEqual(
    h.events.filter((event) => typeof event === "string" && event.startsWith("factory:")),
    [
      "factory:browser",
      "factory:repo",
      "factory:network",
      "factory:self",
      "factory:tracker",
      "factory:logger",
      "factory:usage",
      "factory:registry",
      "factory:controller",
      "factory:attachment",
    ],
  );
  await h.invalid();
  await h.send({ type: "InitLocal" });
  assert.equal(h.control.startupOptions, null);
  const base = new h.Port(),
    env = { SYNTHETIC_ENV: "value" };
  const targets = [
    { workspacePath: "/one", workspaceIdentity: "one" },
    { workspacePath: "/two", workspaceIdentity: "two" },
  ];
  const initial = h.send(
    {
      type: "InitLocal",
      databaseStartupId: "startup",
      runtimeProcessEnvPatch: env,
      agentWarmupTargets: targets,
      deviceMid: "synthetic-device",
    },
    base,
  );
  const queued = new h.Port(),
    detached = new h.Port();
  await h.send(
    {
      type: "AttachServicePort",
      requestId: "queued",
      attachmentId: "queued",
      clientMode: "web-remote-replayable",
      scope: { kind: "local" },
    },
    queued,
  );
  await h.send(
    {
      type: "AttachServicePort",
      requestId: "gone",
      attachmentId: "gone",
      clientMode: "desktop-continuous",
      scope: { kind: "local" },
    },
    detached,
  );
  detached.close();
  const duplicate = new h.Port();
  await h.send({ type: "InitLocal" }, duplicate);
  assert.equal(duplicate.closed, true);
  assert.equal(h.events.filter((event) => event === "startup-start").length, 1);
  assert.equal(h.control.backendLoads, 0);
  h.control.startupGate.resolve();
  await initial;
  assert.equal(h.control.startupOptions.env, env);
  assert.deepEqual(plain(h.control.startupOptions.workingDirectories), ["/one", "/two"]);
  assert.equal(h.control.localOptions.runtimeProcessEnvPatch, env);
  assert.equal(h.control.localOptions.serviceAuthorityMode, "desktop-local");
  assert.equal(h.control.localOptions.agentRuntimeContext.getDeviceMid(), "synthetic-device");
  assert.equal(typeof h.control.localOptions.cuaOperationStateReporter.onStateChanged, "function");
  const cuaEvent = { synthetic: true };
  h.control.localOptions.cuaOperationStateReporter.onStateChanged(cuaEvent);
  assert.deepEqual(plain(h.messages.at(-1)), { type: "CuaOperationState", ...cuaEvent });
  const attached = h.events.filter((event) => Array.isArray(event) && event[0] === "attach");
  assert.equal(attached.length, 2);
  assert.equal(attached[0][1].port, base);
  assert.equal(attached[1][1].port, queued);
  assert.equal(h.scopes[1].options.clientMode, "web-remote-replayable");
  assert.deepEqual(
    h.events
      .filter((event) => Array.isArray(event) && event[0] === "warmup")
      .map((event) => plain(event[1])),
    targets,
  );
  const authority = h.control.localOptions.authorizeLocalMediaPreviewPath("synthetic-media");
  const request = h.messages.find(
    (message) => message.type === "LocalMediaPreviewPathAuthorizeRequest",
  );
  await h.send({
    type: "LocalMediaPreviewPathAuthorizeResult",
    requestId: request.requestId,
    ok: true,
    path: "synthetic-approved",
  });
  assert.equal(await authority, "synthetic-approved");
  h.control.localOptions.processLifecycleReporter.onExit({ signal: undefined, pid: 999 });
  assert.equal(h.messages.at(-1).signal, null);
});
check("remote", async () => {
  const h = harness();
  await h.init();
  assert.equal(h.control.backendLoads, 0);
  const session = await h.connect();
  assert.equal(h.control.backendLoads, 1);
  assert.equal(h.control.remoteOptions.appVersion, "synthetic-version");
  assert.equal(h.control.remoteOptions.deployLockMode, "caller-serialized");
  assert.equal(h.control.remoteOptions.remoteRuntimeNetwork, undefined);
  assert.equal(typeof h.control.remoteOptions.remoteAssetNetwork.fetch, "function");
  assert.deepEqual(plain(h.control.remoteOptions.remoteRuntimeEnv), {
    SYNTHETIC_PUBLIC_ENV: "value",
  });
  const scope = {
    kind: "remote",
    remoteSessionId: session.remoteSessionId,
    workspacePath: session.workspacePath,
    workspaceIdentity: session.workspaceIdentity,
  };
  const denied = new h.Port();
  await h.send(
    {
      type: "AttachServicePort",
      requestId: "bad",
      attachmentId: "bad",
      clientMode: "desktop-continuous",
      scope: { ...scope, workspaceIdentity: "remote:other" },
    },
    denied,
  );
  assert.equal(denied.closed, true);
  assert.equal(
    h.events.filter(
      (event) => Array.isArray(event) && event[0] === "attach" && event[1].attachmentId === "bad",
    ).length,
    0,
  );
  const gate = defer();
  h.control.attachWait = gate;
  const desktop = new h.Port(),
    waiting = h.send(
      {
        type: "AttachServicePort",
        requestId: "desktop",
        attachmentId: "desktop",
        clientMode: "desktop-continuous",
        scope,
      },
      desktop,
    );
  await drain();
  assert.equal(h.control.exposures.length, 1);
  gate.resolve();
  await waiting;
  assert.equal(h.control.mediaOptions.scope, scope);
  const mobile = new h.Port();
  await h.send(
    {
      type: "AttachServicePort",
      requestId: "mobile",
      attachmentId: "mobile",
      clientMode: "web-remote-replayable",
      scope,
    },
    mobile,
  );
  assert.equal(
    h.events.filter((event) => Array.isArray(event) && event[0] === "media-create").length,
    1,
  );
  await h.send({
    type: "BindRemoteWorkspaceContext",
    remoteSessionId: session.remoteSessionId,
    workspacePath: "/new",
    workspaceIdentity: "remote:new",
  });
  assert.ok(
    h.events.some((event) => Array.isArray(event) && event[0] === "detach-stale" && event[2] === 2),
  );
  assert.ok(
    h.events.some(
      (event) =>
        Array.isArray(event) &&
        event[0] === "remove-source" &&
        event[1].workspaceIdentity === "remote:identity",
    ),
  );
  const artifact = { path: "synthetic-artifact", nested: {} };
  assert.throws(
    () =>
      h.control.browserOptions.materializeRecording({
        artifact,
        workspacePath: "/new",
        remoteSessionId: session.remoteSessionId,
      }),
    /requires workspaceIdentity/,
  );
  const result = await h.control.browserOptions.materializeRecording({
    artifact,
    workspacePath: "/new",
    workspaceIdentity: "remote:new",
    remoteSessionId: session.remoteSessionId,
  });
  assert.equal(result, artifact);
  assert.equal(
    h.events.find((event) => Array.isArray(event) && event[0] === "recording")[1].remoteBackend,
    h.control.remoteHandle.capabilities.browserRecordingUploader,
  );
  const materialized = await h.control.taskMaterializer({
    taskId: "task",
    traceId: "trace",
    content: "synthetic-content",
    attachments: [],
  });
  assert.equal(materialized.content, "prepared:synthetic-content");
  h.control.registryOptions.onSessionClosed({
    remoteSessionId: session.remoteSessionId,
    exitCode: 5,
    signal: null,
  });
  const close = h.messages.findLast((message) => message.type === "RemoteWorkspaceClosed");
  assert.equal(close.reason, "connection-closed");
  assert.equal(close.exitCode, 5);
  assert.equal(
    h.control.controllerOptions.resolveSource({
      workspacePath: "/missing",
      workspaceIdentity: "remote:missing",
    }),
    null,
  );
});
check("task-flow", async () => {
  const h = harness();
  const base = await h.init();
  const session = await h.connect();
  const service = h.remote.get(h.tokens.IKnorviaTaskService);
  const meta = await service.createTask({
    workspacePath: "/remote",
    workspaceIdentity: "remote:identity",
  });
  assert.equal(h.metadata.get(meta.taskId), meta);
  assert.equal(
    h.messages.findLast((message) => message.type === "SessionRouteAnnounce").route.sessionId,
    meta.taskId,
  );
  const prompt = {
    taskId: meta.taskId,
    traceId: "prompt-trace",
    content: "synthetic-prompt",
    attachments: [],
  };
  const submission = service.sendPrompt(prompt);
  h.control.taskMetadataOverride = { ...meta, workspaceIdentity: "remote:mirror-current" };
  await submission;
  h.control.taskMetadataOverride = undefined;
  assert.equal(h.trackerEntries.size, 1);
  assert.equal(h.events.find((event) => Array.isArray(event) && event[0] === "prompt")[1], prompt);
  const mirrored = h.events.find((event) => Array.isArray(event) && event[0] === "mirror");
  assert.equal(mirrored[1].workspaceIdentity, "remote:mirror-current");
  assert.equal(mirrored[1].runId, "prompt-trace");
  assert.equal(mirrored[2].attachments, prompt.attachments);
  assert.equal(mirrored[2].kind, "user_message");
  const streamEvent = { type: "synthetic-stream", data: {} };
  h.control.streamListener(streamEvent);
  const streamMirror = h.events.findLast((event) => Array.isArray(event) && event[0] === "mirror");
  assert.equal(streamMirror[2].kind, "stream_event");
  assert.equal(streamMirror[2].event, streamEvent);
  h.taskReady.get(meta.taskId)();
  assert.equal(h.trackerEntries.size, 0);
  assert.ok(h.events.some((event) => event === "ready-dispose:" + meta.taskId));
  const routed = h.control.exposures[0].overrides.get(h.tokens.IKnorviaTaskService.channelName);
  assert.equal(routed.passthrough(), h.local.get(h.tokens.IKnorviaTaskService));
  const mutation = {
    taskId: "task",
    workspacePath: "/local",
    workspaceIdentity: "local",
    pinned: true,
  };
  const projected = await routed.setTaskPinned(mutation);
  assert.equal(projected.address.input.attachmentScope.kind, "local");
  assert.equal(projected.mutation.kind, "pin");
  assert.equal(projected.mutation.pinned, true);
  const gate = defer();
  h.control.flowGate = gate;
  h.protocols[0].fire("saturated");
  h.protocols[0].fire("drained");
  await drain();
  base.close();
  assert.deepEqual(
    h.events
      .filter((event) => Array.isArray(event) && event[0] === "flow")
      .map((event) => event[2]),
    ["saturated"],
  );
  gate.resolve();
  await drain();
  assert.deepEqual(
    h.events
      .filter((event) => Array.isArray(event) && event[0] === "flow")
      .map((event) => event[2]),
    ["saturated", "drained", "closed"],
  );
  assert.ok(h.events.some((event) => Array.isArray(event) && event[0] === "scope-dispose"));
  assert.equal(session.workspaceIdentity, "remote:identity");
});
check("dispatch-shutdown", async () => {
  const h = harness();
  await h.init();
  await h.send({
    type: "CronRun",
    automationId: "absent",
    runId: "absent:1",
    prompt: "synthetic",
    workspacePath: "/missing",
    workspaceIdentity: "remote:missing",
  });
  await drain();
  assert.match(
    h.messages.findLast((message) => message.type === "CronRunResult").error,
    /Remote Host 当前不可用/,
  );
  assert.equal(h.events.filter((event) => Array.isArray(event) && event[0] === "create").length, 0);
  const automation = {
    automationId: "automation",
    workspaceKey: "local",
    workspacePath: "/local",
    workspaceIdentity: "local",
    prompt: "saved",
    mode: " plan ",
  };
  h.control.automations.set(automation.automationId, automation);
  const run = {
    runId: "automation:1700000000000:manual:request",
    modelSelection: h.control.fixedSelection,
    scheduledAt: 1700000000000,
  };
  const ledgerFailure = new Error("synthetic-ledger");
  h.control.ledgerFailure = ledgerFailure;
  await h.control.localOptions.onAutomationManualRunRequested({ automation, run });
  const sent = h.events.find((event) => Array.isArray(event) && event[0] === "prompt")[1];
  assert.equal(sent.traceId, run.runId);
  assert.equal(sent.content, automation.prompt);
  assert.equal(sent.clientMode, "desktop-continuous");
  const created = h.events.find((event) => Array.isArray(event) && event[0] === "create")[1];
  assert.equal(created.model, "model:synthetic-fixed-model");
  assert.equal(created.thoughtLevel, "low");
  const delivered = {
    messageId: "synthetic-message",
    requestId: "synthetic-request",
    fromSessionId: "synthetic-session",
  };
  await h.send({ type: "SessionMessageDeliver", request: delivered });
  await drain();
  const delivery = h.messages.findLast((message) => message.type === "SessionMessageDeliverResult");
  assert.equal(delivery.result, delivered);
  assert.equal(
    h.events.filter((event) => Array.isArray(event) && event[0] === "manual-failure").length,
    0,
  );
  assert.equal(h.events.filter((event) => event === "heartbeat-dispose").length, 0);
  h.terminal.get("synthetic-task")({ inputId: "other", outcome: "completed" });
  assert.equal(h.events.filter((event) => event === "heartbeat-dispose").length, 0);
  h.terminal.get("synthetic-task")({ inputId: run.runId, outcome: "completed" });
  assert.equal(h.events.filter((event) => event === "heartbeat-dispose").length, 1);
  const shutdown = h.send({ type: "Dispose" });
  await drain();
  assert.deepEqual(plain(h.control.phases.map((phase) => phase.name)), [
    "remote-registry-dispose",
    "service-dispose",
  ]);
  assert.deepEqual(plain(h.control.phases.map((phase) => phase.timeoutMs)), [6000, 20000]);
  assert.equal(h.control.phaseOptions.phaseTimeoutMs, 5000);
  assert.equal(h.events.includes("exit:0"), false);
  assert.ok(h.events.indexOf("attachments-dispose") < h.events.indexOf("phases-start"));
  assert.ok(h.events.indexOf("realtime-dispose") < h.events.indexOf("phases-start"));
  h.control.phaseGate.resolve();
  await shutdown;
  assert.ok(h.events.indexOf("coverage-flush") < h.events.indexOf("exit:0"));
  await h.send({ type: "Dispose" });
  assert.equal(h.events.filter((event) => event === "phases-start").length, 1);
  assert.equal(h.events.filter((event) => event === "coverage-flush").length, 1);
});
