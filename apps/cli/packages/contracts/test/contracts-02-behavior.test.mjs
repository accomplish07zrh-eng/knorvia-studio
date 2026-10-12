// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// contracts-02 契约测试：运行时可观察行为（B2–B9）。只走公开入口。
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { load } from "./entry.mjs";

const samples = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/samples.json", import.meta.url)), "utf8"),
);

const root = await load();
const tools = await load("tools");
const workflow = await load("workflow");
const rewind = await load("rewind");

test("B2 追踪上下文：root/child 字段与 ambient 语义", () => {
  const rootContext = root.createRootTraceContext();
  assert.equal(typeof rootContext.traceId, "string");
  assert.equal(rootContext.traceId.length > 0, true);
  assert.equal(rootContext.spanId.length, 16);
  assert.equal(rootContext.queryId, undefined);
  assert.equal(rootContext.sessionId, undefined);
  assert.equal(rootContext.turnId, undefined);

  const explicit = root.createRootTraceContext({
    traceId: "trace-1",
    queryId: "q1",
    sessionId: "s1",
    turnId: "t1",
    attributes: { a: 1 },
  });
  assert.deepEqual(
    {
      traceId: explicit.traceId,
      queryId: explicit.queryId,
      sessionId: explicit.sessionId,
      turnId: explicit.turnId,
      attributes: explicit.attributes,
    },
    { traceId: "trace-1", queryId: "q1", sessionId: "s1", turnId: "t1", attributes: { a: 1 } },
  );

  const child = root.createChildTraceContext(explicit, { turnId: "t2", attributes: { b: 2 } });
  assert.equal(child.traceId, "trace-1");
  assert.equal(child.queryId, "q1");
  assert.equal(child.sessionId, "s1");
  assert.equal(child.turnId, "t2");
  assert.equal(child.parentSpanId, explicit.spanId);
  assert.equal(child.parentId, explicit.spanId);
  assert.equal(child.spanId.length, 16);
  assert.notEqual(child.spanId, explicit.spanId);
  assert.deepEqual(child.attributes, { a: 1, b: 2 });

  assert.equal(root.getCurrentTraceContext(), undefined);
  const seenSync = root.runWithContext(explicit, () => root.getCurrentTraceContext());
  assert.equal(seenSync?.traceId, "trace-1");
  assert.equal(root.getCurrentTraceContext(), undefined, "同步作用域结束后不得残留");

  const logContext = root.traceContextToLogContext(explicit);
  assert.deepEqual(
    {
      traceId: logContext.traceId,
      queryId: logContext.queryId,
      spanId: logContext.spanId,
      sessionId: logContext.sessionId,
      turnId: logContext.turnId,
      a: logContext.a,
    },
    {
      traceId: "trace-1",
      queryId: "q1",
      spanId: explicit.spanId,
      sessionId: "s1",
      turnId: "t1",
      a: 1,
    },
  );
});

test("B2b 异步 ambient 上下文与 createSpan 继承", async () => {
  const context = root.createRootTraceContext({ traceId: "trace-async" });
  const seen = await root.runWithContextAsync(context, async () => {
    await new Promise((resolve) => setImmediate(resolve));
    const span = root.createSpan("child");
    return {
      ambient: root.getCurrentTraceContext()?.traceId,
      spanTraceId: span.traceId,
      spanParentId: span.parentId,
      contextSpanId: context.spanId,
    };
  });
  assert.deepEqual(seen, {
    ambient: "trace-async",
    spanTraceId: "trace-async",
    spanParentId: context.spanId,
    contextSpanId: context.spanId,
  });
});

