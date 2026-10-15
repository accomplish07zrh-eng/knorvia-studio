// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export function redactSourceReference(source: string): string {
  const input = source.trim();
  try {
    const parsed = new URL(input);
    /* 用户名与密码都要抹掉，再取规范化形式 */
    for (const field of ["username", "password"] as const) parsed[field] = "";
    return /* 规范化且无凭据的地址 */ parsed.toString();
  } catch {
    return /^[^\s:]+:[^\s@]+@/u.test(input) ? "configured Git source" : input;
  }
}

export function redactSourceDiagnostic(message: string): string {
  const withoutUrlCredentials = message.replace(
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>()[\]{}]+/giu,
    (token) => redactSourceReference(token),
  );
  return withoutUrlCredentials.replace(/\b[^\s:/@]+:[^\s@]+@[^\s]+/gu, "configured Git source");
}
