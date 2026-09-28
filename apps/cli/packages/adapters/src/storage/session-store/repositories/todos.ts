// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

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

export async function readTodos(
  db: DatabaseSync,
  input: { sessionID: SessionId },
): Promise<TodoItem[]> {
  const rows = db.prepare(READ_TODOS).all(input.sessionID) as unknown as TodoRow[];
  return rows.map(decodeTodoRow);
}

export async function updateTodos(
  db: DatabaseSync,
  input: { sessionID: SessionId; todos: TodoItem[] },
): Promise<void> {
  const now = Date.now();
  withWriteTransaction(db, "own", () => {
    db.prepare(DELETE_TODOS).run(input.sessionID);
    if (input.todos.length > 0) {
      const insert = db.prepare(INSERT_TODO);
      for (const [position, todo] of input.todos.entries()) {
        insert.run(input.sessionID, todo.content, todo.status, todo.priority, position, now, now);
      }
    }
    touchSession(db, input.sessionID, now);
  });
}
