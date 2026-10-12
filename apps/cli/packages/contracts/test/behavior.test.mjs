// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// contracts-01 契约测试：运行时可观察行为（B2–B22）。只走公开入口。
import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./entry.mjs";

const root = await load();
const commands = await load("commands");
const compact = await load("compact");
const events = await load("events");

const SESSION_ID = root.createSessionId("contracts01");
const TRACE_ID = root.createTraceId();

test("标识工厂保留既有前缀且同一毫秒内不重复", () => {
  assert.match(root.createSessionId("x"), /^sess_x$/u);
  assert.match(root.createTurnId("x"), /^turn_x$/u);
  assert.match(root.createEventId("x"), /^evt_x$/u);
  assert.match(root.createQueryId("x"), /^query_x$/u);
  assert.match(root.createToolCallId("x"), /^tool_x$/u);
  assert.match(root.createMessageId("x"), /^msg_x$/u);
  assert.match(root.createPartId("x"), /^part_x$/u);
  assert.match(root.createInputHistoryId("x"), /^input_x$/u);
  assert.match(root.createProjectId("x"), /^proj_x$/u);
  assert.match(root.createWorkspaceId("x"), /^ws_x$/u);
  assert.match(root.createTraceId(), /^[0-9a-f-]{36}$/u);
  const generated = new Set(Array.from({ length: 50 }, () => root.createMessageId()));
  assert.equal(generated.size, 50);
});

test("日志级别常量与名称映射保持既有取值", () => {
  assert.deepEqual({ ...root.LogLevel }, { Debug: 0, Info: 1, Warn: 2, Error: 3 });
  assert.deepEqual({ ...root.LogLevelName }, { 0: "DEBUG", 1: "INFO", 2: "WARN", 3: "ERROR" });
});

test("命令参数切分：引号、转义与未闭合引号", () => {
  assert.deepEqual(commands.splitCustomCommandArguments("  a  b   c "), ["a", "b", "c"]);
  assert.deepEqual(commands.splitCustomCommandArguments('one "two three" four'), [
    "one",
    "two three",
    "four",
  ]);
  assert.deepEqual(commands.splitCustomCommandArguments("one 'two three' four"), [
    "one",
    "two three",
    "four",
  ]);
  assert.deepEqual(commands.splitCustomCommandArguments("a\\ b c"), ["a b", "c"]);
  assert.deepEqual(commands.splitCustomCommandArguments('"a b\\"c"'), ['a b"c']);
  assert.deepEqual(commands.splitCustomCommandArguments(""), []);
  assert.deepEqual(commands.splitCustomCommandArguments("trailing\\"), ["trailing\\"]);
  assert.deepEqual(commands.splitCustomCommandArguments('unclosed "a b'), ["unclosed", "a b"]);
});

test("命令模板展开：$ARGUMENTS、位置参数与 User arguments 追加", () => {
  const command = (content) => ({
    content,
    metadata: { name: "demo", scope: "project", source: "agents", skills: [] },
  });
  const withPlaceholder = commands.expandCustomCommandTemplate({
    args: "  alpha beta  ",
    command: command("Do $1 then $ARGUMENTS and $3"),
  });
  assert.equal(withPlaceholder.argumentCount, 2);
  assert.equal(withPlaceholder.usedArgumentsPlaceholder, true);
  assert.equal(withPlaceholder.body, "Do alpha then alpha beta and ");
  const positionalOnly = commands.expandCustomCommandTemplate({
    args: "x y",
    command: command("run $2"),
  });
  assert.equal(positionalOnly.usedArgumentsPlaceholder, true);
  assert.equal(positionalOnly.body, "run y");
  const noPlaceholder = commands.expandCustomCommandTemplate({
    args: "extra input",
    command: command("Body line"),
  });
  assert.equal(noPlaceholder.usedArgumentsPlaceholder, false);
  assert.equal(noPlaceholder.body, "Body line\n\nUser arguments:\nextra input");
  const noArgs = commands.expandCustomCommandTemplate({ args: "   ", command: command("Body") });
  assert.equal(noArgs.argumentCount, 0);
  assert.equal(noArgs.body, "Body");
});

