// Authored from the designated native-session parser contracts and API packets.
// Compatibility API names, protocol literals, and dependency ports are retained.
// Dependency implementations and their existing attribution remain separate.
import { stat } from "node:fs/promises";

import {
  isObjectRecord,
  readTrimmedString,
  type JsonLineRecord,
} from "#src/session/claude-native/jsonLineRecord.js";
import type { ClaudeNativeImportedSessionSource } from "#src/session/claude-native/claudeNativeImportedSessionTypes.js";
import { readJsonLinesFile } from "#src/session/claude-native/sessionHistoryJsonl.js";
import { deriveSessionTitle } from "#src/session/sessionTitle.js";

interface SessionFileParams {
  filePath: string;
  workspacePath: string;
  sessionId: string;
  sourcePath?: string;
  fallbackCreatedAt?: number;
  fallbackUpdatedAt?: number;
}

interface ProjectionParams {
  workspacePath: string;
  sessionId: string;
  sourcePath: string;
  fallbackCreatedAt?: number;
  fallbackUpdatedAt?: number;
}

function recordField(entry: JsonLineRecord, key: string): JsonLineRecord | undefined {
  const value = entry[key];
  return isObjectRecord(value) ? value : undefined;
}

function entryWorkspace(entry: JsonLineRecord): string | undefined {
  return (
    readTrimmedString(entry.cwd) ??
    readTrimmedString(recordField(entry, "message")?.cwd) ??
    readTrimmedString(recordField(entry, "request")?.cwd)
  );
}

function entryModel(entry: JsonLineRecord): string | undefined {
  return readTrimmedString(entry.model) ?? readTrimmedString(recordField(entry, "message")?.model);
}

function convertTimestamp(value: unknown): number | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    if (value > 1e12) return Math.trunc(value);
    if (value > 1e9) return Math.trunc(value * 1000);
    return undefined;
  }
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return convertTimestamp(numeric);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function entryTimestamp(entry: JsonLineRecord): number | undefined {
  const message = recordField(entry, "message");
  const request = recordField(entry, "request");
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
    const timestamp = convertTimestamp(candidate);
    if (timestamp !== undefined) return timestamp;
  }
  return undefined;
}

function visibleText(text: string): string {
  return text
    .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/gi, " ")
    .replace(/<(?:local-command|command)-[^>]+>[\s\S]*?<\/(?:local-command|command)-[^>]+>/gi, " ")
    .replace(/\r\n/g, "\n")
    .trim();
}

function textField(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isObjectRecord(value)) return "";
  return readTrimmedString(value.text) ?? readTrimmedString(value.content) ?? "";
}

function userText(entry: JsonLineRecord): string | null {
  if (entry.type !== "user") return null;
  const message = recordField(entry, "message");
  if (entry.isMeta === true || message?.isMeta === true) return null;
  const content = message?.content ?? recordField(entry, "request")?.prompt;
  if (typeof content === "string") return visibleText(content) || null;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item !== "string" && (!isObjectRecord(item) || item.type === "tool_result")) {
      continue;
    }
    const text = visibleText(textField(item));
    if (text) parts.push(text);
  }
  return parts.length ? parts.join("\n\n") : null;
}

function assistantText(entry: JsonLineRecord): string | null {
  if (entry.type !== "assistant") return null;
  const message = recordField(entry, "message");
  if (
    entryModel(entry) === "<synthetic>" &&
    entry.isApiErrorMessage !== true &&
    message?.isApiErrorMessage !== true
  ) {
    return null;
  }
  const content = message?.content;
  if (typeof content === "string") return visibleText(content) || null;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item !== "string" && (!isObjectRecord(item) || item.type !== "text")) {
      continue;
    }
    const text = visibleText(textField(item));
    if (text) parts.push(text);
  }
  const text = parts
    .join("")
    .trimEnd()
    .replace(/(?:\n+\s*)?No response requested\.$/u, "")
    .trimEnd();
  return text || null;
}

export function hasClaudeNativeSidechainMarker(entries: readonly JsonLineRecord[]): boolean {
  return entries.some(
    (entry) =>
      entry.isSidechain === true ||
      recordField(entry, "message")?.isSidechain === true ||
      recordField(entry, "request")?.isSidechain === true,
  );
}

