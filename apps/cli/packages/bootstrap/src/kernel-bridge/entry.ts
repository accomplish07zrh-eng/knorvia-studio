// SPDX-License-Identifier: Apache-2.0
// 桥入口（段 A）：NDJSON 读写循环，把 request 路由到 BridgeEngine，把 response / notification 写回 stdout。
// 骨架由工程小弟给定，段 A 只填实现，不改签名。仅由 kernel/process.ts 在 dsh 引擎下动态 import。

import { createInterface } from "node:readline";
import type { Context } from "@deepseek-ai/cordis";
import { knorviaProtocolMessageSchema } from "@knorvia/shared";
import type { KnorviaProtocolMessage, KnorviaProtocolRequest } from "@knorvia/shared";
import {
  V4_METHODS,
  V4_NOTIFICATIONS,
  v4ConnectionFlowParamsSchema,
  v4ConversationResyncParamsSchema,
  v4ConversationSubscribeParamsSchema,
  v4ConversationUnsubscribeParamsSchema,
} from "@knorvia/shared/protocol-v4";
import type { RoutedTopicWireFrame } from "@knorvia/shared/protocol-v4";
import type { z } from "zod";
import { callKernelLogger } from "../kernel/logger.js";
import type { KernelLogger } from "../kernel/logger.js";
import { BridgeEngine } from "./bridge-engine.js";
import { BridgeProtocolError } from "./links-registry.js";

export interface RunBridgeOptions {
  readonly context: Context;
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly logger?: KernelLogger;
}

/** 运行中的桥：stop() 由 process.ts 在 SIGTERM/SIGINT 时调用。 */
export interface RunningBridge {
  /** input 结束或 stop() 后 resolve；所有在途命令已收口。 */
  readonly done: Promise<void>;
  stop(): Promise<void>;
}

// 错误码沿用旧运行时的取值（protocol/transport.ts）：桥不新增错误码。
const JSONRPC_PARSE_ERROR = -32700;
const JSONRPC_INVALID_REQUEST = -32600;
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INVALID_PARAMS = -32602;
const JSONRPC_INTERNAL_ERROR = -32603;

// 无请求 id 的失败沿用旧运行时的稳定伪 id，客户端能把它和真实请求区分开。
const PARSE_ERROR_ID = "parse-error";
const INVALID_MESSAGE_ID = "invalid-message";

// 首帧闸门挂在 setImmediate 上（projection-layer 的 releaseGateAfterResponse）；
// 这两个方法在写完响应后让出一轮，保证 initial/recovery 帧排在响应行之后。
const GATED_DELIVERY_METHODS: ReadonlySet<string> = new Set([
  V4_METHODS.conversationSubscribe,
  V4_METHODS.conversationResync,
]);