test("命令提示格式化：来源行、技能指令与正文顺序", () => {
  const withSkills = commands.formatCustomCommandPrompt({
    argumentCount: 1,
    body: "  Body text  ",
    command: {
      metadata: { name: "demo", scope: "user", source: "plugin", skills: ["alpha", "beta"] },
    },
    usedArgumentsPlaceholder: true,
  });
  assert.equal(
    withSkills.prompt,
    [
      "Run custom command /demo.",
      "Command source: user/plugin.",
      "Required skills: `alpha`, `beta`.",
      "Before following the command body, call the Skill tool for `alpha`, `beta`.",
      "",
      "Body text",
    ].join("\n"),
  );
  assert.equal(withSkills.argumentCount, 1);
  assert.equal(withSkills.usedArgumentsPlaceholder, true);
  const withoutSkills = commands.formatCustomCommandPrompt({
    argumentCount: 0,
    body: "Body",
    command: { metadata: { name: "plain", scope: "project", source: "agents" } },
    usedArgumentsPlaceholder: false,
  });
  assert.equal(
    withoutSkills.prompt,
    ["Run custom command /plain.", "Command source: project/agents.", "", "Body"].join("\n"),
  );
});

test("动态 shell 语法被识别并让 expandCustomCommandPrompt 抛错", () => {
  assert.equal(commands.detectUnsupportedDynamicSyntax("plain body"), undefined);
  assert.equal(commands.detectUnsupportedDynamicSyntax("run !`ls`"), "shell");
  assert.equal(commands.detectUnsupportedDynamicSyntax("```!\nls\n```"), "shell");
  const command = {
    content: "do !`ls`",
    metadata: { name: "danger", scope: "project", source: "agents" },
  };
  assert.throws(
    () => commands.expandCustomCommandPrompt({ args: "", command }),
    /Custom command \/danger uses unsupported shell expansion\. Dynamic expansion is not available yet\./u,
  );
});

test("紧凑相关常量取值保持既有字面量", () => {
  assert.deepEqual(
    { ...compact.CompactTrigger },
    {
      Manual: "manual",
      Auto: "auto",
      Partial: "partial",
      Reactive: "reactive",
      SessionMemory: "session_memory",
    },
  );
  assert.deepEqual(
    { ...compact.MicrocompactTrigger },
    { TimeBased: "time_based", TokenPressure: "token_pressure" },
  );
  assert.deepEqual(
    { ...compact.MicrocompactStrategy },
    { LocalToolResultClear: "local_tool_result_clear" },
  );
  assert.deepEqual(
    { ...compact.CompactPhase },
    {
      StandaloneTurn: "standalone_turn",
      PreRequest: "pre_request",
      MidTurn: "mid_turn",
      Reactive: "reactive",
    },
  );
  assert.deepEqual(
    { ...compact.CompactStatus },
    {
      Started: "started",
      BoundaryCreated: "boundary_created",
      SummaryCreated: "summary_created",
      Completed: "completed",
      Failed: "failed",
    },
  );
  assert.deepEqual(
    { ...compact.CompactTimelineStatus },
    {
      Started: "started",
      Retrying: "retrying",
      Skipped: "skipped",
      Completed: "completed",
      Failed: "failed",
      Interrupted: "interrupted",
    },
  );
  assert.deepEqual({ ...compact.CompactTimelineDisplay }, { Separator: "separator" });
  assert.equal(compact.CompactFailureReason.Unknown, "unknown");
  assert.equal(compact.CompactReason.ProviderOverflow, "provider_overflow");
});

