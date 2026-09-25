import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import {
  NodeReplSession,
  type NodeReplRequestMeta,
  type NodeReplRunResult,
} from "@knorvia/core/repl";
import { createBrowserBridgeGlobals, type ActiveNodeReplCall } from "./browser-bridge.js";
import { createComputerUseBridgeGlobals, type NodeReplCuaBrokerConnection } from "./cua-bridge.js";

export interface NodeReplExecuteInput {
  code: string;
  requestMeta: NodeReplRequestMeta;
  signal: AbortSignal;
  syncTimeoutMs: number;
  cuaBroker?: NodeReplCuaBrokerConnection;
}
export type NodeReplExecutor = (input: NodeReplExecuteInput) => Promise<NodeReplRunResult>;
export const WORKER_KIND = "knorvia-execution-cell-v1";
export function createInProcessNodeReplExecutor(): NodeReplExecutor {
  return async (input) => {
    input.signal.throwIfAborted();
    let active: ActiveNodeReplCall | undefined = {
      generation: 1,
      requestMeta: input.requestMeta,
      signal: input.signal,
    };
    const base = process.env.KNORVIA_PLUGIN_ROOT ?? process.cwd();
    const session: NodeReplSession = new NodeReplSession({
      restrictProcess: true,
      injectedGlobals: () => {
        const context = { generation: 1, getActiveCall: () => active, session: () => session };
        return {
          ...createBrowserBridgeGlobals({ ...context, documentationRoot: resolve(base, "docs") }),
          ...createComputerUseBridgeGlobals({
            ...context,
            broker: input.cuaBroker,
            documentationRoot: resolve(process.env.KNORVIA_CUA_PLUGIN_ROOT ?? base, "docs"),
          }),
        };
      },
    });
    try {
      return await session.run(input.code, {
        requestMeta: input.requestMeta,
        signal: input.signal,
        syncTimeoutMs: input.syncTimeoutMs,
      });
    } finally {
      active = undefined;
      session.dispose();
    }
  };
}

export function executeInWorker(
  moduleUrl: string,
  input: NodeReplExecuteInput,
): Promise<NodeReplRunResult> {
  input.signal.throwIfAborted();
  const { signal, ...data } = input;
  const worker = new Worker(new URL(moduleUrl), { workerData: { ...data, kind: WORKER_KIND } });
  return new Promise((resolveResult, reject) => {
    let finished = false;
    const finish = (error: unknown, value?: NodeReplRunResult) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", cancel);
      void worker.terminate().catch(() => undefined);
      if (error !== undefined) reject(error);
      else if (value) resolveResult(value);
      else reject(new Error("Execution worker returned no result"));
    };
    const cancel = () => finish(signal.reason ?? new DOMException("aborted", "AbortError"));
    worker.once("message", (value: NodeReplRunResult) => finish(undefined, value));
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => finish(new Error(`Execution worker exited (${code})`)));
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
}
