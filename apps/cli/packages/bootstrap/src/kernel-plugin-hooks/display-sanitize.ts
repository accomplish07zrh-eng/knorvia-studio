// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// Hook 展示文本脱敏（B4 的 4 条规格）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B4。
//
// 为什么重要：Hook 的 command / 参数里可能带凭据（如 `--token abc123`），
// 而「执行描述」会展示给用户 → 若不脱敏，凭据会显示在 UI 上。
//
// 设计要点：
//   ① **只替换秘密值，其余文本保持不变** —— 过度脱敏会让命令不可读
//   ② **敏感键名不区分大小写**，并支持前缀/后缀变体（`my-api-key` / `api_key_backup`）
//   ③ **不能误伤普通文本**（URL 的 host 与路径、普通命令、参数）

/** 脱敏后的占位符（B4.2）。 */
const REDACTED = "••••";

/**
 * 敏感键名清单（B4.3）。
 *
 * 用「包含」而不是「相等」来匹配前缀/后缀变体：
 * `my-api-key`、`api_key_backup` 都应命中 `api_key`。
 */
const SENSITIVE_KEYS: readonly string[] = [
  "access_token",
  "api_key",
  "credential",
  "password",
  "private_key",
  "secret",
  "token",
];

/**
 * 敏感键的正则片段：把键名里的 `_` 展开成 `[-_]`，这样
 * `api_key`（下划线）与 `api-key`（连字符）两种写法都能匹配。
 *
 * 为什么必须这样：B4.3 要求覆盖「前缀/后缀变体（如 `my-api-key`）」——
 * 而 `my-api-key` 用的是连字符，若只写 `api_key` 就匹配不到。
 */
const SENSITIVE_KEY_PATTERN = SENSITIVE_KEYS.map((key) => key.replace(/_/gu, "[-_]")).join("|");

/**
 * 判断一个键名是否敏感（支持前后缀变体）。
 *
 * 例：`my-api-key` → 含 `api-key`（把 `_` 归一为 `-` 后匹配）→ 敏感。
 */
export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/_/gu, "-");
  return SENSITIVE_KEYS.some((candidate) => normalized.includes(candidate.replace(/_/gu, "-")));
}

/**
 * 脱敏展示文本（B4）。
 *
 * 处理的形态（按 B4.2 的六条）：
 *   ① `scheme://user:pass@host` 中的 `user:pass`
 *   ② `authorization: basic|bearer <token>`
 *   ③ 查询串中的 `authorization` 与敏感键（`?k=` / `&k=`）值
 *   ④ `authorization = <token>`
 *   ⑤ 带引号或不带引号的 `敏感键[:=]值`
 *   ⑥ `--敏感键 值`
 *
 * 其余文本**保持不变**（B4.4）。
 */
export function sanitizeHookDisplayText(value: string): string {
  if (value.length === 0) return value;

  let result = value;

  // ① URL 用户信息：`scheme://user:pass@host` → 只替换 user:pass。
  //    用 [^/\s:@]+ 避免越界到 host 或路径。
  result = result.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/giu, `$1${REDACTED}@`);

  // ② authorization: basic|bearer <token>
  result = result.replace(
    /\b(authorization\s*[:=]\s*)(basic|bearer)\s+[^\s"',;]+/giu,
    `$1$2 ${REDACTED}`,
  );

  // ④ authorization = <token>（无 basic/bearer 前缀的裸值）
  result = result.replace(
    /\b(authorization\s*[:=]\s*)(?!basic\b|bearer\b)[^\s"',;]+/giu,
    `$1${REDACTED}`,
  );

  // ③ 查询串中的敏感键与 authorization：`?k=v` 或 `&k=v`
  //    值的终止符必须包含 `&` —— 否则会把后续参数一起吃掉（`api_key=x&page=2`）。
  result = result.replace(
    new RegExp(`([?&](?:authorization|${SENSITIVE_KEY_PATTERN})=)[^&\\s"']+`, "giu"),
    `$1${REDACTED}`,
  );

  // ⑥ `--敏感键 值`（长选项形态）
  //    键名允许连字符与下划线的任意组合（`--api-key` / `--api_key`）；
  //    值不能以 `-` 开头（避免把后续的 `--region` 当成值）。
  result = result.replace(
    new RegExp(`(--[\\w-]*(?:${SENSITIVE_KEY_PATTERN})[\\w-]*\\s+)(?!-)\\S+`, "giu"),
    `$1${REDACTED}`,
  );

  // ⑤ `敏感键[:=]值`（带引号或不带引号）—— 放最后，覆盖前面没处理到的。
  //    键名允许前缀/后缀变体（[\w-]*），值允许引号包裹。
  result = result.replace(
    new RegExp(
      `([\\w-]*(?:${SENSITIVE_KEY_PATTERN})[\\w-]*\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s"',;&]+)`,
      "giu",
    ),
    `$1${REDACTED}`,
  );

  return result;
}
