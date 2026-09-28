// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import type {
  CreateScriptWorkflowRunInput,
  ProjectId,
  SessionId,
  UpsertScriptWorkflowDefinitionInput,
} from "@knorvia/contracts";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";

export const parent = "workflow-parent" as SessionId;
export const child = "workflow-child" as SessionId;
export const other = "workflow-other" as SessionId;
export const clock = 100;
export function definition(
  patch: Partial<UpsertScriptWorkflowDefinitionInput> = {},
): UpsertScriptWorkflowDefinitionInput {
  return {
    id: "definition",
    name: "Synthetic workflow",
    source: "user",
    scriptHash: "fixture-hash",
    meta: { name: "Fixture", description: "Offline", phases: [] },
    ...patch,
  };
}
export function runInput(
  patch: Partial<CreateScriptWorkflowRunInput> = {},
): CreateScriptWorkflowRunInput {
  return {
    id: "run",
    cwd: "/synthetic/workflow",
    name: "Fixture run",
    scriptHash: "fixture-hash",
    ...patch,
  };
}
export const writers = [
  "definition",
  "create-run",
  "update-run",
  "create-activity",
  "update-activity",
  "event",
  "link",
] as const;
export type Writer = (typeof writers)[number];
export async function workflowFixture(t: TestContext) {
  t.mock.method(Date, "now", () => clock);
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  t.after(() => store.close());
  for (const id of [parent, child, other])
    await store.createSession({
      id,
      projectID: "workflow-project" as ProjectId,
      slug: id,
      directory: "/synthetic/workflow",
      title: id,
      version: "test",
      time: { created: 1, updated: 2 },
    });
  const db = Reflect.get(store, "db") as DatabaseSync;
  assert.ok(db instanceof DatabaseSync);
  const tables = [
    "workflow_definition",
    "workflow_run",
    "workflow_activity",
    "workflow_event",
    "session_task_link",
    "session",
  ] as const;
  const rows = (table: (typeof tables)[number]) =>
    db
      .prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`)
      .all()
      .map((row) => ({ ...row }));
  const snapshot = () => Object.fromEntries(tables.map((table) => [table, rows(table)]));
  const run = (patch: Partial<CreateScriptWorkflowRunInput> = {}) =>
    store.createScriptWorkflowRun(runInput(patch));
  const activity = () =>
    store.createScriptWorkflowActivity({
      id: "activity",
      runId: "run",
      callIndex: 0,
      callPath: "root/agent",
      type: "agent",
      inputHash: "input-hash",
    });
  return { db, store, rows, snapshot, run, activity };
}
export async function writerFixture(t: TestContext, writer: Writer) {
  const f = await workflowFixture(t);
  if (writer !== "definition" && writer !== "create-run") await f.run();
  if (writer === "update-activity") await f.activity();
  const targets: Record<Writer, [string, "INSERT" | "UPDATE"]> = {
    definition: ["workflow_definition", "INSERT"],
    "create-run": ["workflow_run", "INSERT"],
    "update-run": ["workflow_run", "UPDATE"],
    "create-activity": ["workflow_activity", "INSERT"],
    "update-activity": ["workflow_activity", "UPDATE"],
    event: ["workflow_event", "INSERT"],
    link: ["session_task_link", "INSERT"],
  };
  const call = () => {
    switch (writer) {
      case "definition":
        return f.store.upsertScriptWorkflowDefinition(definition());
      case "create-run":
        return f.run();
      case "update-run":
        return f.store.updateScriptWorkflowRun({
          id: "run",
          currentPhase: "phase",
          budgetSpent: 9,
        });
      case "create-activity":
        return f.activity();
      case "update-activity":
        return f.store.updateScriptWorkflowActivity({
          id: "activity",
          childSessionId: child,
          result: { value: 1 },
        });
      case "event":
        return f.store.appendScriptWorkflowEvent({
          id: "event",
          runId: "run",
          type: "fixture",
          payload: { value: 1 },
        });
      case "link":
        return f.store.createSessionTaskLink({
          id: "link",
          childSessionId: child,
          path: "dwf/run/site@0",
          role: "workflow_actor",
          status: "running",
        });
    }
  };
  return { ...f, call, table: targets[writer][0], operation: targets[writer][1] };
}
