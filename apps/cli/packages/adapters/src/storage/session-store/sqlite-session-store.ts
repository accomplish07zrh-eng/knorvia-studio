// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type * as C from "@knorvia/contracts";
import type { JournalStorePort } from "@knorvia/dynamic-workflow";
import * as target from "../session-target.js";
import * as fork from "./fork-commit.js";
import * as sharedContext from "./shared-context-commit.js";
import {
  DEFAULT_SQLITE_STARTUP_LOCK_TIMEOUT_MS,
  runSqliteSessionMigrationsAsync,
  type AsyncSqliteMigrationOptions,
} from "./migration-runner.js";
import type { SqliteSessionStoreOptions } from "./options.js";
import { getDefaultSessionDbPath } from "./paths.js";
import {
  openSessionDatabase,
  initializeSessionDatabase,
  checkSessionWriteFault as checkWrite,
} from "./session-store-connection.js";
import * as sessions from "./repositories/sessions.js";
import * as messages from "./repositories/messages.js";
import * as entries from "./repositories/session-entries.js";
import * as inputs from "./repositories/session-inputs.js";
import * as todos from "./repositories/todos.js";
import * as usage from "./repositories/usage.js";
import * as history from "./repositories/input-history.js";
import * as settings from "./repositories/local-settings.js";
import * as runs from "./repositories/script-workflow-runs.js";
import * as activities from "./repositories/script-workflow-activities.js";
import * as debug from "./repositories/debug.js";
import { commitPermissionFullAccess } from "./repositories/permission-full-access.js";
import { createDwfJournalStore } from "./repositories/dwf-journal.js";

type SessionApi = C.SessionStorePort &
  C.InputHistoryStorePort &
  C.LocalSettingStorePort &
  C.ScriptWorkflowStorePort &
  C.UsageStorePort;
type Input<K extends keyof SessionApi> = Parameters<NonNullable<SessionApi[K]>>[0];
type MessageCopy = Parameters<C.SessionStorePort["saveMessage"]>[1];
type PartCopy = Parameters<C.SessionStorePort["savePart"]>[1];
const deferredStartup = Symbol("private session store startup");

export class SqliteSessionStore implements SessionApi {
  private readonly db: DatabaseSync;
  private readonly dbPath: string;
  private readonly forkCommitFaultAt: SqliteSessionStoreOptions["forkCommitFaultAt"];
  private journal: JournalStorePort | undefined;

