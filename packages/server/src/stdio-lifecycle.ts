import type { Readable } from "node:stream";

interface StdioProcessLifecycleOptions {
  stdin: Readable;
  signalSource: {
    on(signal: "SIGHUP" | "SIGTERM" | "SIGINT", listener: () => void): unknown;
  };
  log(...args: unknown[]): void;
  stopRpc(): Promise<void>;
  dispose(): Promise<void>;
  exit(code: number): never | void;
  shutdownTimeoutMs?: number;
  rpcStopTimeoutMs?: number;
  serviceDisposeTimeoutMs?: number;
}

type ShutdownPhase = "rpc-stop" | "service-dispose";

export function registerStdioProcessLifecycle(options: StdioProcessLifecycleOptions): void {
  const { log, stopRpc, dispose, exit } = options;
  const budgets: Record<ShutdownPhase, number> = {
    "rpc-stop": Math.max(options.rpcStopTimeoutMs ?? options.shutdownTimeoutMs ?? 1000, 0),
    "service-dispose": Math.max(
      options.serviceDisposeTimeoutMs ?? options.shutdownTimeoutMs ?? 3500,
      0,
    ),
  };
  let requestedExitCode = 0;
  let started = false;

  function settlePhase(operation: Promise<void>, phase: ShutdownPhase): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        settled = true;
        clearTimeout(deadline);
        resolve();
      };
      const deadline = setTimeout(() => {
        if (settled) return;
        requestedExitCode = 1;
        log("stdio shutdown timed out", { phase, timeoutMs: budgets[phase] });
        finish();
      }, budgets[phase]);

      operation.then(
        () => {
          if (!settled) finish();
        },
        (error: unknown) => {
          if (settled) return;
          requestedExitCode = 1;
          log(
            phase === "rpc-stop"
              ? "stdio shutdown RPC stop failed"
              : "stdio shutdown cleanup failed",
            error,
          );
          finish();
        },
      );
    });
  }

  async function completeShutdown(): Promise<void> {
    await settlePhase(stopRpc(), "rpc-stop");
    await settlePhase(dispose(), "service-dispose");
    log("stdio shutdown completed", { exitCode: requestedExitCode });
    exit(requestedExitCode);
  }

  function requestShutdown(exitCode: number): void {
    requestedExitCode = Math.max(requestedExitCode, exitCode);
    if (started) return;
    started = true;
    void completeShutdown();
  }

  options.stdin.on("end", () => {
    log("stdin closed, shutting down");
    requestShutdown(0);
  });
  options.stdin.on("error", (error: unknown) => {
    log("stdin error, shutting down", error);
    requestShutdown(1);
  });
  for (const signal of ["SIGHUP", "SIGTERM", "SIGINT"] as const) {
    options.signalSource.on(signal, () => {
      log("termination signal received, shutting down", signal);
      requestShutdown(1);
    });
  }
}
