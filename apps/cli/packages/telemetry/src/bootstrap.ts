// SPDX-License-Identifier: Apache-2.0
// 会话借用进程级 Owner 的入口。
//
// 所有权边界：Owner 归进程所有（准备/关闭都在 owner-lifecycle.ts），Session 只借它的
// 两个 Port 与 statusSink；关闭 Session 可以 flush，但不能关闭 Provider、Exporter 或
// Context Manager —— 别的 Session 还在用。
//
// 声明形状在 bootstrap-contract.ts；本模块只写行为：借句柄、转交准备/关闭/身份。
import type { AgentTelemetryRuntimeOwner } from "@knorvia/contracts/telemetry";
import type { EnvRecord } from "./env-record.js";
import { NoopAgentExecutionTelemetry } from "./noop-writers.js";
import {
  FLUSH_TIMEOUT_MS,
  closeOwner,
  currentOwner,
  forwardIdentity,
  normalizeInstallationId,
  prepareOwner,
} from "./owner-lifecycle.js";
import {
  parseOtlpHeaders,
  resolveOtlpMetricEndpoint,
  resolveOtlpTraceEndpoint,
} from "./otlp-endpoints.js";
import type {
  CreateModelTelemetryOptions,
  ModelTelemetryBootstrap,
  PrepareModelTelemetryOptions,
} from "./bootstrap-contract.js";

export type { CreateModelTelemetryOptions, ModelTelemetryBootstrap, PrepareModelTelemetryOptions };

/** 进程未启用遥测时借给所有 Session 的单例。 */
const noopExecution = new NoopAgentExecutionTelemetry();

/** 关闭态没有资源可释放。 */
async function nothingToRelease(): Promise<void> {
  // 借用句柄不持有任何资源。
}

/** 会话级关闭：先按会话放弃在册调用，再 flush（顺序固定，避免把已放弃的调用刷成完成）。 */
async function releaseFor(owner: AgentTelemetryRuntimeOwner, sessionId?: string): Promise<void> {
  if (sessionId) owner.abandonSession(sessionId);
  await owner.flush({ timeoutMs: FLUSH_TIMEOUT_MS });
}

/** 借用句柄的两种形态：没有 Owner 时是关闭态 noop，有 Owner 时透传。 */
function borrowFrom(owner: AgentTelemetryRuntimeOwner | undefined): ModelTelemetryBootstrap {
  // 没有 Owner：两侧共用同一个 noop 实例（它没有状态，不需要区分 agent/model）。
  if (owner === undefined) {
    const disabled: Partial<ModelTelemetryBootstrap> = { shutdown: nothingToRelease };
    disabled.agentExecution = noopExecution;
    disabled.modelExecution = noopExecution;
    disabled.enabled = false;
    return disabled as ModelTelemetryBootstrap;
  }
  const borrowed: Partial<ModelTelemetryBootstrap> = { enabled: owner.enabled };
  borrowed.agentExecution = owner.agentExecution;
  borrowed.modelExecution = owner.modelExecution;
  borrowed.statusSink = owner.statusSink;
  borrowed.shutdown = () => releaseFor(owner);
  return borrowed as ModelTelemetryBootstrap;
}

/**
 * 取当前进程的遥测借用句柄。
 * 显式注入的 owner 优先；否则用已准备的进程 Owner；都没有就是 noop。
 */
export function createModelTelemetry(
  options: CreateModelTelemetryOptions = {},
): ModelTelemetryBootstrap {
  const owner = options.owner ?? currentOwner();
  const borrowed = borrowFrom(owner);
  if (owner === undefined || options.sessionId === undefined) return borrowed;
  // 有 sessionId 时覆盖关闭动作：先放弃该会话的在册调用，再 flush。
  return { ...borrowed, shutdown: () => releaseFor(owner, options.sessionId) };
}

/** 见 B27：只在显式启用且存在合法 trace 端点时才准备 Owner。 */
export function prepareModelTelemetryEnv(
  env: EnvRecord,
  options: PrepareModelTelemetryOptions = {},
): Promise<EnvRecord> {
  return prepareOwner(env, options);
}

/** 关闭进程级 Owner；之后的准备会重新构造。 */
export function shutdownPreparedModelTelemetry(): Promise<void> {
  return closeOwner();
}

/** 身份变化转交 Owner；未准备时是空操作。 */
export function updatePreparedTelemetryIdentity(
  snapshot: Parameters<AgentTelemetryRuntimeOwner["updateIdentity"]>[0],
): void {
  forwardIdentity(snapshot);
}

// 入口按 B24 的 17 个名字暴露；这几个是 env 解析与身份规则的再导出，不多不少。
export { parseOtlpHeaders, resolveOtlpMetricEndpoint, resolveOtlpTraceEndpoint };
export { normalizeInstallationId as normalizeTelemetryDeviceMid };
