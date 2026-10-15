// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 会话待办：读取按 position 升序，更新是「整份替换 + 触碰会话时间」。
// 三条 SQL 与 position 语义属于数据格式，逐字保留。

import type { DatabaseSync } from "node:sqlite";
import type { SessionId, TodoItem } from "@knorvia/contracts";
import { decodeTodoRow } from "../codecs.js";
import type { TodoRow } from "../rows.js";
import { touchSession } from "./sessions.js";
import { withWriteTransaction } from "./write-transaction.js";

const READ_TODOS = `
  SELECT session_id, content, status, priority, position, time_created, time_updated
  FROM todo WHERE session_id = ? ORDER BY position ASC
`;
const DELETE_TODOS = "DELETE FROM todo WHERE session_id = ?";
const INSERT_TODO = `
  INSERT INTO todo (session_id, content, status, priority, position, time_created, time_updated)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

function readTodoRows(database: DatabaseSync, sessionID: SessionId): TodoRow[] {
  const query = database.prepare(READ_TODOS);
  return query.all(sessionID) as unknown as TodoRow[];
}

export async function readTodos(
  database: DatabaseSync,
  request: { sessionID: SessionId },
): Promise<TodoItem[]> {
  return readTodoRows(database, request.sessionID).map(decodeTodoRow);
}

/** 写入：先清空再逐条插入，position 取数组下标（0 起）。 */
function replaceTodos(
  database: DatabaseSync,
  sessionID: SessionId,
  todos: readonly TodoItem[],
  at: number,
): void {
  database.prepare(DELETE_TODOS).run(sessionID);
  if (todos.length === 0) return;
  const statement = database.prepare(INSERT_TODO);
  for (const [position, item] of todos.entries()) {
    statement.run(sessionID, item.content, item.status, item.priority, position, at, at);
  }
}

export async function updateTodos(
  database: DatabaseSync,
  request: { sessionID: SessionId; todos: TodoItem[] },
): Promise<void> {
  const at = Date.now();
  withWriteTransaction(database, "own", () => {
    replaceTodos(database, request.sessionID, request.todos, at);
    touchSession(database, request.sessionID, at);
  });
}
