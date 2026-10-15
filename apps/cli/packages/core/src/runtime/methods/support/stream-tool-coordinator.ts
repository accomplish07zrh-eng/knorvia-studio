// SPDX-License-Identifier: Apache-2.0
// 流式工具协调器：声明表 + 执行表 + 流中断控制器的唯一持有者。accept 只登记与判定准入，
// 执行各自独立并发；abandon/drain 是两个收尾出口（都摘 abort 监听）；模型失败按有无声明
// 分流到补执行编排或部分输出恢复。微任务边界保持既有形状（同 tick 契约）。
import type { MessageId, Model, ModelToolCall, ToolCallId, TraceContext } from "../../deps.js";
import { emitStreamingToolLedgerUpdate } from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { StreamedToolExecutionResult } from "../../types.js";
import type { RegularTurnLoopState } from "../turn-loop-state.js";
import {
  createDiscardedByteCounter,
  permitsStreamingLaunch,
  type DeclarationMap,
} from "./admission-table.js";
import { settleAllExecutions, type ExecutionTable } from "./collect-results.js";
import { runDuringStreamTool } from "./during-stream-run.js";
import { recoverWithDeclaredTools } from "./recover-step.js";
import { recoverPartialAssistantOutputFailure } from "./recovery-orchestration.js";
import { hasStreamRecoveryBudget } from "./recovery-plan.js";

/** 助手消息标识（短别名）。 */
type AssistantId = MessageId;

/** 已选模型（短别名）。 */
type SelectedModel = Model;

/** 追踪上下文句柄（短别名）。 */
type TraceHandle = TraceContext;

/** 运行时端口面（短别名）。 */
type RuntimePorts = AgentRuntimeInternal;

/** 回合循环状态（短别名）。 */
type LoopState = RegularTurnLoopState;

/** 故障载荷（短别名）。 */
type Fault = unknown;

/** 毫秒时刻（短别名）。 */
type EpochMillis = number;

/** 恢复请求附加项（短别名）。 */
type RecoveryExtras = { failedRequestId?: string };

/** 降级执行的 warn 文案与事件名（逐字常量）。 */
const FALLBACK_WARN_TEXT = "Streaming tool execution fell back to end-of-stream execution";
const FALLBACK_WARN_EVENT = "tool.streaming.execution_failed";
const LOG_MODULE = "core.runtime";
const FAILED_TAG = "failed";

/** 收尾账本状态（逐字常量）。 */
const CANCELLED_LEDGER_STATUS = "tool_cancelled";
const ABANDONED_LEDGER_STATUS = "tool_abandoned";
const DURING_STREAM_TIMING = "during_stream";

/** 故障描述（Error 取消息，其余取字符串化）。 */
const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** 协调器句柄（兼容导出面）。 */
export interface StreamingToolCoordinatorHandle {
  /** 登记声明并按准入决定是否流中启动。 */
  accept: (toolCall: ModelToolCall) => void;
  /** 中途取消/模型失败收尾（并发发账本更新）。 */
  abandon: (reason: "cancelled" | "model_failed") => Promise<void>;
  /** 流末收尾：按传入表序收集结果。 */
  drain: (toolCalls: readonly ModelToolCall[]) => Promise<StreamedToolExecutionResult[]>;
  /** 累计丢弃的推理 delta 字节。 */
  recordReasoningDelta: (text: string) => void;
  /** 累计丢弃的文本 delta 字节。 */
  recordTextDelta: (text: string) => void;
  /** 模型失败恢复：按有无声明分流。 */
  recoverFromModelFailure: (
    error: Fault,
    assistantCreatedAt: EpochMillis,
    options?: RecoveryExtras,
  ) => Promise<boolean>;
}

/** 协调器构造入参。 */
export interface StreamingToolCoordinatorSpec {
  /** 助手消息 id。 */
  assistantMessageId: AssistantId;
  /** 已绑定模型。 */
  model: SelectedModel;
  /** 追踪上下文。 */
  traceContext: TraceHandle;
}

