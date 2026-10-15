// SPDX-License-Identifier: Apache-2.0
// 用量事实三写：模型请求、回合、工具各一条账本记录。usage 是可选增强面——sessionStore 四方法
// （recordModelUsage/upsertTurnUsage/upsertToolUsage/pruneUsage）缺一即静默返回；写入失败也只
// warn 吞掉（用量观测不阻塞回合）。id 口径：模型事实按逻辑身份（两处兜底分隔符不同），
// 工具事实按 `<session>_<callId>` 收敛。
import {
  CoreErrorType,
  createModelUsageSummaryFromEvents,
  SessionEventType,
  traceContextToLogContext,
} from "../../deps.js";
import type { SessionEvent, TraceContext } from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import { isModelContextExceededError } from "../../helpers/index.js";
import {
  firstModelTokenAt,
  modelNetworkObservations,
  nonemptyString,
  usageCount,
  usageErrorInfo,
} from "./usage-projection.js";

/** 各类短别名（字段行不与历史实现同形）。 */
type AttemptOrdinal = number;
type Count = number;
type DoneMs = number;
type EventList = readonly SessionEvent[];
type Fault = unknown;
type StartMs = number;
type StatusTag = "completed" | "error" | "cancelled";
type TraceHandle = TraceContext;

/** 写入失败日志文案与事件名（逐字常量）。 */
const WRITE_FAIL_TEXT = {
  model: "Usage model fact write failed",
  modelEvent: "usage.model.write.failed",
  module: "core.runtime",
  tool: "Usage tool fact write failed",
  toolEvent: "usage.tool.write.failed",
  turn: "Usage turn fact write failed",
  turnEvent: "usage.turn.write.failed",
} as const;

/** 失败标记（逐字常量）。 */
const FAILED_TAG = "failed";

/** 工具名缺省值（逐字常量）。 */
const UNKNOWN_TOOL = "unknown";

/** 已取消的状态取值（逐字常量）。 */
const CANCELLED_STATUS = "cancelled";

/** 当前毫秒时刻（单点取样入口）。 */
const clockNow = (): number => Date.now();

/** 故障描述（Error 取消息，其余字符串化）。 */
const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** usage 端口最小面（四方法门槛）。 */
interface UsageStorePort {
  recordModelUsage: (record: never) => Promise<void> | void;
  upsertTurnUsage: (record: never) => Promise<void> | void;
  upsertToolUsage: (record: never) => Promise<void> | void;
  pruneUsage: unknown;
}

/** 事件载荷的宽松读取面。 */
type PayloadRead = Record<string, unknown>;

/** 模型事实入参。 */
export interface ModelUsageFactInput {
  assistantMessageId?: string;
  /** 第几次尝试（缺省 0）。 */
  attemptIndex?: AttemptOrdinal;
  /** 故障载荷（可缺）。 */
  error?: Fault;
  /** 观测事件表。 */
  events: EventList;
  model: { modelId: string; options?: { reasoningLevel?: unknown }; providerId: string };
  /** 网络观测起点下标。 */
  networkEventStartIndex: number;
  parentUserMessageId?: string;
  /** 查询来源标识。 */
  querySource: string;
  result?: {
    finishReason?: string;
    providerMetadata?: unknown;
    usage?: {
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
    };
  };
  /** 请求发起毫秒时刻。 */
  startedAt: StartMs;
  status: StatusTag;
  /** 已见工具调用数（可缺）。 */
  toolCallCount?: Count;
  traceContext: TraceHandle;
}

/** 回合事实入参。 */
export interface TurnUsageFactInput {
  /** 回合完成毫秒时刻。 */
  completedAt: DoneMs;
  /** 故障载荷（可缺）。 */
  error?: Fault;
  /** 观测事件表。 */
  events: EventList;
  /** 回合发起毫秒时刻。 */
  startedAt: StartMs;
  status: string;
  traceContext: TraceHandle;
  turnId: string;
  userMessageId?: string;
}

