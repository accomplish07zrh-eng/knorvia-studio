// SPDX-License-Identifier: Apache-2.0
// 错误正文离开进程前的清洗与结构化。分三段：有界截断 → 有序规则表 → 结构化投影。
// 规则必须有序：一旦替换成占位符，后续规则不能再把占位符本身当成秘密处理。
//
// Message 处理器只处理「会进 Span 的文字」；结构化的 type/code 走另一条更窄的路径，
// 二者共享的只有长度上限与最终截断点。

/** 单条消息进入规则前的预截断长度：再长对观测无益，只会放大正则成本。 */
const MESSAGE_PRE_CUT = 4_096;
/** 写入 Span 的错误消息上限。 */
const MESSAGE_LIMIT = 2_048;
/** cause 链最多走到的深度。 */
const CHAIN_LIMIT = 8;
/** type / code 的长度上限。 */
const IDENTIFIER_LIMIT = 128;
/** 一个 route 段的最大长度。 */
const ROUTE_SEGMENT_LIMIT = 128;
/** type 的合法字符集。 */
const TYPE_TOKEN = /^[A-Za-z0-9_.:-]+$/u;

/** 已经认领过的异常对象；WeakSet 不延长生命周期。 */
const claimedErrors = new WeakSet<object>();

export interface SanitizedTelemetryError {
  cause?: SanitizedErrorCause;
  code?: string;
  message?: string;
  type: string;
}

/** cause 的三字段形状：与顶层同名，只是没有更深的链条。 */
export interface SanitizedErrorCause {
  code?: string;
  message?: string;
  type: string;
}

type RuleApply = string | ((match: string) => string);

interface MessageRule {
  /** 替换目标：要么是带 `$1` 的模板串，要么是一个按整段命中重写的回调。 */
  apply: RuleApply;
  pattern: RegExp;
}

/** 敏感键名的两种出现形态：query 形态（`?k=`/`&k=`）与键值形态（`k:`/`k=`）。 */
const SECRET_KEY_NAMES = [
  "api[_-]?key",
  "token",
  "access[_-]?token",
  "authorization",
  "password",
  "passwd",
  "secret",
  "client[_-]?secret",
  "cookie",
  "set-cookie",
  "session",
  "x-arms-license-key",
].join("|");

/** 有序规则表。每条规则只做一次替换；顺序即语义。 */
const MESSAGE_RULES: readonly MessageRule[] = [
  {
    apply: redactUrl,
    pattern: /\bhttps?:\/\/[^\s"'<>]+/giu,
  },
  {
    apply: "$1 {redacted}",
    pattern: /(\bauthorization\b["']?\s*[:=])\s*(?:(?:Bearer|Basic)\s+)?[^\s,"'};]+/giu,
  },
  {
    apply: "$1{redacted}",
    pattern: new RegExp(`([?&](?:${SECRET_KEY_NAMES})=)[^&\\s]+`, "giu"),
  },
  {
    apply: "$1{redacted}",
    pattern: new RegExp(
      `(["']?(?:${SECRET_KEY_NAMES})["']?\\s*[:=]\\s*["']?)(?!\\{redacted\\})[^\\s,"'};]+`,
      "giu",
    ),
  },
  {
    apply: "$1 {redacted}",
    pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu,
  },
  {
    apply: "{secret}",
    pattern: /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/giu,
  },
  {
    apply: "{secret}",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/gu,
  },
  {
    apply: "{secret}",
    pattern: /\bAKIA[A-Z0-9]{16}\b/gu,
  },
  {
    apply: "{secret}",
    pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/gu,
  },
  {
    apply: "{secret}",
    pattern: /\b[A-Za-z0-9]{4,32}@[0-9a-f]{12,}\b/giu,
  },
  {
    apply: "{email}",
    pattern: /\b[^/@\s]+@[^/@\s]+\.[^/@\s]+\b/gu,
  },
  {
    apply: "/{path}",
    pattern: /\/(?:Users|home|root|workspace|workspaces|Volumes)\/[^/\s]+(?:\/[^\s:;,)\]}]+)*/gu,
  },
  {
    apply: "/{path}",
    pattern: /\/(?:private\/)?(?:var\/folders|tmp)\/[^\s:;,)\]}]+/gu,
  },
  {
    apply: "{path}",
    pattern: /\b[A-Za-z]:\\[^\\\s]+(?:\\[^\s:;,)\]}]+)*/gu,
  },
  {
    apply: " ",
    pattern: /\p{Cc}+/gu,
  },
  {
    apply: " ",
    pattern: /\s+/gu,
  },
];

/** 收尾裁剪：去两端空白。空结果在调用处折成 undefined。 */
const TRIM_EDGES = /^\s+|\s+$/gu;

const NESTED_OBJECT_KEYS = ["cause", "adapterError", "error"] as const;

/**
 * 把一条错误消息折成可安全写入 Span 的单行文本。
 * 空输入、纯空白、清洗后为空都返回 undefined。
 */
export function sanitizeErrorMessage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // 先用有界前缀，再跑规则：恶意/异常 Provider 正文不应让清洗承担无界成本。
  let text = value.slice(0, MESSAGE_PRE_CUT);
  for (const rule of MESSAGE_RULES) text = runRule(text, rule);
  text = text.replace(TRIM_EDGES, "");
  return text.slice(0, MESSAGE_LIMIT) || undefined;
}

