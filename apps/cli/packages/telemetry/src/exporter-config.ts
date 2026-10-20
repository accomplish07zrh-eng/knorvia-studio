// SPDX-License-Identifier: Apache-2.0
// 导出端的配置数据：直方图边界、基数保护名单与资源属性取值。
//
// 这些是「导出时用到的常量与纯映射」，与装配流程无关，因此单独成模块：
// 装配代码只引用它们，数据变化不必碰流程。
//
// 写法上按「一列一个维度」组织：每个指标族的边界、每个属性来源各成一条数据，
// 组合逻辑放在末尾的函数里。
import { AggregationType, type ViewOptions } from "@opentelemetry/sdk-metrics";
import {
  TELEMETRY_SCHEMA_VERSION,
  type TelemetryResourceContext,
} from "@knorvia/contracts/telemetry";

/** 一个 View 允许的序列基数上限。 */
export const CARDINALITY_LIMIT = 250;
/** 资源属性里的固定标识。 */
export const SCHEMA_OWNER = "cli";

/** 指标族 → 桶边界。`*` 是通配，按 OTel View 的语义匹配。 */
const DURATION_BUCKETS: Readonly<Record<string, readonly number[]>> = {
  "knorvia.agent.step.duration": [0.01, 0.05, 0.1, 0.5, 1, 5, 30, 120, 300, 600],
  "knorvia.agent.turn.duration": [1, 5, 10, 30, 60, 300, 600],
  "knorvia.command.execution.duration": [0.01, 0.05, 0.1, 0.5, 1, 5, 30, 120, 300, 600],
  "knorvia.context.compaction.duration": [0.01, 0.05, 0.1, 0.5, 1, 5, 30, 120, 300, 600],
  "knorvia.detached.operation.duration": [0.01, 0.05, 0.1, 0.5, 1, 5, 30, 120, 300, 600],
  "knorvia.model.*.duration": [0.25, 1, 2, 5, 10, 30, 60, 120],
  "knorvia.model.call.attempts": [1, 2, 3, 5, 8],
  "knorvia.tool.execution.duration": [0.01, 0.1, 0.5, 1, 5, 30, 120, 300],
  "knorvia.*.time_to_first_*": [0.25, 0.5, 1, 2, 5, 10, 30, 60],
};

/** 只做基数保护、不改聚合方式的指标名。 */
const CARDINALITY_ONLY = [
  "knorvia.model.attempt.stream_stall.count",
  "knorvia.model.attempt.tokens",
  "knorvia.telemetry.abandoned.count",
  "knorvia.telemetry.creation_drop.count",
];

/** 一个显式桶直方图的 View。 */
function histogramView(instrumentName: string, boundaries: readonly number[]): ViewOptions {
  const aggregation = {
    options: { boundaries: [...boundaries], recordMinMax: false },
    type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
  };
  return { aggregation, aggregationCardinalityLimit: CARDINALITY_LIMIT, instrumentName };
}

/** 只限基数、不改聚合的 View。 */
function cardinalityView(instrumentName: string): ViewOptions {
  return { aggregationCardinalityLimit: CARDINALITY_LIMIT, instrumentName };
}

/** 直方图边界 + 基数保护的 View 表。 */
export function metricViews(): ViewOptions[] {
  const bucketViews = Object.keys(DURATION_BUCKETS).map((instrumentName) =>
    histogramView(instrumentName, DURATION_BUCKETS[instrumentName]),
  );
  const guarded = CARDINALITY_ONLY.map((instrumentName) => cardinalityView(instrumentName));
  return [...bucketViews, ...guarded];
}

/** CPU 架构的 OTel 约定写法。 */
function hostArchitecture(): string {
  const aliases: Readonly<Record<string, string>> = { ia32: "x86", x64: "amd64" };
  return aliases[process.arch] ?? process.arch;
}

/** 资源属性的三种来源：进程事实、服务身份、产品与运行时标识。 */
function runtimeFacts(): Record<string, string> {
  const facts: Record<string, string> = {};
  facts["host.arch"] = hostArchitecture();
  facts["os.type"] = process.platform;
  facts["process.runtime.name"] = "nodejs";
  facts["process.runtime.version"] = process.version.replace(/^v/u, "");
  return facts;
}

function serviceFacts(resource: TelemetryResourceContext): Record<string, string | undefined> {
  const facts: Record<string, string | undefined> = {};
  facts["deployment.environment.name"] = resource.deploymentEnvironment;
  facts["service.name"] = resource.serviceName;
  facts["service.version"] = resource.cliVersion;
  return facts;
}

/**
 * 产品与运行时标识。
 * 两个「每进程/每安装」ID 只给 Trace：进 Metric Resource 会在所有用户进程间制造无界基数。
 */
function productFacts(
  resource: TelemetryResourceContext,
  includeEphemeralIds: boolean,
): Record<string, string | undefined> {
  return {
    "knorvia.build.commit_id": resource.buildCommitId,
    "knorvia.device.installation_id": includeEphemeralIds ? resource.installationId : undefined,
    "knorvia.product.version": resource.productVersion,
    "knorvia.runtime.distribution": resource.runtimeDistribution,
    "knorvia.runtime.surface": resource.runtimeSurface,
    "service.instance.id": includeEphemeralIds ? resource.serviceInstanceId : undefined,
  };
}

/** 资源属性：各组来源合并后剔除空值。 */
export function resourceAttributes(
  resource: TelemetryResourceContext,
  includeEphemeralIds: boolean,
): Record<string, string | number> {
  const schema = {
    "knorvia.telemetry.schema_owner": SCHEMA_OWNER,
    "knorvia.telemetry.schema_version": TELEMETRY_SCHEMA_VERSION,
  };
  const merged: Record<string, string | number | undefined> = {
    ...runtimeFacts(),
    ...serviceFacts(resource),
    ...productFacts(resource, includeEphemeralIds),
    ...schema,
  };
  const kept: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === "") continue;
    kept[key] = value;
  }
  return kept;
}
