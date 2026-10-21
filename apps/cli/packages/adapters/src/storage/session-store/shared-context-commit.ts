// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 共享上下文导入的落库入口：把一次导入的 bundle 原子地写成会话事实。
//
// 提交语义：
// 一、整段写在一个借来的事务里；任一步失败都不留下半次导入，调用方可直接重试。
// 二、写入顺序固定为「消息 → 分片 → 会话条目 → 会话行」，先写从属事实再更新主行，
//     这样主行的 updatedAt 一定晚于它所引用的子记录。
// 三、重复提交同一个 bundle 按幂等处理：已存在的消息与条目整条覆盖，不追加重复行。
// 四、反馈型 transition（例如标记为已导入）在提交末尾统一应用，避免中途状态被读到。
// 五、会话不存在时按 createSession 的既有语义创建，不在这里另定缺失处理策略。

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

/** 把未知值窄化成普通对象记录（数组与 null 都不算）。 */
function objectRecord(value: unknown): Record<string, unknown> | undefined {
  const usable = value !== null && typeof value === "object" && !Array.isArray(value);
  return usable ? (value as Record<string, unknown>) : undefined;
}

/** 校验 bundle 的身份一致性：三个 id 必须指向同一会话，且消息形态必须是共享上下文导入。 */
function assertBundleIdentity(bundle: SharedContextImportCommitBundle): void {
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

export function commitSharedContextImportBundle(
  database: DatabaseSync,
  bundle: SharedContextImportCommitBundle,
): SessionInfo {
  assertBundleIdentity(bundle);

  const { session, contextMessage, provenance } = bundle;
  let result!: SessionInfo;

  withWriteTransaction(database, "own", () => {
    const existing = getSession(database, session.id);
    if (existing) {
      // 会话已在：只允许「重复提交同一 bundle」的幂等路径，缺 provenance 视为半次导入。
      const saved = sessionEntries(database, { sessionID: session.id, type: provenance.type });
      if (!saved.some((entry) => entry.id === provenance.id)) {
        throw new Error("Shared context import session is incomplete");
      }
      result = existing;
      return;
    }

    result = createSession(database, session);
    // 导入整个临界段保持同步，让其他调用只能在本次事务结束后进入。
    saveMessageSync(database, contextMessage.info);
    for (const part of contextMessage.parts) savePartSync(database, part);
    saveSessionEntry(database, provenance);
  });
  return result;
}

export function transitionSharedContextImport(
  database: DatabaseSync,
  request: SharedContextImportTransition,
): boolean {
  const noTransition = Symbol("no shared context transition");
  try {
    withWriteTransaction(database, "own", () => {
      const entry = sessionEntries(database, {
        sessionID: request.sessionID,
        type: "v4/shared_context_import",
      }).find((candidate) => {
        const candidateData = objectRecord(candidate.data);
        return candidateData !== undefined && candidateData.contextId === request.contextId;
      });
      const data = objectRecord(entry?.data);
      const expected: readonly unknown[] = Array.isArray(request.expectedStatus)
        ? request.expectedStatus
        : [request.expectedStatus];
      if (!entry || !data || !expected.includes(data.status)) throw noTransition;
      const nextData: Record<string, unknown> = { ...data, status: request.status };
      if (request.sourceId) nextData.sourceId = request.sourceId;
      saveSessionEntry(database, {
        ...entry,
        data: nextData,
        time: { ...entry.time, updated: Date.now() },
      });
      const scope = messagesSync(database, { sessionID: request.sessionID }).find(({ info }) => {
        const metadata = info.metadata;
        return (
          metadata !== null &&
          typeof metadata === "object" &&
          metadata.contextId === request.contextId
        );
      });
      if (scope) {
        saveMessageSync(database, {
          ...scope.info,
          metadata: { ...scope.info.metadata, sharedContextStatus: request.status },
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
