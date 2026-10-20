// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02：回合类命令的分派（合同 behavior.md B1–B7，含 B3 首输入）。
//
// 从 `bridge-engine.ts` 抽出来单独成模块，有两个理由：
//   1. 引擎只该负责「按类型路由」，回合命令的入参映射与失败翻译属于本包；
//   2. 引擎是 `kernel-bridge-01` 的骨架文件，本包改它越少越好（合并冲突面更小）。
//
// 本模块**不持状态**：执行器由调用方注入，会话存在性由 `CommandInbox` 先裁决。
//
// B3 与 B1–B7 同处一模块：它们共用「调执行器 → 翻成冻结 ACK 形状 → 按语义翻译失败」
// 这条唯一路径；拆成两个文件会让 try/catch 与 outcome 构造各写一遍。

import type { CommandAck, CommandEnvelope, CommandPayloadMap } from "@knorvia/shared/protocol-v4";
import type { CommandExecutionOutcome } from "./command-inbox.js";
import type { TurnApprovalRegistry } from "./turn-approval.js";
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
 * 交互已被解决：冻结面规定的 noop 原因码（`command.ts` L171
 * 「先到先得，晚到 noop（reasonCode=proto.alreadyResolved）」）。
 */
const ALREADY_RESOLVED_REASON = "proto.alreadyResolved";

/** 交付档位的冻结取值（`conversationInputDeliverySchema.admitted`）。 */
type AdmittedDelivery = "startNow" | "queue" | "guide";

/**
 * 本包接管的回合类命令字面量。
 *
 * 与 v4 `commandPayloadSchemas` 一致（合同 README §二.1.1 已核准）：
 * **没有** `cancelTurn`（取消是 `stop`）、**没有** `steer`（是 `sendText.requestedDelivery`）。
 * 清单本身的作用是「分派表」：`bridge-engine` 的 case 与这里必须同步，
 * 因此它只在本模块内使用，不对外导出。
 */
const TURN_COMMAND_TYPES: ReadonlySet<string> = new Set([
  "sendText",
  "stop",
  "compact",
  "resolveInteraction",
]);

/**
 * kernel-bridge-03 的 C 组：需要回合栈、但**不投递用户输入**的命令。
 *
 * 与 `TURN_COMMAND_TYPES` 分开是因为它们的产出不是 `inputAccepted`/`inputDisposition`：
 * `forkAssistant`/`createSelectionSideSession` 返回**新会话**，其余返回处置类 ACK。
 */
const STACK_COMMAND_TYPES: ReadonlySet<string> = new Set([
  "forkAssistant",
  "editUserQuery",
  "retryTurn",
  "createSelectionSideSession",
  "sendGoalCommand",
  "pauseGoal",
  "resumeGoal",
]);

/**
 * 把一条 C 组命令翻译成执行层终态。
 *
 * 失败语义与回合命令一致（执行器缺席 → `unsupported`；会话不存在 → `proto.sessionNotFound`；
 * 能力缺席 → `unsupported`），只是产出形状不同。
 *
 * @param envelope - 已通过准入的命令信封。
 * @param executor - 回合执行器；`undefined` 表示当前组合没有回合能力。
 * @returns 执行层终态。
 */
export async function dispatchStackCommand(
  envelope: CommandEnvelope,
  executor: KernelTurnExecutor | undefined,
): Promise<CommandExecutionOutcome> {
  if (!STACK_COMMAND_TYPES.has(envelope.type)) {
    return failedOutcome(UNSUPPORTED_REASON, `${envelope.type} is not a kernel-bridge-03 command`);
  }
  if (executor === undefined) return failedOutcome(UNSUPPORTED_REASON, undefined);
  const sessionId = envelope.sessionId;
  if (sessionId === null) {
    return failedOutcome(SESSION_NOT_FOUND_REASON, `${envelope.type} requires a session`);
  }
  return await guardedBySession(envelope, sessionId, () => runStack(envelope, executor, sessionId));
}

/**
 * 回合命令的统一收口：把「调执行器」的异常翻成既有失败语义。
 *
 * **为什么抽成一个 helper**：三处分派（C 组 / 回合组 / 首输入）原本各写一份
 * 完全相同的 `try { … } catch { 两个 instanceof 检查; throw error }`。
 * 同一段控制流写三遍既是冗余，也让「失败语义只有一份」失去保证——
 * 将来改一处忘另两处就会分叉。集中后调用点只表达「做什么」。
 *
 * @param envelope - 命令信封（用于拼参数错误的文案）。
 * @param sessionId - 已确认非空的会话 id。
 * @param body - 真正的执行体，返回冻结形状的 result。
 * @returns 执行层终态；未识别的异常继续上抛，由调用方折叠为内部错误。
 */
