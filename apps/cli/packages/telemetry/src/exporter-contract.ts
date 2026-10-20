// SPDX-License-Identifier: Apache-2.0
// OTel Owner 的冻结形状：构造入参。
//
// 合同 interface.md 逐字列出它，因此集中声明在这里；实现模块只引用。
import type {
  TelemetryIdentitySnapshot,
  TelemetryResourceContext,
} from "@knorvia/contracts/telemetry";

/** 构造进程级 Owner 的入参。 */
export interface CreateOwnedAgentTelemetryRuntimeOptions {
  endpoint: string;
  headers?: Record<string, string>;
  identity?: TelemetryIdentitySnapshot;
  maxBatchSize?: number;
  maxQueueSize?: number;
  metricEndpoint?: string;
  metricExportIntervalMs?: number;
  metricHeaders?: Record<string, string>;
  onWarning?: (message: string, context: Record<string, unknown>) => void;
  resource: TelemetryResourceContext;
  timeoutMs?: number;
  traceSampleRatio?: number;
}
