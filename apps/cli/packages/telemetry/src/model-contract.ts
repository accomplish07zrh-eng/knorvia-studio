// SPDX-License-Identifier: Apache-2.0
// 模型调用观测的冻结形状：构造入参与对外类声明。
//
// 合同 interface.md 逐字列出这些名字，因此它们集中在一个纯声明模块里；
// 实现模块（model-api-recorder.ts）只引用，不再重复声明。
import type { ModelExecutionTelemetryPort } from "@knorvia/contracts/telemetry";

/** 构造入参：容量上限、时间源、指标出口与告警口。 */
export interface ModelApiTelemetryStatusSinkOptions {
  maxActiveCallAgeMs?: number;
  maxActiveCalls?: number;
  modelExecution: ModelExecutionTelemetryPort;
  now?: () => number;
  onWarning?: (message: string, context: Record<string, unknown>) => void;
}
