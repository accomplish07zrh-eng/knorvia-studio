// SPDX-License-Identifier: Apache-2.0
// 模型网络状态 sink 与状态日志：publish 固定五步（并入恢复信息 → 回调 → 日志 → 持久化 → 入数组），
// 日志在持久化之前。七类状态各自的级别/文案/事件名逐字钉在常量表里，投影器只做字段搬运。
import { SessionEventType, traceContextToLogContext } from "../../deps.js";
import type { SessionEvent, TraceContext } from "../../deps.js";

const LOG_MODULE = "core.runtime";

/** 状态取值常量（逐字）。 */
const WAITING_STATUS = "waiting";
const STARTED_STATUS = "started";
const COMPLETED_STATUS = "completed";
const FAILED_STATUS = "failed";
const CANCELLED_STATUS = "cancelled";

/** 七类状态的日志标签（逐字）。 */
const QUEUED_LABEL = "Model network request queued for admission";
const ADMITTED_LABEL = "Model network request admitted";
const STARTED_LABEL = "Model network request started";
const COMPLETED_LABEL = "Model network request completed";
const FAILED_LABEL = "Model network request failed";
const RETRY_LABEL = "Model network retry scheduled";
const STALLED_LABEL = "Model network stream stalled";

/** 七类状态的日志事件名（逐字）。 */
const QUEUED_EVENT = "model.network.queued";
const ADMITTED_EVENT = "model.network.admitted";
const STARTED_EVENT = "model.network.started";
const COMPLETED_EVENT = "model.network.completed";
const FAILED_EVENT = "model.network.failed";
const RETRY_EVENT = "model.network.retry_scheduled";
const STALLED_EVENT = "model.network.stream_stalled";

type LogFields = Record<string, unknown>;
type StatusLevel = "debug" | "info" | "warn";
type StatusProjector = (statusEvent: LogFields) => LogFields;

/** 一类状态的日志画像。 */
interface StatusProfile {
  level: StatusLevel;
  label: string;
  project: StatusProjector;
}

const profile = (level: StatusLevel, label: string, project: StatusProjector): StatusProfile => ({
  level,
  label,
  project,
});

const asRecord = (value: unknown): LogFields =>
  value !== null && typeof value === "object" ? (value as LogFields) : {};

/** 失败态的状态取值：取消单列，其余记失败。 */
const failureStatus = (reason: unknown): string =>
  reason === "cancelled" ? CANCELLED_STATUS : FAILED_STATUS;

/** 七类状态画像表：键即状态事件 type。 */
const STATUS_PROFILES = new Map<string, StatusProfile>([
  [
    "model_request_queued",
    profile("debug", QUEUED_LABEL, () => ({
      event: QUEUED_EVENT,
      module: LOG_MODULE,
      status: WAITING_STATUS,
    })),
  ],
  [
    "model_request_admitted",
    profile("debug", ADMITTED_LABEL, (statusEvent) => {
      const { queuedMs } = statusEvent;
      return {
        event: ADMITTED_EVENT,
        module: LOG_MODULE,
        queuedMs,
        status: STARTED_STATUS,
      };
    }),
  ],
  [
    "model_request_started",
    profile("debug", STARTED_LABEL, () => ({
      event: STARTED_EVENT,
      module: LOG_MODULE,
      status: STARTED_STATUS,
    })),
  ],
  [
    "model_request_completed",
    profile("info", COMPLETED_LABEL, (statusEvent) => {
      const { durationMs, finishReason } = statusEvent;
      return {
        durationMs,
        event: COMPLETED_EVENT,
        finishReason,
        module: LOG_MODULE,
        status: COMPLETED_STATUS,
      };
    }),
  ],
  [
    "model_request_failed",
    profile("warn", FAILED_LABEL, (statusEvent) => {
      const { durationMs, message, reason, retryable, statusCode } = statusEvent;
      return {
        durationMs,
        event: FAILED_EVENT,
        module: LOG_MODULE,
        reason,
        retryable,
        status: failureStatus(reason),
        statusCode,
        statusMessage: message,
      };
    }),
  ],
  [
    "model_retry_scheduled",
    profile("warn", RETRY_LABEL, (statusEvent) => {
      const { delayMs, message, nextAttempt, reason, statusCode } = statusEvent;
      return {
        delayMs,
        event: RETRY_EVENT,
        module: LOG_MODULE,
        nextAttempt,
        reason,
        status: WAITING_STATUS,
        statusCode,
        statusMessage: message,
      };
    }),
  ],
  [
    "model_stream_stalled",
    profile("warn", STALLED_LABEL, (statusEvent) => {
      const { idleMs, message, timeoutMs } = statusEvent;
      return {
        event: STALLED_EVENT,
        idleMs,
        module: LOG_MODULE,
        status: WAITING_STATUS,
        statusMessage: message,
        timeoutMs,
      };
    }),
  ],
]);