test("紧凑边界 payload：必填、默认值与 strict 拒绝未知字段", () => {
  const payload = compact.parseCompactBoundaryPayload({
    boundaryId: "b1",
    trigger: "auto",
    preCompactTokenCount: 10,
    summarizedMessageCount: 2,
    traceId: "t1",
  });
  assert.deepEqual(payload.summaryMessageIds, []);
  assert.throws(
    () =>
      compact.parseCompactBoundaryPayload({
        trigger: "auto",
        preCompactTokenCount: 1,
        summarizedMessageCount: 1,
        traceId: "t",
      }),
    /boundaryId|Required|invalid_type/u,
  );
  assert.throws(
    () =>
      compact.parseCompactBoundaryPayload({
        boundaryId: "b1",
        trigger: "auto",
        preCompactTokenCount: -1,
        summarizedMessageCount: 1,
        traceId: "t1",
      }),
    /too_small|greater than or equal to 0|nonnegative/u,
  );
  assert.throws(
    () =>
      compact.parseCompactBoundaryPayload({
        boundaryId: "b1",
        trigger: "auto",
        preCompactTokenCount: 1,
        summarizedMessageCount: 1,
        traceId: "t1",
        unexpected: true,
      }),
    /unrecognized|Unrecognized|strict/u,
  );
});

test("时间线 payload：display 默认值且 text 被剔除", () => {
  const parsed = compact.parseCompactTimelinePayload({
    operationId: "op1",
    messageId: "m1",
    status: "started",
    trigger: "manual",
    text: "legacy text should be dropped",
  });
  assert.equal(parsed.display, "separator");
  assert.equal("text" in parsed, false);
  assert.equal(parsed.operationId, "op1");
  assert.throws(
    () =>
      compact.parseCompactTimelinePayload({
        operationId: "op1",
        messageId: "m1",
        status: "nope",
        trigger: "manual",
      }),
    /invalid|Invalid|enum/u,
  );
});

test("微紧凑边界 payload：枚举、id 数组与非负计数", () => {
  const parsed = compact.parseMicrocompactBoundaryPayload({
    trigger: "time_based",
    strategy: "local_tool_result_clear",
    preMicrocompactTokenCount: 5,
    postMicrocompactTokenCount: 3,
    tokensSaved: 2,
    clearedToolCallIds: ["tool_1"],
    keptToolCallIds: ["tool_2"],
    clearedMessageCount: 1,
    traceId: "t1",
  });
  assert.deepEqual(parsed.clearedToolCallIds, ["tool_1"]);
  assert.throws(
    () =>
      compact.parseMicrocompactBoundaryPayload({
        trigger: "time_based",
        strategy: "local_tool_result_clear",
        preMicrocompactTokenCount: 5,
        postMicrocompactTokenCount: 3,
        tokensSaved: 2,
        clearedToolCallIds: [""],
        keptToolCallIds: [],
        clearedMessageCount: 1,
        traceId: "t1",
      }),
    /too_small|at least 1|min/u,
  );
});

test("紧凑辅助函数：边界判定、构造顺序、切片与注解", () => {
  const boundary = {
    boundaryId: "b1",
    trigger: "auto",
    preCompactTokenCount: 10,
    summarizedMessageCount: 2,
    traceId: "t1",
    summaryMessageIds: [],
  };
  assert.equal(compact.isCompactBoundaryItem({ id: "x", compactBoundary: boundary }), true);
  assert.equal(
    compact.isCompactBoundaryItem({ id: "x", compactBoundary: { boundaryId: "b1" } }),
    false,
  );
  assert.equal(compact.isCompactBoundaryItem(null), false);
  assert.deepEqual(
    compact.buildPostCompactItems({
      boundaryMarker: "B",
      summaryMessages: ["s1", "s2"],
      messagesToKeep: ["k"],
      attachments: ["a"],
      hookResults: ["h"],
    }),
    ["B", "s1", "s2", "k", "a", "h"],
  );
  assert.deepEqual(compact.buildPostCompactItems({ boundaryMarker: "B", summaryMessages: [] }), [
    "B",
  ]);
  const items = ["m1", "m2", "m3"];
  assert.deepEqual(
    compact.getItemsAfterLastCompactBoundary(items, () => false),
    items,
  );
  assert.deepEqual(
    compact.getItemsAfterLastCompactBoundary(items, (item) => item === "m2"),
    ["m2", "m3"],
  );
  const annotated = compact.annotateBoundaryWithPreservedSegment(
    { id: "x", compactBoundary: boundary },
    { headMessageId: "h", anchorMessageId: "a", tailMessageId: "t" },
  );
  assert.equal(annotated.compactBoundary.preservedSegment.anchorMessageId, "a");
  assert.equal(boundary.preservedSegment, undefined);
  assert.throws(
    () =>
      compact.annotateBoundaryWithPreservedSegment(
        { id: "x" },
        { headMessageId: "h", anchorMessageId: "a", tailMessageId: "t" },
      ),
    /Cannot annotate a compact boundary on an item without compactBoundary/u,
  );
});