  constructor(options: SqliteSessionStoreOptions = {}, startupToken?: symbol) {
    this.dbPath = options.dbPath ?? getDefaultSessionDbPath();
    this.forkCommitFaultAt = options.forkCommitFaultAt;
    const timeout = options.startupLockTimeoutMs ?? DEFAULT_SQLITE_STARTUP_LOCK_TIMEOUT_MS;
    this.db = openSessionDatabase(this.dbPath, timeout);
    if (startupToken !== deferredStartup) initializeSessionDatabase(this.db, this.dbPath, timeout);
  }
  static async openStartup(
    options: SqliteSessionStoreOptions = {},
    migrationOptions: AsyncSqliteMigrationOptions = {},
  ): Promise<SqliteSessionStore> {
    const store = new SqliteSessionStore(options, deferredStartup);
    try {
      await runSqliteSessionMigrationsAsync(store.db, store.dbPath, migrationOptions);
    } catch (error) {
      try {
        store.close();
      } catch {
        // 通过公开关闭入口清理，但二次失败不能替换原通知拒绝（包括 undefined）。
      }
      throw error;
    }
    return store;
  }
  getDatabasePath(): string {
    return this.dbPath;
  }
  close(): void {
    this.db.close();
  }
  async createSession(input: Input<"createSession">) {
    checkWrite(this.dbPath);
    return sessions.createSession(this.db, input);
  }
  async createForkedSessionWithMetadata(
    input: C.CreateSessionInput,
    metadata: C.ForkChildSessionMetadata,
  ) {
    checkWrite(this.dbPath);
    return fork.createForkedSessionWithMetadata(this.db, input, metadata);
  }
  async commitForkBundle(bundle: C.ForkCommitBundle) {
    checkWrite(this.dbPath);
    return fork.commitForkBundle(this.db, bundle, this.forkCommitFaultAt);
  }
  async commitSharedContextImportBundle(bundle: C.SharedContextImportCommitBundle) {
    checkWrite(this.dbPath);
    return sharedContext.commitSharedContextImportBundle(this.db, bundle);
  }
  async transitionSharedContextImport(input: C.SharedContextImportTransition) {
    checkWrite(this.dbPath);
    return sharedContext.transitionSharedContextImport(this.db, input);
  }
  async updateSession(input: Input<"updateSession">) {
    checkWrite(this.dbPath);
    return sessions.updateSession(this.db, input);
  }
  async getSession(sessionID: C.SessionId) {
    return sessions.getSession(this.db, sessionID);
  }
  async listSessions(input: Input<"listSessions"> = {}) {
    return sessions.listSessions(this.db, input);
  }
  async claimLegacySessionWorkspace(input: Input<"claimLegacySessionWorkspace">) {
    checkWrite(this.dbPath);
    return sessions.claimLegacySessionWorkspace(this.db, input);
  }
  async repairLegacyRemoteSessionWorkspace(input: Input<"repairLegacyRemoteSessionWorkspace">) {
    checkWrite(this.dbPath);
    return sessions.repairLegacyRemoteSessionWorkspace(this.db, input);
  }
  async repairRemoteSessionPaths(input: Input<"repairRemoteSessionPaths">) {
    checkWrite(this.dbPath);
    return sessions.repairRemoteSessionPaths(this.db, input);
  }
  async saveMessage(input: C.MessageInfo, copyFrom?: MessageCopy) {
    checkWrite(this.dbPath);
    return messages.saveMessage(this.db, input, copyFrom);
  }
  async removeMessage(input: Input<"removeMessage">) {
    checkWrite(this.dbPath);
    return messages.removeMessage(this.db, input);
  }
  async savePart(input: C.MessagePart, copyFrom?: PartCopy) {
    checkWrite(this.dbPath);
    return messages.savePart(this.db, input, copyFrom);
  }
  async removePart(input: Input<"removePart">) {
    checkWrite(this.dbPath);
    return messages.removePart(this.db, input);
  }
  async messageWithParts(input: Input<"messageWithParts">) {
    return messages.messageWithParts(this.db, input);
  }
  async messages(input: Input<"messages">) {
    return messages.messages(this.db, input);
  }
  async saveSessionEntry(input: C.SessionEntryInfo) {
    checkWrite(this.dbPath);
    return entries.saveSessionEntry(this.db, input);
  }
  async sessionEntries(input: Input<"sessionEntries">) {
    return entries.sessionEntries(this.db, input);
  }
  async saveSessionInput(input: Input<"saveSessionInput">) {
    checkWrite(this.dbPath);
    return inputs.saveSessionInput(this.db, input);
  }
  async commitPermissionFullAccess(input: Input<"commitPermissionFullAccess">) {
    checkWrite(this.dbPath);
    return commitPermissionFullAccess(this.db, input);
  }
  async updateSessionInputs(input: Input<"updateSessionInputs">) {
    checkWrite(this.dbPath);
    return inputs.updateSessionInputs(this.db, input);
  }
  async promoteSessionInput(input: Input<"promoteSessionInput">) {
    checkWrite(this.dbPath);
    return inputs.promoteSessionInput(this.db, input);
  }
  async markSessionInputPromoted(input: Input<"markSessionInputPromoted">) {
    checkWrite(this.dbPath);
    return inputs.markSessionInputPromoted(this.db, input);
  }
  async settleSessionInput(input: Input<"settleSessionInput">) {
    checkWrite(this.dbPath);
    return inputs.settleSessionInput(this.db, input);
  }
  async listSessionInputs(input: Input<"listSessionInputs">) {
    return inputs.listSessionInputs(this.db, input);
  }
  async getSessionInputById(id: string) {
    return inputs.getSessionInputById(this.db, id);
  }
  async readTodos(input: Input<"readTodos">) {
    return todos.readTodos(this.db, input);
  }
  async updateTodos(input: Input<"updateTodos">) {
    checkWrite(this.dbPath);
    return todos.updateTodos(this.db, input);
  }
  async readTarget(input: Input<"readTarget">) {
    return target.readSessionTarget(this.db, input);
  }
  async setTarget(input: Input<"setTarget">) {
    return target.setSessionTarget(this.db, {
      objective: input.objective,
      sessionID: input.sessionID,
      status: input.status ?? "active",
      tokenBudget: input.tokenBudget,
    });
  }
  async cloneTargetForFork(input: Input<"cloneTargetForFork">) {
    checkWrite(this.dbPath);
    return target.cloneSessionTargetForFork(this.db, {
      source: input.source,
      sessionID: input.sessionID,
      status: input.status ?? input.source.status,
    });
  }
  async createTarget(input: Input<"createTarget">) {
    return target.createSessionTarget(this.db, input);
  }
  async updateTargetStatus(input: Input<"updateTargetStatus">) {
    return target.updateSessionTargetStatus(this.db, input);
  }
  async startTargetRun(input: Input<"startTargetRun">) {
    return target.startSessionTargetRun(this.db, input);
  }
  async heartbeatTargetRun(input: Input<"heartbeatTargetRun">) {
    return target.heartbeatSessionTargetRun(this.db, input);
  }
  async finishTargetRun(input: Input<"finishTargetRun">) {
    return target.finishSessionTargetRun(this.db, input);
  }
  async recoverInterruptedTargetRun(input: Input<"recoverInterruptedTargetRun">) {
    return target.recoverInterruptedSessionTargetRun(this.db, input);
  }
  async accountTargetUsage(input: Input<"accountTargetUsage">) {
    return target.accountSessionTargetUsage(this.db, input);
  }
  async updateTargetSummaryTitle(input: Input<"updateTargetSummaryTitle">) {
    return target.updateSessionTargetSummaryTitle(this.db, input);
  }
  async clearTarget(input: Input<"clearTarget">) {
    return target.clearSessionTarget(this.db, input);
  }
  async recordModelUsage(input: C.ModelUsageRecord) {
    return usage.recordModelUsage(this.db, input);
  }
  async upsertTurnUsage(input: C.TurnUsageRecord) {
    return usage.upsertTurnUsage(this.db, input);
  }
  async upsertToolUsage(input: C.ToolUsageRecord) {
    return usage.upsertToolUsage(this.db, input);
  }
  async pruneUsage(input?: Input<"pruneUsage">) {
    return usage.pruneUsage(this.db, input);
  }
  async queryAppUsage(input: C.AppUsageQueryInput) {
    return usage.queryAppUsage(this.db, input);
  }
  async queryTaskUsage(input: C.TaskUsageQueryInput) {
    return usage.queryTaskUsage(this.db, input);
  }
  async recordInputHistory(input: Input<"recordInputHistory">) {
    return history.recordInputHistory(this.db, input);
  }
  async recallPreviousInputHistory(input: Input<"recallPreviousInputHistory">) {
    return history.recallPreviousInputHistory(this.db, input);
  }
  async getProjectPermission(projectID: C.ProjectId) {
    return settings.getProjectPermission(this.db, projectID);
  }
  async saveProjectPermission(input: Input<"saveProjectPermission">) {
    return settings.saveProjectPermission(this.db, input);
  }
  async updateProjectPermission(input: C.ProjectPermissionUpdateInput) {
    return settings.updateProjectPermission(this.db, input);
  }
  getProjectPermissionMode(projectID: C.ProjectId) {
    return settings.getProjectPermissionMode(this.db, projectID);
  }
  saveProjectPermissionMode(input: Input<"saveProjectPermissionMode">) {
    return settings.saveProjectPermissionMode(this.db, input);
  }
  async setRevert(input: Input<"setRevert">) {
    return sessions.setRevert(this.db, input);
  }
  async clearRevert(sessionID: C.SessionId) {
    return sessions.clearRevert(this.db, sessionID);
  }
  async upsertScriptWorkflowDefinition(input: C.UpsertScriptWorkflowDefinitionInput) {
    return runs.upsertScriptWorkflowDefinition(this.db, input);
  }
  async createScriptWorkflowRun(input: C.CreateScriptWorkflowRunInput) {
    return runs.createScriptWorkflowRun(this.db, input);
  }
  async updateScriptWorkflowRun(input: C.UpdateScriptWorkflowRunInput) {
    return runs.updateScriptWorkflowRun(this.db, input);
  }
  async getScriptWorkflowRun(runId: string) {
    return runs.getScriptWorkflowRun(this.db, runId);
  }
  async listScriptWorkflowRuns(input?: Input<"listScriptWorkflowRuns">) {
    return runs.listScriptWorkflowRuns(this.db, input);
  }
  async createScriptWorkflowActivity(input: C.CreateScriptWorkflowActivityInput) {
    return activities.createScriptWorkflowActivity(this.db, input);
  }
  async updateScriptWorkflowActivity(input: C.UpdateScriptWorkflowActivityInput) {
    return activities.updateScriptWorkflowActivity(this.db, input);
  }
  async findCachedScriptWorkflowActivity(input: Input<"findCachedScriptWorkflowActivity">) {
    return activities.findCachedScriptWorkflowActivity(this.db, input);
  }
  async listScriptWorkflowActivities(input: Input<"listScriptWorkflowActivities">) {
    return activities.listScriptWorkflowActivities(this.db, input);
  }
  async appendScriptWorkflowEvent(input: Input<"appendScriptWorkflowEvent">) {
    return activities.appendScriptWorkflowEvent(this.db, input);
  }
  async listScriptWorkflowEvents(input: Input<"listScriptWorkflowEvents">) {
    return activities.listScriptWorkflowEvents(this.db, input);
  }
  async createSessionTaskLink(input: C.CreateSessionTaskLinkInput) {
    return activities.createSessionTaskLink(this.db, input);
  }
  workflowJournalStore(): JournalStorePort {
    return (this.journal ??= createDwfJournalStore(this.db));
  }
  debugMigrationIds(): string[] {
    return debug.debugMigrationIds(this.db);
  }
  debugCounts(sessionID?: C.SessionId) {
    return debug.debugCounts(this.db, sessionID);
  }
}

export function createSqliteSessionStore(
  options: SqliteSessionStoreOptions = {},
): SqliteSessionStore {
  return new SqliteSessionStore(options);
}
export function openStartupSqliteSessionStore(
  options: SqliteSessionStoreOptions = {},
): SqliteSessionStore {
  return new SqliteSessionStore(options);
}
export { getDefaultSessionDbPath };
