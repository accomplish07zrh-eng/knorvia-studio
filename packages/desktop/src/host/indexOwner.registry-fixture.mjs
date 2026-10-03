import assert from "node:assert/strict";

export function createIndexOwnerRegistries({ events, control, protocols, metadata }) {
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
  return {
    key,
    sessions,
    registry,
    controller,
    attachment,
    Protocol,
    Server,
    Wrapper,
    realtime,
    backend,
    network,
    repo,
    shared,
    proxyState,
  };
}
