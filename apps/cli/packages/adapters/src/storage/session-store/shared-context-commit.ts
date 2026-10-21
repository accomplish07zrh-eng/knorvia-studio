// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 共享上下文导入的落库入口：把一次导入的 bundle 原子地写成会话事实。
//
// 提交语义（五条，逐条对应下面的一段代码）：
//   ① 整段写在一个自有事务里；任一步失败都不留下半次导入，调用方可直接重试。
//   ② 写入顺序固定为「消息 → 分片 → 会话条目 → 会话行」，先写从属事实再更新主行，
//      这样主行的 updatedAt 一定晚于它所引用的子记录。
//   ③ 重复提交同一个 bundle 按幂等处理：已存在的会话只在确有必要时直接复用，不追加重复行。
//   ④ 反馈型 transition（例如标记为已导入）在提交末尾统一应用，避免中途状态被读到。
//   ⑤ 会话不存在时按 `createSession` 的既有语义创建，不在这里另定缺失处理策略。

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

/** 两个入参类型的短别名：签名里各出现多次。 */
type ImportBundle = SharedContextImportCommitBundle;
type ImportTransition = SharedContextImportTransition;

/** 把未知值窄化成「键值记录」：数组与 null 都不算。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null) return undefined;
  if (typeof value !== "object") return undefined;
  if (Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/**
 * 校验 bundle 的身份一致性。
 *
 * 两组判据分开看：**三个 id 必须指向同一会话**；**消息形态必须是共享上下文导入**。
 * 任一组不成立都拒绝 —— 因为后续写入会以这三者的 id 建立外键关系。
 */
function assertBundleIdentity(bundle: ImportBundle): void {
  const { session, contextMessage, provenance } = bundle;
  const message = contextMessage.info;

  const sameSession =
    String(message.sessionID) === String(session.id) &&
    String(provenance.sessionID) === String(session.id) &&
    provenance.id.includes(String(session.id));

  const importShape =
    message.role === "user" &&
    message.visibility === "model-only" &&
    message.source === "shared_context";

  if (!sameSession || !importShape) {
    throw new Error("Shared context import bundle identity is invalid");
  }
}

/** 会话已存在时，判断它是不是「同一次导入的幂等重放」。 */
function isIdempotentReplay(database: DatabaseSync, bundle: ImportBundle): boolean {
  const { session, provenance } = bundle;
  const entries = sessionEntries(database, { sessionID: session.id, type: provenance.type });
  return entries.some((entry) => entry.id === provenance.id);
}

/** 首次导入的写入顺序：消息 → 分片 → 会话条目（会话行在建会话时已写）。 */
function writeImportedFacts(database: DatabaseSync, bundle: ImportBundle): void {
  const { contextMessage, provenance } = bundle;
  saveMessageSync(database, contextMessage.info);
  for (const part of contextMessage.parts) savePartSync(database, part);
  saveSessionEntry(database, provenance);
}

export function commitSharedContextImportBundle(
  database: DatabaseSync,
  bundle: ImportBundle,
): SessionInfo {
  assertBundleIdentity(bundle);

  let result!: SessionInfo;
  withWriteTransaction(database, "own", () => {
    const existing = getSession(database, bundle.session.id);
    // 真值判断：getSession 返回 null 表示「不存在」（不是 undefined）。
    if (existing) {
      if (!isIdempotentReplay(database, bundle)) {
        throw new Error("Shared context import session is incomplete");
      }
      result = existing;
      return;
    }
    // 导入整个临界段保持同步，让其他调用只能在本次事务结束后进入。
    result = createSession(database, bundle.session);
    writeImportedFacts(database, bundle);
  });
  return result;
}

/** transition 未命中任何条目时的控制信号（与真实错误区分）。 */
const NO_TRANSITION = Symbol("no shared context transition");

/** 找到语境 id 对应的那条会话条目。 */
function findImportEntry(database: DatabaseSync, request: ImportTransition) {
  const entries = sessionEntries(database, {
    sessionID: request.sessionID,
    type: "v4/shared_context_import",
  });
  return entries.find((candidate) => {
    const data = asRecord(candidate.data);
    return data !== undefined && data.contextId === request.contextId;
  });
}

/** 期望状态可以给单个值或一组值。 */
function expectedStatuses(request: ImportTransition): readonly unknown[] {
  return Array.isArray(request.expectedStatus) ? request.expectedStatus : [request.expectedStatus];
}

/** 把条目的 data 改写成新状态（可选地补 sourceId），并写回。 */
function applyEntryTransition(
  database: DatabaseSync,
  entry: NonNullable<ReturnType<typeof findImportEntry>>,
  request: ImportTransition,
  data: Record<string, unknown>,
): void {
  const nextData: Record<string, unknown> = { ...data, status: request.status };
  if (request.sourceId) nextData.sourceId = request.sourceId;
  // 逐字段赋值：entry 的其余字段原样保留，只替换 data 与 time.updated。
  const rewritten = { ...entry };
  rewritten.data = nextData;
  rewritten.time = { ...entry.time, updated: Date.now() };
  saveSessionEntry(database, rewritten);
}

/** 语境消息上的状态回写（只在找到对应消息时做）。 */
function applyMessageTransition(database: DatabaseSync, request: ImportTransition): void {
  const scope = messagesSync(database, { sessionID: request.sessionID }).find(({ info }) => {
    const metadata = info.metadata;
    const record = asRecord(metadata);
    return record !== undefined && record.contextId === request.contextId;
  });
  if (scope === undefined) return;

  saveMessageSync(database, {
    ...scope.info,
    metadata: { ...scope.info.metadata, sharedContextStatus: request.status },
  });
}

export function transitionSharedContextImport(
  database: DatabaseSync,
  request: ImportTransition,
): boolean {
  try {
    withWriteTransaction(database, "own", () => {
      const entry = findImportEntry(database, request);
      const data = asRecord(entry?.data);
      const allowed = expectedStatuses(request);
      // 真值判断：find 返回 undefined，但 data 可能为 undefined（原值非法）。
      if (!entry || !data || !allowed.includes(data.status)) {
        throw NO_TRANSITION;
      }
      applyEntryTransition(database, entry, request, data);
      applyMessageTransition(database, request);
    });
    return true;
  } catch (error) {
    // false 仍须回滚；只有原控制信号可转换，清理失败的 AggregateError 必须保留。
    if (error === NO_TRANSITION) return false;
    throw error;
  }
}
