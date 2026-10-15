// SPDX-License-Identifier: Apache-2.0
// 模型网络状态 sink 入口：五步 publish 与七类状态日志在 support/status-log-table.ts，
// 这里接线运行时端口面（建事件、持久化、日志器与回调）。
import type {
  ModelNetworkStatusEvent,
  ModelStatusSink,
  ModelStreamRecoveryStatus,
  SessionEvent,
  TraceContext,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { createStatusSink, writeStatusLog } from "./support/status-log-table.js";

interface ModelStatusSinkOptions {
  onStatus?: (event: ModelNetworkStatusEvent) => void;
  streamRecovery?: ModelStreamRecoveryStatus;
}

export function createModelStatusSink(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
  events: SessionEvent[],
  options: ModelStatusSinkOptions = {},
): ModelStatusSink {
  return createStatusSink(
    {
      onStatus: options.onStatus as ((payload: Record<string, unknown>) => void) | undefined,
      streamRecovery: options.streamRecovery,
      createEvent: (type, payload, trace) => this.createEvent(type as never, payload, trace),
      appendEvent: (event, trace) => this.appendEvent(event, trace),
      log: (statusEvent, trace) => {
        this.logModelNetworkStatus(statusEvent as never, trace);
      },
    },
    traceContext,
    events,
  ) as unknown as ModelStatusSink;
}

export function logModelNetworkStatus(
  this: AgentRuntimeInternal,
  statusEvent: ModelNetworkStatusEvent,
  traceContext: TraceContext,
): void {
  const logger = this.logger;
  if (logger === undefined) return;
  writeStatusLog(
    {
      debug: (message, fields) => logger.debug(message, fields),
      info: (message, fields) => logger.info(message, fields),
      warn: (message, fields) => logger.warn(message, fields),
    },
    statusEvent as unknown as Record<string, unknown>,
    traceContext,
  );
}
