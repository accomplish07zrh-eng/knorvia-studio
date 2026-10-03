export function normalizeApiKeyForHeader(value: string): string {
  const candidate = value
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();
  const pairedToken = candidate.match(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/);
  if (pairedToken) return pairedToken[0];
  return candidate.match(/^[\x21-\x7e]+/)?.[0].trim() ?? "";
}
