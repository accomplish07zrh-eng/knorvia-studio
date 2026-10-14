// SPDX-License-Identifier: Apache-2.0
// shared-01 契约测试：会话索引、工具卡 display、工作区 transcript 与 hook 审核面（B38–B42）。
import assert from "node:assert/strict";
import test from "node:test";
import { protocolV4 } from "./entry.mjs";

const {
  sessionsIndexTopic,
  parseSessionsIndexTopic,
  sessionSummarySchema,
  sessionsIndexSnapshotSchema,
  sessionsIndexDeltaSchema,
  toolCallCreateWorkflowDisplaySchema,
  WORKFLOW_WORKSPACE_LIMITS,
  workflowRunWorkspaceNodeSchema,
  v4ConversationWorkflowRunWorkspaceParamsSchema,
  v4ConversationWorkflowRunWorkspaceResultSchema,
  v4ConversationWorkflowRunNodeResultParamsSchema,
  v4ConversationWorkflowRunNodeResultResultSchema,
  workspaceHookReviewTrustStateSchema,
  workspaceHookReviewDecisionSchema,
  workspaceHookReviewRequestPayloadSchema,
  presentWorkspaceHookReviewRequestSchema,
} = protocolV4;

function summary(overrides = {}) {
  return {
    sessionId: "s-1",
    workspaceId: "ws-1",
    title: "会话标题",
    phase: "running",
    sessionEnded: false,
    hasBackgroundWork: false,
    lastActivityAt: 1_700_000_000_000,
    createdAt: 1_699_999_000_000,
    ...overrides,
  };
}

test("B38 sessions-index topic 键对偶：构造与解析互逆，空 id 不算", () => {
  assert.equal(sessionsIndexTopic("ws-1"), "sessions-index/ws-1");
  assert.equal(parseSessionsIndexTopic("sessions-index/ws-1"), "ws-1");
  assert.equal(parseSessionsIndexTopic("sessions-index/a/b"), "a/b", "只按前缀切一刀");
  assert.equal(parseSessionsIndexTopic("sessions-index/"), null, "空 id 不算");
  assert.equal(parseSessionsIndexTopic("sessions-index"), null, "缺分隔符");
  assert.equal(parseSessionsIndexTopic("other/ws-1"), null, "前缀不符");
  assert.equal(sessionsIndexTopic(""), "sessions-index/", "空 id 构造出的键不可逆");
  assert.equal(parseSessionsIndexTopic(sessionsIndexTopic("")), null, "与上一条互证");
});

test("B39 sessions-index 快照与增量：必备键、可选键与 protocolVersion", () => {
  const parsed = sessionSummarySchema.safeParse(summary());
  assert.equal(parsed.success, true, "最小 summary");
  for (const key of [
    "parentSessionId",
    "titleSource",
    "workflowActivity",
    "pendingInteraction",
    "pendingInteractionSummary",
    "goalStatus",
    "lastAssistantPreview",
  ]) {
    assert.equal(key in parsed.data, false, `旧 frame 兼容：${key} 可缺席`);
  }
  assert.equal(
    sessionSummarySchema.safeParse(summary({ titleSource: "custom" })).success,
    true,
    "titleSource 枚举成员",
  );
  assert.equal(
    sessionSummarySchema.safeParse(summary({ titleSource: "manual" })).success,
    false,
    "titleSource 封闭",
  );
  assert.equal(
    sessionSummarySchema.safeParse(
      summary({ pendingInteraction: { interactionId: "i-1", kind: "permission" } }),
    ).success,
    true,
    "pendingInteraction.kind ∈ permission|userInput",
  );
  assert.equal(
    sessionSummarySchema.safeParse(
      summary({ pendingInteraction: { interactionId: "i-1", kind: "question" } }),
    ).success,
    false,
    "kind 封闭",
  );
  assert.equal(
    sessionSummarySchema.safeParse(
      summary({ pendingInteractionSummary: { permissionCount: 1, userInputCount: 0 } }),
    ).success,
    true,
    "汇总计数非负整数",
  );
  assert.equal(
    sessionSummarySchema.safeParse(
      summary({ pendingInteractionSummary: { permissionCount: -1, userInputCount: 0 } }),
    ).success,
    false,
    "负计数拒绝",
  );
  assert.equal(sessionSummarySchema.safeParse(summary({ goalStatus: "verified" })).success, true);
  assert.equal(
    sessionSummarySchema.safeParse(summary({ goalStatus: "done" })).success,
    false,
    "goalStatus 封闭",
  );
  const withUnknown = sessionSummarySchema.safeParse(summary({ extra: 1 }));
  assert.equal(withUnknown.success, true, "该对象非 strict：旧 frame 的未知键不报错");
  assert.equal("extra" in withUnknown.data, false, "未知键被剥离");

  const snapshot = sessionsIndexSnapshotSchema.safeParse({
    protocolVersion: 1,
    workspaceId: "ws-1",
    logEpoch: "epoch-1",
    sessions: [summary()],
  });
  assert.equal(snapshot.success, true);
  assert.equal(
    sessionsIndexSnapshotSchema.safeParse({
      protocolVersion: 2,
      workspaceId: "ws-1",
      logEpoch: "e",
      sessions: [],
    }).success,
    false,
    "protocolVersion 是字面量 1",
  );
  assert.equal(
    sessionsIndexDeltaSchema.safeParse({ op: "session.upserted", session: summary() }).success,
    true,
  );
  assert.equal(
    sessionsIndexDeltaSchema.safeParse({ op: "session.removed", sessionId: "s-1" }).success,
    true,
  );
  assert.equal(
    sessionsIndexDeltaSchema.safeParse({ op: "session.created", session: summary() }).success,
    false,
    "只有两个 op",
  );
  assert.equal(
    sessionsIndexDeltaSchema.safeParse({ op: "session.removed" }).success,
    false,
    "缺 sessionId",
  );
});

