// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 分叉提交：child 会话与它的 command fact 一起落库，重放同一分叉时按 fact 幂等返回。
// entry id 格式、fault 阶段名、错误文案与 ack 数据形状都是对外可观察契约，逐字保留。

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

const FACT_TYPE = "v4/command_fact";
const FACT_ID_PREFIX = "v4_command_fact:child:";
const FACT_SOURCE = "child";

/** 对象收窄：数组与 null 都不算记录。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object") return undefined;
  return Array.isArray(value) ? undefined : (value as Record<string, unknown>);
}

/** 幂等键：分叉 fact 的 entry id 由「父会话 + 源命令」唯一确定。 */
function factEntryId(parentSessionId: string, sourceCommandId: string): string {
  return `${FACT_ID_PREFIX}${parentSessionId}:${sourceCommandId}`;
}

function corruptMessage(mode: "metadata" | "bundle", entryId: string): string {
  const what = mode === "metadata" ? "child" : "bundle";
  return `Fork ${what} command fact is corrupt: ${entryId}`;
}

/** 从既有 fact 里读回 child 会话；缺失或畸形按 mode 给出不同措辞。 */
function replayChild(
  db: DatabaseSync,
  parent: SessionId,
  entryId: string,
  mode: "metadata" | "bundle",
): SessionInfo | undefined {
  const fact = sessionEntries(db, { sessionID: parent, type: FACT_TYPE }).find(
    (candidate) => candidate.id === entryId,
  );
  if (!fact) return undefined;
  const corrupt = corruptMessage(mode, entryId);
  const ack = asRecord(asRecord(asRecord(fact.data)?.ack)?.result);
  if (typeof ack?.sessionId !== "string" || !ack.sessionId) throw new Error(corrupt);
  const forked = getSession(db, ack.sessionId as SessionId);
  if (!forked) {
    const missing = `Fork child session is missing: ${ack.sessionId}`;
    throw new Error(mode === "metadata" ? missing : corrupt);
  }
  return forked;
}

/** 写 fact：ack 与 metadata 原样存入 data，时间戳由调用时决定。 */
function saveCommandFact(values: {
  ack: unknown;
  db: DatabaseSync;
  entryId: string;
  metadata: unknown;
  parent: SessionId;
  stamp: number;
}): void {
  const { ack, db, entryId, metadata, parent, stamp } = values;
  saveSessionEntry(db, {
    id: entryId,
    sessionID: parent,
    type: FACT_TYPE,
    time: { created: stamp, updated: stamp },
    data: { source: FACT_SOURCE, ack, metadata },
  });
}

function resolveMetadataParent(
  input: CreateSessionInput,
  metadata: ForkChildSessionMetadata,
): SessionId {
  const invalid = () => new Error("Fork child metadata is invalid");
  if (!input.parentID || String(input.parentID) !== metadata.parentSessionId) {
    throw new Error("Fork child metadata parent does not match session parentID");
  }
  const { boundaryMessageId, orderedMessageIds } = metadata.forkTarget;
  if (!metadata.sourceCommandId.trim()) throw invalid();
  const parent = input.parentID;
  if (!boundaryMessageId.trim()) throw invalid();
  if (orderedMessageIds.length > 0 && orderedMessageIds.at(-1) !== boundaryMessageId) {
    throw invalid();
  }
  return parent;
}

export function createForkedSessionWithMetadata(
  db: DatabaseSync,
  input: CreateSessionInput,
  metadata: ForkChildSessionMetadata,
): SessionInfo {
  const parent = resolveMetadataParent(input, metadata);
  const entryId = factEntryId(metadata.parentSessionId, metadata.sourceCommandId);
  let forked!: SessionInfo;
  // 单一所有者处理 BEGIN、自动回滚及清理双因，避免二次回滚遮蔽业务失败。
  withWriteTransaction(db, "own", () => {
    const prior = replayChild(db, parent, entryId, "metadata");
    if (prior) {
      forked = prior;
      return;
    }
    forked = createSession(db, input);
    saveCommandFact({
      ack: {
        commandId: metadata.sourceCommandId,
        status: "accepted",
        revisionAtDecision: 0,
        result: { type: "forkAssistant", sessionId: String(forked.id) },
      },
      db,
      entryId,
      metadata,
      parent,
      stamp: Date.now(),
    });
  });
  return forked;
}

/** 校验 bundle 身份并返回收窄后的父会话 id。 */
function resolveBundleParent(bundle: ForkCommitBundle): SessionId {
  const parent = bundle.child.parentID;
  const command = bundle.commandFact;
  if (!parent) throw new Error("Fork commit bundle identity is invalid");
  if (String(parent) !== command.parentSessionId) {
    throw new Error("Fork commit bundle identity is invalid");
  }
  if (bundle.initialInput && String(bundle.initialInput.sessionID) !== String(bundle.child.id)) {
    throw new Error("Fork commit bundle identity is invalid");
  }
  if (command.ack.commandId !== command.sourceCommandId) {
    throw new Error("Fork commit bundle identity is invalid");
  }
  return parent;
}

/** 事务内复用同步写路径，防止 await 让同连接的另一会话写入混入本次提交。 */
function replayMessages(db: DatabaseSync, bundle: ForkCommitBundle, parent: SessionId): void {
  for (const message of bundle.messages) {
    const source = bundle.copySources?.messages[String(message.info.id)];
    saveMessageSync(db, message.info, source ? { sessionID: parent, id: source } : undefined);
    for (const part of message.parts) {
      const partSource = bundle.copySources?.parts[String(part.id)];
      savePartSync(db, part, partSource ? { sessionID: parent, id: partSource } : undefined);
    }
  }
}

function replayGoal(db: DatabaseSync, bundle: ForkCommitBundle): void {
  if (!bundle.goal) return;
  cloneSessionTargetForFork(db, {
    source: bundle.goal.source,
    sessionID: bundle.child.id,
    status: bundle.goal.status,
  });
}

export function commitForkBundle(
  db: DatabaseSync,
  bundle: ForkCommitBundle,
  faultAt?: ForkCommitFaultStage,
): SessionInfo {
  const parent = resolveBundleParent(bundle);
  const command = bundle.commandFact;
  const entryId = factEntryId(command.parentSessionId, command.sourceCommandId);
  const checkStage = (stage: ForkCommitFaultStage): void => {
    if (faultAt === stage) throw new Error(`injected fork commit fault: ${stage}`);
  };
  let forked!: SessionInfo;
  withWriteTransaction(db, "own", () => {
    const prior = replayChild(db, parent, entryId, "bundle");
    if (prior) {
      forked = prior;
      return;
    }
    validateForkBundleContents(bundle);
    forked = createSession(db, bundle.child);
    checkStage("afterChild");
    replayMessages(db, bundle, parent);
    checkStage("afterMessages");
    replayGoal(db, bundle);
    checkStage("afterGoal");
    for (const entry of bundle.entries) saveSessionEntry(db, entry);
    checkStage("afterEntries");
    if (bundle.initialInput) saveSessionInputSync(db, bundle.initialInput);
    checkStage("afterInput");
    saveCommandFact({
      ack: command.ack,
      db,
      entryId,
      metadata: command.metadata,
      parent,
      stamp: Date.now(),
    });
    checkStage("afterCommandFact");
    checkStage("beforeCommit");
  });
  return forked;
}
