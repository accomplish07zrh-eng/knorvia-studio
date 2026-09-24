import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { INVALID_PARAMS, Server, type Tool } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { JsInputJsonSchema } from "@knorvia/contracts/tools/node-repl";
import { createComputerUseRuntime, type ComputerUseRuntime } from "@knorvia/cua";
import { z } from "zod";
import { createInProcessNodeReplExecutor, executeInWorker, WORKER_KIND, type NodeReplExecutor } from "./executor.js";
import { createNodeReplCuaBroker } from "./cua-broker.js";
import { installNodeReplProcessGuards, installNodeReplShutdownTriggers, isDirectMcpEntrypoint } from "./process-lifecycle.js";
import { toMcpRunResult } from "./result.js";
import { JS_TOOL_DESCRIPTION, NODE_REPL_DEFAULT_TIMEOUT_MS, NODE_REPL_SERVER_INSTRUCTIONS, NODE_REPL_SERVER_VERSION } from "./tool-contract.js";

export { createInProcessNodeReplExecutor, installNodeReplProcessGuards, installNodeReplShutdownTriggers };
export type { NodeReplExecuteInput, NodeReplExecutor } from "./executor.js";
export const NODE_REPL_MCP_PROCESS_TITLE = "knorvia-node-repl-mcp";
export interface NodeReplMcpRuntime { dispose(): void; server: Server }
const argumentsSchema = z.object({ code: z.string(), title: z.string().min(1).max(120).optional(), timeout_ms: z.number().int().min(1).max(120_000).optional() }).strict();
const contextSchema = z.object({ runtime_scope: z.enum(["main", "subagent"]).default("main"), session_id: z.string().trim().min(1).optional() }).catchall(z.unknown());

export function setNodeReplMcpProcessTitle(target: { title: string } = process): void { target.title = NODE_REPL_MCP_PROCESS_TITLE; }
export function captureComputerUseRuntimeFromEnvironment(env: NodeJS.ProcessEnv = process.env): ComputerUseRuntime | undefined {
  const brokerSocketPath = env.KNORVIA_CUA_PERMISSION_BROKER_SOCKET?.trim();
  return brokerSocketPath ? createComputerUseRuntime({ brokerSocketPath, refreshMarkerPath: env.KNORVIA_CUA_PERMISSION_BROKER_REFRESH_MARKER?.trim() }) : undefined;
}

export function createNodeReplMcpRuntime(options: { executeJs?: NodeReplExecutor; cuaRuntime?: ComputerUseRuntime } = {}): NodeReplMcpRuntime {
  const execute = options.executeJs ?? ((input) => executeInWorker(import.meta.url, input));
  const cua = options.cuaRuntime ?? captureComputerUseRuntimeFromEnvironment();
  const broker = cua ? createNodeReplCuaBroker({ runtime: cua }) : undefined;
  const lifetime = new AbortController();
  const tails = new Map<string, Promise<unknown>>();
  const server = new Server({ name: "node_repl", version: NODE_REPL_SERVER_VERSION }, { capabilities: { tools: {} }, instructions: NODE_REPL_SERVER_INSTRUCTIONS });
  server.setRequestHandler("tools/list", async () => ({ tools: [{ name: "js", description: JS_TOOL_DESCRIPTION, inputSchema: JsInputJsonSchema as Tool["inputSchema"] }] }));
  server.setRequestHandler("tools/call", async (request, extra) => {
    lifetime.signal.throwIfAborted();
    const parsed = argumentsSchema.safeParse(request.params.arguments);
    if (request.params.name !== "js" || !parsed.success) throw Object.assign(new Error("Invalid js tool arguments"), { code: INVALID_PARAMS });
    const context = contextSchema.safeParse(extra.mcpReq._meta?.["com.knorvia-studio/request-context"]);
    const meta: Record<string, unknown> = context.success ? context.data : {};
    const key = typeof meta.session_id === "string" ? meta.session_id : "__unscoped__";
    const args = parsed.data;
    const predecessor = tails.get(key) ?? Promise.resolve();
    const task = predecessor.catch(() => undefined).then(async () => {
      const timeout = args.timeout_ms ?? NODE_REPL_DEFAULT_TIMEOUT_MS;
      const signal = AbortSignal.any([lifetime.signal, extra.mcpReq.signal, AbortSignal.timeout(timeout)]);
      signal.throwIfAborted();
      if (!args.code.trim()) return { content: [{ type: "text" as const, text: "js expects non-empty JavaScript source" }], isError: true };
      await broker?.ready;
      signal.throwIfAborted();
      return toMcpRunResult(await execute({ code: args.code, requestMeta: { ...meta, ...(args.title ? { title: args.title } : {}) }, signal, syncTimeoutMs: timeout, cuaBroker: broker?.connection }));
    });
    tails.set(key, task);
    try { return await task; }
    finally { if (tails.get(key) === task) tails.delete(key); }
  });
  return { server, dispose: () => {
    if (lifetime.signal.aborted) return;
    lifetime.abort(new Error("node_repl runtime is disposed"));
    void broker?.close();
    void cua?.dispose();
  } };
}

export async function main(): Promise<void> {
  setNodeReplMcpProcessTitle();
  const cua = captureComputerUseRuntimeFromEnvironment();
  const runtimes = new Set<NodeReplMcpRuntime>();
  const stdio = serveStdio(() => { const runtime = createNodeReplMcpRuntime({ cuaRuntime: cua }); runtimes.add(runtime); return runtime.server; }, { legacy: "reject" });
  let stopped = false;
  const shutdown = () => {
    if (stopped) return;
    stopped = true;
    for (const runtime of runtimes) runtime.dispose();
    void stdio.close().catch(() => undefined).finally(() => process.exit(0));
  };
  installNodeReplProcessGuards({ process, onOutputClosed: shutdown, writeStderr: (text) => { process.stderr.write(text); } });
  installNodeReplShutdownTriggers({ process, stdin: process.stdin, shutdown });
}

if (!isMainThread && workerData?.kind === WORKER_KIND) {
  void createInProcessNodeReplExecutor()({ ...workerData, signal: AbortSignal.timeout(workerData.syncTimeoutMs) })
    .then((result) => parentPort?.postMessage(result))
    .catch((error: unknown) => parentPort?.postMessage({ logs: "", error: { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) } }));
} else if (isMainThread && await isDirectMcpEntrypoint(import.meta.url, process.argv[1])) {
  void main().catch((error: unknown) => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1; });
}
