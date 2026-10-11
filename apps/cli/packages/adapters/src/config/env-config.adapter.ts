// SPDX-License-Identifier: Apache-2.0
// 环境变量配置：把刻意收窄的 KNORVIA_* 变量面解析成配置补丁。
import type { RuntimeConfigPatch } from "@knorvia/contracts";

interface EnvConfigOptions {
  prefix?: string;
}

const DEFAULT_PREFIX = "KNORVIA_";
const TEXT_LOG_FORMAT = "text";
const JSON_LOG_FORMAT = "json";
const DEFAULT_TOOL_CONCURRENCY = "10";
const TOOL_CONCURRENCY_ENV = "KNORVIA_MAX_TOOL_CONCURRENCY";

/** 环境变量名（去掉前缀后）→ 写入配置的落点。 */
type Placement = (patch: RuntimeConfigPatch, value: string) => void;

function intoStorage(field: "dir" | "sessionDbPath"): Placement {
  return (patch, value) => {
    if (!patch.storage) patch.storage = {};
    patch.storage[field] = value;
  };
}

function intoNetwork(field: "httpProxy" | "noProxy" | "caCertFile" | "timeout"): Placement {
  return (patch, value) => {
    if (!patch.network) patch.network = {};
    if (field === "timeout") patch.network.timeout = normalizeNumber(value);
    else patch.network[field] = value;
  };
}

const PLACEMENTS = new Map<string, Placement>([
  ["STORAGE_DIR", intoStorage("dir")],
  ["SESSION_DB_PATH", intoStorage("sessionDbPath")],
  ["SESSION_DB", intoStorage("sessionDbPath")],
  ["HTTP_PROXY", intoNetwork("httpProxy")],
  ["NO_PROXY", intoNetwork("noProxy")],
  ["AGENT_CA_CERT", intoNetwork("caCertFile")],
  ["HTTP_TIMEOUT", intoNetwork("timeout")],
  ["TIMEOUT", intoNetwork("timeout")],
  [
    "LOG_FORMAT",
    (patch, value) => {
      if (!patch.logging) patch.logging = {};
      patch.logging.format = normalizeLogFormat(value);
    },
  ],
  [
    "MAX_TOOL_CONCURRENCY",
    (patch, value) => {
      if (!patch.toolConcurrency) patch.toolConcurrency = {};
      patch.toolConcurrency.maxConcurrency = normalizeNumber(value);
    },
  ],
]);

/** 只认识表里的变量名；未列出的 KNORVIA_* 一律忽略。 */
export function parseEnvConfig(
  env: Record<string, string | undefined> = process.env,
  options: EnvConfigOptions = {},
): RuntimeConfigPatch {
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const patch: RuntimeConfigPatch = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || !name.startsWith(prefix)) continue;
    const placement = PLACEMENTS.get(name.slice(prefix.length));
    if (placement === undefined) continue;
    placement(patch, value);
  }
  return patch;
}

/** 工具并发上限：每次调用都重读环境变量，非法值归零。 */
export function getToolConcurrencyConfig(): { maxConcurrency: number } {
  const raw = process.env[TOOL_CONCURRENCY_ENV] ?? DEFAULT_TOOL_CONCURRENCY;
  return { maxConcurrency: normalizeNumber(raw) };
}

function normalizeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeLogFormat(value: string): "text" | "json" {
  const lowered = value.toLowerCase();
  return lowered === JSON_LOG_FORMAT ? JSON_LOG_FORMAT : TEXT_LOG_FORMAT;
}