test("投影初值字段与默认值保持既有取值", () => {
  const projection = events.reduce([]);
  assert.equal(projection.mode, "build");
  assert.equal(projection.status, "idle");
  assert.equal(projection.turnCount, 0);
  assert.equal(projection.totalTokenCount, 0);
  assert.equal(projection.contextUsed, 0);
  assert.equal(projection.contextWindow, 200000);
  assert.deepEqual(projection.pendingPermissions, []);
  assert.deepEqual(projection.pendingSteerInputs, []);
  assert.deepEqual(projection.activeToolCalls, []);
  assert.deepEqual(projection.streamingToolLedger, []);
  assert.deepEqual(projection.backgroundTasks, []);
  assert.equal(projection.currentTurnId, undefined);
  assert.equal(projection.lastError, undefined);
  assert.equal(projection.lastCompact, undefined);
  assert.ok(projection.createdAt instanceof Date);
  assert.ok(projection.updatedAt instanceof Date);
});

test("reduce 不修改输入事件数组，且对同一输入得到等值投影", () => {
  const sessionId = root.createSessionId("reduce");
  const turnId = root.createTurnId("reduce");
  const input = [
    events.createSessionEvent(events.SessionEventType.TurnStarted, sessionId, {}, { turnId }),
    events.createSessionEvent(
      events.SessionEventType.TurnComplete,
      sessionId,
      { tokenCount: 3 },
      { turnId },
    ),
  ];
  const snapshot = input.map((event) => event.sequenceNumber);
  const first = events.reduce(input);
  const second = events.reduce(input);
  assert.deepEqual(
    input.map((event) => event.sequenceNumber),
    snapshot,
    "输入事件不得被改写",
  );
  assert.equal(first.totalTokenCount, 3);
  assert.deepEqual(first.pendingSteerInputs, second.pendingSteerInputs);
  assert.equal(first.status, second.status);
});

test("保留策略：unbounded 空淘汰、turn-window 的 seal/清空/超时淘汰", () => {
  const unbounded = events.createSessionEventRetentionPolicy("unbounded");
  assert.deepEqual(
    unbounded.onAppend({ type: events.SessionEventType.TurnComplete, turnId: "t1" }, 0),
    [],
  );
  assert.deepEqual(unbounded.collectExpired(10 ** 9, 1), []);

  const grace = events.SEALED_TURN_TRANSIENT_GRACE_MS;
  const policy = events.createSessionEventRetentionPolicy("turn-window");
  const turnComplete = { type: events.SessionEventType.TurnComplete };
  assert.deepEqual(policy.onAppend({ ...turnComplete, turnId: "t1" }, 1000), []);
  assert.deepEqual(policy.onAppend({ ...turnComplete, turnId: "t1" }, 2000), []);
  assert.deepEqual(policy.onAppend({ ...turnComplete, turnId: "t2" }, 3000), []);
  // grace 为「已到期」的边界：now - sealedAt >= grace 才淘汰。
  assert.deepEqual(policy.collectExpired(3000 + grace - 1, grace), ["t1"]);
  assert.deepEqual(
    policy.onAppend({ type: events.SessionEventType.TurnStarted, turnId: "t3" }, 5000),
    ["t2"],
  );
  assert.deepEqual(policy.collectExpired(10 ** 9, 1), []);
});

