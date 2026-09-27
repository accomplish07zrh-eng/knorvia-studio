// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import {
  createMcpRuntime,
  type NodeReplRuntimeOptions,
  type NodeReplMcpRuntime,
} from "./mcp-runtime.js";
import { createInProcessNodeReplExecutor, WORKER_KIND } from "./executor.js";
import { isDirectMcpEntrypoint } from "./process-lifecycle.js";
import { setNodeReplMcpProcessTitle } from "./runtime-environment.js";
import { startStdioHost } from "./stdio-host.js";

export { createInProcessNodeReplExecutor } from "./executor.js";
export {
  installNodeReplProcessGuards,
  installNodeReplShutdownTriggers,
} from "./process-lifecycle.js";
export {
  NODE_REPL_MCP_PROCESS_TITLE,
  setNodeReplMcpProcessTitle,
  captureComputerUseRuntimeFromEnvironment,
} from "./runtime-environment.js";
export type { NodeReplExecuteInput, NodeReplExecutor } from "./executor.js";
export type { NodeReplMcpRuntime } from "./mcp-runtime.js";

export function createNodeReplMcpRuntime(options: NodeReplRuntimeOptions = {}): NodeReplMcpRuntime {
  return createMcpRuntime(import.meta.url, options);
}

export async function main(): Promise<void> {
  setNodeReplMcpProcessTitle();
  startStdioHost(createNodeReplMcpRuntime);
}

function failureMessage(reason: unknown): string {
  try {
    return reason instanceof Error ? reason.message : String(reason);
  } catch {
    return "Unknown execution host failure";
  }
}

async function executeWorkerCell(): Promise<void> {
  let result;
  try {
    const signal = AbortSignal.timeout(workerData.syncTimeoutMs);
    result = await createInProcessNodeReplExecutor()({ ...workerData, signal });
  } catch (reason) {
    result = {
      logs: "",
      error: {
        name: reason instanceof Error ? reason.name : "Error",
        message: failureMessage(reason),
      },
    };
  }
  parentPort?.postMessage(result);
}

const workerCell = !isMainThread && workerData?.kind === WORKER_KIND;
if (workerCell) {
  void executeWorkerCell();
} else if (isMainThread && (await isDirectMcpEntrypoint(import.meta.url, process.argv[1]))) {
  void main().catch((reason) => {
    process.stderr.write(`${failureMessage(reason)}\n`);
    process.exitCode = 1;
  });
}
