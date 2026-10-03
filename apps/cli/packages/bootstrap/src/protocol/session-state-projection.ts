import type { KnorviaActiveToolCall, KnorviaDeliveryKind, KnorviaPendingPermission, KnorviaSessionGoal, KnorviaSessionGoalVerification, KnorviaSessionGoalVerificationTimeline, KnorviaSessionInfo, KnorviaSessionKind, KnorviaSessionProjection, KnorviaSessionRuntimeState, KnorviaSessionSettingsState, KnorviaWorkspaceRef } from "@knorvia/shared";
import type { ActiveToolCall, MessageWithParts, PendingPermission, SessionEvent, SessionGoal, SessionInfo, SessionProjection } from "@knorvia/contracts";
import type { KnorviaApp } from "../app/types.js";
import { projectRecord, type RecordRecipe } from "./message-record-projection.js";
import { formatProtocolModelSelection, optionalModelSelectionFromString } from "./model-mapper.js";
import { buildProtocolPermissionOptions, toLegacyPermissionOptionsPolicy } from "./permission-options.js";
import { resolveSessionContextUsage } from "./session-context-usage.js";
import type { GoalBoundary } from "./session-goal-recovery.js";
import { sessionInteger } from "./session-projection-primitives.js";

const GOAL: RecordRecipe<SessionGoal, KnorviaSessionGoal> = [
  ["createdAt", (goal) => goal.time.created],
  ["objective", (goal) => goal.objective],
  ["sessionId", (goal) => String(goal.sessionID)],
  ["status", (goal) => goal.status],
  ["summaryTitle", (goal) => goal.summaryTitle],
  ["targetId", (goal) => goal.targetID],
  ["timeUsedSeconds", (goal) => goal.timeUsedSeconds ?? 0],
  ["tokenBudget", (goal) => goal.tokenBudget ?? null],
  ["tokensUsed", (goal) => goal.tokensUsed ?? 0],
  ["activeInputId", (goal) => goal.activeInputId ?? null],
  ["activeRunStartedAtMs", (goal) => goal.activeRunStartedAtMs ?? null],
  ["activeRunLastSeenAtMs", (goal) => goal.activeRunLastSeenAtMs ?? null],
  ["updatedAt", (goal) => goal.time.updated],
];

export function sessionGoal(goal: SessionGoal | null | undefined): KnorviaSessionGoal | null | undefined {
  if (goal === undefined || goal === null) return goal;
  return projectRecord(goal, GOAL);
}

const ACTIVE_TOOL: RecordRecipe<ActiveToolCall, KnorviaActiveToolCall> = [
  ["startedAt", (tool) => tool.startedAt?.getTime()],
  ["status", (tool) => tool.status],
  ["toolCallId", (tool) => tool.toolCallId],
  ["toolName", (tool) => tool.toolName],
];
type PermissionPrefix = Pick<KnorviaPendingPermission, "input">;
export function sessionPermission(permission: PendingPermission): KnorviaPendingPermission {
  const initial: RecordRecipe<PendingPermission, PermissionPrefix> = [["input", (source) => source.input]];
  const output = projectRecord(permission, initial) as KnorviaPendingPermission;
  if (permission.origin) output.origin = permission.origin;
  output.options = buildProtocolPermissionOptions({ ...permission, optionsPolicy: toLegacyPermissionOptionsPolicy(permission.optionsPolicy) });
  output.reason = permission.reason ?? "";
  output.requestId = permission.requestId ?? permission.toolCallId;
  output.requestedAt = permission.requestedAt.getTime();
  output.riskLevel = permission.riskLevel;
  output.toolCallId = permission.toolCallId;
  output.toolName = permission.toolName;
  return output;
}