async function guardedBySession(
  envelope: CommandEnvelope,
  sessionId: string,
  body: () => Promise<NonNullable<CommandAck["result"]>>,
): Promise<CommandExecutionOutcome> {
  try {
    const result = await body();
    return { status: "accepted", result };
  } catch (error) {
    if (error instanceof TurnSessionUnavailableError) {
      return failedOutcome(SESSION_NOT_FOUND_REASON, `Session is not active: ${sessionId}`);
    }
    if (error instanceof TurnCapabilityUnavailableError) {
      return failedOutcome(UNSUPPORTED_REASON, error.message);
    }
    // 未识别的异常带上下文上抛：消息里点明是哪条命令，便于定位。
    if (error instanceof Error) {
      error.message = `${envelope.type}: ${error.message}`;
    }
    throw error;
  }
}

/**
 * 按命令类型调执行器的可选方法，并把结果收窄成冻结的 v4 result 形状。
 *
 * @param envelope - 命令信封。
 * @param executor - 回合执行器。
 * @param sessionId - 已确认非空的会话 id。
 * @returns 冻结形状的 result。
 */
async function runStack(
  envelope: CommandEnvelope,
  executor: KernelTurnExecutor,
  sessionId: string,
): Promise<NonNullable<CommandAck["result"]>> {
  // `forkAssistant` 与 `createSelectionSideSession` 都产出**新会话**，
  // 冻结面的 result type 就是它们自己的名字（`commandResultSchema` 已列）。
  if (envelope.type === "forkAssistant") {
    const payload = envelope.payload as CommandPayloadMap["forkAssistant"];
    const forked = await executor.forkSession?.({
      sessionId,
      params: { rowId: payload.target.rowId },
    });
    const forkedSessionId = (forked as { sessionId?: string } | undefined)?.sessionId;
    if (forkedSessionId === undefined) {
      throw new TurnCapabilityUnavailableError("session fork");
    }
    return { type: "forkAssistant", sessionId: forkedSessionId };
  }
  if (envelope.type === "createSelectionSideSession") {
    const payload = envelope.payload as CommandPayloadMap["createSelectionSideSession"];
    // `firstInput` 按冻结面是**可选**的：缺席表示「只建侧会话、不预置输入」。
    const created = await executor.createSelectionSideSession?.({
      parentSessionId: sessionId,
      text: payload.firstInput?.text ?? "",
    });
    if (created === undefined) {
      throw new TurnCapabilityUnavailableError("selection side session");
    }
    const result: NonNullable<CommandAck["result"]> = {
      type: "createSelectionSideSession",
      sessionId: created.sessionId,
      ...(payload.firstInput === undefined
        ? {}
        : { input: { delivery: created.admitted, inputId: envelope.commandId } }),
    };
    return result;
  }
  if (envelope.type === "sendGoalCommand") {
    const payload = envelope.payload as CommandPayloadMap["sendGoalCommand"];
    await executor.setGoal?.({ sessionId, params: { text: payload.text } });
    return { type: "inputDisposition", delivery: "startNow" };
  }
  if (envelope.type === "pauseGoal") {
    await executor.pauseGoal?.({ sessionId, params: {} });
    return { type: "inputDisposition", delivery: "queue" };
  }
  if (envelope.type === "resumeGoal") {
    await executor.resumeGoal?.({ sessionId, params: {} });
    return { type: "inputDisposition", delivery: "startNow" };
  }
  if (envelope.type === "editUserQuery") {
    const payload = envelope.payload as CommandPayloadMap["editUserQuery"];
    await executor.editUserQuery?.({
      sessionId,
      params: {
        rowId: payload.target.rowId,
        newText: payload.newText,
        workspaceMode: payload.workspaceMode,
      },
    });
    return { type: "inputDisposition", delivery: "startNow" };
  }
  // retryTurn：重试该助手轮。
  const payload = envelope.payload as CommandPayloadMap["retryTurn"];
  await executor.retryTurn?.({ sessionId, params: { rowId: payload.target.rowId } });
  return { type: "inputDisposition", delivery: "startNow" };
}

/**
 * 把一条回合类命令翻译成执行层终态。
 *
 * 失败只有四个来源，各有固定语义：
 *   - 执行器缺席 → `unsupported`（只跑骨架的场景）；
 *   - 会话为空 → `proto.sessionNotFound`（协议违例，`createSession` 之外必须有会话）；
 *   - 执行器报会话无活动 agent → 同 `proto.sessionNotFound`；
 *   - 能力缺席（例如压缩服务没挂）→ `unsupported`。
 * 其它异常继续上抛，由调用方折叠为内部错误。
 *
 * @param envelope - 已通过准入的命令信封。
 * @param executor - 回合执行器；`undefined` 表示当前组合没有回合能力。
 * @param approvals - 未决交互登记表（`resolveInteraction` 用它闭合等待中的审批）。
 * @returns 执行层终态。
 */