test("瞬时事件集合与宽限期常量", () => {
  assert.equal(events.SEALED_TURN_TRANSIENT_GRACE_MS, 120000);
  const transient = events.TRANSIENT_SESSION_EVENT_TYPES;
  for (const type of [
    events.SessionEventType.ModelStreaming,
    events.SessionEventType.ToolCallProgress,
    events.SessionEventType.StreamingToolLedgerUpdated,
    events.SessionEventType.ModelNetworkStatus,
  ]) {
    assert.equal(transient.has(type), true, `${type} 应为瞬时事件`);
  }
  assert.equal(transient.has(events.SessionEventType.TurnStarted), false);
  assert.equal(
    events.isTransientSessionEvent({ type: events.SessionEventType.ModelStreaming }),
    true,
  );
  assert.equal(
    events.isTransientSessionEvent({ type: events.SessionEventType.TurnComplete }),
    false,
  );
});

test("内存事件存储：追加/读取/序号/删除/统计", async () => {
  let now = 1000;
  const store = events.createInMemorySessionEventStore({ now: () => now });
  const first = await store.append(
    events.createSessionEvent(
      events.SessionEventType.TurnStarted,
      SESSION_ID,
      {},
      { turnId: root.createTurnId("t1") },
    ),
  );
  const second = await store.append(
    events.createSessionEvent(
      events.SessionEventType.TurnComplete,
      SESSION_ID,
      { tokenCount: 1 },
      { turnId: root.createTurnId("t1") },
    ),
  );
  assert.equal(first.sequenceNumber, 1);
  assert.equal(second.sequenceNumber, 2);
  assert.deepEqual(
    (await store.getEvents(SESSION_ID)).map((event) => event.sequenceNumber),
    [1, 2],
  );
  assert.deepEqual(
    (await store.getEventsAfter(SESSION_ID, 1)).map((event) => event.sequenceNumber),
    [2],
  );
  assert.equal(await store.getLatestSequenceNumber(SESSION_ID), 2);
  assert.deepEqual(await store.getEvents(root.createSessionId("other")), []);
  assert.equal(await store.getLatestSequenceNumber(root.createSessionId("other")), 0);
  const stats = store.getStats();
  assert.equal(stats.sessions, 1);
  assert.equal(stats.events, 2);
  now += 1;
  await store.deleteSession(SESSION_ID);
  assert.deepEqual(await store.getEvents(SESSION_ID), []);
  assert.equal(store.getStats().sessions, 0);
  assert.equal(store.pruneTransientEvents(0, 1), 0);
});

