// SPDX-License-Identifier: Apache-2.0
// @knorvia/telemetry 的公共入口。
//
// 运行期面固定为 17 个名字（合同 B24）：会话借用、准备/关闭、OTLP 解析、脱敏器与
// 两个类。`createOwnedAgentTelemetryRuntime` 不在入口——它只在启用后由 prepared-owner
// 动态加载，否则 SDK 会进入每个 CLI 启动的静态依赖图。
export { AgentExecutionTelemetryRuntime } from "./agent-trace-runtime.js";
export { NoopAgentExecutionTelemetry } from "./noop-writers.js";
export {
  createModelTelemetry,
  normalizeTelemetryDeviceMid,
  parseOtlpHeaders,
  prepareModelTelemetryEnv,
  resolveOtlpMetricEndpoint,
  resolveOtlpTraceEndpoint,
  shutdownPreparedModelTelemetry,
  updatePreparedTelemetryIdentity,
  type CreateModelTelemetryOptions,
  type ModelTelemetryBootstrap,
  type PrepareModelTelemetryOptions,
} from "./bootstrap.js";
export {
  claimSanitizedTelemetryError,
  sanitizeErrorMessage,
  sanitizeTelemetryError,
  type SanitizedTelemetryError,
} from "./error-sanitizer.js";
export { ModelApiTelemetryStatusSink } from "./model-api-recorder.js";
export {
  PROVIDER_ENDPOINT_SANITIZER_VERSION,
  ProviderEndpointIdentityCache,
  sanitizeProviderEndpoint,
} from "./provider-endpoint.js";
