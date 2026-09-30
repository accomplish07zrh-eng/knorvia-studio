// Modified by Knorvia Studio: see packages/services/specs/claude-leaf-contract-fast-2057.md.
// Prior upstream source exposure; existing Apache-2.0/NOTICE obligations remain.
import { types } from "node:util";
import { deriveSessionTitle } from "#src/session/sessionTitle.js";
import {
  isObjectRecord,
  readTrimmedString,
  type JsonLineRecord,
} from "#src/session/claude-native/jsonLineRecord.js";

const IDE_OPENED_FILE_TAG_RE = /<ide_opened_file>[\s\S]*?<\/ide_opened_file>/gi;
const COMMAND_TAG_BLOCK_RE =
  /<(?:local-command|command)-[^>]+>[\s\S]*?<\/(?:local-command|command)-[^>]+>/gi;

function toTimestampMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) {
      return Math.trunc(value);
    }
    if (value > 1_000_000_000) {
      return Math.trunc(value * 1000);
    }
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const numericValue = Number(normalized);
  if (Number.isFinite(numericValue)) {
    return toTimestampMs(numericValue);
  }

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readEntryTimestamp(entry: JsonLineRecord): number | undefined {
  const message = isObjectRecord(entry.message) ? entry.message : undefined;
  const request = isObjectRecord(entry.request) ? entry.request : undefined;
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
    const timestamp = toTimestampMs(candidate);
    if (timestamp !== undefined) {
      return timestamp;
    }
  }

  return undefined;
}

function readEntryWorkspacePath(entry: JsonLineRecord): string | undefined {
  const message = isObjectRecord(entry.message) ? entry.message : undefined;
  const request = isObjectRecord(entry.request) ? entry.request : undefined;
  return (
    readTrimmedString(entry.cwd) ??
    readTrimmedString(message?.cwd) ??
    readTrimmedString(request?.cwd)
  );
}

function readEntryModel(entry: JsonLineRecord): string | undefined {
  const message = isObjectRecord(entry.message) ? entry.message : undefined;
  return readTrimmedString(entry.model) ?? readTrimmedString(message?.model);
}

function isClaudeNativeSidechainEntry(entry: JsonLineRecord): boolean {
  const message = isObjectRecord(entry.message) ? entry.message : undefined;
  const request = isObjectRecord(entry.request) ? entry.request : undefined;
  return (
    entry.isSidechain === true || message?.isSidechain === true || request?.isSidechain === true
  );
}

export function hasClaudeNativeSidechainMarker(entries: readonly JsonLineRecord[]): boolean {
  return entries.some(isClaudeNativeSidechainEntry);
}

function sanitizeClaudeVisibleText(text: string): string {
  return text
    .replace(IDE_OPENED_FILE_TAG_RE, " ")
    .replace(COMMAND_TAG_BLOCK_RE, " ")
    .replace(/\r\n/g, "\n")
    .trim();
}

function isClaudeNativeNonVisibleAssistantEntry(entry: JsonLineRecord): boolean {
  const message = isObjectRecord(entry.message) ? entry.message : undefined;
  return (
    entry.isApiErrorMessage === true ||
    message?.isApiErrorMessage === true ||
    readEntryModel(entry) === "<synthetic>"
  );
}

function extractTextField(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!isObjectRecord(value)) {
    return "";
  }

  return readTrimmedString(value.text) ?? readTrimmedString(value.content) ?? "";
}

const nativeFlatMap = Array.prototype.flatMap;
const nativeFilter = Array.prototype.filter;
const nativeSpecies = Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get;

function projectFragment(item: unknown, role: "user" | "assistant"): string {
  if (typeof item === "string") return sanitizeClaudeVisibleText(item);
  if (!isObjectRecord(item)) return "";
  if (role === "user" ? item.type === "tool_result" : item.type !== "text") return "";
  return sanitizeClaudeVisibleText(extractTextField(item));
}

function canCollectDirectly(content: unknown[]): boolean {
  // JSON-decoded arrays take the indexed path. Preserve native method/species behavior
  // for extended JS inputs; proxy traps must only be invoked by the original pipeline.
  return (
    !types.isProxy(content) &&
    Object.getPrototypeOf(content) === Array.prototype &&
    !Object.getOwnPropertyDescriptor(content, "flatMap") &&
    !Object.getOwnPropertyDescriptor(content, "constructor") &&
    Object.getOwnPropertyDescriptor(Array.prototype, "flatMap")?.value === nativeFlatMap &&
    Object.getOwnPropertyDescriptor(Array.prototype, "filter")?.value === nativeFilter &&
    Object.getOwnPropertyDescriptor(Array.prototype, "constructor")?.value === Array &&
    Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get === nativeSpecies
  );
}

function projectVisibleContent(content: unknown, role: "user" | "assistant"): string | null {
  if (typeof content === "string") return sanitizeClaudeVisibleText(content) || null;
  if (!Array.isArray(content)) return null;

  let fragments: string[];
  if (canCollectDirectly(content)) {
    fragments = [];
    // Capture length once and skip holes, including slots deleted by a getter.
    const length = content.length;
    for (let index = 0; index < length; index++) {
      if (!(index in content)) continue;
      const visible = projectFragment(content[index], role);
      if (visible) fragments.push(visible);
    }
  } else {
    // Retained compatibility adapter for callers supplying custom Array methods/species.
    fragments = content
      .flatMap((item) => {
        const visible = projectFragment(item, role);
        return visible ? [visible] : [];
      })
      .filter((part) => part.length > 0);
  }
  if (role === "user") return fragments.length > 0 ? fragments.join("\n\n") : null;
  const text = fragments.length > 0 ? fragments.join("") : "";
  return text.length > 0 ? text : null;
}

function extractClaudeUserText(entry: JsonLineRecord): string | null {
  if (entry.type !== "user") return null;
  const message = isObjectRecord(entry.message) ? entry.message : undefined;
  if (entry.isMeta === true || message?.isMeta === true) return null;
  const content =
    message?.content ?? (isObjectRecord(entry.request) ? entry.request.prompt : undefined);
  return projectVisibleContent(content, "user");
}

function extractClaudeAssistantText(entry: JsonLineRecord): string | null {
  if (entry.type !== "assistant") return null;
  const message = isObjectRecord(entry.message) ? entry.message : undefined;
  if (isClaudeNativeNonVisibleAssistantEntry(entry)) return null;
  return projectVisibleContent(message?.content, "assistant");
}

export function extractClaudeNativeSessionHeadInfo(entries: readonly JsonLineRecord[]): {
  workspacePath?: string;
  previewTitle?: string;
  createdAt?: number;
} {
  let workspacePath: string | undefined;

  for (const entry of entries) {
    const userText = extractClaudeUserText(entry);
    const assistantText = extractClaudeAssistantText(entry);
    if (!workspacePath && (userText || assistantText)) {
      workspacePath = readEntryWorkspacePath(entry);
    }
    if (!userText) {
      continue;
    }

    return {
      workspacePath,
      previewTitle: deriveSessionTitle(userText, []),
      createdAt: readEntryTimestamp(entry),
    };
  }

  return { workspacePath };
}
