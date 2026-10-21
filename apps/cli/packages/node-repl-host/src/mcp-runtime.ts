// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// MCP 运行时：把 `js` 工具与原生 Computer Use 工具挂到同一个 MCP 服务器上。
//
// 分层：本文件只做「协议面 ↔ 执行层」的翻译。真正的执行在 `executor.ts`（工作线程）、
// 准入在 `session-admission.ts`、生命周期在 `runtime-lifetime.ts`。
// **不在这里做取消、排队或能力协商**——那些都有各自的所有者。
import {
  INVALID_PARAMS,
  Server,
  type Tool,
  type CallToolResult,
  type CallToolRequest,
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

/** 工具名：唯一由本包提供的工具。 */
const JS_TOOL_NAME = "js";

/** 标题长度上限（客户端展示用）。 */
const MAX_TITLE_LENGTH = 120;

/** 单次执行的时间预算上限（毫秒）。 */
const MAX_TIMEOUT_MS = 120_000;

/** 调用方上下文在 MCP 元数据里的键。 */
const CONTEXT_META_KEY = "com.knorvia-studio/request-context";

/** `js` 工具的参数形状。`.strict()`：多传字段直接判错，不静默忽略。 */
const jsArgumentsSchema = z
  .object({
    code: z.string(),
    title: z.string().min(1).max(MAX_TITLE_LENGTH).optional(),
    timeout_ms: z.number().int().min(1).max(MAX_TIMEOUT_MS).optional(),
  })
  .strict();

/**
 * 调用方上下文的形状。
 *
 * `catchall(z.unknown())` 是刻意的：客户端可以带额外字段，
 * 本包只关心 `runtime_scope` 与 `session_id`，其余原样传给执行器做 requestMeta。
 */
const callerContextSchema = z
  .object({
    runtime_scope: z.enum(["main", "subagent"]).default("main"),
    session_id: z.string().trim().min(1).optional(),
  })
  .catchall(z.unknown());

/** MCP 运行时的对外句柄。 */
export interface NodeReplMcpRuntime {
  server: Server;
  dispose(): Promise<void>;
}

/** 造运行时所需的注入点；全部可选，缺席时用环境捕获的默认实现。 */
export interface NodeReplRuntimeOptions {
  executeJs?: NodeReplExecutor;
  cuaRuntime?: ComputerUseRuntime;
  windowsRuntime?: WindowsComputerRuntime;
}

/**
 * 把调用方元数据解析成 requestMeta（永不抛错：解析失败就用空对象）。
 *
 * @param rawContext - MCP 请求里携带的原始上下文。
 * @returns 已归一化的元数据。
 */
function readCallerContext(rawContext: unknown): Record<string, unknown> {
  const parsed = callerContextSchema.safeParse(rawContext);
  return parsed.success ? parsed.data : {};
}

/**
 * 造一个 MCP 运行时。
 *
 * 调用方必须传**稳定的可执行入口 URL**（不是本实现模块）：
 * 工作线程要以它为入口重新加载执行环境，传本模块会导致线程里只有一半能力。
 *
 * @param entryUrl - 工作线程的可执行入口 URL。
 * @param options - 可选注入点。
 * @returns 运行时句柄（`server` + `dispose`）。
 */
export function createMcpRuntime(
  entryUrl: string,
  options: NodeReplRuntimeOptions,
): NodeReplMcpRuntime {
  const lifetime = new RuntimeLifetime();
  const admission = new SessionAdmission(lifetime.signal);
  const execute = options.executeJs ?? ((input) => executeInWorker(entryUrl, input));
  const cua = options.cuaRuntime ?? captureComputerUseRuntimeFromEnvironment();
  const broker = cua === undefined ? undefined : createNodeReplCuaBroker({ runtime: cua });
  const windowsReady: Promise<WindowsComputerRuntime | undefined> =
    options.windowsRuntime === undefined
      ? captureWindowsComputerRuntime()
      : Promise.resolve(options.windowsRuntime);

  const server = new Server(
    { name: "node_repl", version: NODE_REPL_SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: NODE_REPL_SERVER_INSTRUCTIONS },
  );

  /**
   * 取原生能力；能力加载可能晚于关闭，因此必须经过同一生命周期门槛。
   */
  const nativeTools = async (): Promise<WindowsComputerRuntime | undefined> => {
    const resolved = await windowsReady;
    lifetime.signal.throwIfAborted();
    return resolved;
  };

  /**
   * 执行一次 `js` 调用。
   *
   * 中止来源三合一（调用方信号、运行时关闭、时间预算）：任一触发都必须
   * 阻止「迟到的成功」被发布 —— 客户端已经不等了，再发成功会错位。
   */
  const runJs = (
    args: z.infer<typeof jsArgumentsSchema>,
    rawContext: unknown,
    callerSignal: AbortSignal,
  ): Promise<CallToolResult> => {
    const meta = readCallerContext(rawContext);
    const sessionId = typeof meta.session_id === "string" ? meta.session_id : undefined;
    return admission.submit(sessionId, async (): Promise<CallToolResult> => {
      const budget = args.timeout_ms ?? NODE_REPL_DEFAULT_TIMEOUT_MS;
      const signal = AbortSignal.any([callerSignal, lifetime.signal, AbortSignal.timeout(budget)]);
      signal.throwIfAborted();
      if (args.code.trim() === "") {
        return {
          isError: true,
          content: [{ type: "text", text: "js expects non-empty JavaScript source" }],
        };
      }
      await broker?.ready;
      signal.throwIfAborted();
      const result = await execute({
        code: args.code,
        signal,
        syncTimeoutMs: budget,
        cuaBroker: broker?.connection,
        requestMeta: { ...meta, ...(args.title === undefined ? {} : { title: args.title }) },
      });
      const projected = toMcpRunResult(result);
      // 已被取消的执行器不可发布迟到成功；已返回的诊断错误仍需交给调用方。
      if (!projected.isError) signal.throwIfAborted();
      return projected;
    });
  };

  /**
   * 把原生工具的描述转成 MCP 工具条目。
   *
   * 单独成函数是因为它的唯一职责是**形状转换**（原生 schema → MCP schema），
   * 与能力加载、生命周期判断无关。
   */
  const nativeToolEntries = (native: WindowsComputerRuntime | undefined): Tool[] =>
    native === undefined
      ? []
      : native
          .listTools()
          .map((tool) => ({ ...tool, inputSchema: tool.inputSchema as Tool["inputSchema"] }));

  server.setRequestHandler("tools/list", () =>
    lifetime.accept(async () => {
      const native = await nativeTools();
      const tools = nativeToolEntries(native);
      tools.push({
        name: JS_TOOL_NAME,
        inputSchema: JsInputJsonSchema as Tool["inputSchema"],
        description: JS_TOOL_DESCRIPTION,
      });
      return { tools };
    }),
  );

  /**
   * 原生工具优先：只要能力存在且认识这个名字，就交给它执行；
   * 否则按 `js` 处理。顺序不能反——原生工具名是动态的，先判 `js` 会漏掉同名原生工具。
   *
   * 这段逻辑**内联在 handler 里**而不是抽成独立函数：`extra` 的类型只能由
   * `setRequestHandler` 的签名推导，抽出去就得手写类型（会漂移）。
   */
  server.setRequestHandler("tools/call", (request, extra) =>
    lifetime.accept(async () => {
      const native = await nativeTools();
      const rawContext = extra.mcpReq._meta?.[CONTEXT_META_KEY];
      const { name, arguments: args } = request.params;
      const isNative = native?.listTools().some((tool) => tool.name === name) ?? false;
      if (native !== undefined && isNative) {
        return (await native.execute({
          toolName: name,
          arguments: args,
          context: windowsComputerContext(rawContext),
          signal: AbortSignal.any([extra.mcpReq.signal, lifetime.signal]),
        })) as CallToolResult;
      }
      const parsed = jsArgumentsSchema.safeParse(args);
      if (name !== JS_TOOL_NAME || !parsed.success) {
        throw Object.assign(new Error("Invalid js tool arguments"), { code: INVALID_PARAMS });
      }
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
