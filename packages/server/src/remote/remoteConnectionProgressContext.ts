import { AsyncLocalStorage } from "node:async_hooks";

export type RemoteConnectionProgressLevel = "info" | "warn" | "error";

export interface RemoteConnectionProgressEvent {
  requestId: string;
  level: RemoteConnectionProgressLevel;
  args: unknown[];
}

export function createRemoteConnectionProgressContext(options: {
  emit: (event: RemoteConnectionProgressEvent) => void;
}) {
  const context = new AsyncLocalStorage<{ requestId: string; active: boolean }>();

  return {
    async run<T>(requestId: string, task: () => Promise<T>): Promise<T> {
      const scope = { requestId, active: true };
      return context.run(scope, async () => {
        try {
          return await task();
        } finally {
          scope.active = false;
        }
      });
    },

    report(level: RemoteConnectionProgressLevel, args: unknown[]): void {
      const scope = context.getStore();
      if (!scope?.active) return;

      options.emit({ requestId: scope.requestId, level, args });
    },
  };
}