function graphStep(index) {
  return { id: `s${index}`, kind: "ask", label: `步骤 ${index}`, lane: "l1" };
}

test("B40 CreateWorkflow 工具卡 display：strict 形态、诊断与因果图界限", () => {
  const schema = toolCallCreateWorkflowDisplaySchema;
  const minimal = { kind: "create_workflow", ok: true, errorCount: 0, diagnostics: [] };
  assert.equal(schema.safeParse(minimal).success, true);
  assert.equal(
    schema.safeParse({ ...minimal, kind: "edit_workflow" }).success,
    false,
    "kind 是字面量",
  );
  assert.equal(schema.safeParse({ ...minimal, extra: 1 }).success, false, "strict");
  assert.equal(schema.safeParse({ ...minimal, errorCount: -1 }).success, false, "errorCount 非负");
  const okDiagnostic = { line: 1, column: 2, code: 3, message: "bad" };
  assert.equal(schema.safeParse({ ...minimal, diagnostics: [okDiagnostic] }).success, true);
  assert.equal(
    schema.safeParse({ ...minimal, diagnostics: [{ ...okDiagnostic, message: "" }] }).success,
    false,
    "message 1..2048",
  );
  assert.equal(
    schema.safeParse({ ...minimal, diagnostics: [{ ...okDiagnostic, message: "m".repeat(2049) }] })
      .success,
    false,
    "message 上界",
  );
  assert.equal(
    schema.safeParse({
      ...minimal,
      diagnostics: Array.from({ length: 101 }, () => okDiagnostic),
    }).success,
    false,
    "诊断最多 100 条",
  );
  assert.equal(
    schema.safeParse({
      ...minimal,
      diagnostics: Array.from({ length: 100 }, () => okDiagnostic),
    }).success,
    true,
    "100 条在界内",
  );

  const graph = {
    steps: Array.from({ length: 65 }, (_, index) => graphStep(index)),
    lanes: [],
    participants: [],
    handoffs: [],
  };
  assert.equal(
    schema.safeParse({ ...minimal, causalityGraph: graph }).success,
    false,
    "steps 最多 64",
  );
  const bounded = {
    steps: Array.from({ length: 64 }, (_, index) => graphStep(index)),
    lanes: Array.from({ length: 32 }, (_, index) => ({ id: `l${index}` })),
    participants: [],
    handoffs: [],
  };
  assert.equal(
    schema.safeParse({ ...minimal, causalityGraph: bounded }).success,
    true,
    "64 步 / 32 车道在界内",
  );
  assert.equal(
    schema.safeParse({
      ...minimal,
      causalityGraph: { ...bounded, handoffs: [{ from: "a", to: "b", back: false }] },
    }).success,
    false,
    "back 只能是字面 true",
  );
  assert.equal(
    schema.safeParse({
      ...minimal,
      causalityGraph: { ...bounded, handoffs: [{ from: "a", to: "b", back: true }] },
    }).success,
    true,
    "回边接受",
  );
  assert.equal(
    schema.safeParse({
      ...minimal,
      causalityGraph: { ...bounded, extra: 1 },
    }).success,
    false,
    "图对象 strict",
  );
  assert.equal(
    schema.safeParse({
      ...minimal,
      causalityGraph: {
        ...bounded,
        steps: [{ ...graphStep(0), kind: "write" }],
      },
    }).success,
    false,
    "step.kind ∈ ask|world-read",
  );
  assert.equal(
    schema.safeParse({
      ...minimal,
      causalityGraph: {
        ...bounded,
        steps: [{ ...graphStep(0), repeat: "parallel" }],
      },
    }).success,
    false,
    "step.repeat ∈ stack|serial",
  );
  assert.equal(
    schema.safeParse({
      ...minimal,
      causalityGraph: {
        ...bounded,
        participants: [{ id: "p1", phase: "ph1", lane: "l1", steps: [] }],
      },
    }).success,
    false,
    "participants.steps 至少 1 项",
  );
  assert.equal(
    schema.safeParse({
      ...minimal,
      causalityGraph: {
        ...bounded,
        lanes: [{ id: "l1", namePattern: { head: "", tail: "x" } }],
      },
    }).success,
    false,
    "namePattern.head 1..128",
  );
});

