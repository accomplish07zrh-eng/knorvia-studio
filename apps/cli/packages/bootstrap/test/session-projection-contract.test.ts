import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionEventType, type PendingPermission, type SessionInfo } from "@knorvia/contracts";
import {
  mapSessionEvent,
  mapSessionEventForProtocol,
  mapSessionEvents,
  mapSessionInfo,
  mapSessionSettings,
  resolveSessionContextUsage,
} from "../src/protocol/session-mapper.js";
import {
  goalTitleFallback,
  restoreGoalVerifications,
} from "../src/protocol/session-goal-recovery.js";
import { sessionGoalStats, sessionTodoGroups } from "../src/protocol/session-goal-history.js";
import { sessionPermission, sessionRuntime } from "../src/protocol/session-state-projection.js";
import {
  appFixture,
  event,
  goal,
  message,
  projection,
  todoPart,
} from "./session-projection-fixture.js";

test("session info uses persisted then caller fallback times and preserves explicit undefined fields", () => {
  const workspace = { workspacePath: "fixture-workspace" };
  const p = projection();
  const result = mapSessionInfo({
    projection: p,
    fallbackCreatedAt: 0,
    fallbackUpdatedAt: 1,
    workspace,
  });
  assert.equal(result.createdAt, 0);
  assert.equal(result.updatedAt, 1);
  assert.equal(result.sessionId, "unknown");
  assert.equal(result.workspace, workspace);
  assert.deepEqual(Object.keys(result), [
    "archivedAt",
    "createdAt",
    "mode",
    "model",
    "parentSessionId",
    "traceId",
    "sessionId",
    "sessionKind",
    "status",
    "target",
    "title",
    "titleSource",
    "updatedAt",
    "workspace",
  ]);
  const session = {
    id: "persisted-id",
    time: { created: 3, updated: 4 },
    title: "persisted",
    parentID: "parent",
    traceID: "trace",
    taskType: "interactive",
  } as unknown as SessionInfo;
  const persisted = mapSessionInfo({ projection: p, session, fallbackCreatedAt: 0, workspace });
  assert.equal(persisted.createdAt, 3);
  assert.equal(persisted.updatedAt, 4);
  assert.equal(persisted.parentSessionId, "parent");
});

test("current-only settings retain original selection and the query order without catalog expansion", async () => {
  const f = appFixture();
  const result = await mapSessionSettings(f.app, {
    modelAvailability: "current",
    currentModelContextWindow: 32,
  });
  assert.equal(result.model.current, f.selection);
  assert.equal(result.model.available[0]?.contextWindow, 32);
  assert.equal(result.thoughtLevel.defaultLevel, "low");
  assert.deepEqual(f.calls, [
    "levels",
    "chosen",
    "default",
    "model",
    "option",
    "mode",
    "selection",
    "mode",
  ]);
});

test("settings reject stale thought levels and fall back to filtered catalog only when current option is absent", async () => {
  const f = appFixture();
  f.app.getThoughtLevel = () => "stale";
  f.app.getDefaultThoughtLevel = () => "stale-default";
  f.app.getCurrentModelOption = () => undefined;
  const result = await mapSessionSettings(f.app, { modelAvailability: "current" });
  assert.equal(result.model.available.length, 1);
  assert.equal(result.thoughtLevel.current, undefined);
  assert.equal(Object.hasOwn(result.thoughtLevel, "defaultLevel"), false);
  assert.equal(f.calls.includes("catalog"), true);
});

test("runtime active turn comes only from the live port and pending ids use nullish fallback", () => {
  const pending = {
    requestId: "",
    toolCallId: "tool",
    toolName: "Read",
    requestedAt: new Date(1),
    riskLevel: "low",
  } as PendingPermission;
  const p = projection({
    currentTurnId: "old-complete-turn" as NonNullable<
      ReturnType<typeof projection>["currentTurnId"]
    >,
    pendingPermissions: [pending],
  });
  const result = sessionRuntime({ projection: p, messages: [], eventSeq: 9, stateRevision: 3 });
  assert.equal(result.activeTurnId, undefined);
  assert.deepEqual(result.pendingRequestIds, [""]);
  assert.deepEqual(Object.keys(result), [
    "activeTurnId",
    "activeTurnKind",
    "deliveryKind",
    "eventSeq",
    "pendingRequestIds",
    "goalVerifications",
    "goalVerificationTimeline",
    "stateRevision",
  ]);
});

