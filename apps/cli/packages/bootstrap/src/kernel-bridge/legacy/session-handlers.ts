// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：会话与 workspace 域处理器。
//
// 状态所有者：LegacySessionRegistry（旧协议会话身份与元数据）+ WorkspacePreferences。
// 对话正文不在这里——`session/messages` / `session/events` 从 DSH 会话日志派生，
// 本包不存副本（specs/knorvia-builtin-kernel-dsh.md「对话正文唯一所有者是 DSH 会话日志」）。

import { BUILTIN_KNORVIA_SLASH_COMMAND_HELP_ENTRIES } from "@knorvia/shared";
import { parseParams, type ParsedParams } from "./parse.js";
import type { WorkspaceRef } from "./contracts.js";
import { protocolError, result as ok, sessionNotActive, sessionNotFound } from "./errors.js";
import type { LegacyMethodOutcome } from "./types.js";
import type { LegacyRouterDeps } from "./router-deps.js";
import { fetchSessionRuntimePreferences } from "./runtime-preferences.js";
import {
  toSessionDebug,
  toSessionList,
  toSessionSnapshot,
  toSubscribeResult,
  toZeroUsage,
} from "./session-projections.js";
import { listBuiltinSlashCommands } from "./workspace.js";

/** `session/create` 的参数（shared `sessionCreateParamsSchema` 的输出子集）。 */
interface CreateParams {
  readonly sessionId?: string;
  readonly workspace: WorkspaceRef;
  readonly mode?: "plan" | "build" | "edit" | "yolo" | "auto";
  readonly model?: { readonly providerId: string; readonly modelId: string };
  readonly thoughtLevel?: string;
}

interface ListParams {
  readonly workspace?: WorkspaceRef;
}

interface SessionIdParams {
  readonly sessionId: string;
}

interface InteractionPreferencesParams {
  readonly workspace: WorkspaceRef;
  readonly preferences: { readonly askUserQuestionAutoResolutionEnabled: boolean };
}

interface ModelIoPreferencesParams {
  readonly workspace: WorkspaceRef;
  readonly preferences: { readonly fullRetentionEnabled: boolean };
}

interface PolicyParams {
  readonly workspace: WorkspaceRef;
  readonly enabled: boolean;
}

function parse<T>(method: string, params: unknown): ParsedParams<T> {
  return parseParams<T>(method, params);
}

/**
 * `session/create`。
 *
 * 与默认引擎一致：创建时向 Host 取一次运行时偏好（scope=runtime-materialization）。
 * 错误分支逐码对齐（Lead 2026-10-20 裁决）：-32020/-32601 退化继续，超时与其它错误让 create 失败。
 */
export async function createSession(
  deps: LegacyRouterDeps,
  params: unknown,
  trace?: Readonly<Record<string, unknown>>,
): Promise<LegacyMethodOutcome> {
  const parsed = parse<CreateParams>("session/create", params);
  if (!parsed.ok) return parsed.outcome;
  const input = parsed.value;
  const traceId = deps.newTraceId();

  const record = deps.sessions.create({
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    workspace: input.workspace,
    traceId,
    ...(input.mode !== undefined ? { mode: input.mode } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.thoughtLevel !== undefined ? { thoughtLevel: input.thoughtLevel } : {}),
  });

  try {
    await fetchSessionRuntimePreferences({
      book: deps.hostRequests,
      sessionId: record.sessionId,
      scope: "runtime-materialization",
      ...(trace !== undefined ? { trace } : {}),
      ...(deps.logger !== undefined ? { logger: deps.logger } : {}),
    });
  } catch (error) {
    // create 失败：会话不该对外可见，回滚登记避免留下半成品（不带副作用的失败语义）。
    deps.sessions.close(record.sessionId);
    return protocolError(-32603, error instanceof Error ? error.message : String(error));
  }

  deps.logger?.info("kernel.bridge.legacy.session.created", {
    sessionId: record.sessionId,
    workspacePath: record.workspace.workspacePath,
  });
  return ok(
    toSessionSnapshot(record, listBuiltinSlashCommands(BUILTIN_KNORVIA_SLASH_COMMAND_HELP_ENTRIES)),
  );
}

/** `session/list`：按 workspace 过滤（缺省列全部活跃会话）。 */
export function listSessions(deps: LegacyRouterDeps, params: unknown): LegacyMethodOutcome {
  const parsed = parse<ListParams>("session/list", params);
  if (!parsed.ok) return parsed.outcome;
  const records =
    parsed.value.workspace === undefined
      ? deps.sessions.list()
      : deps.sessions.listByWorkspace(parsed.value.workspace.workspaceKey);
  return ok(toSessionList(records));
}

/** `session/read`：空白会话的完整快照。 */
export function readSession(deps: LegacyRouterDeps, params: unknown): LegacyMethodOutcome {
  const parsed = parse<SessionIdParams>("session/read", params);
  if (!parsed.ok) return parsed.outcome;
  const record = deps.sessions.get(parsed.value.sessionId);
  if (record === undefined) return sessionNotActive(parsed.value.sessionId);
  return ok(
    toSessionSnapshot(record, listBuiltinSlashCommands(BUILTIN_KNORVIA_SLASH_COMMAND_HELP_ENTRIES)),
  );
}

