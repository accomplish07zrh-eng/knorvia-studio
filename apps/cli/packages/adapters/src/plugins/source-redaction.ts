// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export function redactSourceReference(source: string): string {
  const input = source.trim();
  try {
    const url = new URL(input);
    url.username = "";
    url.password = "";
    return url.toString();
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