test("投影提交不改入参；紧凑/流式/后台任务 changes 语义", () => {
  const projection = events.reduce([]);
  const turnId = root.createTurnId("t1");
  const boundaryPayload = {
    boundaryId: "b1",
    trigger: "auto",
    preCompactTokenCount: 100,
    postCompactTokenCount: 40,
    summarizedMessageCount: 3,
    traceId: TRACE_ID,
    turnId,
  };
  const compacted = events.apply(
    projection,
    events.createSessionEvent(
      events.SessionEventType.SessionCompacted,
      SESSION_ID,
      { compactBoundary: boundaryPayload },
      { turnId },
    ),
  );
  assert.equal(compacted.contextUsed, 40);
  assert.equal(compacted.lastCompact.boundaryId, "b1");
  assert.equal(compacted.lastCompact.preCompactTokenCount, 100);
  assert.notEqual(compacted, projection);
  assert.equal(projection.contextUsed, 0, "入参不得被改写");
  assert.equal(projection.lastCompact, undefined);

  const withTruePost = events.apply(
    compacted,
    events.createSessionEvent(
      events.SessionEventType.SessionCompacted,
      SESSION_ID,
      { compactBoundary: { ...boundaryPayload, boundaryId: "b2", truePostCompactTokenCount: 7 } },
      { turnId },
    ),
  );
  assert.equal(withTruePost.contextUsed, 7);

  const ledgerEvent = (attemptId, toolCallId) =>
    events.createSessionEvent(
      events.SessionEventType.StreamingToolLedgerUpdated,
      SESSION_ID,
      { attemptId, toolCallId, status: "started" },
      { turnId },
    );
  const ledgerOnce = events.apply(projection, ledgerEvent("a1", "tool_1"));
  assert.equal(ledgerOnce.streamingToolLedger.length, 1);
  const ledgerTwice = events.apply(ledgerOnce, ledgerEvent("a1", "tool_1"));
  assert.equal(ledgerTwice.streamingToolLedger.length, 1);
  const ledgerOther = events.apply(ledgerTwice, ledgerEvent("a2", "tool_2"));
  assert.equal(ledgerOther.streamingToolLedger.length, 2);
  assert.equal(projection.streamingToolLedger.length, 0);

  const anchored = events.apply(
    projection,
    events.createSessionEvent(
      events.SessionEventType.StreamRecoveryAnchorCreated,
      SESSION_ID,
      { anchorId: "anchor_1" },
      { turnId },
    ),
  );
  assert.equal(anchored.lastStreamRecoveryAnchor.anchorId, "anchor_1");

  const started = events.apply(
    projection,
    events.createSessionEvent(
      events.SessionEventType.BackgroundTaskStarted,
      SESSION_ID,
      { taskId: "task_1", status: "running", toolName: "bash", command: "sleep" },
      { turnId },
    ),
  );
  assert.equal(started.backgroundTasks.length, 1);
  assert.equal(started.backgroundTasks[0].taskId, "task_1");
  assert.ok(started.backgroundTasks[0].startedAt instanceof Date);
  const restarted = events.apply(
    started,
    events.createSessionEvent(
      events.SessionEventType.BackgroundTaskStarted,
      SESSION_ID,
      { taskId: "task_1", status: "running", toolName: "bash", command: "sleep" },
      { turnId },
    ),
  );
  assert.equal(restarted.backgroundTasks.length, 1);
  const updated = events.apply(
    restarted,
    events.createSessionEvent(
      events.SessionEventType.BackgroundTaskUpdated,
      SESSION_ID,
      { taskId: "task_1", status: "completed", outputBytes: 12 },
      { turnId },
    ),
  );
  assert.equal(updated.backgroundTasks[0].status, "completed");
  assert.equal(updated.backgroundTasks[0].outputBytes, 12);
  assert.equal(updated.backgroundTasks[0].command, "sleep", "未提供的字段保持原值");
  const completed = events.apply(
    updated,
    events.createSessionEvent(
      events.SessionEventType.BackgroundTaskCompleted,
      SESSION_ID,
      { taskId: "task_1", status: "completed", outputBytes: 12 },
      { turnId },
    ),
  );
  assert.ok(completed.backgroundTasks[0].completedAt instanceof Date);
});

test("队列 changes：admission 原位、order 重排与 mode 授权", () => {
  const projection = events.reduce([]);
  const turnId = root.createTurnId("t1");
  const queued = (pendingInputId, input) =>
    events.createSessionEvent(
      events.SessionEventType.TurnSteerQueued,
      SESSION_ID,
      { pendingInputId, input, inputPreview: input, inputSize: input.length, targetTurnId: turnId },
      { turnId },
    );
  const first = events.apply(projection, queued("p1", "one"));
  const second = events.apply(first, queued("p2", "two"));
  assert.deepEqual(
    second.pendingSteerInputs.map((row) => row.pendingInputId),
    ["p1", "p2"],
  );
  const edited = events.apply(second, queued("p1", "one-edited"));
  assert.equal(edited.pendingSteerInputs.length, 2);
  assert.equal(edited.pendingSteerInputs[0].input, "one-edited");
  assert.equal(edited.pendingSteerInputs[0].queuedAt, second.pendingSteerInputs[0].queuedAt);
  const reordered = events.apply(
    edited,
    events.createSessionEvent(
      events.SessionEventType.TurnSteerReordered,
      SESSION_ID,
      { orderedPendingInputIds: ["p2"] },
      { turnId },
    ),
  );
  assert.deepEqual(
    reordered.pendingSteerInputs.map((row) => row.pendingInputId),
    ["p2", "p1"],
  );
  const drained = events.apply(
    reordered,
    events.createSessionEvent(
      events.SessionEventType.TurnSteerDrained,
      SESSION_ID,
      { pendingInputIds: ["p2"] },
      { turnId },
    ),
  );
  assert.deepEqual(
    drained.pendingSteerInputs.map((row) => row.pendingInputId),
    ["p1"],
  );
  const planMode = events.apply(
    projection,
    events.createSessionEvent(
      events.SessionEventType.SessionModeChanged,
      SESSION_ID,
      { mode: "plan" },
      { turnId },
    ),
  );
  assert.equal(planMode.mode, "plan");
  assert.equal(planMode.planEnabled, true);
  const yoloMode = events.apply(
    projection,
    events.createSessionEvent(
      events.SessionEventType.SessionModeChanged,
      SESSION_ID,
      { mode: "build", planEnabled: false },
      { turnId },
    ),
  );
  assert.equal(yoloMode.planEnabled, false);
});

