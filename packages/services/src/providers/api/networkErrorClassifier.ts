interface NetworkErrorDetails {
  codes: Set<string>;
  messages: string[];
}

const networkCodes = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_CONNECT_ERROR",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ECONNREFUSED",
  "ECONNRESET",
]);
const establishmentCodes = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_CONNECT_ERROR",
  "ENOTFOUND",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ECONNREFUSED",
]);

function inspectGraph(error: unknown): NetworkErrorDetails {
  const details: NetworkErrorDetails = { codes: new Set(), messages: [] };
  const pending: unknown[] = [error];
  const seen = new Set<object>();
  while (pending.length) {
    const entry = pending.pop();
    if (!entry || typeof entry !== "object" || seen.has(entry)) continue;
    seen.add(entry);
    const node = entry as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown };
    if (typeof node.code === "string") details.codes.add(node.code);
    if (typeof node.message === "string") details.messages.push(node.message);
    if (node.cause !== undefined) pending.push(node.cause);
    if (Array.isArray(node.errors)) pending.push(...node.errors);
  }
  return details;
}

export function getNetworkErrorCodes(error: unknown): string[] {
  return [...inspectGraph(error).codes].sort();
}

export function isNetworkFailure(error: unknown): boolean {
  return [...inspectGraph(error).codes].some((code) => networkCodes.has(code));
}

export function isRetryableConnectionEstablishmentError(error: unknown): boolean {
  const { codes, messages } = inspectGraph(error);
  if ([...codes].some((code) => establishmentCodes.has(code))) return true;
  if (
    codes.has("ETIMEDOUT") &&
    messages.some((message) => /connection attempts timed out|connect ETIMEDOUT/i.test(message))
  ) {
    return true;
  }
  return (
    codes.has("ECONNRESET") &&
    messages.some((message) => /before secure TLS connection was established/i.test(message))
  );
}
