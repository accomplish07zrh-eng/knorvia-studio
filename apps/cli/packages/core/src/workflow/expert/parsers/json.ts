// SPDX-License-Identifier: Apache-2.0
// 宽松 JSON 读取：从模型响应里抽取 JSON，并提供大小写/分隔符不敏感的字段读取。
const PLANNER_JSON_ERROR = "Workflow planner did not return JSON graph expansion data";
const FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)\s*```/;
const NON_ALNUM = /[^a-z0-9]/g;

/** 围栏代码块里的 JSON 文本（无围栏返回 undefined）。 */
const fencedJson = (text: string): string | undefined => FENCE_PATTERN.exec(text)?.[1];

/** 首个 `{` 到最后一个 `}` 之间的片段（无有效区间返回 undefined）。 */
const bracedSlice = (text: string): string | undefined => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : undefined;
};

export function parsePlannerJson(response: string): unknown {
  const trimmed = response.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const fenced = fencedJson(trimmed);
  if (fenced !== undefined) return JSON.parse(fenced);
  const braced = bracedSlice(trimmed);
  if (braced !== undefined) return JSON.parse(braced);
  throw new Error(PLANNER_JSON_ERROR);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  return !Array.isArray(value);
}

/** 归一化键名：去空白、转小写、去掉非字母数字。 */
const normalizeKey = (key: string): string => key.trim().toLowerCase().replace(NON_ALNUM, "");

export function readLooseValue(
  source: Record<string, unknown>,
  aliases: readonly string[],
): unknown {
  const direct = aliases.find((alias) => alias in source);
  if (direct !== undefined) return source[direct];
  const wanted = new Set(aliases.map(normalizeKey).filter(Boolean));
  if (wanted.size === 0) return undefined;
  for (const key of Object.keys(source)) {
    if (wanted.has(normalizeKey(key))) return source[key];
  }
  return undefined;
}

/** 字符串取值：非字符串或去空白后为空都返回 undefined。 */
export function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** 宽松读取的取值形态：每种形态一个强制转换器。 */
type LooseKind = "array" | "boolean" | "positiveInteger" | "string" | "stringArray";

const COERCERS: Readonly<Record<LooseKind, (value: unknown) => unknown>> = {
  array: (value) => (Array.isArray(value) ? value : undefined),
  boolean: (value) => (typeof value === "boolean" ? value : undefined),
  positiveInteger: (value) =>
    typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined,
  string: (value) => stringValue(value),
  stringArray: (value) => {
    if (!Array.isArray(value)) return undefined;
    return value.map(stringValue).filter((entry): entry is string => entry !== undefined);
  },
};

/** 统一入口：按形态取别名值再强制转换。 */
const readLoose = (
  source: Record<string, unknown>,
  aliases: readonly string[],
  kind: LooseKind,
): unknown => COERCERS[kind](readLooseValue(source, aliases));

export const readLooseArray = (
  source: Record<string, unknown>,
  aliases: readonly string[],
): unknown[] | undefined => readLoose(source, aliases, "array") as unknown[] | undefined;

export const readLooseString = (
  source: Record<string, unknown>,
  aliases: readonly string[],
): string | undefined => readLoose(source, aliases, "string") as string | undefined;

export const readLooseStringArray = (
  source: Record<string, unknown>,
  aliases: readonly string[],
): string[] | undefined => readLoose(source, aliases, "stringArray") as string[] | undefined;

export const readLooseBoolean = (
  source: Record<string, unknown>,
  aliases: readonly string[],
): boolean | undefined => readLoose(source, aliases, "boolean") as boolean | undefined;

export const readLoosePositiveInteger = (
  source: Record<string, unknown>,
  aliases: readonly string[],
): number | undefined => readLoose(source, aliases, "positiveInteger") as number | undefined;
