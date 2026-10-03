// Complete-owner behavior/public-port candidate. Existing Apache/NOTICE obligations remain.
import { types } from "node:util";
import { deriveSessionTitle } from "#src/session/sessionTitle.js";
import {
  isObjectRecord,
  readTrimmedString,
  type JsonLineRecord,
} from "#src/session/claude-native/jsonLineRecord.js";

const nativeFlatMap = Array.prototype.flatMap;
const nativeFilter = Array.prototype.filter;
const nativeSpeciesGetter = Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get;
const ideBlock = /<ide_opened_file>[\s\S]*?<\/ide_opened_file>/gi;
const commandBlock =
  /<(?:local-command|command)-[^>]+>[\s\S]*?<\/(?:local-command|command)-[^>]+>/gi;

type Role = "user" | "assistant";
type HeadInfo = { workspacePath?: string; previewTitle?: string; createdAt?: number };

function sanitize(value: string): string {
  return value.replace(ideBlock, " ").replace(commandBlock, " ").replace(/\r\n/g, "\n").trim();
}

function fragment(value: unknown, role: Role): string {
  if (typeof value === "string") return sanitize(value);
  if (!isObjectRecord(value)) return "";
  if (role === "user" ? value.type === "tool_result" : value.type !== "text") return "";
  return sanitize(readTrimmedString(value.text) ?? readTrimmedString(value.content) ?? "");
}

function ordinaryArray(value: unknown[]): boolean {
  // Proxy inputs go straight to the public native sequence without optimization traps.
  if (types.isProxy(value)) return false;
  const prototype = Array.prototype;
  if (Object.getPrototypeOf(value) !== prototype) return false;
  if (
    Object.getOwnPropertyDescriptor(value, "flatMap") !== undefined ||
    Object.getOwnPropertyDescriptor(value, "constructor") !== undefined
  )
    return false;
  if (
    Object.getOwnPropertyDescriptor(prototype, "flatMap")?.value !== nativeFlatMap ||
    Object.getOwnPropertyDescriptor(prototype, "filter")?.value !== nativeFilter ||
    Object.getOwnPropertyDescriptor(prototype, "constructor")?.value !== Array
  )
    return false;
  return Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get === nativeSpeciesGetter;
}

function contentText(content: unknown, role: Role): string | undefined {
  if (typeof content === "string") return sanitize(content) || undefined;
  if (!Array.isArray(content)) return undefined;
  let parts: string[];
  if (ordinaryArray(content)) {
    parts = [];
    const length = content.length;
    for (let index = 0; index < length; index++) {
      if (!(index in content)) continue;
      const projected = fragment(content[index], role);
      if (projected.length > 0) parts.push(projected);
    }
  } else {
    parts = content
      .flatMap((value) => {
        const projected = fragment(value, role);
        return projected.length > 0 ? [projected] : [];
      })
      .filter((part) => part.length > 0);
  }
  if (role === "user") return parts.length > 0 ? parts.join("\n\n") : undefined;
  const joined = parts.length > 0 ? parts.join("") : "";
  return joined.length > 0 ? joined : undefined;
}

function objectField(entry: JsonLineRecord, key: string): JsonLineRecord | undefined {
  return isObjectRecord(entry[key]) ? (entry[key] as JsonLineRecord) : undefined;
}

function userText(entry: JsonLineRecord): string | undefined {
  if (entry.type !== "user") return undefined;
  const message = objectField(entry, "message");
  if (entry.isMeta === true || message?.isMeta === true) return undefined;
  const content = message?.content;
  return contentText(content ?? objectField(entry, "request")?.prompt, "user");
}

function assistantText(entry: JsonLineRecord): string | undefined {
  if (entry.type !== "assistant") return undefined;
  const contentMessage = objectField(entry, "message");
  const errorMessage = objectField(entry, "message");
  if (entry.isApiErrorMessage === true || errorMessage?.isApiErrorMessage === true)
    return undefined;
  const modelMessage = objectField(entry, "message");
  const model = readTrimmedString(entry.model) ?? readTrimmedString(modelMessage?.model);
  if (model === "<synthetic>") return undefined;
  return contentText(contentMessage?.content, "assistant");
}

function workspace(entry: JsonLineRecord): string | undefined {
  const message = objectField(entry, "message");
  const request = objectField(entry, "request");
  return (
    readTrimmedString(entry.cwd) ??
    readTrimmedString(message?.cwd) ??
    readTrimmedString(request?.cwd)
  );
}

function numericTimestamp(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  if (value > 1e12) return Math.trunc(value);
  if (value > 1e9) return Math.trunc(value * 1000);
  return undefined;
}

function timestampValue(value: unknown): number | undefined {
  if (typeof value === "number") return numericTimestamp(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numericTimestamp(numeric);
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function createdAt(entry: JsonLineRecord): number | undefined {
  const message = objectField(entry, "message");
  const request = objectField(entry, "request");
  const candidates = [
    entry.timestamp,
    entry.createdAt,
    entry.updatedAt,
    entry.created_at,
    entry.updated_at,
    entry.time,
    message?.timestamp,
    message?.createdAt,
    message?.updatedAt,
    request?.timestamp,
  ];
  for (const candidate of candidates) {
    const parsed = timestampValue(candidate);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

export function hasClaudeNativeSidechainMarker(entries: readonly JsonLineRecord[]): boolean {
  return entries.some((entry) => {
    const message = objectField(entry, "message");
    const request = objectField(entry, "request");
    return (
      entry.isSidechain === true || message?.isSidechain === true || request?.isSidechain === true
    );
  });
}

export function extractClaudeNativeSessionHeadInfo(entries: readonly JsonLineRecord[]): HeadInfo {
  let workspacePath: string | undefined;
  for (const entry of entries) {
    const user = userText(entry);
    const assistant = assistantText(entry);
    if (!workspacePath && (user || assistant)) {
      workspacePath = workspace(entry);
    }
    if (user) {
      return {
        workspacePath,
        previewTitle: deriveSessionTitle(user, []),
        createdAt: createdAt(entry),
      };
    }
  }
  return { workspacePath };
}