const PROJECTION: RecordRecipe<SessionProjection, KnorviaSessionProjection> = [
  ["activeToolCalls", (source) => source.activeToolCalls.map((tool) => projectRecord(tool, ACTIVE_TOOL))],
  ["backgroundJobs", (source) => source.backgroundTasks.map((task) => ({ ...task }))],
  ["contextUsed", (source) => source.contextUsed],
  ["contextWindow", (source) => source.contextWindow],
  ["currentTurnId", (source) => source.currentTurnId ? String(source.currentTurnId) : undefined],
  ["lastError", (source) => source.lastError],
  ["mode", (source) => source.mode],
  ["pendingPermissions", (source) => source.pendingPermissions.map(sessionPermission)],
  ["sessionId", (source) => String(source.id)],
  ["status", (source) => source.status],
  ["target", (source) => sessionGoal(source.target)],
  ["totalTokenCount", (source) => source.totalTokenCount],
  ["turnCount", (source) => source.turnCount],
];
export function sessionProjection(source: SessionProjection): KnorviaSessionProjection {
  return projectRecord(source, PROJECTION);
}

type Verification = SessionProjection["targetCompletionVerifications"][number];
const VERIFICATION: RecordRecipe<Verification, KnorviaSessionGoalVerification> = [
  ["nextAction", (source) => source.nextAction ?? null],
  ["passed", (source) => source.passed],
  ["reason", (source) => source.reason],
];
type TimelinePrefix = Pick<KnorviaSessionGoalVerificationTimeline, "version" | "kind" | "type" | "display" | "targetId" | "verificationId" | "status">;
const TIMELINE: RecordRecipe<GoalBoundary, TimelinePrefix> = [
  ["version", () => 1], ["kind", () => "synthetic"], ["type", () => "goal_verification"], ["display", () => "separator"],
  ["targetId", (source) => source.targetId],
  ["verificationId", (source) => source.verificationId],
  ["status", (source) => source.status],
];
function verificationBoundary(source: GoalBoundary): KnorviaSessionGoalVerificationTimeline {
  const output = projectRecord(source, TIMELINE) as KnorviaSessionGoalVerificationTimeline;
  if (source.goalIteration) output.goalIteration = source.goalIteration;
  if (source.anchorAssistantMessageId) output.anchorAssistantMessageId = source.anchorAssistantMessageId;
  if (source.anchorTurnId) output.anchorTurnId = source.anchorTurnId;
  if (source.verification) output.verification = projectRecord(source.verification, VERIFICATION);
  if (source.startedAt) output.startedAt = source.startedAt.getTime();
  output.updatedAt = source.updatedAt.getTime();
  return output;
}

export interface RuntimeProjectionInput {
  activeTurn?: ReturnType<KnorviaApp["runtime"]["getActiveTurnInfo"]>;
  deliveryKind?: KnorviaDeliveryKind;
  eventSeq: number;
  messages: MessageWithParts[];
  persistedContextUsageBreakdownEvents?: readonly SessionEvent[];
  projection: SessionProjection;
  stateRevision: number;
}
type RuntimePrefix = Pick<KnorviaSessionRuntimeState, "activeTurnId" | "activeTurnKind" | "deliveryKind" | "eventSeq" | "pendingRequestIds">;
type RuntimeTurnId = NonNullable<RuntimeProjectionInput["activeTurn"]>["turnId"];
const RUNTIME: RecordRecipe<{ input: RuntimeProjectionInput; turnId: RuntimeTurnId | undefined }, RuntimePrefix> = [
  ["activeTurnId", (source) => source.turnId ? String(source.turnId) : undefined],
  ["activeTurnKind", (source) => source.input.activeTurn?.kind],
  ["deliveryKind", (source) => source.input.deliveryKind],
  ["eventSeq", (source) => source.input.eventSeq],
  ["pendingRequestIds", (source) => source.input.projection.pendingPermissions.map((permission) => permission.requestId ?? permission.toolCallId)],
];
export function sessionRuntime(input: RuntimeProjectionInput): KnorviaSessionRuntimeState {
  const turnId = input.activeTurn?.turnId;
  const usage = resolveSessionContextUsage({
    messages: input.messages,
    persistedContextUsageBreakdownEvents: input.persistedContextUsageBreakdownEvents,
    projection: input.projection,
  });
  const output = projectRecord({ input, turnId }, RUNTIME) as KnorviaSessionRuntimeState;
  if (usage) output.contextUsage = usage;
  output.goalVerifications = (input.projection.targetCompletionVerifications ?? []).map((source) => projectRecord(source, VERIFICATION));
  output.goalVerificationTimeline = (input.projection.targetCompletionVerificationTimeline ?? []).map(verificationBoundary);
  output.stateRevision = input.stateRevision;
  return output;
}