/** 四方法门槛：缺一静默返回。 */
const gateSatisfied = (candidate: Partial<UsageStorePort> | undefined): boolean =>
  Boolean(
    candidate &&
    candidate.recordModelUsage &&
    candidate.upsertTurnUsage &&
    candidate.upsertToolUsage &&
    candidate.pruneUsage,
  );

const usagePortOf = (runtime: AgentRuntimeInternal): UsageStorePort | undefined => {
  const candidate = runtime.sessionStore as unknown as Partial<UsageStorePort> | undefined;
  return gateSatisfied(candidate) ? (candidate as UsageStorePort) : undefined;
};

/** 逻辑身份先冻结再取来源（两处兜底分隔符：`_` 与 `:`）。 */
const modelFactId = (input: ModelUsageFactInput): string => {
  const fallbackLogical = `${input.querySource}_${input.startedAt}`;
  const logical = input.assistantMessageId ?? input.traceContext.spanId ?? fallbackLogical;
  const attempt = input.attemptIndex ?? 0;
  return `usage_model_${input.querySource}_${logical}_${attempt}`;
};

/** 模型事实写入（失败只 warn 吞掉）。 */
export async function writeModelUsageFact(
  runtime: AgentRuntimeInternal,
  input: ModelUsageFactInput,
): Promise<void> {
  const store = usagePortOf(runtime);
  if (!store) return;
  const completedAt = clockNow();
  const usage = input.result?.usage;
  const network = modelNetworkObservations({
    events: input.events.slice(input.networkEventStartIndex),
  });
  const retryCount = network.filter((item) => item.type === "model_retry_scheduled").length;
  const failed = network.findLast((item) => item.type === "model_request_failed");
  const firstTokenAt = firstModelTokenAt({
    events: input.events,
    startIndex: input.networkEventStartIndex,
  });
  const durationMs = completedAt - input.startedAt;
  const errorInfo = usageErrorInfo({ error: input.error, failed });
  const contextExceeded =
    isModelContextExceededError(input.error) || failed?.reason === "context_exceeded";
  try {
    const record = {} as Record<string, unknown>;
    record.id = modelFactId(input);
    record.logicalRequestId =
      input.assistantMessageId ??
      input.traceContext.spanId ??
      `${input.querySource}:${input.startedAt}`;
    record.attemptIndex = input.attemptIndex;
    record.sessionID = runtime.sessionId;
    record.turnID = input.traceContext.turnId;
    record.traceID = input.traceContext.traceId;
    record.spanID = input.traceContext.spanId;
    record.assistantMessageID = input.assistantMessageId;
    record.parentUserMessageID = input.parentUserMessageId;
    record.querySource = input.querySource;
    record.providerId = input.model.providerId;
    record.modelId = input.model.modelId;
    record.reasoningLevel = input.model.options?.reasoningLevel;
    record.agent = runtime.config.agentName ?? "agent";
    record.mode = runtime.config.mode ?? "build";
    record.taskType = runtime.config.taskType ?? "interactive";
    record.status = input.status;
    record.startedAt = input.startedAt;
    record.firstTokenAt = firstTokenAt;
    record.completedAt = completedAt;
    record.durationMs = durationMs;
    record.timeToFirstTokenMs =
      firstTokenAt === undefined ? undefined : firstTokenAt - input.startedAt;
    record.finishReason = input.result?.finishReason;
    record.toolCallCount = input.toolCallCount ?? 0;
    record.inputTokens = usage?.inputTokens;
    record.outputTokens = usage?.outputTokens;
    record.reasoningTokens = usage?.reasoningTokens;
    record.cacheCreationInputTokens = usage?.cacheWriteTokens;
    record.cacheReadInputTokens = usage?.cacheReadTokens;
    record.providerTotalTokens = usage?.totalTokens;
    record.retryCount = retryCount;
    record.retryable = errorInfo.retryable ?? retryCount > 0;
    record.cancelledByUser = input.status === CANCELLED_STATUS;
    record.contextExceeded = contextExceeded;
    record.errorType = errorInfo.type;
    record.errorCode = errorInfo.code;
    record.errorMessage = errorInfo.message;
    record.rawUsage = usage;
    record.providerMetadata = input.result?.providerMetadata;
    await store.recordModelUsage(record as never);
  } catch (error) {
    runtime.logger?.warn(WRITE_FAIL_TEXT.model, {
      ...traceContextToLogContext(input.traceContext),
      errorMessage: describeError(error),
      event: WRITE_FAIL_TEXT.modelEvent,
      module: WRITE_FAIL_TEXT.module,
      status: FAILED_TAG,
    });
  }
}