function runRule(text: string, rule: MessageRule): string {
  return typeof rule.apply === "function"
    ? text.replace(rule.pattern, (match: string) => (rule.apply as (m: string) => string)(match))
    : text.replace(rule.pattern, rule.apply);
}

/** 某条记录链上的第一个嵌套对象（cause → adapterError → error 的优先顺序）。 */
function firstNestedObject(record: Record<string, unknown>): object | undefined {
  for (const key of NESTED_OBJECT_KEYS) {
    const candidate = record[key];
    if (candidate !== null && typeof candidate === "object") return candidate;
  }
  return undefined;
}

/**
 * 沿优先链收集对象，遇环或超深停止。返回值第一项始终是原始输入（当它是对象时）。
 */
function errorChain(error: unknown): object[] {
  const chain: object[] = [];
  const seen = new Set<object>();
  let cursor: unknown = error;
  while (chain.length < CHAIN_LIMIT && cursor !== null && typeof cursor === "object") {
    if (seen.has(cursor as object)) break;
    seen.add(cursor as object);
    chain.push(cursor as object);
    cursor = firstNestedObject(cursor as Record<string, unknown>);
  }
  return chain;
}

/** 对象或空记录：数组与非对象一律按无字段处理。 */
function fieldRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** 去空白后的非空字符串字段。 */
function textField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** type 的取值：白名单字符集、长度有界，否则视为没有类型。 */
function typeToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const candidate = value.trim().slice(0, IDENTIFIER_LIMIT);
  return TYPE_TOKEN.test(candidate) ? candidate : undefined;
}

/** code 的取值：压掉控制字符与连续空白，长度有界。 */
function codeToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const candidate = value
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, IDENTIFIER_LIMIT);
  return candidate || undefined;
}

/** cause 节点：三字段全空时整节点省略。 */
function causeNode(record: object): SanitizedTelemetryError["cause"] {
  const fields = fieldRecord(record);
  const type = typeToken(textField(fields.type) ?? textField(fields.name));
  const code = codeToken(textField(fields.code));
  const message = sanitizeErrorMessage(textField(fields.message));
  if (!type && !code && !message) return undefined;
  return {
    ...(code === undefined ? {} : { code }),
    ...(message === undefined ? {} : { message }),
    type: type ?? "UnknownError",
  };
}

/** 顶层 + 最深 cause 的结构化投影。 */
function projectError(error: unknown): SanitizedTelemetryError {
  const fields = fieldRecord(error);
  const type =
    typeToken(textField(fields.type) ?? textField(fields.name)) ??
    typeToken(error instanceof Error ? error.name : undefined) ??
    "UnknownError";
  const code = codeToken(textField(fields.code));
  const message = sanitizeErrorMessage(
    error instanceof Error ? error.message : textField(fields.message),
  );
  const chain = errorChain(error);
  // 链的第一项就是输入本身；只有真的存在嵌套对象时才写 cause，否则会重复同一份正文。
  const cause = chain.length > 1 ? causeNode(chain[chain.length - 1] as object) : undefined;
  return {
    ...(cause === undefined ? {} : { cause }),
    ...(code === undefined ? {} : { code }),
    ...(message === undefined ? {} : { message }),
    type,
  };
}

/** 结构化错误投影；不抛错，也不认领。 */
export function sanitizeTelemetryError(error: unknown): SanitizedTelemetryError {
  return projectError(error);
}

/**
 * 认领式投影：同一条异常会沿 Attempt → Call → Step → Turn 冒泡，正文只记在最靠近来源的
 * Span。链上任一对象已被认领即返回 undefined；否则登记整条链并给出投影。
 */
export function claimSanitizedTelemetryError(error: unknown): SanitizedTelemetryError | undefined {
  const chain = errorChain(error);
  if (chain.length === 0) return projectError(error);
  let taken = false;
  for (const item of chain) {
    if (claimedErrors.has(item)) taken = true;
    claimedErrors.add(item);
  }
  return taken ? undefined : projectError(error);
}

/** URL → `protocol//host` + 逐段清洗的路径；解析失败折叠成 `{url}`。 */
function redactUrl(match: string): string {
  let parsed: URL;
  try {
    parsed = new URL(match);
  } catch {
    return "{url}";
  }
  const segments = parsed.pathname.split("/").map(routeSegment);
  return `${parsed.protocol}//${parsed.host}${segments.join("/")}`;
}

/**
 * 单段路由的判定：邮箱、长数字、长十六进制与 UUID 形态都是身份信息，替换为 `{segment}`；
 * 其余段截断到 128 字符。判定顺序固定，先命中先返回。
 */
function routeSegment(segment: string): string {
  if (!segment) return segment;
  if (segment.includes("@")) return "{segment}";
  if (/^\d{7,}$/u.test(segment)) return "{segment}";
  if (/^[0-9a-f]{16,}$/iu.test(segment)) return "{segment}";
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(segment)) return "{segment}";
  return segment.slice(0, ROUTE_SEGMENT_LIMIT);
}