test("B41 工作区 transcript 词汇表：限额常量、节点行 strict 与两条查询", () => {
  assert.deepEqual(
    { ...WORKFLOW_WORKSPACE_LIMITS },
    {
      maxNodes: 2000,
      maxOpLength: 32,
      maxArgs: 16,
      maxErrorMessageLength: 2000,
      resultMaxBytes: 32768,
    },
  );
  const node = {
    siteId: "site-1",
    ordinal: 0,
    kind: "world-read",
    op: "files.read",
    args: ["src/a.ts"],
    status: "completed",
    summary: { resultBytes: 12 },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_500,
  };
  const parsed = workflowRunWorkspaceNodeSchema.safeParse(node);
  assert.equal(parsed.success, true, "最小节点行");
  assert.equal("op" in parsed.data, true, "op/args 在场时保留（历史行可缺席）");
  assert.equal(
    workflowRunWorkspaceNodeSchema.safeParse({ ...node, extra: 1 }).success,
    false,
    "strict",
  );
  assert.equal(
    workflowRunWorkspaceNodeSchema.safeParse({ ...node, status: "pending" }).success,
    false,
    "status 封闭",
  );
  assert.equal(
    workflowRunWorkspaceNodeSchema.safeParse({ ...node, kind: "world-write" }).success,
    false,
    "kind 封闭",
  );
  assert.equal(
    workflowRunWorkspaceNodeSchema.safeParse({ ...node, op: "x".repeat(33) }).success,
    false,
    "op ≤ maxOpLength",
  );
  assert.equal(
    workflowRunWorkspaceNodeSchema.safeParse({
      ...node,
      args: Array.from({ length: 17 }, () => "a"),
    }).success,
    false,
    "args ≤ maxArgs",
  );
  assert.equal(
    workflowRunWorkspaceNodeSchema.safeParse({
      ...node,
      error: { code: "E1", message: "m".repeat(2001) },
    }).success,
    false,
    "error.message ≤ maxErrorMessageLength",
  );
  assert.equal(
    workflowRunWorkspaceNodeSchema.safeParse({ ...node, summary: { resultBytes: 1, bogus: 2 } })
      .success,
    false,
    "summary strict",
  );
  assert.equal(
    workflowRunWorkspaceNodeSchema.safeParse({ ...node, inputTruncated: false }).success,
    false,
    "inputTruncated 只能是字面 true",
  );

  const params = v4ConversationWorkflowRunWorkspaceParamsSchema;
  assert.equal(params.safeParse({ sessionId: "s-1", runId: "r-1" }).success, true);
  assert.equal(params.safeParse({ sessionId: "s-1" }).success, false, "runId 必填");
  assert.equal(
    params.safeParse({ sessionId: "s-1", runId: "r-1", extra: 1 }).success,
    false,
    "strict",
  );

  const result = v4ConversationWorkflowRunWorkspaceResultSchema;
  assert.equal(result.safeParse({ nodes: [node] }).success, true, "truncated 可缺席");
  assert.equal(
    result.safeParse({ nodes: Array.from({ length: 2001 }, () => node) }).success,
    false,
    "清单最多 maxNodes 行",
  );
  assert.equal(result.safeParse({ nodes: Array.from({ length: 2000 }, () => node) }).success, true);

  const nodeParams = v4ConversationWorkflowRunNodeResultParamsSchema;
  assert.equal(
    nodeParams.safeParse({ sessionId: "s-1", runId: "r-1", siteId: "site-1", ordinal: 0 }).success,
    true,
    "maxBytes 可缺席",
  );
  assert.equal(
    nodeParams.safeParse({
      sessionId: "s-1",
      runId: "r-1",
      siteId: "site-1",
      ordinal: 0,
      maxBytes: 32768,
    }).success,
    true,
    "maxBytes 上界 = resultMaxBytes",
  );
  assert.equal(
    nodeParams.safeParse({
      sessionId: "s-1",
      runId: "r-1",
      siteId: "site-1",
      ordinal: 0,
      maxBytes: 32769,
    }).success,
    false,
    "超过 resultMaxBytes 拒绝",
  );
  assert.equal(
    nodeParams.safeParse({
      sessionId: "s-1",
      runId: "r-1",
      siteId: "site-1",
      ordinal: 0,
      maxBytes: 0,
    }).success,
    false,
    "maxBytes 正整数",
  );

  const nodeResult = v4ConversationWorkflowRunNodeResultResultSchema;
  const done = { status: "completed", truncated: false, totalBytes: 10 };
  assert.equal(nodeResult.safeParse(done).success, true, "result/error 可缺席");
  assert.equal(nodeResult.safeParse({ ...done, result: { text: "body" } }).success, true);
  assert.equal(
    nodeResult.safeParse({ status: "completed", totalBytes: 10 }).success,
    false,
    "truncated 必备",
  );
  assert.equal(
    nodeResult.safeParse({ status: "completed", truncated: false }).success,
    false,
    "totalBytes 必备",
  );
  assert.equal(
    nodeResult.safeParse({ ...done, truncated: "no" }).success,
    false,
    "truncated 是布尔",
  );
});