/** 建协调器：状态持有在闭包里，出口都负责摘 abort 监听。 */
export function buildStreamingCoordinator(
  runtime: RuntimePorts,
  state: LoopState,
  spec: StreamingToolCoordinatorSpec,
): StreamingToolCoordinatorHandle {
  const declarations: DeclarationMap = new Map();
  const executions: ExecutionTable = new Map();
  const streamCanceller = new AbortController();
  const turnAbortListener = () => streamCanceller.abort();
  const { turnAbortSignal } = state;
  turnAbortSignal.addEventListener("abort", turnAbortListener, { once: true });
  /** 摘除 abort 转发监听（幂等）。 */
  const detachAbortForwarding = (): void => {
    turnAbortSignal.removeEventListener("abort", turnAbortListener);
  };
  const discarded = createDiscardedByteCounter();
  let declarationTally = 0;

  /** 下一个声明序号（登记即递增）。 */
  const nextDeclarationIndex = (): number => {
    const current = declarationTally;
    declarationTally += 1;
    return current;
  };

  /** 当前声明清单（登记序）。 */
  const listDeclarations = (): ModelToolCall[] => Array.from(declarations.values());

  /** 收尾账本载荷（赋值式组装，字段序即契约）。 */
  const ledgerPayloadFor = (
    declaration: ModelToolCall,
    status: string,
    blockedReason: string,
  ): Record<string, unknown> => {
    const toolCall = {} as { id: ToolCallId; input: unknown; name: string };
    toolCall.id = declaration.id as ToolCallId;
    toolCall.input = declaration.input;
    toolCall.name = declaration.name;
    const payload: Record<string, unknown> = {};
    payload.assistantMessageId = spec.assistantMessageId;
    payload.toolCall = toolCall;
    payload.status = status;
    payload.executionTiming = DURING_STREAM_TIMING;
    payload.blockedReason = blockedReason;
    return payload;
  };

  /** 降级 warn（流中执行失败转流末执行）。 */
  const warnFallback = (declaration: ModelToolCall, error: unknown): undefined => {
    const callIdentity = declaration.id;
    const callName = declaration.name;
    runtime.logger?.warn(FALLBACK_WARN_TEXT, {
      error: describeError(error),
      event: FALLBACK_WARN_EVENT,
      module: LOG_MODULE,
      status: FAILED_TAG,
      toolCallId: callIdentity,
      toolName: callName,
    });
    return undefined;
  };

  /** 启动一条流中执行（同 id 只启动一次）。 */
  const launchDuringStream = (declaration: ModelToolCall, declarationIndex: number): void => {
    const { id } = declaration;
    if (executions.has(id)) return;
    const running = runDuringStreamTool({
      runtime,
      state,
      declaration,
      options: {
        declarationIndex,
        assistantMessageId: spec.assistantMessageId,
        model: spec.model,
        traceContext: spec.traceContext,
        signal: streamCanceller.signal,
      },
    }).catch((error: unknown) => warnFallback(declaration, error));
    executions.set(id, running);
  };

  /** 登记声明（provider 自执行不登记）并按准入决定是否启动。 */
  const registerDeclaration = (toolCall: ModelToolCall): void => {
    const declaration = Object.assign({}, toolCall);
    const { id, providerExecuted } = declaration;
    if (providerExecuted) return;
    declarations.set(id, declaration);
    const declarationIndex = nextDeclarationIndex();
    if (!permitsStreamingLaunch(runtime, declaration)) return;
    launchDuringStream(declaration, declarationIndex);
  };

  const handle = {} as StreamingToolCoordinatorHandle;
  handle.accept = registerDeclaration;

  handle.abandon = async (reason) => {
    streamCanceller.abort();
    const status = reason === "cancelled" ? CANCELLED_LEDGER_STATUS : ABANDONED_LEDGER_STATUS;
    // 账本更新并发发出（顺序不保证，内容各自独立）。
    await Promise.all(
      listDeclarations().map((declaration) =>
        emitStreamingToolLedgerUpdate(
          runtime,
          state.events,
          spec.traceContext,
          ledgerPayloadFor(declaration, status, reason) as never,
        ),
      ),
    );
    await settleAllExecutions(executions);
    detachAbortForwarding();
  };

  handle.drain = async (toolCalls) => {
    const collected: StreamedToolExecutionResult[] = [];
    for (const toolCall of toolCalls) {
      const pending = executions.get(toolCall.id);
      if (pending === undefined) continue;
      const settled = await pending;
      if (settled) collected.push(settled);
    }
    detachAbortForwarding();
    return collected;
  };

  handle.recordReasoningDelta = (text) => {
    discarded.recordReasoningDelta(text);
  };

  handle.recordTextDelta = (text) => {
    discarded.recordTextDelta(text);
  };

  handle.recoverFromModelFailure = async (error, assistantCreatedAt, recoveryOptions = {}) => {
    // 短路：回合已取消或预算耗尽。
    if (turnAbortSignal.aborted || !hasStreamRecoveryBudget(state)) return false;
    const eventOptions = {
      ...spec,
      ...(recoveryOptions.failedRequestId
        ? { failedRequestId: recoveryOptions.failedRequestId }
        : {}),
    };
    // 无声明：走部分输出恢复（丢弃字节 + 可重试判定在彼处短路）。
    const declaredCount = declarations.size;
    if (declaredCount === 0) {
      return recoverPartialAssistantOutputFailure({
        abortController: streamCanceller,
        assistantCreatedAt,
        discardedReasoningBytes: discarded.reasoningBytes(),
        discardedTextBytes: discarded.textBytes(),
        error,
        options: eventOptions,
        runtime,
        state,
        turnAbortListener,
      });
    }
    // 有声明：abort 后补执行编排（同 tick 契约：abort 与记账同微任务起步）。
    streamCanceller.abort();
    return recoverWithDeclaredTools({
      declarations: listDeclarations(),
      executions,
      error,
      assistantCreatedAt,
      discardedReasoningBytes: discarded.reasoningBytes(),
      discardedTextBytes: discarded.textBytes(),
      options: eventOptions,
      runtime,
      state,
      turnAbortListener,
    });
  };

  return handle;
}
