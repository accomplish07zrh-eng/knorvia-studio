// SPDX-License-Identifier: Apache-2.0
// Attribute 闸门：外部给的字符串只有通过字符集与长度检查才能进入 Span。
//
// 取值种类用一张小表描述，判定函数共享同一条「折叠 → 截断 → 匹配」管线；
// 这样新增一种取值只要加一行数据，而不是复制一段 if。
import type { Attributes } from "@opentelemetry/api";
import type { AgentTelemetryExecutionContext } from "@knorvia/contracts/telemetry";

/** 控制字符：统一压成空格，避免换行把单行属性撑成多行。 */
const CONTROL_CHARS = /\p{Cc}+/gu;
/** 连续空白：压成一个空格。 */
const RUNS_OF_SPACE = /\s+/gu;

interface ValueShape {
  /** 匹配前是否小写折叠。 */
  lower: boolean;
  maxLength: number;
  pattern: RegExp;
}

/** 三种取值形状：枚举词、执行 ID、外部短名字。 */
const SHAPES = {
  enum: { lower: true, maxLength: 128, pattern: /^[a-z0-9_./:-]+$/u },
  id: { lower: false, maxLength: 128, pattern: /^[A-Za-z0-9._:-]+$/u },
  name: { lower: false, maxLength: 128, pattern: /^[A-Za-z0-9._:/-]+$/u },
} satisfies Record<string, ValueShape>;

type ShapeName = keyof typeof SHAPES;

/** 一个取值入口：入参是外部字符串，出参是过闸门后的值或 undefined。 */
type GateEntry = (value: string | undefined) => string | undefined;

function throughShape(shape: ShapeName, raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const rule: ValueShape = SHAPES[shape];
  const folded = rule.lower ? trimmed.toLowerCase() : trimmed;
  const candidate = folded.slice(0, rule.maxLength);
  return rule.pattern.test(candidate) ? candidate : undefined;
}

/** 三种形状的对外入口：都只做一次查表 + 一次匹配。 */
const GATE_ENTRIES: Readonly<Record<"enum" | "id" | "name", GateEntry>> = {
  enum: (value) => throughShape("enum", value),
  id: (value) => throughShape("id", value),
  name: (value) => throughShape("name", value),
};

export const safeEnum = GATE_ENTRIES.enum;
export const safeId = GATE_ENTRIES.id;
export const safeIdentifier = GATE_ENTRIES.name;

/** 可读文本：压掉控制字符与多余空白，按调用方给的上限截断。 */
export function safeString(value: string | undefined, maxLength = 256): string | undefined {
  if (!value) return undefined;
  const flattened = value.replace(CONTROL_CHARS, " ").replace(RUNS_OF_SPACE, " ").trim();
  const capped = maxLength > 0 ? flattened.slice(0, maxLength) : flattened;
  return capped === "" ? undefined : capped;
}

/** 非负有限数：不是数字、非有限或负数都算没有值。 */
export function finiteNonNegative(value: number | undefined): number | undefined {
  const usable = typeof value === "number" && Number.isFinite(value) && value >= 0;
  return usable ? value : undefined;
}

/** 安全整数：小数与超出安全范围的值不写成计数。 */
export function integer(value: number | undefined): number | undefined {
  return Number.isSafeInteger(value) ? value : undefined;
}

/** 取消类异常：AbortError 名称，或带 ABORT_ERR 错误码。 */
export function isAbortLike(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  return error.name === "AbortError" || code === "ABORT_ERR";
}

/**
 * http(s) URL 的解析：长度有界、协议白名单、解析失败一律返回 undefined。
 * 调用方拿到的 URL 对象可继续读 hostname / port / pathname，不必重复 try/catch。
 */
export function httpUrlOf(value: string | undefined): URL | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === "") return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : undefined;
}

/**
 * 唯一的「可失败调用」出口：跑一次可能抛错的异步操作，失败折成 undefined。
 * 遥测的副作用全部是 best effort，不区分错误类型，因此只需要一个这样的入口。
 */
export async function bestEffort<T>(run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch {
    return undefined;
  }
}

/** 单个 Attribute 的归一：类型决定走哪条分支，数组要求元素同型。 */
function attributeOf(value: unknown): Attributes[string] | undefined {
  switch (typeof value) {
    case "string":
      return safeString(value, 1_024);
    case "number":
      return Number.isFinite(value) ? value : undefined;
    case "boolean":
      return value;
    case "object":
      return Array.isArray(value) ? arrayOf(value) : undefined;
    default:
      return undefined;
  }
}

/** 同型数组原样保留；混型、空数组与非有限数都整体丢弃。 */
function arrayOf(items: unknown[]): string[] | number[] | boolean[] | undefined {
  const sample = items[0];
  if (sample === undefined) return undefined;
  const kind = typeof sample;
  if (!items.every((item) => typeof item === kind)) return undefined;
  if (kind === "number" && !items.every((item) => Number.isFinite(item))) return undefined;
  if (kind === "string" || kind === "number" || kind === "boolean") {
    return items as string[] | number[] | boolean[];
  }
  return undefined;
}

/** 丢掉无值、空串与异型数组后的 Attribute 集合。 */
export function compactAttributes(attributes: Attributes): Attributes {
  const kept: Attributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    const normalized = attributeOf(value);
    if (normalized !== undefined && normalized !== "") kept[key] = normalized;
  }
  return kept;
}

/** 执行投影的字段表：后缀、关联字段、需要哪个开关、用哪种取值形状。 */
const PROJECTION = [
  { field: "sessionId", flag: "session", shape: "id", suffix: "session_id" },
  { field: "parentSessionId", flag: "session", shape: "id", suffix: "parent_session_id" },
  { field: "turnId", flag: null, shape: "id", suffix: "turn_id" },
  { field: "parentTurnId", flag: "session", shape: "id", suffix: "parent_turn_id" },
  { field: "queryId", flag: "query", shape: "id", suffix: "query_id" },
  { field: "identityState", flag: "identity", shape: "enum", suffix: "identity_state" },
  { field: "userSubjectId", flag: "identity", shape: "id", suffix: "user_subject_id" },
] as const;

export interface ProjectionFlags {
  actor?: boolean;
  agent?: boolean;
  identity?: boolean;
  query?: boolean;
  session?: boolean;
}

/**
 * 执行上下文 → `knorvia.execution.*`。
 * 每行数据自己声明「属于哪类字段、用哪种形状」，投影函数只做开关与转换。
 */
export function executionProjection(
  correlation: AgentTelemetryExecutionContext | undefined,
  flags: ProjectionFlags = {},
): Attributes {
  if (!correlation) return {};
  const projection: Attributes = {};
  for (const row of PROJECTION) {
    if (row.flag !== null && flags[row.flag as keyof ProjectionFlags] !== true) continue;
    projection[`knorvia.execution.${row.suffix}`] = throughShape(
      row.shape,
      correlation[row.field] as string | undefined,
    );
  }
  if (flags.actor === true) {
    projection["knorvia.execution.actor_kind"] = safeEnum(correlation.actorKind);
  }
  if (flags.agent === true) {
    projection["knorvia.execution.agent_name"] = safeIdentifier(correlation.agentName);
  }
  projection["knorvia.execution.launch_surface"] = safeEnum(correlation.launchSurface);
  return projection;
}
