// SPDX-License-Identifier: Apache-2.0
// 遥测 Owner 的生命周期。
//
// 这是一个显式的三态机：
//   dormant --prepare()--> preparing --构造成功--> ready --shutdown()--> dormant
//                                   \--构造失败--> dormant（noop）
// 两个模块级变量就够表达：已就绪的 Owner 与进行中的构造。
//
// 相关的纯取值逻辑分住两处：身份与资源属性在 owner-identity，匿名安装标识在
// owner-installation。本模块只做状态迁移与接入参数装配。
import type {
  AgentTelemetryRuntimeOwner,
  TelemetryIdentitySnapshot,
} from "@knorvia/contracts/telemetry";
import type { EnvRecord } from "./env-record.js";
import { bestEffort } from "./gates.js";
import { identityFromEnv, resourceFromEnv, type ResourceInputs } from "./owner-identity.js";
import {
  DEVICE_MID_ENV,
  installationIdFromEnv,
  resolveInstallationId,
  normalizeInstallationId,
} from "./owner-installation.js";
export { normalizeInstallationId };
import {
  parseOtlpHeaders,
  resolveOtlpMetricEndpoint,
  resolveOtlpTraceEndpoint,
} from "./otlp-endpoints.js";

/** 启用开关的精确取值；其余一律视为关闭。 */
const ENABLED_VALUE = "1";
/** Owner 关闭与会话 flush 的超时。 */
export const FLUSH_TIMEOUT_MS = 1_500;

/** 准备入参：版本信息与告警口由调用方给，本模块不读 process.env。 */
export type PrepareOptions = ResourceInputs & {
  onWarning?: (message: string, context: Record<string, unknown>) => void;
};

/** 已就绪的 Owner 与进行中的构造：两个变量就是状态机的全部状态。 */
let ready: AgentTelemetryRuntimeOwner | undefined;
let preparing: Promise<AgentTelemetryRuntimeOwner | undefined> | undefined;

/** 当前已就绪的 Owner；同步 App 工厂只读这一个。 */
export function currentOwner(): AgentTelemetryRuntimeOwner | undefined {
  return ready;
}

/** 关闭并清空单例；未准备时是空操作。 */
export async function closeOwner(): Promise<void> {
  const owner = ready ?? (await preparing);
  ready = undefined;
  preparing = undefined;
  await owner?.shutdown({ timeoutMs: FLUSH_TIMEOUT_MS });
}

/** 身份变化转交 Owner；未就绪时是空操作。 */
export function forwardIdentity(snapshot: TelemetryIdentitySnapshot): void {
  ready?.updateIdentity(snapshot);
}

/**
 * 准备入口：决定是否启用、补齐安装标识、按需构造 Owner。
 * 未启用时原样返回同一个 env 对象（调用方可以按对象身份判断有没有被触碰）。
 */
export async function prepareOwner(env: EnvRecord, options: PrepareOptions): Promise<EnvRecord> {
  if (env.KNORVIA_MODEL_TELEMETRY_ENABLED !== ENABLED_VALUE) return env;
  if (resolveOtlpTraceEndpoint(env) === undefined) return env;

  const declared = installationIdFromEnv(env);
  const installationId = declared ?? (await resolveInstallationId(env.KNORVIA_HOME));
  const prepared =
    installationId === undefined ? env : { ...env, [DEVICE_MID_ENV]: installationId };

  if (ready === undefined && preparing === undefined) preparing = construct(prepared, options);
  ready = await preparing;
  return prepared;
}

/** 构造 Owner：先解析全部接入参数，再动态 import 导出层（disabled 路径因此不加载 SDK）。 */
async function construct(
  env: EnvRecord,
  options: PrepareOptions,
): Promise<AgentTelemetryRuntimeOwner | undefined> {
  const endpoint = resolveOtlpTraceEndpoint(env);
  if (endpoint === undefined) return undefined;
  const commonHeaders = env.OTEL_EXPORTER_OTLP_HEADERS;
  // 两侧接入参数各自可覆盖：专用 header 存在时优先，否则共用公共 header。
  const traceHeaders = parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_TRACES_HEADERS ?? commonHeaders);
  const metricHeaders = parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_METRICS_HEADERS ?? commonHeaders);
  const runtimeModule = await bestEffort(() => import("./otlp-exporter.js"));
  if (runtimeModule === undefined) {
    options.onWarning?.("Agent telemetry runtime initialization failed", {
      errorType: "ImportError",
    });
    return undefined;
  }
  return bestEffort(async () =>
    runtimeModule.createOwnedAgentTelemetryRuntime({
      endpoint,
      headers: traceHeaders,
      identity: identityFromEnv(env),
      metricEndpoint: resolveOtlpMetricEndpoint(env),
      metricHeaders,
      onWarning: options.onWarning,
      resource: resourceFromEnv(env, options),
    }),
  );
}