interface ProtocolErrorBody {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

/** 启动 NDJSON 读写循环并立即返回句柄。 */
export function runBridge(options: RunBridgeOptions): RunningBridge {
  const logger = options.logger;
  const reader = createInterface({ input: options.input, crlfDelay: Infinity });

  let outputClosed = false;
  let shuttingDown: Promise<void> | undefined;
  // 已收下但未收口的行数：包含排队中与执行中，EOF 收尾要等它归零。
  let inflight = 0;
  // 单写者串行链：响应与帧按服务端产生顺序写出，不会在同一行处理中途交错。
  let chain: Promise<void> = Promise.resolve();
  const idleWaiters = new Set<() => void>();
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const engine = new BridgeEngine({
    context: options.context,
    logger,
    writeFrame: (frame: RoutedTopicWireFrame) => {
      writeMessage({ method: V4_NOTIFICATIONS.conversationFrame, params: frame });
    },
  });

  // 事件接线失败就是启动失败：没有事件投影，v4 帧面不可能正确工作。
  // 让错误冒泡到 process.ts 的启动失败路径（退出码 1），不在这里降级成只剩命令面。
  engine.start();

  reader.on("line", onLine);
  reader.on("close", onReaderClose);
  options.input.on("error", onInputError);
  options.output.on("error", onOutputError);

  return { done, stop };

  function onLine(line: string): void {
    inflight += 1;
    chain = chain
      .then(() => handleLine(line))
      .catch((error: unknown) => {
        // handleLine 自己已经收口请求级错误；能到这里的只有写出口异常，不能中断后续行。
        log("error", "kernel.bridge.line.failed", { error: messageOf(error) });
      })
      .finally(() => {
        inflight -= 1;
        if (inflight > 0) return;
        for (const wake of idleWaiters) wake();
        idleWaiters.clear();
      });
  }

  async function handleLine(line: string): Promise<void> {
    let decoded: unknown;
    try {
      decoded = JSON.parse(line);
    } catch (error) {
      log("warn", "kernel.bridge.line.invalid-json", { error: messageOf(error) });
      writeError(PARSE_ERROR_ID, { code: JSONRPC_PARSE_ERROR, message: "Parse error" });
      return;
    }

    const parsed = knorviaProtocolMessageSchema.safeParse(decoded);
    if (!parsed.success) {
      writeError(INVALID_MESSAGE_ID, {
        code: JSONRPC_INVALID_REQUEST,
        message: "Invalid Knorvia Studio Protocol message",
        data: { issues: parsed.error.issues },
      });
      return;
    }

    const message: KnorviaProtocolMessage = parsed.data;
    if ("method" in message) {
      if ("id" in message) {
        await handleRequest(message);
        return;
      }
      // 客户端 → 服务端方向没有桥需要消费的通知；记 debug 后丢弃，不回错误。
      log("debug", "kernel.bridge.notification.ignored", { method: message.method });
      return;
    }
    // 反向 request 的应答（例如 session/requestRuntimePreferences）：桥不发起反向请求，
    // 这里只消费回执。回错误会污染客户端的 stdout 断言。
    log("debug", "kernel.bridge.client-reply.ignored");
  }

  async function handleRequest(request: KnorviaProtocolRequest): Promise<void> {
    try {
      const result = await route(request.method, request.params);
      writeMessage({ id: request.id, result });
      if (GATED_DELIVERY_METHODS.has(request.method)) await nextImmediate();
    } catch (error) {
      writeError(request.id, protocolErrorOf(error));
    }
  }

  async function route(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case V4_METHODS.command:
        return await engine.handleCommand(params);

      case V4_METHODS.commandsQuery: {
        const result = engine.queryCommands(params);
        // query() 用 undefined 表达参数非法；在请求边界转成协议 error，而不是伪造空结果。
        if (result === undefined) {
          throw new BridgeProtocolError(JSONRPC_INVALID_PARAMS, "Invalid params");
        }
        return result;
      }

      case V4_METHODS.conversationSubscribe: {
        const parsed = parseParams(v4ConversationSubscribeParamsSchema, params);
        return await engine.subscribe({
          topic: parsed.topic,
          connectionId: parsed.connectionId,
          clientMode: parsed.clientMode,
          base: parsed.base,
          workspace: parsed.workspace,
          visibility: parsed.visibility,
          legacyTaskIds: parsed.legacyTaskIds,
          resumeThoughtLevel: parsed.resumeThoughtLevel,
        });
      }

      case V4_METHODS.conversationResync: {
        const parsed = parseParams(v4ConversationResyncParamsSchema, params);
        return await engine.resync({
          topic: parsed.topic,
          connectionId: parsed.connectionId,
          subscriptionId: parsed.subscriptionId,
          // 共享 schema 用 null 表达“没有可续传水位”，interface 用可选字段表达同一件事。
          base: parsed.base ?? undefined,
          forceSnapshot: parsed.forceSnapshot,
        });
      }

      case V4_METHODS.conversationUnsubscribe: {
        engine.unsubscribe(parseParams(v4ConversationUnsubscribeParamsSchema, params));
        return {};
      }

      case V4_METHODS.connectionFlow: {
        engine.setFlowControl(parseParams(v4ConnectionFlowParamsSchema, params));
        return {};
      }

      default:
        throw new BridgeProtocolError(JSONRPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  }

  function stop(): Promise<void> {
    shuttingDown ??= shutdown();
    return shuttingDown;
  }

  async function shutdown(): Promise<void> {
    detach();
    try {
      reader.close();
    } catch (error) {
      log("debug", "kernel.bridge.reader.close.failed", { error: messageOf(error) });
    }
    // EOF 之后仍可能有在途请求：先让它们把 ACK/帧写完，再释放投影层。
    await waitForIdle();
    try {
      await engine.stop();
    } catch (error) {
      log("warn", "kernel.bridge.stop.failed", { error: messageOf(error) });
    }
    resolveDone();
  }

  function waitForIdle(): Promise<void> {
    if (inflight === 0) return Promise.resolve();
    return new Promise<void>((resolve) => idleWaiters.add(resolve));
  }

  function detach(): void {
    reader.off("line", onLine);
    reader.off("close", onReaderClose);
    options.input.off("error", onInputError);
    options.output.off("error", onOutputError);
  }

  function onReaderClose(): void {
    void stop();
  }

  function onInputError(error: unknown): void {
    log("warn", "kernel.bridge.stdin.failed", { error: messageOf(error) });
    void stop();
  }

  function onOutputError(error: unknown): void {
    // stdout 断了就没有可写的协议面：停止读取并收尾，让 process.ts 走正常退出路径。
    outputClosed = true;
    log("warn", "kernel.bridge.stdout.failed", { error: messageOf(error) });
    void stop();
  }

  function writeMessage(message: unknown): void {
    if (outputClosed) return;
    try {
      options.output.write(`${JSON.stringify(message)}\n`);
    } catch (error) {
      outputClosed = true;
      log("warn", "kernel.bridge.stdout.failed", { error: messageOf(error) });
      void stop();
    }
  }

  function writeError(id: string | number, body: ProtocolErrorBody): void {
    writeMessage({
      id,
      error:
        body.data === undefined
          ? { code: body.code, message: body.message }
          : { code: body.code, message: body.message, data: body.data },
    });
  }

  function protocolErrorOf(error: unknown): ProtocolErrorBody {
    if (error instanceof BridgeProtocolError) {
      return error.data === undefined
        ? { code: error.code, message: error.message }
        : { code: error.code, message: error.message, data: error.data };
    }
    return { code: JSONRPC_INTERNAL_ERROR, message: messageOf(error) };
  }

  function log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ): void {
    if (!logger) return;
    callKernelLogger(logger, level, message, fields);
  }
}

/** 请求边界参数校验：失败即协议 error，不进入投影层（不建订阅、不改投递状态）。 */
function parseParams<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new BridgeProtocolError(
    JSONRPC_INVALID_PARAMS,
    `Invalid params: ${summarizeIssues(parsed.error)}`,
  );
}

/** zod 诊断压成单行文案：路径 + 原因，最多 5 条，避免把整份 payload 回显到 stdout。 */
function summarizeIssues(error: z.ZodError): string {
  const parts = error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.length === 0 ? "(root)" : issue.path.map(String).join(".");
    return `${path}: ${issue.message}`;
  });
  const more = error.issues.length > 5 ? ` (+${error.issues.length - 5} more)` : "";
  return parts.length === 0 ? "invalid parameters" : `${parts.join("; ")}${more}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nextImmediate(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}
