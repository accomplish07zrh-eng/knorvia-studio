import { KNORVIA_PROTOCOL_NAME, KNORVIA_PROTOCOL_VERSION, type KnorviaDeliveryKind, type KnorviaSessionStateSnapshot, type KnorviaWorkspaceRef } from "@knorvia/shared";
import type { MessageWithParts, SessionEvent, SessionGoal, SessionInfo, SessionProjection, TodoItem } from "@knorvia/contracts";
import type { KnorviaApp } from "../app/types.js";
import { goalTitleFallback, restoreGoalVerifications } from "./session-goal-recovery.js";
import { sessionGoalStats, sessionTodo, sessionTodoGroups } from "./session-goal-history.js";
import { snapshotMessages } from "./session-snapshot-images.js";
import { mapSessionInfo, mapSessionSettings, sessionProjection, sessionRuntime } from "./session-state-projection.js";
import { listProtocolSlashCommands, type ListProtocolSlashCommandsOptions } from "./slash-commands.js";

export { mapSessionInfo, mapSessionSettings } from "./session-state-projection.js";
export { mapSessionEvent, mapSessionEventForProtocol, mapSessionEvents, shouldExposeSessionEventToProtocol } from "./session-event-projection.js";
export { resolveSessionContextUsage } from "./session-context-usage.js";

export interface SessionSnapshotInput {
  app: KnorviaApp;
  deliveryKind?: KnorviaDeliveryKind;
  eventSeq: number;
  fallbackCreatedAt?: number;
  fallbackUpdatedAt?: number;
  lastError?: SessionProjection["lastError"];
  messages: MessageWithParts[];
  modelAvailability?: "all" | "current";
  persistedGoalVerificationEvents?: SessionEvent[];
  persistedContextUsageBreakdownEvents?: SessionEvent[];
  session?: SessionInfo | null;
  stateRevision: number;
  slashCommandOptions?: ListProtocolSlashCommandsOptions;
  target?: SessionGoal | null;
  todos?: TodoItem[];
  workspace: KnorviaWorkspaceRef;
}

export async function buildSessionSnapshot(input: SessionSnapshotInput): Promise<KnorviaSessionStateSnapshot> {
  const runtime = await input.app.runtime.getProjection();
  const activeTurn = input.app.runtime.getActiveTurnInfo();
  let projection = restoreGoalVerifications(
    runtime, input.persistedGoalVerificationEvents ?? [],
    input.target === undefined ? runtime.target : input.target,
  );
  if (input.target !== undefined || input.lastError !== undefined) {
    projection = { ...projection };
    // DB target 是冷恢复权威，null 必须覆盖旧 runtime target；undefined 才表示未提供。
    if (input.target !== undefined) projection.target = input.target;
    if (input.lastError !== undefined) projection.lastError = input.lastError;
  }
  projection = goalTitleFallback(projection, input.session, input.messages);
  const messages = await snapshotMessages(input.app, input.messages);
  return {
    messages,
    projection: sessionProjection(projection),
    protocol: { name: KNORVIA_PROTOCOL_NAME, version: KNORVIA_PROTOCOL_VERSION },
    runtime: sessionRuntime({
      activeTurn, deliveryKind: input.deliveryKind, eventSeq: input.eventSeq,
      messages: input.messages, persistedContextUsageBreakdownEvents: input.persistedContextUsageBreakdownEvents,
      projection, stateRevision: input.stateRevision,
    }),
    session: mapSessionInfo({
      app: input.app, fallbackCreatedAt: input.fallbackCreatedAt, fallbackUpdatedAt: input.fallbackUpdatedAt,
      projection, session: input.session, workspace: input.workspace,
    }),
    settings: await mapSessionSettings(input.app, {
      currentModelContextWindow: projection.contextWindow, modelAvailability: input.modelAvailability,
    }),
    slashCommands: await listProtocolSlashCommands({
      ...input.slashCommandOptions, workingDirectory: input.workspace.workspacePath,
    }),
    goalStats: sessionGoalStats(projection, input.messages),
    todos: input.todos?.map(sessionTodo) ?? [],
    todoGroups: sessionTodoGroups(input.messages, input.todos ?? [], projection),
  };
}