/** `session/messages`：正文归 DSH 会话日志；本包对空会话回空数组。 */
export function readMessages(deps: LegacyRouterDeps, params: unknown): LegacyMethodOutcome {
  const parsed = parse<SessionIdParams>("session/messages", params);
  if (!parsed.ok) return parsed.outcome;
  if (deps.sessions.get(parsed.value.sessionId) === undefined) {
    return sessionNotActive(parsed.value.sessionId);
  }
  return ok({ messages: [] });
}

/** `session/events`：同上，事件流归 DSH。 */
export function readEvents(deps: LegacyRouterDeps, params: unknown): LegacyMethodOutcome {
  const parsed = parse<SessionIdParams>("session/events", params);
  if (!parsed.ok) return parsed.outcome;
  if (deps.sessions.get(parsed.value.sessionId) === undefined) {
    return sessionNotActive(parsed.value.sessionId);
  }
  return ok({ events: [] });
}

/** `session/debug`：空白形状（rounds / networkEntries / cache 全空）。 */
export function readSessionDebug(deps: LegacyRouterDeps, params: unknown): LegacyMethodOutcome {
  const parsed = parse<SessionIdParams>("session/debug", params);
  if (!parsed.ok) return parsed.outcome;
  const record = deps.sessions.get(parsed.value.sessionId);
  if (record === undefined) return sessionNotActive(parsed.value.sessionId);
  return ok(toSessionDebug(record));
}

/**
 * `session/usage`：零值结果。
 * 实测默认引擎对不存在的会话也返回零值（不报 -32004），逐字段对齐。
 */
export function readSessionUsage(deps: LegacyRouterDeps, params: unknown): LegacyMethodOutcome {
  void deps;
  const parsed = parse<SessionIdParams>("session/usage", params);
  if (!parsed.ok) return parsed.outcome;
  return ok(toZeroUsage(parsed.value.sessionId));
}

/** `session/subagents`：空子 Agent 清单。此方法族用 "Session not found" 文案（D3）。 */
export function listSubagents(deps: LegacyRouterDeps, params: unknown): LegacyMethodOutcome {
  const parsed = parse<SessionIdParams>("session/subagents", params);
  if (!parsed.ok) return parsed.outcome;
  const record = deps.sessions.get(parsed.value.sessionId);
  if (record === undefined) return sessionNotFound(parsed.value.sessionId);
  return ok({
    revision: record.stateRevision,
    childSessionIds: [],
    running: [],
    ended: { total: 0, items: [] },
  });
}

/** `session/subscribe`：当前水位（草稿会话 0 条事件）。 */
export function subscribeSession(deps: LegacyRouterDeps, params: unknown): LegacyMethodOutcome {
  const parsed = parse<SessionIdParams>("session/subscribe", params);
  if (!parsed.ok) return parsed.outcome;
  const record = deps.sessions.get(parsed.value.sessionId);
  if (record === undefined) return sessionNotActive(parsed.value.sessionId);
  return ok(toSubscribeResult(record));
}

/** `workspace/updateInteractionPreferences`：纯内存偏好。 */
export function updateInteractionPreferences(
  deps: LegacyRouterDeps,
  params: unknown,
): LegacyMethodOutcome {
  const parsed = parse<InteractionPreferencesParams>(
    "workspace/updateInteractionPreferences",
    params,
  );
  if (!parsed.ok) return parsed.outcome;
  const enabled = parsed.value.preferences.askUserQuestionAutoResolutionEnabled;
  deps.preferences.setInteractionAutoResolution(enabled);
  return ok({
    workspace: parsed.value.workspace,
    askUserQuestionAutoResolutionEnabled: enabled,
    snoozedInteractionCount: 0,
  });
}

/** `workspace/updateModelIoPreferences`：纯内存偏好。 */
export function updateModelIoPreferences(
  deps: LegacyRouterDeps,
  params: unknown,
): LegacyMethodOutcome {
  const parsed = parse<ModelIoPreferencesParams>("workspace/updateModelIoPreferences", params);
  if (!parsed.ok) return parsed.outcome;
  const enabled = parsed.value.preferences.fullRetentionEnabled;
  deps.preferences.setModelIoFullRetention(enabled);
  return ok({
    workspace: parsed.value.workspace,
    fullRetentionEnabled: enabled,
    updatedSessionCount: 0,
  });
}

/** `workspace/updateOffPeakToolPolicy`：灰度门缓存。 */
export function updateOffPeakToolPolicy(
  deps: LegacyRouterDeps,
  params: unknown,
): LegacyMethodOutcome {
  const parsed = parse<PolicyParams>("workspace/updateOffPeakToolPolicy", params);
  if (!parsed.ok) return parsed.outcome;
  deps.preferences.setOffPeakToolEnabled(parsed.value.enabled);
  return ok({ workspace: parsed.value.workspace, enabled: parsed.value.enabled });
}

/** `workspace/updateDynamicWorkflowPolicy`：灰度门缓存。 */
export function updateDynamicWorkflowPolicy(
  deps: LegacyRouterDeps,
  params: unknown,
): LegacyMethodOutcome {
  const parsed = parse<PolicyParams>("workspace/updateDynamicWorkflowPolicy", params);
  if (!parsed.ok) return parsed.outcome;
  deps.preferences.setDynamicWorkflowEnabled(parsed.value.enabled);
  return ok({ workspace: parsed.value.workspace, enabled: parsed.value.enabled });
}