test("B3 span 驻留语义：状态、属性、单次结算与 onEnd 钩子", () => {
  const spans = [];
  const tracer = root.createTracer("tracer-1", (span) => spans.push(span));
  assert.equal(tracer.name, "tracer-1");

  const span = tracer.startSpan("op");
  assert.equal(span.name, "op");
  assert.equal(span.status, "running");
  assert.equal(span.endTime, undefined);
  assert.deepEqual(span.attributes, {});
  assert.equal(span.spanId.length, 16);
  span.setAttribute("k", "v");
  span.setAttributes({ n: 2, flag: true });
  assert.deepEqual(span.attributes, { k: "v", n: 2, flag: true });
  span.addEvent("ignored", { any: 1 });
  assert.deepEqual(span.attributes, { k: "v", n: 2, flag: true }, "addEvent 不得改变可见事实");

  span.end();
  assert.equal(span.status, "completed");
  assert.ok(span.endTime instanceof Date);
  assert.equal(spans.length, 1);
  assert.equal(spans[0], span, "钩子必须看到同一个已结算 record");
  const endTime = span.endTime;
  span.end(new Error("late"));
  assert.equal(span.status, "completed", "重复 end 不得二次结算");
  assert.equal(span.endTime, endTime);
  assert.equal(spans.length, 1);

  const failing = tracer.startSpan("op-fail");
  failing.end(new Error("boom"));
  assert.equal(failing.status, "error");
  assert.equal(failing.error?.message, "boom");
  assert.equal(spans.length, 2);

  const wrapped = root.createTracer("tracer-2").withSpan("sync", (inner) => {
    assert.equal(inner.status, "running");
    return 42;
  });
  assert.equal(wrapped, 42);
  assert.throws(
    () =>
      root.createTracer("tracer-3").withSpan("sync-fail", () => {
        throw new Error("nope");
      }),
    /nope/u,
  );
});

test("B4 Read PDF：常量、分页解析与校验失败", () => {
  assert.equal(tools.READ_PDF_NATIVE_MAX_INPUT_BYTES, 20 * 1024 * 1024);
  assert.equal(tools.READ_PDF_EXTRACT_MAX_INPUT_BYTES, 100 * 1024 * 1024);
  assert.equal(tools.READ_PDF_NATIVE_MAX_PAGES, 10);
  assert.equal(tools.READ_PDF_MAX_PAGES_PER_REQUEST, 20);
  assert.equal(tools.READ_PDF_INFO_TIMEOUT_MS, 10000);
  assert.equal(tools.READ_PDF_AVAILABILITY_TIMEOUT_MS, 5000);
  assert.equal(tools.READ_PDF_RENDER_TIMEOUT_MS, 120000);

  assert.deepEqual(tools.parseReadPdfPageRange("1-5"), { firstPage: 1, lastPage: 5 });
  assert.deepEqual(tools.parseReadPdfPageRange("3"), { firstPage: 3, lastPage: 3 });
  assert.deepEqual(tools.parseReadPdfPageRange(" 10- "), {
    firstPage: 10,
    lastPage: Number.POSITIVE_INFINITY,
  });
  assert.equal(tools.parseReadPdfPageRange("5-3"), undefined);
  assert.equal(tools.parseReadPdfPageRange("0"), undefined);
  assert.equal(tools.parseReadPdfPageRange("1-2-3"), undefined);
  assert.equal(tools.parseReadPdfPageRange("abc"), undefined);
  assert.equal(tools.parseReadPdfPageRange(""), undefined);

  assert.equal(tools.getReadPdfPagesValidationFailure("a.txt", "1-5"), undefined);
  assert.equal(tools.getReadPdfPagesValidationFailure("a.pdf", undefined), undefined);
  assert.equal(tools.getReadPdfPagesValidationFailure("a.pdf", "1-5"), undefined);
  const invalid = tools.getReadPdfPagesValidationFailure("a.pdf", "5-3");
  assert.equal(invalid.errorCode, 7);
  assert.match(invalid.message, /Invalid pages parameter/u);
  const tooLarge = tools.getReadPdfPagesValidationFailure("a.pdf", "1-21");
  assert.equal(tooLarge.errorCode, 8);
  assert.match(tooLarge.message, /exceeds maximum of 20 pages/u);
  assert.equal(tools.getReadPdfPagesValidationFailure("a.pdf", "10-").errorCode, 8);
});

test("B5 Read 常量与错误码取值", () => {
  assert.equal(tools.READ_DEFAULT_MAX_LINES, 2000);
  assert.equal(tools.READ_MAX_OUTPUT_TOKENS, 25000);
  assert.equal(tools.READ_IMAGE_MAX_DIMENSION, 2000);
  assert.equal(tools.READ_IMAGE_TOKEN_TO_BASE64_CHAR_RATIO, 0.125);
  assert.equal(tools.READ_PDF_MAX_PAGES_PER_REQUEST, 20);
  assert.deepEqual(
    { ...tools.ReadErrorCode },
    {
      PDF_INVALID_PAGES: 7,
      PDF_PAGE_RANGE_TOO_LARGE: 8,
      PDF_PAGES_IMAGES_UNSUPPORTED: 10,
      PDF_CONFIGURATION_ERROR: 11,
      PDF_INVALID: 12,
      PDF_TOO_LARGE: 13,
      PDF_TOO_MANY_PAGES: 14,
      PDF_TIMEOUT: 15,
      PDF_PASSWORD_PROTECTED: 16,
      PDF_PAGE_OUT_OF_RANGE: 17,
      PDF_PERMISSION_DENIED: 18,
      PDF_IO_ERROR: 19,
      PDF_PROCESS_FAILED: 20,
    },
  );
});