test("event envelope retains zero seq override and payload-before-seq reads", () => {
  const source = event(SessionEventType.UserMessage, { fixture: true }, 123, 8);
  const order: string[] = [];
  Object.defineProperty(source, "payload", {
    get: () => {
      order.push("payload");
      return { fixture: true };
    },
  });
  const options = {
    get seq() {
      order.push("seq");
      return 0;
    },
  };
  const result = mapSessionEvent(source, undefined, options);
  assert.equal(result.seq, 0);
  assert.equal(result.timestamp, 123);
  assert.equal(result.type, "message.upserted");
  assert.deepEqual(order, ["payload", "seq"]);
  assert.deepEqual(Object.keys(result), [
    "deliveryKind",
    "eventId",
    "payload",
    "seq",
    "sessionId",
    "timestamp",
    "traceId",
    "turnId",
    "type",
  ]);
});

test("event visibility retains tool argument lifecycle but excludes internal ledgers and empty text", () => {
  for (const type of [
    SessionEventType.StreamingToolLedgerUpdated,
    SessionEventType.DynamicWorkflowRunProgress,
  ]) {
    assert.equal(mapSessionEventForProtocol(event(type)), null);
  }
  const events = [
    "text_delta",
    "reasoning_delta",
    "tool_input_start",
    "tool_input_delta",
    "tool_input_end",
    "tool_call",
    "other",
  ].map((kind) => event(SessionEventType.ModelStreaming, { kind, delta: "" }));
  assert.equal(mapSessionEvents(events).length, 4);
  assert.equal(
    mapSessionEvents([
      event(SessionEventType.ModelStreaming, { kind: "text_delta", delta: "visible" }),
    ]).length,
    1,
  );
});

test("model requests expose bounded counters and public fields rather than message context", () => {
  const payload = {
    messages: [{ fixture: 1 }, { fixture: 2 }],
    providerId: "fixture-provider",
    temperature: null,
    privateFixture: "hidden",
  };
  const result = mapSessionEvent(event(SessionEventType.ModelRequest, payload)).payload;
  assert.deepEqual(result, { messageCount: 2, providerId: "fixture-provider", temperature: null });
  const unchanged = {};
  assert.equal(
    mapSessionEvent(event(SessionEventType.ModelNetworkStatus, unchanged)).payload,
    unchanged,
  );
});

test("started tool events normalize instants and denied/requested permissions retain legacy gates", () => {
  const started = mapSessionEvent(
    event(SessionEventType.ToolCallStarted, { startedAt: new Date(55), toolCallId: "tool" }, 100),
  ).payload;
  assert.deepEqual(started, { startedAt: 55, toolCallId: "tool", kind: "started" });
  const fallback = mapSessionEvent(
    event(SessionEventType.ToolCallStarted, { startedAt: new Date(Number.NaN) }, 100),
  ).payload;
  assert.deepEqual(fallback, { startedAt: 100, kind: "started" });
  const requested = mapSessionEvent(
    event(SessionEventType.PermissionRequested, {
      toolName: "Read",
      display: { fixture: true },
      optionsPolicy: {},
      requestId: "request",
    }),
  ).payload as Record<string, unknown>;
  assert.equal(Object.hasOwn(requested, "display"), false);
  assert.equal(Object.hasOwn(requested, "optionsPolicy"), false);
  assert.ok(Array.isArray(requested.options));
  assert.equal(
    (
      mapSessionEvent(event(SessionEventType.PermissionDenied, { requestId: "request" }))
        .payload as Record<string, unknown>
    ).decision,
    "deny",
  );
  const pending = sessionPermission({
    toolCallId: "tool",
    toolName: "Read",
    requestedAt: new Date(7),
    riskLevel: "low",
    display: { fixture: true },
  } as unknown as PendingPermission);
  assert.equal(pending.requestId, "tool");
  assert.equal(pending.requestedAt, 7);
  assert.equal(Object.hasOwn(pending, "display"), false);
});

