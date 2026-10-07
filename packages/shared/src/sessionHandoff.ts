import { redactDiagnosticText } from "./diagnosticSecrets.js";

export const HANDOFF_TEXT_LIMIT = 20_000;
export const HANDOFF_RECORD_LIMIT = 100;
export const HANDOFF_FIELD_KEYS = [
  "goal",
  "constraints",
  "decisions",
  "progress",
  "failedAttempts",
  "remainingSteps",
  "acceptanceCriteria",
  "uncertainty",
] as const;
export type HandoffFieldKey = (typeof HANDOFF_FIELD_KEYS)[number];
export interface HandoffScope {
  sessionId: string;
  kernelId: string;
  workspacePath: string;
  workspaceIdentity?: string;
}
export interface HandoffField {
  text: string;
  origin: "visible-message" | "user-edit";
  sourceMessageId?: string;
  omittedChars: number;
}
export interface SessionHandoffRecord {
  version: 1;
  scope: HandoffScope;
  fields: Partial<Record<HandoffFieldKey, HandoffField>>;
  /** User supplied relative paths; existence is never persisted as a fact. */
  references: string[];
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function scopeText(value: unknown, limit: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= limit &&
    !Array.from(value).some((char) => char.charCodeAt(0) < 32) &&
    sanitizeHandoffText(value) === value
  );
}
export function isHandoffScope(value: unknown): value is HandoffScope {
  return (
    object(value) &&
    scopeText(value.sessionId, 128) &&
    !["__proto__", "constructor", "prototype"].includes(value.sessionId) &&
    scopeText(value.kernelId, 128) &&
    scopeText(value.workspacePath, 4096) &&
    (value.workspaceIdentity === undefined || scopeText(value.workspaceIdentity, 4096))
  );
}
export function handoffScopeKey(scope: HandoffScope): string {
  return JSON.stringify([
    scope.workspaceIdentity?.trim() || scope.workspacePath,
    scope.kernelId,
    scope.sessionId,
  ]);
}
export function sameHandoffScope(a: HandoffScope, b: HandoffScope): boolean {
  return handoffScopeKey(a) === handoffScopeKey(b) && a.workspacePath === b.workspacePath;
}
/** Redact before both persistence and submission, including edits made after preview. */
export function sanitizeHandoffText(text: string): string {
  return redactDiagnosticText(text)
    .replace(/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*$/g, "[redacted]")
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[redacted]")
    .replace(/\bAIza[A-Za-z0-9_-]{30,}\b/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]");
}
export function handoffFieldLimit(key: HandoffFieldKey): number {
  return key === "goal" ? 2000 : 1000;
}
export function createHandoffField(
  key: HandoffFieldKey,
  text: string,
  origin: HandoffField["origin"],
  sourceMessageId?: string,
): HandoffField {
  const safe = sanitizeHandoffText(text).trim();
  const limit = handoffFieldLimit(key);
  return {
    text: safe.slice(0, limit),
    origin,
    omittedChars: Math.max(0, safe.length - limit),
    ...(origin === "visible-message" && sourceMessageId
      ? { sourceMessageId: sanitizeHandoffText(sourceMessageId).slice(0, 128) }
      : {}),
  };
}
export function emptyHandoffRecord(scope: HandoffScope): SessionHandoffRecord {
  return {
    version: 1,
    scope: {
      sessionId: scope.sessionId,
      kernelId: scope.kernelId,
      workspacePath: scope.workspacePath,
      ...(scope.workspaceIdentity !== undefined
        ? { workspaceIdentity: scope.workspaceIdentity }
        : {}),
    },
    fields: {},
    references: [],
  };
}
/** Invalid task notes fall back independently; legacy composer drafts remain intact. */
export function parseHandoffRecord(value: unknown): SessionHandoffRecord | null {
  if (
    !object(value) ||
    value.version !== 1 ||
    !isHandoffScope(value.scope) ||
    !object(value.fields) ||
    !Array.isArray(value.references) ||
    value.references.length > 20
  )
    return null;
  const result = emptyHandoffRecord(value.scope);
  for (const key of HANDOFF_FIELD_KEYS) {
    const field = value.fields[key];
    if (field === undefined) continue;
    if (
      !object(field) ||
      typeof field.text !== "string" ||
      field.text.length > handoffFieldLimit(key) ||
      (field.origin !== "user-edit" && field.origin !== "visible-message") ||
      (field.origin === "visible-message" &&
        (key !== "goal" || !scopeText(field.sourceMessageId, 128))) ||
      !Number.isSafeInteger(field.omittedChars) ||
      (field.omittedChars as number) < 0
    )
      return null;
    result.fields[key] = {
      ...createHandoffField(key, field.text, field.origin, field.sourceMessageId as string),
      omittedChars: field.omittedChars as number,
    };
  }
  for (const reference of value.references) {
    if (typeof reference !== "string" || reference.length > 240) return null;
    result.references.push(sanitizeHandoffText(reference));
  }
  return result;
}
export function parseHandoffRecords(value: unknown): Record<string, SessionHandoffRecord> {
  const result: Record<string, SessionHandoffRecord> = {};
  if (!object(value) || Object.keys(value).length > HANDOFF_RECORD_LIMIT) return result;
  for (const [key, entry] of Object.entries(value)) {
    const record = parseHandoffRecord(entry);
    if (record && key === handoffScopeKey(record.scope)) result[key] = record;
  }
  return result;
}
export function editHandoffRecord(
  record: SessionHandoffRecord,
  fields: Record<HandoffFieldKey, string>,
  references: string[],
): SessionHandoffRecord {
  const next = emptyHandoffRecord(record.scope);
  for (const key of HANDOFF_FIELD_KEYS) {
    // 未填写的缺失项不等于用户清空；否则补约束会永久阻止后来加载的原目标摘录。
    if (fields[key] === "" && record.fields[key] === undefined) continue;
    next.fields[key] =
      fields[key] === (record.fields[key]?.text ?? "") && record.fields[key]
        ? record.fields[key]
        : createHandoffField(key, fields[key], "user-edit");
  }
  next.references = references.map(sanitizeHandoffText);
  return next;
}
/** Accept project-relative references, excluding common credential paths and URLs. */
export function handoffRelativePath(value: string): string | null {
  const path = value.trim().replace(/\\/g, "/");
  if (
    !path ||
    path.length > 240 ||
    /[:#?]/.test(path) ||
    Array.from(path).some((char) => char.charCodeAt(0) < 32) ||
    path.startsWith("/") ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    /(?:^|\/)(?:\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|credentials?(?:\..*)?|id_(?:rsa|ed25519)|[^/]+\.(?:pem|key|p12|pfx))(?:\/|$)/i.test(
      path,
    ) ||
    sanitizeHandoffText(path) !== path
  )
    return null;
  return path;
}
export function handoffPathInside(root: string, path: string): boolean {
  const normalize = (value: string) => {
    const clean = value.replace(/\\/g, "/").replace(/\/+$/, "");
    return /^[A-Za-z]:\//.test(clean) || clean.startsWith("//") ? clean.toLowerCase() : clean;
  };
  return normalize(path).startsWith(`${normalize(root)}/`);
}