function hookItem(overrides = {}) {
  return {
    reviewItemId: "item-1",
    event: "PreToolUse",
    type: "command",
    displayName: "示例 Hook",
    displayCommand: "node hook.js",
    sourcePath: ".claude/hooks/hook.js",
    resolvedTimeoutMs: 1000,
    resolvedMaxOutputBytes: 4096,
    executionMode: "foreground",
    configuredEnabled: true,
    editable: true,
    trustState: "pending_trust",
    ...overrides,
  };
}

function hookRequest(overrides = {}) {
  return {
    kind: "workspaceHookReview",
    reviewFlowId: "flow-1",
    generation: 1,
    interactionId: "i-1",
    sessionId: "s-1",
    taskId: "t-1",
    runId: "r-1",
    workspaceIdentity: "workspace-identity",
    workspaceLabel: "示例工作区",
    bundleDigest: "a".repeat(64),
    createdAt: 1_700_000_000_000,
    deadlineAt: 1_700_000_060_000,
    sourceFiles: [{ path: ".claude/hooks/hook.js", displayPath: "hooks/hook.js", editable: true }],
    summary: { eventCount: 2, hookCount: 2, pendingCount: 1 },
    items: [
      hookItem({ reviewItemId: "item-1", event: "PreToolUse" }),
      hookItem({ reviewItemId: "item-2", event: "Stop", trustState: "trusted_persistent" }),
    ],
    warningCode: "workspace_hooks_execute_code",
    ...overrides,
  };
}