test("B6 goal/target schema 与文案", () => {
  assert.deepEqual(
    { ...tools.GoalStatus },
    {
      Active: "active",
      Paused: "paused",
      BudgetLimited: "budget_limited",
      Complete: "complete",
    },
  );
  assert.equal(tools.MAX_GOAL_OBJECTIVE_CHARS, 4000);
  assert.equal(tools.GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE, "target_completion_verification");
  assert.equal(tools.GoalStatusSchema.safeParse("active").success, true);
  assert.equal(tools.GoalStatusSchema.safeParse("nope").success, false);
  assert.equal(tools.GoalTokenBudgetSchema.safeParse(null).success, true);
  assert.equal(tools.GoalTokenBudgetSchema.safeParse(5).success, true);
  assert.equal(tools.GoalTokenBudgetSchema.safeParse(0).success, false);
  assert.equal(tools.GoalTokenBudgetSchema.safeParse(-1).success, false);
  assert.equal(tools.GoalObjectiveSchema.safeParse("  hi  ").data, "hi");
  assert.equal(tools.GoalObjectiveSchema.safeParse("   ").success, false);
  assert.equal(tools.GoalObjectiveSchema.safeParse("x".repeat(4001)).success, false);
  assert.equal(tools.GoalObjectiveSchema.safeParse("x".repeat(4000)).success, true);
  assert.equal(tools.normalizeGoalObjective("  hi  "), "hi");
  assert.equal(tools.formatGoalStateForModel(null), "");

  const goal = samples.validGoal;
  assert.equal(tools.SessionGoalSchema.safeParse(goal).success, true);
  assert.equal(tools.SessionGoalSchema.safeParse({ ...goal, extra: 1 }).success, false);
  assert.equal(tools.SessionGoalSchema.safeParse({ ...goal, status: "nope" }).success, false);
  assert.equal(tools.SessionGoalSchema.safeParse({ ...goal, tokensUsed: -1 }).success, false);
  assert.equal(tools.GoalReadOutputSchema.safeParse({ goal: null }).success, true);
  assert.equal(tools.GoalReadOutputSchema.safeParse({}).success, false);
  assert.equal(tools.GoalReadInputSchema.safeParse({}).success, true);
  assert.equal(tools.GoalReadInputSchema.safeParse({ any: 1 }).success, false);
});