test("cache usage keeps latest and total request vectors while usage restores the latest valid meter", () => {
  const first = message("assistant", 100);
  const next = message("assistant", 200);
  assert.ok(next.info.role === "assistant");
  next.info.tokens = { input: 0, output: 5, reasoning: 0, cache: { read: 2, write: 0 } };
  const result = resolveSessionContextUsage({ projection: projection(), messages: [first, next] });
  assert.equal(result?.used, 12);
  assert.deepEqual(result?.cache, {
    inputTokens: 0,
    cacheReadTokens: 2,
    cacheWriteTokens: 0,
    latestHitRate: null,
    hitRate: 0.6,
    hitRateRequestCount: 2,
    totalInputTokens: 10,
    totalCacheReadTokens: 6,
    totalCacheWriteTokens: 1,
  });
  assert.equal(
    resolveSessionContextUsage({ projection: projection({ contextUsed: 99 }), messages: [first] })
      ?.cache,
    undefined,
  );
});

test("compaction summary meter supersedes earlier assistant usage and cache", () => {
  const compact = message("user", 300, [
    {
      type: "compaction",
      compactBoundary: { truePostCompactTokenCount: 50, postCompactTokenCount: 60 },
    } as unknown as ReturnType<typeof message>["parts"][number],
  ]);
  assert.ok(compact.info.role === "user");
  compact.info.summary = true;
  const result = resolveSessionContextUsage({
    projection: projection(),
    messages: [message("assistant"), compact],
  });
  assert.deepEqual(result, { cost: null, size: 1000, used: 50 });
});

test("breakdown uses the latest admissible event and requires waterline/window alignment", () => {
  const breakdown = [{ source: "messages", chars: 40 }];
  const older = event(
    SessionEventType.ModelComplete,
    {
      querySource: "main_turn",
      contextWindow: 1000,
      contextUsageBreakdown: breakdown,
      usage: { inputTokens: 10, outputTokens: 2 },
    },
    100,
  );
  const newer = event(
    SessionEventType.ModelComplete,
    {
      querySource: "main_turn",
      contextWindow: 1000,
      contextUsageBreakdown: breakdown,
      usage: { inputTokens: 11, outputTokens: 2 },
    },
    200,
  );
  const input = {
    projection: projection({ contextUsed: 12 }),
    messages: [message("assistant")],
    persistedContextUsageBreakdownEvents: [older, newer],
  };
  assert.equal(resolveSessionContextUsage(input)?.breakdown, undefined);
  (newer.payload as Record<string, unknown>).querySource = "target_completion_verification";
  assert.deepEqual(resolveSessionContextUsage(input)?.breakdown, breakdown);
});

test("goal verification replay sorts lifecycle events and stably deduplicates summaries", () => {
  const target = goal();
  const summary = { passed: false, reason: " Same  Reason ", nextAction: null };
  const p = projection({ target, targetCompletionVerifications: [summary] });
  const completed = event(
    SessionEventType.TargetCompletionVerification,
    {
      targetId: target.targetID,
      verificationId: "v",
      status: "completed",
      goalIteration: 1,
      verification: { passed: false, reason: "same reason", nextAction: "" },
    },
    300,
    2,
  );
  const started = event(
    SessionEventType.TargetCompletionVerification,
    { targetId: target.targetID, verificationId: "v", status: "started", goalIteration: 1 },
    200,
    1,
  );
  const unrelated = event(
    SessionEventType.TargetCompletionVerification,
    { targetId: "other", verificationId: "other", status: "started" },
    100,
  );
  const restored = restoreGoalVerifications(p, [completed, unrelated, started], target);
  assert.equal(restored.targetCompletionVerificationTimeline.length, 1);
  assert.equal(restored.targetCompletionVerificationTimeline[0]?.startedAt?.getTime(), 200);
  assert.equal(restored.targetCompletionVerificationTimeline[0]?.updatedAt.getTime(), 300);
  assert.deepEqual(restored.targetCompletionVerifications, [summary]);
  assert.equal(restoreGoalVerifications(p, [], target), p);
});