test("B42 hook 审核：信任态词表、决策去重与请求载荷的三处计数一致性", () => {
  const trustStates = [
    "not_applicable",
    "pending_trust",
    "trusted_persistent",
    "blocked_untrusted",
    "blocked_policy",
    "revoked",
    "stale_digest",
  ];
  assert.deepEqual([...workspaceHookReviewTrustStateSchema.options], trustStates, "七态词表是契约");
  for (const state of trustStates) {
    assert.equal(workspaceHookReviewTrustStateSchema.safeParse(state).success, true, state);
  }
  assert.equal(workspaceHookReviewTrustStateSchema.safeParse("pending").success, false);

  const decision = workspaceHookReviewDecisionSchema.safeParse({
    action: "trust_selected",
    reviewItemIds: ["item-1", "item-2"],
  });
  assert.equal(decision.success, true);
  assert.equal(
    workspaceHookReviewDecisionSchema.safeParse({ action: "trust_selected", reviewItemIds: [] })
      .success,
    false,
    "至少 1 项",
  );
  const duplicate = workspaceHookReviewDecisionSchema.safeParse({
    action: "trust_selected",
    reviewItemIds: ["item-1", "item-1"],
  });
  assert.equal(duplicate.success, false, "reviewItemId 不得重复");
  assert.ok(
    duplicate.error.issues.some((issue) => issue.message === "review item ids must be unique"),
    "固定 message",
  );
  assert.equal(
    workspaceHookReviewDecisionSchema.safeParse({ action: "trust_all", reviewItemIds: ["a"] })
      .success,
    false,
    "action 是字面量",
  );

  const request = workspaceHookReviewRequestPayloadSchema;
  const parsed = request.safeParse(hookRequest());
  assert.equal(parsed.success, true, "最小合法请求");
  assert.equal(
    request.safeParse(hookRequest({ deadlineAt: 1_699_999_999_999 })).success,
    false,
    "deadlineAt ≥ createdAt",
  );
  assert.ok(
    request
      .safeParse(hookRequest({ deadlineAt: 1_699_999_999_999 }))
      .error.issues.some(
        (issue) =>
          issue.message === "deadlineAt must not precede createdAt" &&
          JSON.stringify(issue.path) === '["deadlineAt"]',
      ),
    "固定 message 与 path",
  );
  const wrongHookCount = request.safeParse(
    hookRequest({ summary: { eventCount: 2, hookCount: 3, pendingCount: 1 } }),
  );
  assert.equal(wrongHookCount.success, false, "hookCount 必须等于 items 条数");
  assert.ok(
    wrongHookCount.error.issues.some(
      (issue) => issue.message === "hookCount must match the immutable request items",
    ),
  );
  const wrongEventCount = request.safeParse(
    hookRequest({ summary: { eventCount: 1, hookCount: 2, pendingCount: 1 } }),
  );
  assert.equal(wrongEventCount.success, false, "eventCount 必须等于 items 的不同 event 数");
  assert.ok(
    wrongEventCount.error.issues.some(
      (issue) => issue.message === "eventCount must match the immutable request items",
    ),
  );
  const wrongPending = request.safeParse(
    hookRequest({ summary: { eventCount: 2, hookCount: 2, pendingCount: 0 } }),
  );
  assert.equal(wrongPending.success, false, "pendingCount 必须等于待审核信任态条数");
  assert.ok(
    wrongPending.error.issues.some(
      (issue) => issue.message === "pendingCount must match pending admission items",
    ),
  );
  assert.equal(
    request.safeParse(
      hookRequest({
        summary: { eventCount: 2, hookCount: 2, pendingCount: 1 },
        items: [
          hookItem({ reviewItemId: "dup" }),
          hookItem({ reviewItemId: "dup", event: "Stop" }),
        ],
      }),
    ).success,
    false,
    "items 内 reviewItemId 唯一",
  );
  assert.equal(
    request.safeParse(hookRequest({ bundleDigest: "A".repeat(64) })).success,
    false,
    "digest 必须小写 hex",
  );
  assert.equal(
    request.safeParse(hookRequest({ bundleDigest: "a".repeat(63) })).success,
    false,
    "digest 必须 64 位",
  );
  assert.equal(
    request.safeParse(hookRequest({ warningCode: "workspace_hooks_unknown" })).success,
    false,
    "warningCode 是字面量",
  );
  assert.equal(request.safeParse(hookRequest({ extra: 1 })).success, false, "strict");
  assert.equal(
    request.safeParse(hookRequest({ items: [hookItem({ event: "PreToolUseX" }), hookItem()] }))
      .success,
    false,
    "event 枚举封闭",
  );
  assert.equal(
    request.safeParse(hookRequest({ items: [hookItem({ type: "hook" }), hookItem()] })).success,
    false,
    "type ∈ command|process",
  );
  assert.equal(
    request.safeParse(hookRequest({ items: [hookItem({ executionMode: "idle" }), hookItem()] }))
      .success,
    false,
    "executionMode ∈ foreground|background",
  );

  const present = presentWorkspaceHookReviewRequestSchema;
  const presentValid = {
    reviewFlowId: "flow-1",
    generation: 1,
    interactionId: "i-1",
    sessionId: "s-1",
    workspaceIdentity: "workspace-identity",
    bundleDigest: "a".repeat(64),
    settingsSection: "hooks",
    settingsScope: "workspace",
  };
  assert.equal(present.safeParse(presentValid).success, true);
  assert.equal(
    present.safeParse({ ...presentValid, settingsSection: "general" }).success,
    false,
    "settingsSection 字面量",
  );
  assert.equal(
    present.safeParse({ ...presentValid, settingsScope: "global" }).success,
    false,
    "settingsScope 字面量",
  );
  assert.equal(present.safeParse({ ...presentValid, extra: 1 }).success, false, "strict");
});