test("B7 rewind 常量、payload 解析与目标判定", () => {
  assert.deepEqual(
    { ...rewind.RewindScope },
    { Conversation: "conversation", Workspace: "workspace", Both: "both" },
  );
  assert.deepEqual(
    { ...rewind.RewindStrategy },
    {
      ActiveChain: "active_chain",
      FileOnly: "file_only",
      ForkRequired: "fork_required",
      Unavailable: "unavailable",
    },
  );
  assert.deepEqual(
    { ...rewind.RewindTargetStatus },
    {
      ActiveChain: "active_chain",
      CoveredByCompact: "covered_by_compact",
      Missing: "missing",
    },
  );

  const items = samples.rewindItems;
  const missing = rewind.evaluateRewindTarget({
    items,
    scope: "conversation",
    targetMessageId: "nope",
  });
  assert.deepEqual(
    {
      strategy: missing.strategy,
      targetStatus: missing.targetStatus,
      allowedScopes: missing.allowedScopes,
      reason: missing.reason,
    },
    {
      strategy: "unavailable",
      targetStatus: "missing",
      allowedScopes: [],
      reason: "target_not_found",
    },
  );
  const withoutCheckpoint = rewind.evaluateRewindTarget({
    items,
    scope: "conversation",
    targetMessageId: "m2",
  });
  assert.equal(withoutCheckpoint.strategy, "active_chain");
  assert.equal(withoutCheckpoint.targetStatus, "active_chain");
  assert.deepEqual(withoutCheckpoint.allowedScopes, ["conversation"]);
  const withCheckpoint = rewind.evaluateRewindTarget({
    items,
    scope: "conversation",
    targetMessageId: "m2",
    checkpointAvailable: true,
  });
  assert.deepEqual(withCheckpoint.allowedScopes, ["conversation", "workspace", "both"]);

  const messages = ["m1", "m2", "m3"].map((id) => ({ info: { id } }));
  assert.deepEqual(
    rewind.selectActiveConversationBranch(messages).map((m) => m.info.id),
    ["m1", "m2", "m3"],
  );
  assert.deepEqual(
    rewind
      .selectActiveConversationBranch(messages, { rewindTargetMessageId: "m2" })
      .map((m) => m.info.id),
    ["m1"],
  );
  assert.deepEqual(
    rewind
      .selectActiveConversationBranch(messages, {
        rewindTargetMessageId: "m2",
        rewindKeptMessageIds: ["m1", "m3"],
      })
      .map((m) => m.info.id),
    ["m1", "m3"],
  );

  assert.throws(
    () => rewind.parseCheckpointCreatedPayload({ checkpointId: "c1" }),
    /messageId|Required|invalid_type/u,
  );
  assert.throws(() => rewind.parseRewindTriggeredPayload({}), /Required|invalid_type/u);
  assert.throws(
    () => rewind.parseWorkspaceCheckpointArtifact({}),
    /Required|invalid_type|literal/u,
  );
});

test("B8 CreateWorkflow 常量与输入 schema", () => {
  assert.equal(tools.CREATE_WORKFLOW_TOOL_NAME, "CreateWorkflow");
  assert.deepEqual([...tools.CREATE_WORKFLOW_STEP_KINDS], ["ask", "world-read"]);
  assert.equal(tools.CREATE_WORKFLOW_GRAPH_MAX_STEPS, 64);
  assert.equal(tools.CREATE_WORKFLOW_GRAPH_MAX_PHASES, 32);
  assert.equal(tools.CREATE_WORKFLOW_GRAPH_MAX_LANES, 32);
  assert.equal(tools.CREATE_WORKFLOW_GRAPH_MAX_HANDOFFS, 256);
  assert.equal(tools.CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS, 64);
  assert.equal(tools.CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS, 128);
  assert.equal(tools.CREATE_WORKFLOW_DISPLAY_MAX_DIAGNOSTICS, 100);
  assert.equal(tools.CREATE_WORKFLOW_DISPLAY_MAX_MESSAGE_CHARS, 2048);

  assert.equal(tools.CreateWorkflowInputSchema.safeParse({ script: "x" }).success, true);
  assert.equal(tools.CreateWorkflowInputSchema.safeParse({ script: "x", extra: 1 }).success, false);
  assert.equal(
    tools.CreateWorkflowDiagnosticSchema.safeParse({ code: 1, column: 1, line: 1, message: "m" })
      .success,
    true,
  );
  assert.equal(
    tools.CreateWorkflowDiagnosticSchema.safeParse({
      code: 1,
      column: 1,
      line: 1,
      message: "m",
      extra: 1,
    }).success,
    false,
  );
  assert.equal(tools.CreateWorkflowEdgeSchema.safeParse({ from: "a", to: "b" }).success, true);
  assert.equal(tools.CreateWorkflowEdgeSchema.safeParse({ from: "a" }).success, false);
});

test("B9 workflow canonical schema 与 Expert 别名", () => {
  assert.equal(workflow.ExpertWorkflowStrategySchema, workflow.WorkflowStrategySchema);
  assert.equal(workflow.ExpertWorkflowRunSnapshotSchema, workflow.WorkflowRunSnapshotSchema);
  assert.equal(workflow.WorkflowStrategySchema.safeParse({}).success, false);
  assert.equal(workflow.WorkflowStrategySchema.safeParse({ nope: 1 }).success, false);
  const validStrategy = samples.validStrategy;
  assert.equal(workflow.WorkflowStrategySchema.safeParse(validStrategy).success, true);
  assert.equal(
    workflow.WorkflowStrategySchema.safeParse({ ...validStrategy, reactLoop: { maxRounds: 0 } })
      .success,
    false,
  );
});
