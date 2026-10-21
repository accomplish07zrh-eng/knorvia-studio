// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// MCP 运行时：把 `js` 工具与原生 Computer Use 工具挂到同一个 MCP 服务器上。
//
// 分层：本文件只做**装配**。真正的执行在 `executor.ts`（工作线程）、
// 准入在 `session-admission.ts`、生命周期在 `runtime-lifetime.ts`、
// 上下文解析在 `mcp-caller-context.ts`、参数准备在 `mcp-tool-dispatch.ts`、
// 工具表与分派判定在 `mcp-tool-catalogue.ts`。
// **不在这里做取消、排队或能力协商**——那些都有各自的所有者。
import { Server, type CallToolResult } from "@modelcontextprotocol/server";
import type { JsRuntimeInput } from "@knorvia/contracts/tools/node-repl";
import type { ComputerUseRuntime } from "@knorvia/cua";
import type { WindowsComputerRuntime } from "@knorvia/cua/windows";
import { createNodeReplCuaBroker } from "./cua-broker.js";
import { executeInWorker, type NodeReplExecutor } from "./executor.js";
import { CONTEXT_META_KEY, readCallerContext, sessionIdOf } from "./mcp-caller-context.js";
import {
  isNativeCall,
  nativeInvocation,
  requireJsArguments,
  toolCatalogue,
} from "./mcp-tool-catalogue.js";
import {
  budgetOf,
  emptySourceResult,
  executionSignal,
  isEmptySource,
  toExecutorInput,
  withTitle,
} from "./mcp-tool-dispatch.js";
import { captureComputerUseRuntimeFromEnvironment } from "./runtime-environment.js";
import { RuntimeLifetime } from "./runtime-lifetime.js";
import { SessionAdmission } from "./session-admission.js";
import { toMcpRunResult } from "./result.js";
import { captureWindowsComputerRuntime } from "./windows-computer.js";
import { NODE_REPL_SERVER_INSTRUCTIONS, NODE_REPL_SERVER_VERSION } from "./tool-contract.js";

/** 服务器的自我描述（协议面可见，名称与版本不要改）。 */
const SERVER_INFO = { name: "node_repl", version: NODE_REPL_SERVER_VERSION } as const;

/** 服务器的能力声明与使用说明。 */
const SERVER_CAPABILITIES = {
  capabilities: { tools: {} },
  instructions: NODE_REPL_SERVER_INSTRUCTIONS,
} as const;

/**
 * MCP 运行时的对外句柄。
 *
 * 两个成员都是只读的：句柄一旦交出，调用方不该换掉它的服务器或释放函数 ——
 * 那会让「谁负责关闭」变得不确定。用 `readonly` 把这一点写进类型。
 */
export type NodeReplMcpRuntime = {
  readonly server: Server;
  readonly dispose: () => Promise<void>;
};

/**
 * 造运行时所需的注入点；全部可选。
 *
 * 三个都是「替换某个协作者的实现」这一件事，所以并列放在一个类型里；
 * 缺席时不写 `undefined` 而是走环境捕获的默认实现（见 `assemble`）。
 */
export type NodeReplRuntimeOptions = {
  readonly executeJs?: NodeReplExecutor;
  readonly cuaRuntime?: ComputerUseRuntime;
  readonly windowsRuntime?: WindowsComputerRuntime;
};

/**
 * 解析出来的运行时协作者。
 *
 * 六个协作者一起穿过工厂函数，收成一个对象而不是六个局部变量：
 * 后面每个 handler 都要用到其中几项，摊成局部变量会让闭包捕获一堆平行符号。
 */
type Parts = {
  readonly lifetime: RuntimeLifetime;
  readonly admission: SessionAdmission;
  readonly execute: NodeReplExecutor;
  readonly cua: ComputerUseRuntime | undefined;
  readonly broker: ReturnType<typeof createNodeReplCuaBroker> | undefined;
  readonly windowsReady: Promise<WindowsComputerRuntime | undefined>;
};

/**
 * 装配协作者：注入优先，否则走环境捕获的默认实现。
 *
 * 集中在一处比较好核对「默认实现是什么」；分散到工厂正文里
 * 会让这个问题的答案散落在多个分支中。
 *
 * @param entryUrl - 工作线程的可执行入口 URL。
 * @param options - 可选注入点。
 * @returns 六个协作者。
 */