/** 回合事实写入（失败只 warn 吞掉）。 */
export async function writeTurnUsageFact(
  runtime: AgentRuntimeInternal,
  input: TurnUsageFactInput,
): Promise<void> {
  const store = usagePortOf(runtime);
  if (!store) return;
  const summary = createModelUsageSummaryFromEvents(input.events as never);
  const modelRequests = input.events.filter(
    (event) => event.type === SessionEventType.ModelRequest,
  );
  const firstModelStartAt = modelRequests[0]?.timestamp.getTime();
  const firstTokenAt = firstModelTokenAt({ events: input.events, startIndex: 0 });
  const scheduled = new Set<unknown>();
  const errored = new Set<unknown>();
  for (const event of input.events) {
    const payload = event.payload as PayloadRead;
    if (event.type === SessionEventType.ToolCallScheduled && payload.toolCallId) {
      scheduled.add(payload.toolCallId);
    }
    if (event.type === SessionEventType.ToolCallError && payload.toolCallId) {
      errored.add(payload.toolCallId);
    }
  }
  const errorInfo = usageErrorInfo({ error: input.error, failed: undefined });
  try {
    const record = {} as Record<string, unknown>;
    record.sessionID = runtime.sessionId;
    record.turnID = input.turnId;
    record.traceID = input.traceContext.traceId;
    record.userMessageID = input.userMessageId;
    record.status = input.status;
    record.startedAt = input.startedAt;
    record.firstModelStartAt = firstModelStartAt;
    record.firstTokenAt = firstTokenAt;
    record.completedAt = input.completedAt;
    record.durationMs = input.completedAt - input.startedAt;
    record.timeToFirstTokenMs =
      firstTokenAt === undefined ? undefined : firstTokenAt - input.startedAt;
    record.modelRequestCount = modelRequests.length;
    record.modelRetryCount = modelNetworkObservations({ events: input.events }).filter(
      (item) => item.type === "model_retry_scheduled",
    ).length;
    record.toolCallCount = scheduled.size;
    record.toolErrorCount = errored.size;
    record.inputTokens = summary?.inputTokens;
    record.outputTokens = summary?.outputTokens;
    record.reasoningTokens = summary?.reasoningTokens;
    record.cacheCreationInputTokens = summary?.cacheWriteTokens;
    record.cacheReadInputTokens = summary?.cacheReadTokens;
    record.computedTotalTokens = summary?.totalTokens;
    record.retryable = errorInfo.retryable;
    record.cancelledByUser = input.status === CANCELLED_STATUS;
    record.contextExceeded = isModelContextExceededError(input.error);
    record.errorType = errorInfo.type;
    record.errorCode = errorInfo.code;
    await store.upsertTurnUsage(record as never);
  } catch (error) {
    runtime.logger?.warn(WRITE_FAIL_TEXT.turn, {
      ...traceContextToLogContext(input.traceContext),
      errorMessage: describeError(error),
      event: WRITE_FAIL_TEXT.turnEvent,
      module: WRITE_FAIL_TEXT.module,
      status: FAILED_TAG,
    });
  }
}

