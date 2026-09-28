// SPDX-FileCopyrightText: 2026 Knorvia contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { TestContext } from "node:test";
import {
  SqliteSessionStore,
  type DwfRunIntrospectionQueries,
  type DwfRunSessionListItem,
  type JournalStorePort,
  type RunRecord,
  type NodeRecord,
  type ActorRecord,
  type RunEvent,
} from "./dwf-journal.target.js";

export type Journal = JournalStorePort &
  DwfRunIntrospectionQueries & {
    listNonTerminalRuns(parentSessionId: string): RunRecord[];
    listRunsByParentSession(parentSessionId: string, limit: number): DwfRunSessionListItem[];
  };
export const plainKeys = (value: object, keys: string[]) => {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.deepEqual(Object.keys(value), keys);
};
export function unsafe<T>(value: unknown): T {
  return value as T;
}
export function thrown(operation: () => unknown): Error & { code?: string; errcode?: number } {
  try {
    operation();
  } catch (error) {
    assert.ok(error instanceof Error);
    return error;
  }
  assert.fail("expected a synchronous exception");
}
export function fixture(t: TestContext) {
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  const journal = store.workflowJournalStore() as Journal;
  // Introspection only: mutations still use the public facade, except explicit corrupt/legacy fixtures.
  const db = (store as unknown as { db: DatabaseSync }).db;
  assert.ok(db instanceof DatabaseSync);
  let closed = false;
  const close = () => {
    if (!closed) {
      store.close();
      closed = true;
    }
  };
  t.after(close);
  const clock = { value: 1_700_000_000_100, calls: 0 };
  t.mock.method(Date, "now", () => {
    clock.calls++;
    return clock.value;
  });
  const run = (runId = "run-a", extra: Partial<RunRecord> = {}): RunRecord => ({
    runId,
    caps: { maxConcurrency: 2 },
    spentTokens: 0,
    status: "running",
    ...extra,
  });
  const node = (siteId = "site-a", extra: Partial<NodeRecord> = {}): NodeRecord => ({
    runId: "run-a",
    siteId,
    ordinal: 0,
    kind: "ask",
    inputHash: "hash-a",
    status: "running",
    ...extra,
  });
  const actor = (siteId = "actor-a", extra: Partial<ActorRecord> = {}): ActorRecord => ({
    runId: "run-a",
    siteId,
    ordinal: 0,
    ...extra,
  });
  const log = (message: string): RunEvent => unsafe<RunEvent>({ type: "log", message });
  const report = (
    item: unknown,
    artifactId = "chart",
    siteId = "report-a",
    ordinal = 0,
  ): RunEvent => ({
    type: "report",
    instance: { siteId, ordinal },
    item,
    artifactId,
  });
  const row = (
    table: "dwf_run" | "dwf_actor" | "dwf_node" | "dwf_event",
    where = "",
    ...args: SQLInputValue[]
  ) => {
    const value = db
      .prepare(`select * from ${table}${where ? ` where ${where}` : ""}`)
      .get(...args);
    assert.ok(value);
    return { ...value };
  };
  const count = (table: "dwf_run" | "dwf_actor" | "dwf_node" | "dwf_event") =>
    Number(db.prepare(`select count(*) as n from ${table}`).get()!.n);
  return { store, journal, db, close, clock, run, node, actor, log, report, row, count };
}
