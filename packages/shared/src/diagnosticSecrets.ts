const REDACTED = "[redacted]";
const SECRET_KEY =
  /(?:api[-_]?key|authorization|cookie|credential|password|passwd|private[-_]?key|secret|token|passphrase)/i;

/** Remove credential shapes before diagnostic text reaches any persistent logger. */
export function redactDiagnosticText(value: string): string {
  return value
    .replace(
      /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/g,
      REDACTED,
    )
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`)
    .replace(
      /([?&](?:api[-_]?key|access[-_]?token|token|password|secret)=)[^&#\s]+/gi,
      `$1${REDACTED}`,
    )
    .replace(
      /(["']?(?:api[-_]?key|authorization|cookie|credential|password|passwd|private[-_]?key|secret|token|passphrase)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi,
      `$1${REDACTED}`,
    )
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/gi, REDACTED)
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, REDACTED);
}

/** Redact structured fields, nested errors and strings without mutating the source event. */
export function redactDiagnosticValue(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (typeof value === "string") return redactDiagnosticText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 8 || seen.has(value)) return REDACTED;
  seen.add(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactDiagnosticText(value.message),
      ...(value.stack ? { stack: redactDiagnosticText(value.stack) } : {}),
      ...(value.cause ? { cause: redactDiagnosticValue(value.cause, seen, depth + 1) } : {}),
    };
  }
  if (Array.isArray(value))
    return value.map((item) => redactDiagnosticValue(item, seen, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY.test(key) ? REDACTED : redactDiagnosticValue(entry, seen, depth + 1),
    ]),
  );
}