test("goal title fallback is restricted to the first matching user objective and time window", () => {
  const p = projection({ target: goal() });
  const text = message("user", 200, [
    { type: "text", text: " Make a  Fixture " } as unknown as ReturnType<
      typeof message
    >["parts"][number],
  ]);
  const session = { title: "Persisted title" } as SessionInfo;
  const restored = goalTitleFallback(p, session, [text]);
  assert.equal(restored.target?.summaryTitle, "Persisted title");
  assert.equal(p.target?.summaryTitle, null);
  text.info.time.created = 10_000;
  assert.equal(goalTitleFallback(p, session, [text]), p);
});

test("cross-iteration todo updates retain their first group while new empty groups remain visible", () => {
  const target = goal();
  const p = projection({
    target,
    targetCompletionVerificationTimeline: [
      {
        targetId: target.targetID,
        verificationId: "v",
        status: "completed",
        goalIteration: 1,
        verification: { passed: false, reason: "continue", nextAction: null },
        updatedAt: new Date(300),
      },
    ],
  });
  const first = message("assistant", 200, [
    todoPart([{ content: " Do Work ", status: "pending", priority: "high" }], { end: 250 }),
  ]);
  const next = message("assistant", 400, [
    todoPart([{ content: "do   work", status: "completed", priority: "low" }], { end: 600 }),
  ]);
  const groups = sessionTodoGroups([next, first], [], p);
  assert.deepEqual(
    groups.map((group) => group.id),
    ["goal-iteration-1", "goal-iteration-2"],
  );
  assert.deepEqual(groups[0]?.todos, [
    { content: "do   work", priority: "low", status: "completed" },
  ]);
  assert.deepEqual(groups[1]?.todos, []);
  assert.equal(groups[0]?.updatedAt, 600);
  assert.equal(groups[1]?.startedAt, 300);
});

test("invalid/subagent todo batches fall back to current todos while an admitted empty batch blocks fallback", () => {
  const current = [{ content: "current", priority: "medium" as const, status: "pending" as const }];
  const invalid = message("assistant", 200, [
    todoPart([
      { content: "valid", priority: "low", status: "pending" },
      { content: "", priority: "low", status: "pending" },
    ]),
  ]);
  const child = message("assistant", 300, [todoPart(current, { source: "subagent" })]);
  assert.equal(
    sessionTodoGroups([invalid, child], current, projection())[0]?.id,
    "session-current",
  );
  const empty = sessionTodoGroups(
    [message("assistant", 400, [todoPart([])])],
    current,
    projection(),
  );
  assert.equal(empty[0]?.id, "session");
  assert.deepEqual(empty[0]?.todos, []);
});

test("goal stats derive per-iteration totals without double-counting a live run base", () => {
  const target = goal({ activeRunStartedAtMs: 400 });
  const p = projection({
    target,
    targetCompletionVerificationTimeline: [
      {
        targetId: target.targetID,
        verificationId: "v",
        status: "completed",
        goalIteration: 1,
        verification: { passed: false, reason: "continue", nextAction: null },
        updatedAt: new Date(300),
      },
    ],
  });
  const stats = sessionGoalStats(p, [message("assistant", 200), message("assistant", 400)]);
  assert.equal(stats?.tokensUsed, 40);
  assert.equal(stats?.timeUsedSeconds, 0);
  assert.equal(stats?.iterationCount, 2);
  assert.equal(stats?.tokenBudget, null);
});
