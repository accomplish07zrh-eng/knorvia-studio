// SPDX-License-Identifier: Apache-2.0
// OTLP 接入点与 header 的解析。
//
// 三个键（专用 trace / 专用 metric / 公共）构成一张二维表：先按信号取专用键，
// 缺席再看公共键并按信号补路径。解析器只读传入的环境记录，不缓存、不读 process.env。
import type { EnvRecord } from "./env-record.js";

/** 信号的两种取值：决定专用键名与公共端点要补的路径。 */
type Signal = "metric" | "trace";

/** 一张小表：信号 → 专用环境键 + 公共端点后追加的路径。 */
const SIGNAL_KEYS: Readonly<Record<Signal, { path: string; dedicated: string }>> = {
  metric: { dedicated: "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", path: "/v1/metrics" },
  trace: { dedicated: "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", path: "/v1/traces" },
};

/** URI 解析的两种结局：要么拿到 URL 对象，要么没有。 */
function urlOf(raw: string | undefined): URL | undefined {
  const candidate = raw?.trim();
  if (candidate === undefined || candidate === "") return undefined;
  try {
    const parsed = new URL(candidate);
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    return isHttp ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** 专用端点的两种状态：没配（可以回落）与配了（成功或失败都不再回落）。 */
type Dedicated = { configured: false } | { configured: true; url?: string };

/** 判读专用端点：出现非空文本即算「配了」，此时解析失败也不回落公共端点。 */
function dedicatedOf(raw: string | undefined): Dedicated {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === "") return { configured: false };
  const parsed = urlOf(trimmed);
  return parsed === undefined ? { configured: true } : { configured: true, url: parsed.toString() };
}

/** 专用端点优先；没配才用公共端点 + 信号路径。 */
function endpointFor(signal: Signal, env: EnvRecord): string | undefined {
  const dedicated = dedicatedOf(env[SIGNAL_KEYS[signal].dedicated]);
  if (dedicated.configured) return dedicated.url;
  return commonFor(signal, env);
}

/** 公共端点 + 信号路径；公共端点没配或非法时返回 undefined。 */
function commonFor(signal: Signal, env: EnvRecord): string | undefined {
  const common = urlOf(env.OTEL_EXPORTER_OTLP_ENDPOINT);
  if (common === undefined) return undefined;
  common.pathname = `${common.pathname.replace(/\/$/u, "")}${SIGNAL_KEYS[signal].path}`;
  return common.toString();
}

/** trace 接入点。 */
export function resolveOtlpTraceEndpoint(env: EnvRecord): string | undefined {
  return endpointFor("trace", env);
}

/**
 * metric 接入点。判定顺序固定：
 * 1. metric 专用端点配了就只看它（非法即无，不回落）；
 * 2. 否则公共端点 + `/v1/metrics`（配了但非法同样不回落）；
 * 3. 两者都没配时才沿用 trace 接入点 —— 同一段 OTLP 网关常常既收 trace 也收 metric。
 */
export function resolveOtlpMetricEndpoint(env: EnvRecord): string | undefined {
  const dedicated = dedicatedOf(env[SIGNAL_KEYS.metric.dedicated]);
  if (dedicated.configured) return dedicated.url;
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) return commonFor("metric", env);
  return endpointFor("trace", env);
}

/** 一条 `key=value` 的判读结果。 */
interface HeaderPair {
  key: string;
  value: string;
}

/** 解码百分号；失败保留原串（不因此丢弃整条 header）。 */
function percentDecoded(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** 单条 `key=value`：只按首个 `=` 分割，值里允许再出现 `=`。 */
function headerPairOf(rawPair: string): HeaderPair | undefined {
  const cut = rawPair.indexOf("=");
  if (cut <= 0) return undefined;
  const key = percentDecoded(rawPair.slice(0, cut).trim());
  const value = percentDecoded(rawPair.slice(cut + 1).trim());
  if (key === "" || value === "") return undefined;
  return { key, value };
}

/**
 * `key=value` 列表 → header 表。
 * 空键、空值与没有分隔符的项都被丢掉；结果为空返回 undefined。
 */
export function parseOtlpHeaders(value: string | undefined): Record<string, string> | undefined {
  const pairs = (value ?? "")
    .split(",")
    .map(headerPairOf)
    .filter((pair): pair is HeaderPair => pair !== undefined);
  if (pairs.length === 0) return undefined;
  return Object.fromEntries(pairs.map((pair) => [pair.key, pair.value]));
}
