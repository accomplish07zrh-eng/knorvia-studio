// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 插件来源引用的脱敏。来源有两种形态：带凭据的 URL，以及 `user:token@host` 形态的 Git 地址；
// 两者对外展示前都必须抹掉账号信息。诊断文案里内嵌的 URL 也要逐个过一遍同样的处理，
// 因为错误信息常常把远端地址整段抄进 message。

/** 脱敏后统一替换成这句话，既说明「配置过凭据」，又不泄露账号或令牌的任何片段。 */
const CREDENTIAL_PLACEHOLDER = "configured Git source";

/** URL 里承载账号信息的位置：清空这两处即抹掉凭据。 */
const URL_CREDENTIAL_PARTS = ["username", "password"] as const;

/** 诊断文案中的内嵌 URL：scheme:// 起到空白、引号、尖括号或括号为止。 */
const INLINE_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>()[\]{}]+/giu;

/** 不带 scheme 的 Git 凭据形态 `user:secret@host/path`。 */
const INLINE_GIT_CREDENTIALS = /\b[^\s:/@]+:[^\s@]+@[^\s]+/gu;

/** 判断一段文本整体是不是 `user:secret@...` 形态（无法按 URL 解析时的兜底）。 */
const BARE_CREDENTIAL = /^[^\s:]+:[^\s@]+@/u;

/** 借 URL 解析去掉凭据后返回规范形式；解析不了返回 null 交给调用方兜底。 */
function canonicalWithoutCredentials(text: string): string | null {
  const parsed = URL.parse(text);
  if (parsed === null) return null;
  for (const part of URL_CREDENTIAL_PARTS) parsed[part] = "";
  return parsed.toString();
}

export function redactSourceReference(source: string): string {
  const asUrl = canonicalWithoutCredentials(source.trim());
  if (asUrl !== null) return asUrl;
  return BARE_CREDENTIAL.test(source.trim()) ? CREDENTIAL_PLACEHOLDER : source.trim();
}

export function redactSourceDiagnostic(message: string): string {
  const urlsScrubbed = message.replace(INLINE_URL, (found) => redactSourceReference(found));
  return urlsScrubbed.replace(INLINE_GIT_CREDENTIALS, CREDENTIAL_PLACEHOLDER);
}
