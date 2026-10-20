// SPDX-License-Identifier: Apache-2.0
// 遥测脱敏管线的纯数据部分（B19–B21）。
// 只放数据：长度上限、历史内置模型 ID、供应商档位表、脱敏阶段表与识别用正则。
// 阶段调度与 URL 归一逻辑在 telemetryRedaction.ts。

/** 脱敏长度上限：输出截断、扫描窗口与路径段上限。 */
export const REDACTION_LIMITS = { textMax: 2048, scanLimit: 4096, routeSegmentMax: 128 } as const;

/** 历史内置模型 ID（ZCode 自己发布过的稳定 ID，不属于用户自定义命名）。 */
export const LEGACY_BUILTIN_MODEL_IDS = ["charglm-4", "codegeex-4", "emohaa"] as const;

/** 供应商档位表。 */
export const PROVIDER_SCOPE_TABLE = {
  builtin: "builtin",
  custom: "custom",
  unknown: "unknown",
} as const;

/**
 * 脱敏阶段表：顺序即行为。`url` 阶段交给 URL 归一函数，其余阶段按 `replacement` 直替。
 * 顺序：URL 整体脱敏 → 授权头 → 查询串密钥 → 键值对密钥 → Bearer/Basic →
 * 各类令牌字面量 → 邮箱 → 本地路径。
 */
export const TEXT_REDACTION_STAGES = [
  { kind: "url", pattern: /\bhttps?:\/\/[^\s"'<>]+/giu },
  {
    kind: "literal",
    pattern: /(\bauthorization\b["']?\s*[:=])\s*(?:(?:Bearer|Basic)\s+)?[^\s,"'};]+/giu,
    replacement: "$1 {redacted}",
  },
  {
    kind: "literal",
    pattern:
      /([?&](?:api[_-]?key|token|access[_-]?token|authorization|password|passwd|secret|cookie|session)=)[^&\s]+/giu,
    replacement: "$1{redacted}",
  },
  {
    kind: "literal",
    pattern:
      /(["']?(?:api[_-]?key|token|access[_-]?token|password|passwd|secret|client[_-]?secret|cookie|set-cookie|session)["']?\s*[:=]\s*["']?)(?!\{redacted\})[^\s,"'};]+/giu,
    replacement: "$1{redacted}",
  },
  {
    kind: "literal",
    pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu,
    replacement: "$1 {redacted}",
  },
  { kind: "literal", pattern: /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/giu, replacement: "{secret}" },
  { kind: "literal", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/gu, replacement: "{secret}" },
  { kind: "literal", pattern: /\bAKIA[A-Z0-9]{16}\b/gu, replacement: "{secret}" },
  { kind: "literal", pattern: /\bAIza[A-Za-z0-9_-]{30,}\b/gu, replacement: "{secret}" },
  { kind: "literal", pattern: /\b[^/@\s]+@[^/@\s]+\.[^/@\s]+\b/gu, replacement: "{email}" },
  {
    kind: "literal",
    pattern: /\/(?:private\/)?(?:var\/folders|tmp)\/[^\s:;,)\]}]+/gu,
    replacement: "{path}",
  },
  {
    kind: "literal",
    pattern: /\/(?:Users|home|root|workspace|workspaces|Volumes)\/[^/\s]+(?:\/[^\s:;,)\]}]+)*/gu,
    replacement: "{path}",
  },
  {
    kind: "literal",
    pattern: /\b[A-Za-z]:\\[^\\\s]+(?:\\[^\s:;,)\]}]+)*/gu,
    replacement: "{path}",
  },
] as const;

/** 路径段里的敏感形态：纯数字、长十六进制、UUID 前缀。 */
export const SEGMENT_SENSITIVE_PATTERNS = [
  /^[0-9]{7,}$/u,
  /^[0-9a-f]{16,}$/iu,
  /^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu,
] as const;

/** 形如主机名的前缀（可带端口），用于给无协议的输入补 https。 */
export const HOST_LIKE_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#]|$)/iu;

/** 控制字符与空白压缩用的正则。 */
export const CONTROL_CHARS_PATTERN = /\p{Cc}+/gu;
export const WHITESPACE_RUN_PATTERN = /\s+/gu;

/** URL 输入的分类前缀。 */
export const NON_HTTP_URL_PREFIXES = [
  { prefix: "blob:", label: "blob" },
  { prefix: "data:", label: "data" },
] as const;

/** 本地路径判定：file: 协议、盘符路径或绝对路径。 */
export const LOCAL_PATH_PATTERNS = [/^file:/iu, /^[A-Za-z]:[\\/]/u] as const;
