// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import {
  INVALID_PARAMS,
  Server,
  type Tool,
  type CallToolResult,
} from "@modelcontextprotocol/server";
import { JsInputJsonSchema } from "@knorvia/contracts/tools/node-repl";
import type { ComputerUseRuntime } from "@knorvia/cua";
import type { WindowsComputerRuntime } from "@knorvia/cua/windows";
import { z } from "zod";
import { createNodeReplCuaBroker } from "./cua-broker.js";
import { executeInWorker, type NodeReplExecutor } from "./executor.js";
import { captureComputerUseRuntimeFromEnvironment } from "./runtime-environment.js";
import { RuntimeLifetime } from "./runtime-lifetime.js";
import { SessionAdmission } from "./session-admission.js";
import { toMcpRunResult } from "./result.js";
import { captureWindowsComputerRuntime, windowsComputerContext } from "./windows-computer.js";
import {
  JS_TOOL_DESCRIPTION,
  NODE_REPL_DEFAULT_TIMEOUT_MS,
  NODE_REPL_SERVER_INSTRUCTIONS,
  NODE_REPL_SERVER_VERSION,
} from "./tool-contract.js";

export interface NodeReplMcpRuntime {
  server: Server;
  dispose(): Promise<void>;
}
export interface NodeReplRuntimeOptions {
  executeJs?: NodeReplExecutor;
  cuaRuntime?: ComputerUseRuntime;
  windowsRuntime?: WindowsComputerRuntime;
}
const MAX_TITLE_LENGTH = 120;
const MAX_TIMEOUT_MS = 120_000;
const CONTEXT_META_KEY = "com.knorvia-studio/request-context";
const jsArguments = z
  .object({
    code: z.string(),
    title: z.string().min(1).max(MAX_TITLE_LENGTH).optional(),
    timeout_ms: z.number().int().min(1).max(MAX_TIMEOUT_MS).optional(),
  })
  .strict();
const requestContext = z
  .object({
    runtime_scope: z.enum(["main", "subagent"]).default("main"),
    session_id: z.string().trim().min(1).optional(),
  })
  .catchall(z.unknown());

/** The caller supplies the stable executable entry URL, never this implementation module. */
export function createMcpRuntime(
  entryUrl: string,
  options: NodeReplRuntimeOptions,
): NodeReplMcpRuntime {
  const lifetime = new RuntimeLifetime();
  const admission = new SessionAdmission(lifetime.signal);
  const execute = options.executeJs ?? ((input) => executeInWorker(entryUrl, input));
  const cua = options.cuaRuntime ?? captureComputerUseRuntimeFromEnvironment();
  const broker = cua && createNodeReplCuaBroker({ runtime: cua });
  const windowsReady = options.windowsRuntime
    ? Promise.resolve(options.windowsRuntime)
    : captureWindowsComputerRuntime();
  const server = new Server(
    { name: "node_repl", version: NODE_REPL_SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: NODE_REPL_SERVER_INSTRUCTIONS },
  );

  const capabilities = async () => {
    const windows = await windowsReady;
    // 能力加载可能晚于关闭；发现和执行必须经过同一生命周期门槛。
    lifetime.signal.throwIfAborted();
    return windows;
  };

  const runJs = (args: z.infer<typeof jsArguments>, rawContext: unknown, caller: AbortSignal) => {
    const context = requestContext.safeParse(rawContext);
    const meta: Record<string, unknown> = context.success ? context.data : {};
    return admission.submit(
      typeof meta.session_id === "string" ? meta.session_id : undefined,
      async (): Promise<CallToolResult> => {
        const budget = args.timeout_ms ?? NODE_REPL_DEFAULT_TIMEOUT_MS;
        const signal = AbortSignal.any([caller, lifetime.signal, AbortSignal.timeout(budget)]);
        signal.throwIfAborted();
        if (!args.code.trim())
          return {
            isError: true,
            content: [{ type: "text", text: "js expects non-empty JavaScript source" }],
          };
        await broker?.ready;
        signal.throwIfAborted();
        const result = await execute({
          code: args.code,
          signal,
          syncTimeoutMs: budget,
          cuaBroker: broker?.connection,
          requestMeta: { ...meta, ...(args.title ? { title: args.title } : {}) },
        });
        // 忽略取消的执行器不可发布迟到成功；已返回的重置等错误诊断仍需交给调用者。
        const projected = toMcpRunResult(result);
        if (!projected.isError) signal.throwIfAborted();
        return projected;
      },
    );
  };

  server.setRequestHandler("tools/list", () =>
    lifetime.accept(async () => {
      const native = await capabilities();
      const tools: Tool[] =
        native
          ?.listTools()
          .map((tool) => ({ ...tool, inputSchema: tool.inputSchema as Tool["inputSchema"] })) ?? [];
      tools.push({
        name: "js",
        inputSchema: JsInputJsonSchema as Tool["inputSchema"],
        description: JS_TOOL_DESCRIPTION,
      });
      return { tools };
    }),
  );
  server.setRequestHandler("tools/call", (request, extra) =>
    lifetime.accept(async () => {
      const native = await capabilities();
      const rawContext = extra.mcpReq._meta?.[CONTEXT_META_KEY];
      const { name, arguments: args } = request.params;
      if (native?.listTools().some((tool) => tool.name === name)) {
        return {
          ...(await native.execute({
            toolName: name,
            arguments: args,
            context: windowsComputerContext(rawContext),
            signal: AbortSignal.any([extra.mcpReq.signal, lifetime.signal]),
          })),
        };
      }
      const parsed = jsArguments.safeParse(args);
      if (name !== "js" || !parsed.success)
        throw Object.assign(new Error("Invalid js tool arguments"), { code: INVALID_PARAMS });
      return runJs(parsed.data, rawContext, extra.mcpReq.signal);
    }),
  );

  return {
    server,
    dispose: () =>
      lifetime.close([
        () => broker?.close(),
        () => cua?.dispose(),
        async () => (await windowsReady)?.dispose(),
      ]),
  };
}