export async function dispatchTurnCommand(
  envelope: CommandEnvelope,
  executor: KernelTurnExecutor | undefined,
  approvals: TurnApprovalRegistry,
): Promise<CommandExecutionOutcome> {
  // 分派表与引擎的 case 必须同步：不是本包管的类型在这里直接判「不归我」，
  // 避免将来引擎多转发一个类型时被静默当成回合命令执行。
  if (!TURN_COMMAND_TYPES.has(envelope.type)) {
    return failedOutcome(UNSUPPORTED_REASON, `${envelope.type} is not a kernel-bridge-02 command`);
  }
  // `resolveInteraction` 在**执行器之前**处理：审批应答不需要回合执行器
  // （它只闭合已登记的未决请求），也不能因为执行器缺席就被判 unsupported。
  if (envelope.type === "resolveInteraction") {
    const payload = envelope.payload as CommandPayloadMap["resolveInteraction"];
    // 冻结语义（command.ts L171）：先到先得，晚到 noop（`proto.alreadyResolved`）。
    const settled = approvals.settle(payload.interactionId, payload.answer);
    const result: NonNullable<CommandAck["result"]> = {
      type: "inputDisposition",
      delivery: "startNow",
    };
    return settled
      ? { status: "accepted", result }
      : { status: "noop", reasonCode: ALREADY_RESOLVED_REASON };
  }
  if (executor === undefined) return failedOutcome(UNSUPPORTED_REASON, undefined);
  const sessionId = envelope.sessionId;
  if (sessionId === null) {
    return failedOutcome(SESSION_NOT_FOUND_REASON, `${envelope.type} requires a session`);
  }
  return await guardedBySession(envelope, sessionId, () => runTurn(envelope, executor, sessionId));
}

/**
 * 投递 `createSession` 的首输入（B3）。
 *
 * B3 的可判定要求：**建会话与首输入在同一个 ACK 之前完成**——Host 依赖
 * 「创建成功即认为首输入已被接受」，所以两者不能拆成两次往返。
 *
 * 冻结形状：`{ type: "createSession", sessionId, input?: { delivery, inputId } }`——
 * **没有 `turnId` 字段**（见 design.md §10.2）。
 *
 * @param envelope - 已通过准入的 `createSession` 信封。
 * @param executor - 回合执行器（与 v4/legacy 共用的同一个实例）。
 * @param forgetSession - 失败回滚用：把半建的会话摘出桥的登记表。
 * @returns 执行层终态；无首输入时返回 undefined（交回调用方走「只建会话」路径）。
 */
export async function deliverFirstInput(
  envelope: CommandEnvelope,
  executor: KernelTurnExecutor | undefined,
  forgetSession: (sessionId: string) => void,
): Promise<CommandExecutionOutcome | undefined> {
  const payload = envelope.payload as CommandPayloadMap["createSession"];
  // 没有首输入就没什么可投递的：交回调用方走原来的「只建会话」路径。
  if (payload.firstInput === undefined) return undefined;
  // 有首输入却没有执行器：不能建出「吞掉用户输入」的会话（段 A 的旧保护）。
  if (executor === undefined) return failedOutcome(UNSUPPORTED_REASON, undefined);

  const sessionId = envelope.sessionId ?? "";
  const firstTurn = await executor
    .createSession({
      sessionId,
      workspacePath: payload.workspaceId,
      // `firstInput.mode` 是**提交模式**（build/edit/plan/yolo 一类），不是交付意愿；
      // 首输入没有 requestedDelivery 字段，按空闲会话的首个回合处理。
      firstInput: { text: payload.firstInput.text },
    })
    .catch((rejection: unknown) => {
      // 首输入被拒时不能留下「半建的会话」：DSH 侧会话已由引擎建好，
      // 这里把它摘出登记表，再如实回失败（不伪造成功）。
      forgetSession(sessionId);
      if (rejection instanceof TurnSessionUnavailableError) {
        return failedOutcome(SESSION_NOT_FOUND_REASON, `Session is not active: ${sessionId}`);
      }
      throw rejection;
    });
  // 失败分支返回的是 outcome 而不是首回合结果：用 `status` 区分，避免再抛一次。
  if ("status" in firstTurn) return firstTurn;
  const result: NonNullable<CommandAck["result"]> = {
    type: "createSession",
    sessionId,
    input: { delivery: firstTurn.admitted ?? "startNow", inputId: envelope.commandId },
  };
  return { status: "accepted", result };
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
  await executor.compact({ sessionId, sourceCommandId: idempotencyKey });
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
  readonly delivery: AdmittedDelivery;
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