/** 公共元数据字段：每条状态日志都带（streamRecovery 四字段从事件上的恢复信息映射）。 */
export const commonStatusMetadata = (
  statusEvent: LogFields,
  traceContext: TraceContext,
): LogFields => {
  const recovery = asRecord(statusEvent.streamRecovery);
  return {
    ...traceContextToLogContext(traceContext),
    /** 第几次尝试发出该请求。 */
    attempt: statusEvent.attempt,
    /** 请求基址（含协议与主机）。 */
    baseURL: statusEvent.baseURL,
    /** 允许的最大尝试次数。 */
    maxAttempts: statusEvent.maxAttempts,
    /** 模型标识。 */
    modelId: statusEvent.modelId,
    /** 供应商标识。 */
    providerId: statusEvent.providerId,
    /** 供应商类别。 */
    providerKind: statusEvent.providerKind,
    /** 本次请求的追踪号。 */
    requestId: statusEvent.requestId,
    streamRecoveryAnchorId: recovery.anchorId,
    streamRecoveryFromRequestId: recovery.recoveredFromRequestId,
    streamRecoveryMaxRetries: recovery.maxRetries,
    streamRecoveryRetryNumber: recovery.retryNumber,
    /** 传输通道。 */
    transport: statusEvent.transport,
  };
};

/** 打一条状态日志：未知 type 只走公共元数据、不打类型日志。 */
export function writeStatusLog(
  sink: {
    debug: (message: string, fields: LogFields) => void;
    info: (message: string, fields: LogFields) => void;
    warn: (message: string, fields: LogFields) => void;
  },
  statusEvent: LogFields,
  traceContext: TraceContext,
): void {
  const found = STATUS_PROFILES.get(String(statusEvent.type));
  if (!found) return;
  sink[found.level](found.label, {
    ...commonStatusMetadata(statusEvent, traceContext),
    ...found.project(statusEvent),
  });
}

/** sink 构造入参：回调、恢复信息与端口面。 */
export interface StatusSinkSpec {
  /** 状态回调（先于日志与持久化）。 */
  onStatus?: (payload: LogFields) => void;
  /** 构造级恢复信息（并入每个载荷）。 */
  streamRecovery?: unknown;
  /** 建事件端口。 */
  createEvent: (type: string, payload: unknown, traceContext: TraceContext) => SessionEvent;
  /** 持久化端口。 */
  appendEvent: (event: SessionEvent, traceContext: TraceContext) => Promise<void>;
  /** 日志端口。 */
  log: (statusEvent: LogFields, traceContext: TraceContext) => void;
}

/** 状态 sink：publish 固定五步，一次一个状态事件。 */
export function createStatusSink(
  spec: StatusSinkSpec,
  traceContext: TraceContext,
  events: SessionEvent[],
): { publish(statusEvent: LogFields): Promise<void> } {
  return {
    async publish(statusEvent) {
      const payload = spec.streamRecovery
        ? { ...statusEvent, streamRecovery: spec.streamRecovery }
        : statusEvent;
      spec.onStatus?.(payload);
      spec.log(payload, traceContext);
      const event = spec.createEvent(SessionEventType.ModelNetworkStatus, payload, traceContext);
      await spec.appendEvent(event, traceContext);
      events.push(event);
    },
  };
}
