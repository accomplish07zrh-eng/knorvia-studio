import assert from "node:assert/strict";

export function createIndexOwnerPorts({
  shared,
  Protocol,
  Server,
  Wrapper,
  tokens,
  Collection,
  events,
  control,
  scopes,
  repo,
  local,
  network,
  noop,
  backend,
  fakeProcess,
  remote,
  startupGate,
  realtime,
  tracker,
  proxyState,
  phaseGate,
  attachment,
  registry,
  controller,
  randomUUID,
  setTrackerReporter,
}) {
  const ports = {
    "node:crypto": { randomUUID },
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
        setTrackerReporter(callback);
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
  return { ports };
}