test("媒体策略：provider-visible 判定与不支持媒体文案", () => {
  const media = root;
  const image = { type: "image", mediaType: "image/png", dataUrl: "data:image/png;base64,AA" };
  const pdf = {
    type: "file",
    mediaType: "application/pdf",
    dataUrl: "data:application/pdf;base64,AA",
  };
  const pdfWithText = { ...pdf, text: "extracted" };
  const video = { type: "video", mediaType: "video/mp4", dataUrl: "data:video/mp4;base64,AA" };
  assert.equal(media.isProviderVisibleModelInputMediaBlock(image), true);
  assert.equal(media.isProviderVisibleModelInputMediaBlock(pdf), true);
  assert.equal(media.isProviderVisibleModelInputMediaBlock(pdfWithText), false);
  assert.equal(media.isProviderVisibleModelInputMediaBlock(video), true);
  assert.equal(media.isProviderVisibleModelInputMediaBlock({ type: "text", text: "hi" }), false);
  const format = { supportsImage: false, supportsPdf: false, supportsVideo: false };
  assert.equal(media.getUnsupportedModelInputMediaKind(image, format), "image input");
  assert.equal(media.getUnsupportedModelInputMediaKind(pdf, format), "PDF input");
  assert.equal(media.getUnsupportedModelInputMediaKind(video, format), "video input");
  assert.equal(media.getUnsupportedModelInputMediaKind(pdfWithText, format), undefined);
  assert.equal(
    media.createUnsupportedModelInputMediaText(image, "image input"),
    "[Attached image/png]\n[Media omitted from provider request because the selected model does not support image input.]",
  );
});

test("公网出口 IP：规范化、版本与阻断原因", () => {
  assert.equal(root.normalizeIpAddressLiteral("[2001:DB8::1]."), "2001:db8::1");
  assert.equal(root.getIpAddressVersion("127.0.0.1"), 4);
  assert.equal(root.getIpAddressVersion("::1"), 6);
  assert.equal(root.getIpAddressVersion("not-an-ip"), 0);
  assert.deepEqual(root.getPublicEgressIpBlockReason("not-an-ip"), {
    reason: "not an IP address",
    version: 0,
  });
  assert.equal(root.getPublicEgressIpBlockReason("10.1.2.3").reason, "private IPv4 address");
  assert.equal(root.getPublicEgressIpBlockReason("127.0.0.1").reason, "loopback IPv4 address");
  assert.equal(root.getPublicEgressIpBlockReason("169.254.1.1").reason, "link-local IPv4 address");
  assert.equal(root.getPublicEgressIpBlockReason("::1").reason, "loopback IPv6 address");
  assert.equal(root.getPublicEgressIpBlockReason("fd00::1").reason, "unique-local IPv6 address");
  assert.equal(root.getPublicEgressIpBlockReason("fe80::1").reason, "link-local IPv6 address");
  assert.equal(root.getPublicEgressIpBlockReason("93.184.216.34"), undefined);
});

