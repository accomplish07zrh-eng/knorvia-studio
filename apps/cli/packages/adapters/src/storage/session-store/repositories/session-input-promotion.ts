// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type { SessionId, SessionStorePort } from "@knorvia/contracts";
import { isInputDocument } from "./session-input-documents.js";
import { messagesSync, saveMessageSync, savePartSync } from "./message-storage.js";
import { saveSessionEntry, sessionEntries } from "./session-entries.js";
import { withWriteTransaction } from "./write-transaction.js";

type Promotion = Parameters<NonNullable<SessionStorePort["promoteSessionInput"]>>[0];

function isLiveObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function attachContext(
  db: DatabaseSync,
  sessionID: SessionId,
  contextID: string,
  messageID: string,
  time: number,
): void {
  const entry = sessionEntries(db, { sessionID, type: "v4/shared_context_import" }).find(
    (candidate) => isInputDocument(candidate.data) && candidate.data.contextId === contextID,
  );
  if (!entry || !isInputDocument(entry.data)) throw new Error("shared context import is missing");
  const status = String(entry.data.status);
  if (status !== "pending" && status !== "reserved")
    throw new Error("shared context import is no longer attachable");
  saveSessionEntry(db, {
    ...entry,
    time: { ...entry.time, updated: time },
    data: { ...entry.data, status: "attached", attachedMessageId: messageID },
  });
  const contextMessage = messagesSync(db, { sessionID }).find(
    ({ info }) => isLiveObject(info.metadata) && info.metadata.contextId === contextID,
  )?.info;
  if (contextMessage && isLiveObject(contextMessage.metadata)) {
    saveMessageSync(db, {
      ...contextMessage,
      metadata: { ...contextMessage.metadata, sharedContextStatus: "attached" },
    });
  }
}

export async function promoteSessionInput(db: DatabaseSync, input: Promotion): Promise<void> {
  const time = Date.now();
  // 全部依赖使用同步入口，事务中不让出 JS 执行权，避免卷入另一会话已成功的入账。
  // 错误交给唯一自有边界处理，既不丢弃 Promise 拒绝，也不重复实现回滚清理。
  withWriteTransaction(db, "own", () => {
    saveMessageSync(db, input.message);
    for (const part of input.parts) savePartSync(db, part);
    const metadata = input.message.metadata;
    const intent = isLiveObject(metadata) ? metadata.inputIntent : undefined;
    const refs = isLiveObject(intent) ? intent.sharedContextRefs : undefined;
    const messageID = String(input.message.id);
    if (Array.isArray(refs)) {
      for (const ref of refs) {
        if (
          isLiveObject(ref) &&
          ref.kind === "shared_context_import" &&
          typeof ref.context_id === "string"
        ) {
          attachContext(db, input.sessionID, ref.context_id, messageID, time);
        }
      }
    }
    db.prepare(`
      UPDATE session_input SET status = 'promoted', promoted_message_id = ?, promoted_sequence = (
        SELECT COALESCE(MAX(promoted_sequence), -1) + 1 FROM session_input WHERE session_id = ?
      ), time_updated = ? WHERE id = ? AND session_id = ?
    `).run(messageID, input.sessionID, time, input.id, input.sessionID);
  });
}