function assemble(entryUrl: string, options: NodeReplRuntimeOptions): Parts {
  const lifetime = new RuntimeLifetime();
  const execute = options.executeJs ?? ((input) => executeInWorker(entryUrl, input));
  const cua = options.cuaRuntime ?? captureComputerUseRuntimeFromEnvironment();
  const windowsReady: Promise<WindowsComputerRuntime | undefined> =
    options.windowsRuntime === undefined
      ? captureWindowsComputerRuntime()
      : Promise.resolve(options.windowsRuntime);
  const broker = cua === undefined ? undefined : createNodeReplCuaBroker({ runtime: cua });
  return {
    lifetime,
    admission: new SessionAdmission(lifetime.signal),
    execute,
    cua,
    broker,
    windowsReady,
  };
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
  const parts = assemble(entryUrl, options);

  /** 取原生能力：加载可能晚于关闭，所以必须经过同一生命周期门槛。 */
  const nativeTools = async (): Promise<WindowsComputerRuntime | undefined> => {
    const resolved = await parts.windowsReady;
    parts.lifetime.signal.throwIfAborted();
    return resolved;
  };

  /**
   * 执行一次 `js` 调用。
   *
   * 中止来源三合一（调用方信号、运行时关闭、时间预算）：任一触发都必须
   * 阻止「迟到的成功」被发布 —— 客户端已经不等了，再发成功会错位。
   */
  const runJs = (
    args: JsRuntimeInput,
    rawContext: unknown,
    callerSignal: AbortSignal,
  ): Promise<CallToolResult> => {
    const meta = readCallerContext(rawContext);
    const queueKey = sessionIdOf(meta);
    return parts.admission.submit(queueKey, async (): Promise<CallToolResult> => {
      const budget = budgetOf(args.timeout_ms);
      const signal = executionSignal(callerSignal, parts.lifetime.signal, budget);
      signal.throwIfAborted();
      if (isEmptySource(args.code)) return emptySourceResult();
      await parts.broker?.ready;
      signal.throwIfAborted();
      const input = toExecutorInput(
        args,
        signal,
        budget,
        parts.broker?.connection,
        withTitle(meta, args.title),
      );
      const projected = toMcpRunResult(await parts.execute(input));
      // 已被取消的执行器不可发布迟到成功；已返回的诊断错误仍需交给调用方。
      if (!projected.isError) signal.throwIfAborted();
      return projected;
    });
  };

  const server = new Server(SERVER_INFO, SERVER_CAPABILITIES);

  server.setRequestHandler("tools/list", () =>
    parts.lifetime.accept(async () => ({ tools: toolCatalogue(await nativeTools()) })),
  );

  /**
   * `tools/call` 的分派。
   *
   * 逻辑**内联在 handler 里**而不是抽成独立函数：`extra` 的类型只能由
   * `setRequestHandler` 的签名推导，抽出去就得手写类型（会漂移）。
   * 但每一步的判定与参数准备都走上面的模块，这里只剩「读、判、转」三行。
   */
  server.setRequestHandler("tools/call", (request, extra) =>
    parts.lifetime.accept(async (): Promise<CallToolResult> => {
      const native = await nativeTools();
      const rawContext = extra.mcpReq._meta?.[CONTEXT_META_KEY];
      const signal = AbortSignal.any([extra.mcpReq.signal, parts.lifetime.signal]);
      if (isNativeCall(native, request.params.name)) {
        return (await native?.execute(
          nativeInvocation(request, rawContext, signal),
        )) as CallToolResult;
      }
      const args = requireJsArguments(request.params.name, request.params.arguments);
      return runJs(args, rawContext, extra.mcpReq.signal);
    }),
  );

  /** 关闭顺序：先停会话准入，再放 broker / CUA / 原生能力。 */
  const closeAll = (): Promise<void> =>
    parts.lifetime.close([
      () => parts.broker?.close(),
      () => parts.cua?.dispose(),
      async () => (await parts.windowsReady)?.dispose(),
    ]);

  return { server, dispose: closeAll };
}
