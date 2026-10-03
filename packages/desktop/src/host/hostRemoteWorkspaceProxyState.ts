import type { IDisposable } from "@knorvia/rpc";

import { resolveWorkspaceKey } from "@knorvia/shared";

export interface HostRemoteTaskMeta {
  taskId: string;
  traceId: string;
  workspacePath: string;
  workspaceIdentity?: string;
}

interface HostRemoteWorkspaceContext {
  workspacePath: string;
  workspaceIdentity?: string;
}

export function createHostRemoteWorkspaceProxyState(): {
  rememberTaskMeta: (meta: HostRemoteTaskMeta) => void;
  getTaskMeta: (taskId: string) => HostRemoteTaskMeta | undefined;
  ensureWorkspaceSubscription: (
    context: HostRemoteWorkspaceContext,
    subscribe: () => IDisposable,
  ) => boolean;
  trackTaskReady: (
    taskId: string,
    context: HostRemoteWorkspaceContext,
    subscribe: (listener: () => void) => IDisposable,
    onReady: () => void,
  ) => void;
  disposeTaskReadySubscription: (taskId: string) => void;
  clearWorkspace: (context: HostRemoteWorkspaceContext) => void;
} {
  type WorkspaceKey = ReturnType<typeof resolveWorkspaceKey>;

  const metadata = new Map<string, HostRemoteTaskMeta>();
  const workspaceSubscriptions = new Map<WorkspaceKey, IDisposable>();
  const readySubscriptions = new Map<
    string,
    {
      workspaceKey: WorkspaceKey;
      disposable: IDisposable;
    }
  >();

  function rememberTaskMeta(meta: HostRemoteTaskMeta): void {
    metadata.set(meta.taskId, meta);
  }

  function getTaskMeta(taskId: string): HostRemoteTaskMeta | undefined {
    return metadata.get(taskId);
  }

  function ensureWorkspaceSubscription(
    context: HostRemoteWorkspaceContext,
    subscribe: () => IDisposable,
  ): boolean {
    const key = resolveWorkspaceKey(context);
    if (workspaceSubscriptions.has(key)) {
      return false;
    }

    const disposable = subscribe();
    workspaceSubscriptions.set(key, disposable);
    return true;
  }

  function disposeTaskReadySubscription(taskId: string): void {
    const association = readySubscriptions.get(taskId);
    if (association === undefined) {
      return;
    }

    readySubscriptions.delete(taskId);
    association.disposable.dispose();
  }

  function trackTaskReady(
    taskId: string,
    context: HostRemoteWorkspaceContext,
    subscribe: (listener: () => void) => IDisposable,
    onReady: () => void,
  ): void {
    let readyDuringSubscribe = false;
    const disposable = subscribe(() => {
      readyDuringSubscribe = true;
      disposeTaskReadySubscription(taskId);
      onReady();
    });

    if (readyDuringSubscribe) {
      disposable.dispose();
      return;
    }

    disposeTaskReadySubscription(taskId);
    const workspaceKey = resolveWorkspaceKey(context);
    readySubscriptions.set(taskId, { workspaceKey, disposable });
  }

  function clearWorkspace(context: HostRemoteWorkspaceContext): void {
    const key = resolveWorkspaceKey(context);
    const subscription = workspaceSubscriptions.get(key);
    if (subscription !== undefined) {
      subscription.dispose();
      workspaceSubscriptions.delete(key);
    }

    for (const [taskId, meta] of metadata) {
      if (resolveWorkspaceKey(meta) === key) {
        metadata.delete(taskId);
      }
    }

    for (const [taskId, association] of readySubscriptions) {
      if (association.workspaceKey === key) {
        disposeTaskReadySubscription(taskId);
      }
    }
  }

  return {
    rememberTaskMeta,
    getTaskMeta,
    ensureWorkspaceSubscription,
    trackTaskReady,
    disposeTaskReadySubscription,
    clearWorkspace,
  };
}
