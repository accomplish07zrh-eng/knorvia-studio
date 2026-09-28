// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import { SqliteSessionStore } from "./session-store-facade.target.js";

export type Store = SqliteSessionStore;
export type SessionInput = Parameters<Store["createSession"]>[0];
export type SessionID = SessionInput["id"];
export type ProjectID = SessionInput["projectID"];
export const owner = "facade-owner" as SessionID;
export const other = "facade-other" as SessionID;
export const project = "facade-project" as ProjectID;
export const otherProject = "facade-other-project" as ProjectID;

export function sessionInput(id = owner): SessionInput {
  return {
    id,
    projectID: project,
    slug: id,
    directory: "/synthetic/facade",
    title: id,
    version: "fixture",
    time: { created: 1, updated: 2 },
  };
}

export function connection(store: Store): DatabaseSync {
  const value: unknown = Reflect.get(store, "db");
  assert.ok(value instanceof DatabaseSync, "native connection observation only");
  return value;
}

export function track(t: TestContext, store: Store) {
  const db = connection(store);
  t.after(() => {
    if (db.isOpen) store.close();
  });
  return { store, db };
}

export function fixture(t: TestContext) {
  return track(t, new SqliteSessionStore({ dbPath: ":memory:" }));
}

type Shapes = {
  [K in keyof Store]: Store[K] extends (...args: never[]) => Promise<unknown> ? "promise" : "sync";
};

// Exhaustive type check against the public class, independent of private helper names.
export const portShapes = {
  getDatabasePath: "sync",
  close: "sync",
  createSession: "promise",
  createForkedSessionWithMetadata: "promise",
  commitForkBundle: "promise",
  commitSharedContextImportBundle: "promise",
  transitionSharedContextImport: "promise",
  updateSession: "promise",
  getSession: "promise",
  listSessions: "promise",
  claimLegacySessionWorkspace: "promise",
  repairLegacyRemoteSessionWorkspace: "promise",
  repairRemoteSessionPaths: "promise",
  saveMessage: "promise",
  removeMessage: "promise",
  savePart: "promise",
  removePart: "promise",
  messageWithParts: "promise",
  messages: "promise",
  saveSessionEntry: "promise",
  sessionEntries: "promise",
  saveSessionInput: "promise",
  commitPermissionFullAccess: "promise",
  updateSessionInputs: "promise",
  promoteSessionInput: "promise",
  markSessionInputPromoted: "promise",
  settleSessionInput: "promise",
  listSessionInputs: "promise",
  getSessionInputById: "promise",
  readTodos: "promise",
  updateTodos: "promise",
  readTarget: "promise",
  setTarget: "promise",
  cloneTargetForFork: "promise",
  createTarget: "promise",
  updateTargetStatus: "promise",
  startTargetRun: "promise",
  heartbeatTargetRun: "promise",
  finishTargetRun: "promise",
  recoverInterruptedTargetRun: "promise",
  accountTargetUsage: "promise",
  updateTargetSummaryTitle: "promise",
  clearTarget: "promise",
  recordModelUsage: "promise",
  upsertTurnUsage: "promise",
  upsertToolUsage: "promise",
  pruneUsage: "promise",
  queryAppUsage: "promise",
  queryTaskUsage: "promise",
  recordInputHistory: "promise",
  recallPreviousInputHistory: "promise",
  getProjectPermission: "promise",
  saveProjectPermission: "promise",
  updateProjectPermission: "promise",
  getProjectPermissionMode: "sync",
  saveProjectPermissionMode: "sync",
  setRevert: "promise",
  clearRevert: "promise",
  upsertScriptWorkflowDefinition: "promise",
  createScriptWorkflowRun: "promise",
  updateScriptWorkflowRun: "promise",
  getScriptWorkflowRun: "promise",
  listScriptWorkflowRuns: "promise",
  createScriptWorkflowActivity: "promise",
  updateScriptWorkflowActivity: "promise",
  findCachedScriptWorkflowActivity: "promise",
  listScriptWorkflowActivities: "promise",
  appendScriptWorkflowEvent: "promise",
  listScriptWorkflowEvents: "promise",
  createSessionTaskLink: "promise",
  workflowJournalStore: "sync",
  debugMigrationIds: "sync",
  debugCounts: "sync",
} as const satisfies Shapes;

export const countKeys = [
  "sessions",
  "messages",
  "parts",
  "todos",
  "targets",
  "sessionEntries",
  "permissions",
  "localSettings",
  "schemaMigrations",
  "inputHistory",
  "modelUsage",
  "toolUsage",
  "turnUsage",
] as const;

export function counts(values: readonly number[]) {
  assert.equal(values.length, countKeys.length);
  return Object.fromEntries(countKeys.map((key, index) => [key, values[index]]));
}
