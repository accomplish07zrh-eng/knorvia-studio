// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02：回合类命令的分派（合同 behavior.md B1–B7）。
//
// 从 `bridge-engine.ts` 抽出来单独成模块，有两个理由：
//   1. 引擎只该负责「按类型路由」，回合命令的入参映射与失败翻译属于本包；
//   2. 引擎是 `kernel-bridge-01` 的骨架文件，本包改它越少越好（合并冲突面更小）。
//
// 本模块**不持状态**：执行器由调用方注入，会话存在性由 `CommandInbox` 先裁决。

import type { CommandAck, CommandEnvelope, CommandPayloadMap } from "@knorvia/shared/protocol-v4";
import type { CommandExecutionOutcome } from "./command-inbox.js";
import {
  type KernelTurnExecutor,
  TurnCapabilityUnavailableError,
  TurnSessionUnavailableError,
} from "./turn-executor.js";

/** 引擎侧的会话不存在 reasonCode；与本包失败翻译共用同一个词。 */
const SESSION_NOT_FOUND_REASON = "proto.sessionNotFound";

/** 未支持能力的 reasonCode。 */
const UNSUPPORTED_REASON = "unsupported";

/**
 * 本包接管的回合类命令字面量。
 *
 * 与 v4 `commandPayloadSchemas` 一致（合同 README §二.1.1 已核准）：
 * **没有** `cancelTurn`（取消是 `stop`）、**没有** `steer`（是 `sendText.requestedDelivery`）。
 * 清单本身的作用是「分派表」：`bridge-engine` 的 case 与这里必须同步，
 * 因此它只在本模块内使用，不对外导出。
 */
const TURN_COMMAND_TYPES: ReadonlySet<string> = new Set(["sendText", "stop", "compact"]);

/**
 * 把一条回合类命令翻译成执行层终态。
 *
 * 失败只有三个来源，各有固定语义：
 *   - 执行器未注入 → `unsupported`（只跑骨架的场景）；
 *   - 会话为空 → `proto.sessionNotFound`（协议违例，`createSession` 之外必须有会话）；
 *   - 执行器报会话无活动 agent → 同 `proto.sessionNotFound`；
 *   - 能力缺席（例如压缩服务没挂）→ `unsupported`。
 * 其它异常继续上抛，由调用方折叠为内部错误。
 *
 * @param envelope - 已通过准入的命令信封。
 * @param executor - 回合执行器；`undefined` 表示当前组合没有回合能力。
 * @returns 执行层终态。
 */
export async function dispatchTurnCommand(
  envelope: CommandEnvelope,
  executor: KernelTurnExecutor | undefined,
): Promise<CommandExecutionOutcome> {
  // 分派表与引擎的 case 必须同步：不是本包管的类型在这里直接判「不归我」，
  // 避免将来引擎多转发一个类型时被静默当成回合命令执行。
  if (!TURN_COMMAND_TYPES.has(envelope.type)) {
    return failedOutcome(UNSUPPORTED_REASON, `${envelope.type} is not a kernel-bridge-02 command`);
  }
  if (executor === undefined) return failedOutcome(UNSUPPORTED_REASON, undefined);
  const sessionId = envelope.sessionId;
  if (sessionId === null) {
    return failedOutcome(SESSION_NOT_FOUND_REASON, `${envelope.type} requires a session`);
  }
  try {
    return { status: "accepted", result: await runTurn(envelope, executor, sessionId) };
  } catch (error) {
    if (error instanceof TurnSessionUnavailableError) {
      return failedOutcome(SESSION_NOT_FOUND_REASON, `Session is not active: ${sessionId}`);
    }
    if (error instanceof TurnCapabilityUnavailableError) {
      return failedOutcome(UNSUPPORTED_REASON, error.message);
    }
    throw error;
  }
}

/**
 * 按命令类型调执行器，并把结果收窄成冻结的 v4 result 形状。
 *
 * **没有自造 result type**：`sendText` 用 `inputAccepted`，`stop`/`compact` 用
 * `inputDisposition`（`commandResultSchema`，见 design.md §10.2）。
 *
 * @param envelope - 命令信封。
 * @param executor - 回合执行器。
 * @param sessionId - 已确认非空的会话 id。
 * @returns 冻结形状的 result。
 */
async function runTurn(
  envelope: CommandEnvelope,
  executor: KernelTurnExecutor,
  sessionId: string,
): Promise<NonNullable<CommandAck["result"]>> {
  const idempotencyKey = envelope.commandId;
  if (envelope.type === "sendText") {
    const payload = envelope.payload as CommandPayloadMap["sendText"];
    const delivered = await executor.sendText({
      sessionId,
      text: payload.text,
      ...optional("requestedDelivery", payload.requestedDelivery),
      ...optional("heldQueueDisposition", payload.heldQueueDisposition),
    });
    return turnResult({
      shape: "accepted",
      delivery: delivered.admitted,
      commandId: idempotencyKey,
    });
  }
  if (envelope.type === "stop") {
    const payload = envelope.payload as CommandPayloadMap["stop"];
    const stopped = await executor.stop({
      sessionId,
      ...optional("expectedForegroundExecutionId", payload.expectedForegroundExecutionId),
    });
    // stop 不产生输入；用离「停止后的输入处置」最近的冻结结果表达。
    return turnResult({ shape: "disposition", delivery: stopped.stopped ? "startNow" : "queue" });
  }
  // compact：输入型维护，无专属 ACK 形状。
  await executor.compact({ sessionId, sourceCommandId: envelope.commandId });
  return turnResult({ shape: "disposition", delivery: "startNow" });
}

/**
 * 造冻结形状的 ACK result。
 *
 * 只有两种合法形态（`commandResultSchema`，见 design.md §10.2）：
 * 输入被接纳用 `inputAccepted`（带幂等键），维护/停止类意图用 `inputDisposition`。
 * 两个分支集中一处，调用点只说「是哪种、什么档位」。
 *
 * @param request - 形态、档位与被接纳时的命令标识。
 * @returns 可直接作为 ACK result 的对象。
 */
function turnResult(request: {
  readonly shape: "accepted" | "disposition";
  readonly delivery: "startNow" | "queue" | "guide";
  readonly commandId?: string;
}): NonNullable<CommandAck["result"]> {
  if (request.shape === "disposition") {
    return { type: "inputDisposition", delivery: request.delivery };
  }
  return {
    type: "inputAccepted",
    delivery: request.delivery,
    inputId: request.commandId ?? "",
  };
}

/**
 * 只在值存在时收进对象，避免把 `undefined` 显式写进可选字段（`exactOptionalPropertyTypes`）。
 *
 * @param key - 字段名。
 * @param value - 字段值。
 * @returns 可直接展开的对象。
 */
function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });
}

/**
 * 造失败终态。
 *
 * @param reasonCode - 失败原因码（既有词表）。
 * @param message - 面向调用方的说明；缺席时只回原因码。
 * @returns 执行层失败终态。
 */
function failedOutcome(reasonCode: string, message: string | undefined): CommandExecutionOutcome {
  const outcome: CommandExecutionOutcome = { status: "failed", reasonCode };
  return message === undefined ? outcome : { ...outcome, message };
}
