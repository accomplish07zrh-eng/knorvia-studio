// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type {
  SessionInfo,
  SharedContextImportCommitBundle,
  SharedContextImportTransition,
} from "@knorvia/contracts";
import { messagesSync, saveMessageSync, savePartSync } from "./repositories/message-storage.js";
import { sessionEntries, saveSessionEntry } from "./repositories/session-entries.js";
import { createSession, getSession } from "./repositories/sessions.js";
import { withWriteTransaction } from "./repositories/write-transaction.js";

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function commitSharedContextImportBundle(
  db: DatabaseSync,
  bundle: SharedContextImportCommitBundle,
): SessionInfo {
  const { session, contextMessage, provenance } = bundle;
  const message = contextMessage.info;
  if (
    String(message.sessionID) !== String(session.id) ||
    String(provenance.sessionID) !== String(session.id) ||
    !provenance.id.includes(String(session.id)) ||
    message.role !== "user" ||
    message.visibility !== "model-only" ||
    message.source !== "shared_context"
  ) {
    throw new Error("Shared context import bundle identity is invalid");
  }
  let result!: SessionInfo;
  withWriteTransaction(db, "own", () => {
    const existing = getSession(db, session.id);
    if (existing) {
      const savedProvenance = sessionEntries(db, {
        sessionID: session.id,
        type: provenance.type,
      }).some((entry) => entry.id === provenance.id);
      if (!savedProvenance) throw new Error("Shared context import session is incomplete");
      result = existing;
      return;
    }
    result = createSession(db, session);
    // 导入整个临界段保持同步，让其他调用只能在本次事务结束后进入。
    saveMessageSync(db, message);
    for (const part of contextMessage.parts) savePartSync(db, part);
    saveSessionEntry(db, provenance);
  });
  return result;
}

export function transitionSharedContextImport(
  db: DatabaseSync,
  input: SharedContextImportTransition,
): boolean {
  const noTransition = Symbol("no shared context transition");
  try {
    withWriteTransaction(db, "own", () => {
      const entry = sessionEntries(db, {
        sessionID: input.sessionID,
        type: "v4/shared_context_import",
      }).find((candidate) => {
        const candidateData = objectRecord(candidate.data);
        return candidateData !== undefined && candidateData.contextId === input.contextId;
      });
      const data = objectRecord(entry?.data);
      const expected: readonly unknown[] = Array.isArray(input.expectedStatus)
        ? input.expectedStatus
        : [input.expectedStatus];
      if (!entry || !data || !expected.includes(data.status)) throw noTransition;
      const nextData: Record<string, unknown> = { ...data, status: input.status };
      if (input.sourceId) nextData.sourceId = input.sourceId;
      saveSessionEntry(db, {
        ...entry,
        data: nextData,
        time: { ...entry.time, updated: Date.now() },
      });
      const context = messagesSync(db, { sessionID: input.sessionID }).find(({ info }) => {
        const metadata = info.metadata;
        return (
          metadata !== null &&
          typeof metadata === "object" &&
          metadata.contextId === input.contextId
        );
      });
      if (context) {
        saveMessageSync(db, {
          ...context.info,
          metadata: { ...context.info.metadata, sharedContextStatus: input.status },
        });
      }
    });
    return true;
  } catch (error) {
    // false 仍须回滚；只有原控制信号可转换，清理失败的 AggregateError 必须保留。
    if (error === noTransition) return false;
    throw error;
  }
}
