// SPDX-License-Identifier: Apache-2.0
// 会话借用面的冻结形状：入参、借用句柄与准备入参。
//
// 合同 interface.md 逐字列出这些名字，所以它们集中声明在一个纯声明模块里；
// 实现模块（bootstrap.ts）只引用，不再重复声明一遍。
import type {
  AgentExecutionTelemetryPort,
  ModelExecutionTelemetryPort,
  TelemetryResourceContext,
  ModelApiRuntimeSurface,
} from "@knorvia/contracts/telemetry";
import type { AgentTelemetryRuntimeOwner } from "@knorvia/contracts/telemetry";
import type { ModelStatusSink } from "@knorvia/contracts/model";

/** 取遥测借用句柄的入参。 */
export interface CreateModelTelemetryOptions {
  owner?: AgentTelemetryRuntimeOwner;
  sessionId?: string;
}

/** 借用句柄：两个 Port、启用标志、可选 statusSink 与会话级关闭。 */
export interface ModelTelemetryBootstrap {
  agentExecution: AgentExecutionTelemetryPort;
  enabled: boolean;
  modelExecution: ModelExecutionTelemetryPort;
  statusSink?: ModelStatusSink;
  shutdown(): Promise<void>;
}

/** 准备入参：版本信息与告警口由调用方给，实现模块不读 process.env。 */
export interface PrepareModelTelemetryOptions {
  buildCommitId?: string;
  cliVersion?: string;
  onWarning?: (message: string, context: Record<string, unknown>) => void;
  productVersion?: string;
  runtimeDistribution?: TelemetryResourceContext["runtimeDistribution"];
  runtimeSurface?: ModelApiRuntimeSurface;
}