test("Git Bash 路径双向转换", () => {
  assert.equal(root.windowsPathToGitBashPath("C:\\Users\\dev\\a.txt"), "/c/Users/dev/a.txt");
  assert.equal(root.windowsPathToGitBashPath("D:/work"), "/d/work");
  assert.equal(root.windowsPathToGitBashPath("C:"), "/c/");
  assert.equal(root.windowsPathToGitBashPath("\\\\server\\share\\x"), "//server/share/x");
  assert.equal(root.windowsPathToGitBashPath("relative\\path"), "relative/path");
  assert.equal(root.gitBashPathToWindowsPath("/c/Users/dev"), "C:\\Users\\dev");
  assert.equal(root.gitBashPathToWindowsPath("/cygdrive/d/work"), "D:\\work");
  assert.equal(root.gitBashPathToWindowsPath("/d"), "D:\\");
  assert.equal(root.gitBashPathToWindowsPath("//server/share/x"), "\\\\server\\share\\x");
  assert.equal(root.gitBashPathToWindowsPath("plain/rel"), "plain\\rel");
});
test("配置常量与默认运行配置保持既有取值与优先级", async () => {
  const config = await load("config");
  assert.equal(config.DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS, 600000);
  assert.equal(config.ConfigKey.ModelStreamIdleTimeout, "modelStream.idleTimeoutMs");
  assert.equal(config.ConfigKey.PermissionMode, "permission.mode");
  assert.equal(config.ConfigKey.StorageDir, "storage.dir");
  assert.equal(config.ConfigKey.HttpTimeout, "network.timeout");
  assert.equal(config.ConfigKey.PluginsEnabled, "plugins.enabled");
  assert.equal(config.ConfigKey.SkillsEnabled, "skills.enabled");
  assert.deepEqual(
    { ...config.ConfigScope },
    {
      System: "system",
      User: "user",
      Project: "project",
      Session: "session",
      Env: "env",
      Cli: "cli",
    },
  );
  assert.equal(config.ConfigScopePriority[config.ConfigScope.System], 0);
  assert.equal(config.ConfigScopePriority[config.ConfigScope.User], 10);
  assert.equal(config.ConfigScopePriority[config.ConfigScope.Project], 20);
  assert.equal(config.ConfigScopePriority[config.ConfigScope.Session], 30);
  const priorities = Object.values(config.ConfigScopePriority);
  assert.deepEqual(
    [...priorities].sort((left, right) => left - right),
    priorities,
    "优先级必须严格递增",
  );
  assert.equal(new Set(priorities).size, priorities.length, "每个 scope 的优先级唯一");
  const defaults = config.DefaultRuntimeConfig;
  assert.equal(defaults.modelStream.idleTimeoutMs, config.DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS);
  assert.equal(defaults.permission.mode, "build");
  assert.deepEqual(defaults.permission.allowedTools, []);
  assert.deepEqual(defaults.permission.disallowedTools, []);
  assert.equal(defaults.permission.autoApproveHighRisk, false);
  assert.equal(defaults.permission.allowMediumRiskInAuto, false);
  assert.equal(defaults.storage.dir, "~/.knorvia-studio");
  assert.equal(defaults.storage.sessionDbPath, "~/.knorvia-studio/cli/db/db.sqlite");
  assert.equal(defaults.network.timeout, 180000);
  for (const feature of ["compact", "rewind", "subagent", "memory", "skill"]) {
    assert.equal(defaults.features[feature], true, `features.${feature} 默认为 true`);
  }
});

test("插件常量与官方 marketplace 判定矩阵", async () => {
  const plugins = await load("plugins");
  assert.equal(plugins.KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE, "knorvia-plugins-bundled");
  assert.equal(plugins.KNORVIA_INLINE_PLUGIN_MARKETPLACE, "inline");
  assert.equal(plugins.KNORVIA_PLUGIN_HOST_COMMAND, "__knorvia-plugin-host");
  assert.equal(plugins.KNORVIA_DWF_CHILD_COMMAND, "__knorvia-dwf-child");
  assert.equal(plugins.isOfficialMarketplaceId("knorvia-plugins-bundled"), true);
  for (const rejected of [
    "inline",
    "",
    "KNORVIA-PLUGINS-BUNDLED",
    " knorvia-plugins-bundled",
    "knorvia-plugins-bundled ",
    "knorvia-plugins-bundle",
    "knorvia-plugins-bundled-2",
  ]) {
    assert.equal(
      plugins.isOfficialMarketplaceId(rejected),
      false,
      `${JSON.stringify(rejected)} 必须被拒绝`,
    );
  }
});