export interface SessionInfoInput {
  app?: Pick<KnorviaApp, "getMode" | "getModel" | "sessionId" | "traceId">;
  fallbackCreatedAt?: number;
  fallbackUpdatedAt?: number;
  projection?: SessionProjection;
  session?: SessionInfo | null;
  taskType?: SessionInfo["taskType"];
  parentSessionId?: string;
  workspace: KnorviaWorkspaceRef;
}
interface InfoSource { input: SessionInfoInput; sessionId: string; createdAt: number; updatedAt: number }
const INFO: RecordRecipe<InfoSource, KnorviaSessionInfo> = [
  ["archivedAt", (source) => source.input.session?.time.archived],
  ["createdAt", (source) => source.createdAt],
  ["mode", (source) => source.input.projection?.mode ?? source.input.app?.getMode?.() ?? "build"],
  ["model", (source) => source.input.app ? optionalModelSelectionFromString(source.input.app.getModel()) : undefined],
  ["parentSessionId", (source) => source.input.session?.parentID ?? source.input.parentSessionId],
  ["traceId", (source) => source.input.session?.traceID ?? source.input.app?.traceId],
  ["sessionId", (source) => source.sessionId],
  ["sessionKind", (source) => (source.input.session?.taskType ?? source.input.taskType ?? "interactive") as KnorviaSessionKind],
  ["status", (source) => source.input.projection?.status ?? "idle"],
  ["target", (source) => sessionGoal(source.input.projection?.target)],
  ["title", (source) => source.input.session?.title ?? ""],
  ["titleSource", (source) => source.input.session?.titleSource],
  ["updatedAt", (source) => source.updatedAt],
  ["workspace", (source) => source.input.workspace],
];
export function mapSessionInfo(input: SessionInfoInput): KnorviaSessionInfo {
  const sessionId = String(input.session?.id ?? input.app?.sessionId ?? "unknown");
  const createdAt = input.session?.time.created ?? input.fallbackCreatedAt ?? input.projection?.createdAt.getTime() ?? Date.now();
  const updatedAt = input.session?.time.updated ?? input.fallbackUpdatedAt ?? input.projection?.updatedAt.getTime() ?? createdAt;
  return projectRecord({ input, sessionId, createdAt, updatedAt }, INFO);
}

export async function mapSessionSettings(app: KnorviaApp, options: { currentModelContextWindow?: number; modelAvailability?: "all" | "current" } = {}): Promise<KnorviaSessionSettingsState> {
  const levels = app.listThoughtLevels();
  const chosen = app.getThoughtLevel();
  const current = chosen && levels.includes(chosen) ? chosen : undefined;
  const rawDefault = app.getDefaultThoughtLevel();
  const defaultLevel = rawDefault && levels.includes(rawDefault) ? rawDefault : undefined;
  const model = app.getModel();
  const option = app.getCurrentModelOption?.();
  let available: ReturnType<KnorviaApp["listModels"]>;
  if (options.modelAvailability !== "current") available = app.listModels();
  else if (option) available = [{ ...option, contextWindow: sessionInteger(options.currentModelContextWindow, 1) ?? option.contextWindow }];
  else available = app.listModels().filter((candidate) => formatProtocolModelSelection(candidate.ref) === model);
  const source = { app, levels, current, defaultLevel, model, available };
  const settings: RecordRecipe<typeof source, KnorviaSessionSettingsState> = [
    ["mode", (facts) => ({ current: facts.app.getMode() })],
    ["model", (facts) => ({
      available: facts.available, current: facts.app.runtime.getSessionModelSelection(),
      lastUsed: optionalModelSelectionFromString(facts.model),
    })],
    ["permission", (facts) => ({ mode: facts.app.getMode() })],
    ["thoughtLevel", (facts) => ({
      available: facts.levels.map((level) => ({ label: level, value: level })),
      current: facts.current, ...(facts.defaultLevel ? { defaultLevel: facts.defaultLevel } : {}),
      enabled: facts.levels.length > 0,
    })],
  ];
  return projectRecord(source, settings);
}