export function extractClaudeNativeSessionHeadInfo(entries: readonly JsonLineRecord[]): {
  workspacePath?: string;
  previewTitle?: string;
  createdAt?: number;
} {
  let workspacePath: string | undefined;
  for (const entry of entries) {
    const user = userText(entry);
    const assistant = assistantText(entry);
    if (!workspacePath && (user || assistant)) workspacePath = entryWorkspace(entry);
    if (!user) continue;
    return {
      workspacePath,
      previewTitle: deriveSessionTitle(user, []),
      createdAt: entryTimestamp(entry),
    };
  }
  return { workspacePath };
}

function projectRecords(
  records: readonly JsonLineRecord[],
  params: ProjectionParams,
): ClaudeNativeImportedSessionSource {
  const messages: ClaudeNativeImportedSessionSource["messages"] = [];
  let detectedWorkspacePath: string | undefined;
  let firstVisibleUserTimestamp: number | undefined;
  let updatedAt = params.fallbackUpdatedAt;
  let currentTurnIndex = -1;
  let model: string | undefined;
  let pendingAssistantContent = "";
  let pendingAssistantTimestamp: number | undefined;

  // 顺序契约：先收口上一轮，再采用新用户时间。
  // 助手模型仅在用户轮次内首次有值时确定，后续沿用。
  const flushAssistant = (): void => {
    if (pendingAssistantContent && currentTurnIndex >= 0) {
      messages.push({
        role: "assistant",
        content: pendingAssistantContent,
        timestamp: pendingAssistantTimestamp ?? updatedAt ?? Date.now(),
        ...(model ? { model } : {}),
        turnIndex: currentTurnIndex,
      });
      updatedAt = pendingAssistantTimestamp ?? updatedAt;
    }
    pendingAssistantContent = "";
    pendingAssistantTimestamp = undefined;
  };

  for (const entry of records) {
    const user = userText(entry);
    if (!detectedWorkspacePath && user) detectedWorkspacePath = entryWorkspace(entry);
    if (user) {
      flushAssistant();
      currentTurnIndex += 1;
      const timestamp = entryTimestamp(entry) ?? updatedAt ?? Date.now();
      firstVisibleUserTimestamp ??= timestamp;
      updatedAt = timestamp;
      messages.push({ role: "user", content: user, timestamp, turnIndex: currentTurnIndex });
      continue;
    }
    const assistant = assistantText(entry);
    if (!detectedWorkspacePath && assistant) detectedWorkspacePath = entryWorkspace(entry);
    if (!assistant || currentTurnIndex < 0) continue;
    model ??= entryModel(entry);
    pendingAssistantContent += assistant;
    pendingAssistantTimestamp = entryTimestamp(entry) ?? pendingAssistantTimestamp ?? updatedAt;
    updatedAt = pendingAssistantTimestamp ?? updatedAt;
  }
  flushAssistant();
  if (messages.length === 0) {
    throw new Error(`[claude-native] Claude 原生 session ${params.sessionId} 没有可导入的可见消息`);
  }
  return {
    provider: "claude",
    sessionId: params.sessionId,
    workspacePath: detectedWorkspacePath ?? params.workspacePath,
    sourcePath: params.sourcePath,
    createdAt: firstVisibleUserTimestamp ?? params.fallbackCreatedAt ?? updatedAt ?? Date.now(),
    updatedAt: updatedAt ?? firstVisibleUserTimestamp ?? params.fallbackCreatedAt ?? Date.now(),
    title: deriveSessionTitle(
      messages.find((message) => message.role === "user")?.content ?? "",
      [],
    ),
    migrationSource: "claudeCode",
    ...(model ? { model } : {}),
    messages,
  };
}

export async function parseClaudeNativeSessionFile(
  params: SessionFileParams,
): Promise<ClaudeNativeImportedSessionSource> {
  const recordsPromise = readJsonLinesFile(params.filePath);
  const sourceStatPromise = stat(params.filePath);
  const [records, sourceStat] = await Promise.all([recordsPromise, sourceStatPromise]);
  // 异步屏障后才读取这些参数，保留调用期间参数变更的既有语义。
  return projectRecords(records, {
    workspacePath: params.workspacePath,
    sessionId: params.sessionId,
    sourcePath: params.sourcePath ?? params.filePath,
    fallbackCreatedAt: params.fallbackCreatedAt ?? Math.trunc(sourceStat.birthtimeMs),
    fallbackUpdatedAt: params.fallbackUpdatedAt ?? Math.trunc(sourceStat.mtimeMs),
  });
}
