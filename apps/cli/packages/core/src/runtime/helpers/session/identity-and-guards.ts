// SPDX-License-Identifier: Apache-2.0
// 会话标题、项目标识与数据守卫（B41，含 B40/B41 共用的数据工具）。
// 标题：输入压空白后取前 60 字符（超出截 57 加省略号），空输入给固定占位；slug：小写化、
// 非 [a-z0-9._-] 字符成段换连字符、去首尾连字符、空 slug 给固定兜底；项目 id = slug 前 80
// 字符（再兜底 default）。数据守卫：普通对象判定、diff hunk 形状判定、键名截断枚举与
// 字符串属性读取。全部同步纯计算、不抛异常。
import { createProjectId } from "../../deps.js";
import type { DiffHunk, ProjectId } from "../../deps.js";

// 标题与 slug 的固定兜底文案（逐字冻结）。
const UNTITLED_SESSION = "Untitled session";
const FALLBACK_SLUG = "session";
const FALLBACK_PROJECT_ID = "default";

// 标题截断参数：超过 60 字符截 57 加省略号。
const TITLE_LIMIT_CHARS = 60;
const TITLE_KEEP_CHARS = 57;
const TITLE_ELLIPSIS = "...";

// 项目 id 的 slug 截断长度。
const PROJECT_SLUG_LIMIT = 80;

// 对象键枚举的截断上限（诊断用，最多 20 个键）。
const KEY_ENUM_CAP = 20;

// diff hunk 的四个行号字段。
const HUNK_SPAN_KEYS = ["oldStart", "oldLines", "newStart", "newLines"] as const;

export function titleFromInput(raw: string): string {
  const compact = raw.trim().replace(/\s+/g, " ");
  if (!compact) return UNTITLED_SESSION;
  return compact.length <= TITLE_LIMIT_CHARS
    ? compact
    : `${compact.slice(0, TITLE_KEEP_CHARS)}${TITLE_ELLIPSIS}`;
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || FALLBACK_SLUG;
}

export function projectIdFromDirectory(directory: string): ProjectId {
  return createProjectId(slugify(directory).slice(0, PROJECT_SLUG_LIMIT) || FALLBACK_PROJECT_ID);
}

// 普通对象判定：非 null 的对象且不是数组。
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// diff hunk 形状判定：四个行号数字 + 字符串行数组。
export function isRuntimeDiffHunk(value: unknown): value is DiffHunk {
  if (!isPlainRecord(value)) return false;
  const numericSpans = HUNK_SPAN_KEYS.every((key) => typeof value[key] === "number");
  return (
    numericSpans &&
    Array.isArray(value.lines) &&
    value.lines.every((line) => typeof line === "string")
  );
}

// 对象键枚举（诊断用）：非对象给 undefined，最多 20 个键。
export function objectKeys(value: unknown): string[] | undefined {
  if (!value || typeof value !== "object") return undefined;
  return Object.keys(value).slice(0, KEY_ENUM_CAP);
}

// 字符串属性读取：非字符串值一律当缺失。
export function stringProperty(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key];
  return typeof value === "string" ? value : undefined;
}
