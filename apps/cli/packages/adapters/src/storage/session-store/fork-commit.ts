// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type {
  CreateSessionInput,
  ForkChildSessionMetadata,
  ForkCommitBundle,
  SessionId,
  SessionInfo,
} from "@knorvia/contracts";
import { cloneSessionTargetForFork } from "../session-target.js";
import type { ForkCommitFaultStage } from "./options.js";
import { validateForkBundleContents } from "./fork-validation.js";
import { saveMessageSync, savePartSync } from "./repositories/message-storage.js";
import { saveSessionEntry, sessionEntries } from "./repositories/session-entries.js";
import { saveSessionInputSync } from "./repositories/session-inputs.js";
import { createSession, getSession } from "./repositories/sessions.js";
import { withWriteTransaction } from "./repositories/write-transaction.js";

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function replayChild(
  db: DatabaseSync,
  parent: SessionId,
  entryId: string,
  mode: "metadata" | "bundle",
): SessionInfo | undefined {
  const entry = sessionEntries(db, { sessionID: parent, type: "v4/command_fact" }).find(
    (candidate) => candidate.id === entryId,
  );
  if (!entry) return undefined;
  const corrupt = `Fork ${mode === "metadata" ? "child" : "bundle"} command fact is corrupt: ${entryId}`;
  const result = objectRecord(objectRecord(objectRecord(entry.data)?.ack)?.result);
  if (typeof result?.sessionId !== "string" || !result.sessionId) throw new Error(corrupt);
  const child = getSession(db, result.sessionId as SessionId);
  if (!child) {
    throw new Error(
      mode === "metadata" ? `Fork child session is missing: ${result.sessionId}` : corrupt,
    );
  }
  return child;
}

function saveCommandFact(
  db: DatabaseSync,
  parent: SessionId,
  entryId: string,
  ack: unknown,
  metadata: unknown,
): void {
  const now = Date.now();
  saveSessionEntry(db, {
    id: entryId,
    sessionID: parent,
    type: "v4/command_fact",
    time: { created: now, updated: now },
    data: { source: "child", ack, metadata },
  });
}

export function createForkedSessionWithMetadata(
  db: DatabaseSync,
  input: CreateSessionInput,
  metadata: ForkChildSessionMetadata,
): SessionInfo {
  if (!input.parentID || String(input.parentID) !== metadata.parentSessionId) {
    throw new Error("Fork child metadata parent does not match session parentID");
  }
  const { boundaryMessageId, orderedMessageIds } = metadata.forkTarget;
  if (
    !metadata.sourceCommandId.trim() ||
    !boundaryMessageId.trim() ||
    (orderedMessageIds.length > 0 && orderedMessageIds.at(-1) !== boundaryMessageId)
  ) {
    throw new Error("Fork child metadata is invalid");
  }
  const parent = input.parentID;
  const entryId = `v4_command_fact:child:${metadata.parentSessionId}:${metadata.sourceCommandId}`;
  let child!: SessionInfo;
  // 单一所有者处理 BEGIN、自动回滚及清理双因，避免二次回滚遮蔽业务失败。
  withWriteTransaction(db, "own", () => {
    const existing = replayChild(db, parent, entryId, "metadata");
    if (existing) {
      child = existing;
      return;
    }
    child = createSession(db, input);
    saveCommandFact(
      db,
      parent,
      entryId,
      {
        commandId: metadata.sourceCommandId,
        status: "accepted",
        revisionAtDecision: 0,
        result: { type: "forkAssistant", sessionId: String(child.id) },
      },
      metadata,
    );
  });
  return child;
}

export function commitForkBundle(
  db: DatabaseSync,
  bundle: ForkCommitBundle,
  faultAt?: ForkCommitFaultStage,
): SessionInfo {
  const parent = bundle.child.parentID;
  const command = bundle.commandFact;
  if (
    !parent ||
    String(parent) !== command.parentSessionId ||
    (bundle.initialInput && String(bundle.initialInput.sessionID) !== String(bundle.child.id)) ||
    command.ack.commandId !== command.sourceCommandId
  ) {
    throw new Error("Fork commit bundle identity is invalid");
  }
  const entryId = `v4_command_fact:child:${command.parentSessionId}:${command.sourceCommandId}`;
  const checkStage = (stage: ForkCommitFaultStage): void => {
    if (faultAt === stage) throw new Error(`injected fork commit fault: ${stage}`);
  };
  let child!: SessionInfo;
  withWriteTransaction(db, "own", () => {
    const existing = replayChild(db, parent, entryId, "bundle");
    if (existing) {
      child = existing;
      return;
    }
    validateForkBundleContents(bundle);
    child = createSession(db, bundle.child);
    checkStage("afterChild");
    // 事务内复用同步写路径，防止 await 让同连接的另一会话写入混入本次提交。
    for (const message of bundle.messages) {
      const source = bundle.copySources?.messages[String(message.info.id)];
      saveMessageSync(db, message.info, source ? { sessionID: parent, id: source } : undefined);
      for (const part of message.parts) {
        const partSource = bundle.copySources?.parts[String(part.id)];
        savePartSync(db, part, partSource ? { sessionID: parent, id: partSource } : undefined);
      }
    }
    checkStage("afterMessages");
    if (bundle.goal) {
      cloneSessionTargetForFork(db, {
        source: bundle.goal.source,
        sessionID: bundle.child.id,
        status: bundle.goal.status,
      });
    }
    checkStage("afterGoal");
    for (const entry of bundle.entries) saveSessionEntry(db, entry);
    checkStage("afterEntries");
    if (bundle.initialInput) saveSessionInputSync(db, bundle.initialInput);
    checkStage("afterInput");
    saveCommandFact(db, parent, entryId, command.ack, command.metadata);
    checkStage("afterCommandFact");
    checkStage("beforeCommit");
  });
  return child;
}