/** 工具事实写入（按事件类型分派成对账形状；失败只 warn 吞掉）。 */
export async function writeToolUsageFact(
  runtime: AgentRuntimeInternal,
  record: SessionEvent,
  traceContext: TraceContext,
): Promise<void> {
  const store = usagePortOf(runtime);
  if (!store) return;
  const payload = record.payload as PayloadRead;
  const toolCallId = nonemptyString({ value: payload.toolCallId });
  if (!toolCallId) return;
  const toolName = nonemptyString({ value: payload.toolName }) ?? UNKNOWN_TOOL;
  const metadata = runtime.registry.get(toolName)?.metadata;
  const startedAt = record.timestamp.getTime();
  const base = {} as Record<string, unknown>;
  base.id = `usage_tool_${runtime.sessionId}_${toolCallId}`;
  base.sessionID = runtime.sessionId;
  base.turnID = record.turnId ?? traceContext.turnId;
  base.traceID = record.traceId ?? traceContext.traceId;
  base.toolCallID = toolCallId;
  base.toolName = toolName;
  base.sideEffectScope = metadata?.sideEffectScope;
  base.readOnly = metadata?.readOnly;
  base.destructive = metadata?.destructive;
  base.startedAt = startedAt;
  try {
    const write = async (extra: Record<string, unknown>): Promise<void> => {
      await store.upsertToolUsage({ ...base, ...extra } as never);
    };
    switch (record.type) {
      case SessionEventType.ToolCallScheduled:
        await write({ status: "running", approvalStatus: "none" });
        return;
      case SessionEventType.PermissionRequested:
        await write({ status: "running", approvalStatus: "requested" });
        return;
      case SessionEventType.PermissionResolved: {
        const decision = nonemptyString({ value: payload.decision });
        await write({
          status: "running",
          approvalStatus: decision === "deny" ? "denied" : "allowed",
        });
        return;
      }
      case SessionEventType.PermissionDenied:
        await write({ status: "error", approvalStatus: "denied" });
        return;
      case SessionEventType.ToolCallStarted: {
        const stamped = payload.startedAt;
        const fromPayload = stamped instanceof Date ? stamped.getTime() : startedAt;
        await write({ startedAt: fromPayload, status: "running" });
        return;
      }
      case SessionEventType.ToolCallProgress: {
        const outputBytes = usageCount({ value: payload.outputBytes });
        const stdoutBytes = usageCount({ value: payload.stdoutBytes });
        const stderrBytes = usageCount({ value: payload.stderrBytes });
        const emitted = outputBytes > 0 || stdoutBytes > 0 || stderrBytes > 0;
        await write({
          status: "running",
          firstOutputAt: emitted ? record.timestamp.getTime() : undefined,
          outputBytes,
          stdoutBytes,
          stderrBytes,
        });
        return;
      }
      case SessionEventType.ToolCallResult: {
        const result = payload.result as
          | {
              perf?: { detail?: { kind?: string; command?: { exitCode?: unknown } } };
              returnedBytes?: unknown;
              originalBytes?: unknown;
              truncated?: unknown;
            }
          | undefined;
        const detail = result?.perf?.detail;
        const command = detail?.kind === "command" ? detail.command : undefined;
        await write({
          status: "completed",
          completedAt: record.timestamp.getTime(),
          durationMs: usageCount({ value: payload.duration }),
          exitCode: usageCount({ value: command?.exitCode }),
          outputBytes: usageCount({ value: result?.returnedBytes ?? result?.originalBytes }),
          truncated: result?.truncated === true,
        });
        return;
      }
      case SessionEventType.ToolCallError: {
        const failure = payload.error as
          | { type?: unknown; code?: unknown; message?: unknown }
          | undefined;
        const errorType =
          nonemptyString({ value: failure?.type }) ?? CoreErrorType.ToolExecutionFailed;
        const userCancelled = errorType.includes("cancel");
        await write({
          status: userCancelled ? CANCELLED_STATUS : "error",
          completedAt: record.timestamp.getTime(),
          cancelledByUser: userCancelled,
          errorType,
          errorCode: nonemptyString({ value: failure?.code }),
          errorMessage: nonemptyString({ value: failure?.message }),
        });
        return;
      }
      default:
        return;
    }
  } catch (error) {
    runtime.logger?.warn(WRITE_FAIL_TEXT.tool, {
      ...traceContextToLogContext(traceContext),
      errorMessage: describeError(error),
      event: WRITE_FAIL_TEXT.toolEvent,
      module: WRITE_FAIL_TEXT.module,
      status: FAILED_TAG,
      toolCallId,
    });
  }
}
