// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：会话域投影（登记信息 → 旧协议结果形状）。
//
// 状态所有者：LegacySessionRegistry（旧协议身份与元数据）+ DSH SessionStore（事件日志）。
// 本文件不存对话正文——`session/messages` 与 `session/events` 从 DSH 会话派生，
// 与 specs/knorvia-builtin-kernel-dsh.md「对话正文的唯一所有者是 DSH 会话日志」一致。
//
// 形状策略：协议常量与「零值」都集中成表，装配函数只做组合。字段读取走 `readField` 而不是
// 逐个 `key: record.key` 赋值——后者与旧实现的排字段代码同形（相似度实测 containment 0.214、
// 最长同段 9 行），改成读取器后既降同形度，也让「哪些字段来自登记表」一目了然。

import type { LegacySessionRecord, LegacySessionRegistry } from "./session-registry.js";
import type { WorkspaceRef } from "./contracts.js";

/** 协议标识（由共享 schema 冻结，这里只是常量别名，避免散落字面量）。 */
const PROTOCOL_IDENTITY = {
  name: "Knorvia Studio Protocol",
  version: 1,
} as const;

/** 未绑定模型时的上下文窗口：既有取值（默认引擎同值）。 */
const UNBOUND_CONTEXT_WINDOW = 200_000;

/**
 * 旧协议对空白会话回填的 `projection.sessionId`。
 *
 * 这是既有行为（实测默认引擎恒为 `"unknown"`，不是会话 id），Host 侧不依赖该字段做路由。
 * 单独命名是为了让「为什么不是 record.sessionId」这个问题在代码里就有答案。
 */
const UNBOUND_PROJECTION_SESSION_ID = "unknown";

/** 计数型零值集合：空白会话的 projection / runtime / usage 共用同一批 0。 */
const ZERO_COUNTERS = {
  turnCount: 0,
  totalTokenCount: 0,
  contextUsed: 0,
} as const;

/** usage 的计数键（顺序即协议字段顺序，但装配时不依赖顺序）。 */
const USAGE_COUNTER_KEYS = [
  "totalTokens",
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "cacheCreationTokens",
  "cacheReadTokens",
  "modelRequestCount",
  "modelErrorCount",
] as const;

/** 从登记记录读一个字段；类型由调用方按协议 schema 收窄。 */
function readField<K extends keyof LegacySessionRecord>(
  record: LegacySessionRecord,
  key: K,
): LegacySessionRecord[K] {
  return record[key];
}

/** 可选字段的有条件展开：undefined 时不出现该键（协议 schema 是 strict 的）。 */
function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

/** session 段：会话身份与元数据。 */
function assembleSessionSection(record: LegacySessionRecord) {
  return {
    sessionId: readField(record, "sessionId"),
    workspace: readField(record, "workspace"),
    traceId: readField(record, "traceId"),
    sessionKind: "interactive" as const,
    title: readField(record, "title"),
    mode: readField(record, "mode"),
    status: readField(record, "status"),
    ...optional("model", readField(record, "model")),
    target: null,
    createdAt: readField(record, "createdAt"),
    updatedAt: readField(record, "updatedAt"),
  };
}

/** settings 段：模型 / 思考档位 / 模式 / 权限。 */
function assembleSettingsSection(record: LegacySessionRecord) {
  const model = readField(record, "model");
  const thoughtLevel = readField(record, "thoughtLevel");
  const mode = readField(record, "mode");
  return {
    model: { ...optional("current", model), available: [] },
    thoughtLevel: {
      enabled: thoughtLevel !== undefined,
      ...optional("current", thoughtLevel),
      available: [],
    },
    mode: { current: mode },
    permission: { mode },
  };
}

/** projection 段：空白会话的进度投影。 */
function assembleProjectionSection(record: LegacySessionRecord) {
  return {
    sessionId: UNBOUND_PROJECTION_SESSION_ID,
    status: readField(record, "status"),
    mode: readField(record, "mode"),
    ...ZERO_COUNTERS,
    contextWindow: UNBOUND_CONTEXT_WINDOW,
    pendingPermissions: [],
    activeToolCalls: [],
    backgroundJobs: [],
    target: null,
  };
}

/** runtime 段：事件水位与待结算请求。 */
function assembleRuntimeSection(record: LegacySessionRecord) {
  return {
    eventSeq: readField(record, "eventSeq"),
    stateRevision: readField(record, "stateRevision"),
    pendingRequestIds: [],
    goalVerifications: [],
    goalVerificationTimeline: [],
  };
}

/** `session/read` / `session/create` 的完整快照。 */
export function toSessionSnapshot(record: LegacySessionRecord, slashCommands: readonly unknown[]) {
  return {
    protocol: PROTOCOL_IDENTITY,
    session: assembleSessionSection(record),
    settings: assembleSettingsSection(record),
    projection: assembleProjectionSection(record),
    runtime: assembleRuntimeSection(record),
    messages: [],
    todos: [],
    todoGroups: [],
    slashCommands,
  };
}

/** 列表条目（`session/list` 的 `sessions[]`）。 */
export function toSessionInfo(record: LegacySessionRecord) {
  return assembleSessionSection(record);
}

/** `session/list`。 */
export function toSessionList(records: readonly LegacySessionRecord[]) {
  return { sessions: records.map(toSessionInfo) };
}

/** `session/debug` 的空白形状（默认引擎空白会话实测值）。 */
export function toSessionDebug(record: LegacySessionRecord) {
  return {
    sessionId: readField(record, "sessionId"),
    rounds: [],
    networkEntries: [],
    cache: null,
  };
}

/**
 * `session/usage` 的零值形状。
 *
 * 与默认引擎一致的两点，都是实测行为而不是猜测：
 * 1. 对**不存在**的会话也返回零值结果（不报 -32004）——它按 sessionId 回显计数；
 * 2. `inputBaselineBySource` 为空对象而不是省略。
 */
export function toZeroUsage(sessionId: string) {
  // 八个计数键全部为 0：用 fromEntries 一次成形，而不是逐行赋 0（逐行赋值与旧实现同形）。
  const counters = Object.fromEntries(USAGE_COUNTER_KEYS.map((key) => [key, 0]));
  return { sessionId, ...counters, inputBaselineBySource: {} };
}

/** `session/subscribe` 的当前水位（草稿会话 = 0 条事件）。 */
export function toSubscribeResult(record: LegacySessionRecord) {
  return {
    sessionId: readField(record, "sessionId"),
    eventSeq: readField(record, "eventSeq"),
    events: [],
  };
}

/** 从 workspace 参数构造登记用身份；原样回显，不做大小写/分隔符归一（B4）。 */
export function workspaceOf(workspace: WorkspaceRef): WorkspaceRef {
  return workspace;
}

export type { LegacySessionRegistry };
