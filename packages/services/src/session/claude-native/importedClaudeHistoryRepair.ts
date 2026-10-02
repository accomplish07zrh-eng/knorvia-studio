import { readFile } from "node:fs/promises";

import type {
  KnorviaAgentMcpServer,
  KnorviaSessionImportHistory,
  KnorviaSessionImportMessage,
  KnorviaSessionStateSnapshot,
} from "@knorvia/shared";

import {
  getLegacyDeletedTaskSessionSnapshotPath,
  getLegacyTaskSessionSnapshotPath,
} from "#src/paths.js";
import { buildImportedClaudeTaskId } from "#src/session/claude-native/buildImportedClaudeTaskFile.js";
import { claudeNativeSessionImportRepo } from "#src/session/claude-native/claudeNativeSessionImportRepo.js";
import { parseClaudeNativeSessionFile } from "#src/session/claude-native/claudeNativeSessionImportParser.js";
import { safeParseLegacyTaskSessionFile } from "#src/session/legacyTaskSessionFile.js";

interface ImportedClaudeHistoryRepairTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
}

interface ImportedClaudeHistoryRepairResult {
  traceId?: string;
  title?: string;
  createdAt?: number;
  updatedAt?: number;
  messages: KnorviaSessionImportMessage[];
  source: "legacySnapshot" | "nativeJsonl";
}

interface ImportedClaudeSessionRepairTarget extends ImportedClaudeHistoryRepairTarget {
  mcpServers?: KnorviaAgentMcpServer[];
}

interface ImportedClaudeSessionRepairCreateParams {
  workspacePath: string;
  workspaceIdentity?: string;
  sessionId: string;
  mode: KnorviaSessionStateSnapshot["session"]["mode"];
  model: KnorviaSessionStateSnapshot["settings"]["model"]["current"];
  thoughtLevel?: string;
  persistence: "immediate";
  mcpServers?: KnorviaAgentMcpServer[];
  importedHistory: KnorviaSessionImportHistory;
}

type ImportMessageInput = {
  role: string;
  content: string;
  timestamp?: number;
};

function importMessages(messages: readonly ImportMessageInput[]): KnorviaSessionImportMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
      timestamp: message.timestamp,
    }));
}

function assistantCount(messages: readonly KnorviaSessionImportMessage[]): number {
  return messages.filter((message) => message.role === "assistant").length;
}

function needsImportedHistoryRepair(snapshot: KnorviaSessionStateSnapshot): boolean {
  // 活跃轮次拥有当前状态；导入历史修复不能越过运行态权威边界。
  if (snapshot.session.status === "running" || snapshot.runtime.activeTurnId) return false;
  const hasLegacyFixedIds = snapshot.messages.some((message) =>
    /^msg_import_\d+$/u.test(message.info.messageId),
  );
  if (!snapshot.session.sessionId.startsWith("claude-import-") && !hasLegacyFixedIds) {
    return false;
  }
  if (!snapshot.messages.some((message) => message.info.role === "assistant")) return true;
  if (snapshot.messages[0]?.info.role === "assistant") return true;
  return hasLegacyFixedIds;
}

export async function readLegacyImportedClaudeHistory(
  target: ImportedClaudeHistoryRepairTarget,
): Promise<ImportedClaudeHistoryRepairResult | null> {
  const paths = [
    getLegacyTaskSessionSnapshotPath(target.workspacePath, target.taskId, target.workspaceIdentity),
    getLegacyDeletedTaskSessionSnapshotPath(
      target.workspacePath,
      target.taskId,
      target.workspaceIdentity,
    ),
  ];
  let raw: string | undefined;
  for (const path of paths) {
    try {
      raw = await readFile(path, "utf-8");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (raw === undefined) return null;
  const parsed = safeParseLegacyTaskSessionFile(JSON.parse(raw));
  if (!parsed.success || parsed.data.meta.migrationSource !== "claudeCode") return null;
  const messages = importMessages(parsed.data.messages);
  if (messages.length === 0) return null;
  return {
    traceId: parsed.data.meta.traceId,
    title: parsed.data.meta.title,
    createdAt: parsed.data.meta.createdAt,
    updatedAt: parsed.data.meta.updatedAt,
    messages,
    source: "legacySnapshot",
  };
}

async function readNativeImportedHistory(
  target: ImportedClaudeHistoryRepairTarget,
): Promise<ImportedClaudeHistoryRepairResult | null> {
  const candidates = await claudeNativeSessionImportRepo.scanImportableSessions({
    workspacePath: target.workspacePath,
  });
  const candidate = candidates.find(
    (item) => buildImportedClaudeTaskId(item.workspacePath, item.sessionId) === target.taskId,
  );
  if (!candidate) return null;
  const source = await parseClaudeNativeSessionFile({
    filePath: candidate.sourcePath,
    workspacePath: candidate.workspacePath,
    sessionId: candidate.sessionId,
    sourcePath: candidate.sourcePath,
    fallbackCreatedAt: candidate.createdAt,
    fallbackUpdatedAt: candidate.updatedAt,
  });
  const messages = importMessages(source.messages);
  if (messages.length === 0) return null;
  return {
    title: source.title,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    messages,
    source: "nativeJsonl",
  };
}

async function resolveImportedHistory(
  target: ImportedClaudeHistoryRepairTarget,
): Promise<ImportedClaudeHistoryRepairResult | null> {
  const legacy = await readLegacyImportedClaudeHistory(target);
  if (legacy && assistantCount(legacy.messages) > 0) return legacy;
  const native = await readNativeImportedHistory(target);
  if (native && assistantCount(native.messages) >= assistantCount(legacy?.messages ?? [])) {
    return native;
  }
  return legacy;
}

export async function repairImportedClaudeSessionSnapshot<T>(params: {
  snapshot: KnorviaSessionStateSnapshot;
  target: ImportedClaudeSessionRepairTarget;
  createSession(input: ImportedClaudeSessionRepairCreateParams): Promise<T>;
  onRepair?(history: ImportedClaudeHistoryRepairResult): void;
}): Promise<T | null> {
  if (!needsImportedHistoryRepair(params.snapshot)) return null;
  const history = await resolveImportedHistory(params.target);
  if (!history) return null;
  // 回调先于重建执行，随后读取实时参数；回调失败必须阻止持久化。
  params.onRepair?.(history);
  return params.createSession({
    workspacePath: params.target.workspacePath,
    workspaceIdentity: params.target.workspaceIdentity,
    sessionId: params.target.taskId,
    mode: params.snapshot.session.mode,
    model: params.snapshot.settings.model.current,
    thoughtLevel: params.snapshot.settings.thoughtLevel.current,
    persistence: "immediate",
    mcpServers: params.target.mcpServers,
    importedHistory: {
      source: "claudeCode",
      title: history.title,
      createdAt: history.createdAt,
      updatedAt: history.updatedAt,
      messages: history.messages,
    },
  });
}
