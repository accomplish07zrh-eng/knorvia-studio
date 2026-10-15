// SPDX-License-Identifier: Apache-2.0
// core-runtime-helpers-01 契约测试：权限/子 Agent 中转、steering 与提醒、计划文件与回合变更（B14–B23）。
import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { coreDeps, coreModule, helpers, repoRoot } from "./entry.mjs";
import { createFileSystem, createLogger, createSessionStore } from "./fixtures.js";

const deps = await coreDeps();
const messageHistory = await coreModule("agent/message-history");
const permissionBrokerModule = await helpers("permission-broker");
const grantResume = await helpers("permission-grant-resume");
const interactionBroker = await helpers("subagent-interaction-broker");
const childPorts = await helpers("child-client-ports");
const selection = await helpers("subagent-selection");
const steering = await helpers("steering");
const reminders = await helpers("runtime-reminders");
const postCompactReminders = await helpers("compact-post-reminders");
const planFile = await helpers("plan-file-continuity");
const turnFileChanges = await helpers("turn-file-changes");

const trace = { spanId: "span", traceId: "trace" } as never;
const originContext = {
  agentId: "agent-1",
  agentType: "explore",
  childSessionId: "session-child" as never,
  description: "explore the repo",
  parentSessionId: "session-parent" as never,
};

test("B14 权限 broker 的能力判定是结构化类型谓词", () => {
  assert.equal(
    permissionBrokerModule.isResolvablePermissionBroker({ resolvePermission: () => true }),
    true,
  );
  assert.equal(permissionBrokerModule.isResolvablePermissionBroker({}), false);
  assert.equal(
    permissionBrokerModule.isInspectablePermissionBroker({ listPendingRequests: () => [] }),
    true,
  );
  assert.equal(
    permissionBrokerModule.isInspectablePermissionBroker({ listPendingRequests: 1 }),
    false,
  );
  assert.equal(
    permissionBrokerModule.isResolvablePermissionBroker({ resolvePermission: 1 }),
    false,
    "存在同名字段但不是函数同样判否",
  );
});

test("B15 会话恢复：授权标记按最后一条回填，损坏或会话不符只告警", async () => {
  const receipt = {
    event: {
      id: "event-1",
      payload: {
        mode: "yolo",
        planEnabled: false,
        permissionGrant: { interactionId: "interaction-1", queueItemIds: ["queue-1"] },
        previousMode: "build",
        previousPlanEnabled: false,
        source: "command",
      },
      sequenceNumber: 1,
      sessionId: "session-contract",
      timestamp: "2026-10-15T00:00:00.000Z",
      traceId: "trace-1",
      turnId: "turn-1",
      type: "session_mode_changed",
    },
    interactionId: "interaction-1",
  };

  const store = createSessionStore();
  store.entries = [{ data: receipt, id: "entry-1" }];
  const logger = createLogger();
  const runtime = {
    lastPermissionGrantId: "stale" as string | undefined,
    logger,
    sessionId: "session-contract" as never,
    sessionStore: store.port,
  };
  await grantResume.restorePermissionGrantMarker(runtime as never, trace);
  assert.equal(runtime.lastPermissionGrantId, "interaction-1");
  assert.deepEqual(
    store.calls.map((call) => call.method),
    ["sessionEntries"],
    "只读一次会话条目",
  );
  assert.equal(logger.records.length, 0, "成功回填不打日志");

  const mismatchLogger = createLogger();
  await grantResume.restorePermissionGrantMarker(
    {
      lastPermissionGrantId: "stale",
      logger: mismatchLogger,
      sessionId: "session-other" as never,
      sessionStore: store.port,
    } as never,
    trace,
  );
  assert.equal(mismatchLogger.records.length, 1);
  assert.equal(mismatchLogger.records[0].level, "warn");
  const mismatchContext = mismatchLogger.records[0].context[0] as Record<string, unknown>;
  assert.equal(mismatchContext.event, "session.resume.permission_grant_invalid");
  assert.equal(mismatchContext.reason, "session_mismatch");
  assert.equal(mismatchContext.entryId, "entry-1");

  const corruptLogger = createLogger();
  store.entries = [{ data: { interactionId: "x" }, id: "entry-bad" }];
  const corruptRuntime = {
    lastPermissionGrantId: "stale" as string | undefined,
    logger: corruptLogger,
    sessionId: "session-contract" as never,
    sessionStore: store.port,
  };
  await grantResume.restorePermissionGrantMarker(corruptRuntime as never, trace);
  assert.equal(corruptRuntime.lastPermissionGrantId, undefined, "损坏回执只清空不回填");
  const corruptContext = corruptLogger.records[0].context[0] as Record<string, unknown>;
  assert.equal(corruptContext.reason, "invalid_receipt");

  const emptyRuntime = {
    lastPermissionGrantId: "stale" as string | undefined,
    logger: createLogger(),
    sessionId: "session-contract" as never,
    sessionStore: { ...store.port, sessionEntries: async () => [] } as never,
  };
  await grantResume.restorePermissionGrantMarker(emptyRuntime as never, trace);
  assert.equal(emptyRuntime.lastPermissionGrantId, undefined, "没有条目时保持清空");
});

test("B16 子 Agent 交互中转：外层改写 sessionId、origin 只在缺失时写入", async () => {
  const seen: Record<string, unknown>[] = [];
  const parent = {
    preparePermission(request: Record<string, unknown>) {
      seen.push(request);
      return Promise.resolve({
        activate: () => undefined,
        dispose: () => undefined,
        result: Promise.resolve({ decision: "allow" }),
      });
    },
    requestPermission: () => Promise.resolve({ decision: "deny" }),
  };

  const inner = interactionBroker.createSubagentInteractionBroker(parent as never, originContext);
  const prepared = await inner.preparePermission({
    sessionId: "session-child" as never,
    toolCallId: "call-1",
    toolName: "Bash",
  } as never);
  assert.ok(prepared);
  assert.equal(seen[0].sessionId, "session-parent", "路由身份改写成父会话");
  const innerOrigin = seen[0].origin as { agentId: string; kind: string; parentSessionId: string };
  assert.equal(innerOrigin.kind, "subagent");
  assert.equal(innerOrigin.agentId, "agent-1");
  assert.equal(innerOrigin.parentSessionId, "session-parent");

  // 多层嵌套：入口层是**最深子代理**的包装（先执行、缺省 origin 由它生成），
  // 越靠近真实 broker 的包装越后执行 —— sessionId 被它改写成根会话，origin 保持最内层的归属。
  const middleLayer = interactionBroker.createSubagentInteractionBroker(parent as never, {
    agentId: "agent-2",
    agentType: "explore",
    childSessionId: "session-middle" as never,
    description: "middle layer",
    parentSessionId: "session-root" as never,
  });
  const deepestLayer = interactionBroker.createSubagentInteractionBroker(middleLayer as never, {
    ...originContext,
    parentSessionId: "session-middle" as never,
  });
  await deepestLayer.preparePermission({
    sessionId: "session-child" as never,
    toolCallId: "call-2",
    toolName: "Bash",
  } as never);
  assert.equal(seen[1].sessionId, "session-root", "越靠近真实 broker 的一层最后改写 → 落到根会话");
  assert.equal(
    (seen[1].origin as { agentId: string }).agentId,
    "agent-1",
    "origin 由入口层生成，内层不覆盖（归属恒为真正发起的子代理）",
  );
  assert.equal(
    (seen[1].origin as { parentSessionId: string }).parentSessionId,
    "session-middle",
    "origin 记录的是入口层自己的父会话，内层不改写",
  );
  assert.equal(
    (seen[1].origin as { childSessionId: string }).childSessionId,
    "session-child",
    "归属子会话指向真正发起请求的那一个",
  );

  const allowed = await deepestLayer.requestPermission({
    sessionId: "session-child" as never,
    toolCallId: "call-3",
    toolName: "Bash",
  } as never);
  assert.deepEqual(allowed, { decision: "allow" }, "requestPermission = prepare + activate");
  assert.equal(seen.length, 3);
});

test("B16 子端口派生：缺席端口不造空壳，provider header 改写为父会话", async () => {
  const none = childPorts.deriveChildClientPorts({}, originContext);
  assert.deepEqual(none, {}, "父侧端口缺席时子侧也整体缺席");

  const headerCalls: Record<string, unknown>[] = [];
  const parentHeaders = {
    refreshBeforeModelRequest(input: Record<string, unknown>) {
      headerCalls.push(input);
      return Promise.resolve();
    },
    shouldRefreshBeforeModelRequest: undefined,
  };
  const derived = childPorts.deriveChildClientPorts(
    { providerRuntimeHeadersPort: parentHeaders, permissionBroker: {} as never },
    originContext,
  );
  assert.equal(derived.permissionBroker !== undefined, true);
  assert.equal(
    derived.providerRuntimeHeadersPort.shouldRefreshBeforeModelRequest({} as never),
    true,
    "父侧未实现时默认刷新",
  );
  await derived.providerRuntimeHeadersPort.refreshBeforeModelRequest({
    sessionId: "session-child",
  } as never);
  assert.equal(headerCalls[0].sessionId, "session-parent", "刷新请求改用父会话路由");

  const parentShouldRefresh = () => false;
  const passthrough = childPorts.deriveChildClientPorts(
    {
      providerRuntimeHeadersPort: {
        refreshBeforeModelRequest: () => Promise.resolve(),
        shouldRefreshBeforeModelRequest: parentShouldRefresh,
      },
    },
    originContext,
  );
  assert.equal(
    passthrough.providerRuntimeHeadersPort.shouldRefreshBeforeModelRequest({} as never),
    false,
    "父侧实现原样透传",
  );
  assert.equal(passthrough.permissionBroker, undefined, "父侧没有 broker 时不派生");
});

test("B17 子 Agent 模型选择：显式意图、继承与解析失败的错误", () => {
  const concrete = { modelId: "model-a", providerId: "provider-a" } as never;
  const inherited = selection.resolveSubagentSelection({ parentSelection: concrete });
  assert.deepEqual(inherited, { hasConcreteModel: false, selection: concrete });
  assert.notEqual(inherited.selection, concrete, "选择对象是克隆，改动不回写父选择");

  const explicit = selection.resolveSubagentSelection({
    profileSelection: { modelId: "model-b", providerId: "provider-b" } as never,
    parentSelection: concrete,
  });
  assert.equal(explicit.hasConcreteModel, true);
  assert.equal(explicit.selection.modelId, "model-b");

  const override = selection.resolveSubagentSelection({
    overrideSelection: { modelId: "model-c", providerId: "provider-c" } as never,
    profileSelection: { modelId: "model-b", providerId: "provider-b" } as never,
  });
  assert.equal(override.selection.modelId, "model-c", "override 优先于 profile");

  assert.throws(
    () => selection.resolveSubagentSelection({ parentSelection: null }),
    (error: {
      context?: Record<string, unknown>;
      message?: string;
      recoverable?: boolean;
      type?: string;
    }) => {
      assert.equal(error.type, deps.CoreErrorType.ConfigurationError);
      assert.equal(error.recoverable, true);
      assert.equal(error.context.reason, "selection-missing");
      assert.ok(error.message.includes("No model selected"));
      assert.ok(error.message.includes("[reason=selection-missing]"));
      return true;
    },
    "解析失败不回落父模型",
  );

  assert.throws(
    () =>
      selection.resolveSubagentSelection({
        profileSelection: { modelId: "model-b", providerId: "provider-b" } as never,
        resolveSelection: () =>
          ({
            effectiveSelection: null,
            selectionIssue: "provider-not-found",
          }) as never,
      }),
    (error: { context?: Record<string, unknown>; message?: string }) => {
      assert.equal(error.context.selectionIssue, "provider-not-found");
      assert.ok(error.message.includes("Provider unavailable"));
      assert.ok(error.message.includes("selection=provider-b/model-b"));
      return true;
    },
  );
});

test("B18 steering 度量与预览：UTF-8 字节、空白归一与从尾偏移", () => {
  assert.equal(steering.MAX_TURN_STEER_INPUT_BYTES, 200_000);
  assert.equal(steering.measureUtf8Bytes("héllo"), 6, "按 UTF-8 字节计数");
  assert.equal(steering.measureUtf8Bytes(""), 0);

  assert.equal(steering.previewInput("  a \n\t b  "), "a b", "连续空白压成单空格");
  assert.equal(steering.previewInput("x".repeat(199)), "x".repeat(199));
  const long = steering.previewInput("y".repeat(250));
  assert.equal(long.length, 203, "200 字符 + 三个点");
  assert.ok(long.endsWith("..."));

  const messages = [
    { content: "1", role: "user" },
    { content: "2", role: "assistant" },
    { content: "3", role: "user" },
    { content: "4", role: "assistant" },
  ];
  assert.equal(steering.findLatestUserMessageFromEnd(messages), 1, "返回从尾部数的偏移");
  assert.equal(
    steering.findLatestUserMessageFromEnd([{ content: "x", role: "assistant" }]),
    undefined,
  );
  assert.equal(steering.findLatestUserMessageFromEnd([]), undefined);
});

test("B19 fork 克隆：新身份、引用重映射与严格模式", () => {
  const userMessage = {
    anchor: { orderedMessageIds: ["m1"], turnId: "t1" },
    id: "m1",
    metadata: {},
    role: "user",
    sessionID: "session-parent" as never,
  };
  const clonedUser = steering.cloneMessageForFork(userMessage as never, {
    forkedSessionId: "session-child" as never,
    messageIdMap: new Map([["m1", "m1c"]]),
    nextMessageId: "m1c" as never,
    strictLocalReferences: true,
    turnIdMap: new Map([["t1", "t1c"]]),
  });
  assert.equal(clonedUser.id, "m1c");
  assert.equal(clonedUser.sessionID, "session-child");
  assert.deepEqual(clonedUser.metadata.forkOrigin, {
    messageId: "m1",
    sessionId: "session-parent",
  });
  assert.equal(clonedUser.anchor.turnId, "t1c");
  assert.deepEqual(clonedUser.anchor.orderedMessageIds, ["m1c"]);
  assert.notEqual(clonedUser.metadata, userMessage.metadata, "元数据是克隆");

  const assistant = {
    id: "m2",
    parentID: "m1",
    role: "assistant",
    sessionID: "session-parent" as never,
  };
  const clonedAssistant = steering.cloneMessageForFork(assistant as never, {
    forkedSessionId: "session-child" as never,
    messageIdMap: new Map([["m1", "m1c"]]),
    nextMessageId: "m2c" as never,
    strictLocalReferences: true,
  });
  assert.equal(clonedAssistant.parentID, "m1c");
  assert.equal(clonedAssistant.id, "m2c");

  assert.throws(
    () =>
      steering.cloneMessageForFork(
        { id: "m3", parentID: "outside", role: "assistant", sessionID: "session-parent" } as never,
        {
          forkedSessionId: "session-child" as never,
          messageIdMap: new Map(),
          nextMessageId: "m3c" as never,
          strictLocalReferences: true,
        },
      ),
    /Fork assistant parent is outside child transcript: outside/,
  );

  const timelinePart = {
    anchorMessageId: "m1",
    anchorTurnId: "t9",
    id: "p1",
    messageID: "m1",
    sessionID: "session-parent" as never,
    timelineType: "context_compaction",
    type: "timeline",
  };
  const clonedTimeline = steering.clonePartForFork(timelinePart as never, {
    forkedSessionId: "session-child" as never,
    messageIdMap: new Map(),
    nextMessageId: "m1c" as never,
    turnIdMap: new Map(),
  });
  assert.equal(clonedTimeline.anchorMessageId, undefined, "映射不到的锚点必须清空");
  assert.equal(clonedTimeline.originAnchorMessageId, "m1", "降级到溯源字段");
  assert.equal(clonedTimeline.anchorTurnId, undefined);
  assert.equal(clonedTimeline.originAnchorTurnId, "t9");

  assert.throws(
    () =>
      steering.clonePartForFork(timelinePart as never, {
        forkedSessionId: "session-child" as never,
        messageIdMap: new Map(),
        nextMessageId: "m1c" as never,
        strictLocalReferences: true,
      }),
    /Fork timeline anchorMessageId is outside child transcript: m1/,
  );

  const toolPart = {
    callID: "call-1",
    id: "p2",
    messageID: "m1",
    sessionID: "session-parent" as never,
    state: {
      attachments: [{ id: "att-1", messageID: "m1", sessionID: "session-parent" }],
      status: "completed",
    },
    type: "tool",
  };
  const clonedTool = steering.clonePartForFork(toolPart as never, {
    forkedSessionId: "session-child" as never,
    messageIdMap: new Map([["m1", "m1c"]]),
    nextMessageId: "m1c" as never,
    partIdMap: new Map([["att-1", "att-1c"]]),
    toolCallIdMap: new Map([["call-1", "call-1c"]]),
  });
  assert.equal(clonedTool.callID, "call-1c");
  assert.equal(clonedTool.state.attachments[0].id, "att-1c");
  assert.equal(clonedTool.state.attachments[0].sessionID, "session-child");
  assert.equal(clonedTool.state.attachments[0].messageID, "m1c");

  const compactionPart = {
    compactBoundary: { lastSummarizedMessageId: "m1", summaryMessageIds: ["m2"] },
    id: "p3",
    messageID: "m1",
    sessionID: "session-parent" as never,
    type: "compaction",
  };
  const clonedCompaction = steering.clonePartForFork(compactionPart as never, {
    forkedSessionId: "session-child" as never,
    messageIdMap: new Map([
      ["m1", "m1c"],
      ["m2", "m2c"],
    ]),
    nextMessageId: "m1c" as never,
  });
  assert.equal(clonedCompaction.compactBoundary.lastSummarizedMessageId, "m1c");
  assert.deepEqual(clonedCompaction.compactBoundary.summaryMessageIds, ["m2c"]);
});

test("B20 运行时提醒正文族：日期、todo 阈值、模式轮换与输出风格", async () => {
  assert.equal(
    reminders.buildDateChangeReminderBody("2026-10-14", "2026-10-15"),
    "The date has changed. Today's date is now 2026-10-15. DO NOT mention this to the user explicitly because they are already aware.",
  );

  assert.equal(
    reminders.runtimeMetadataForSyntheticUserMessageSource("background_task").source,
    "legacy_synthetic",
  );
  assert.equal(
    reminders.runtimeMetadataForSyntheticUserMessageSource("subagent_message").source,
    "legacy_synthetic",
  );
  assert.equal(
    reminders.runtimeMetadataForSyntheticUserMessageSource("todo_reminder").source,
    "todo_reminder",
  );
  assert.equal(
    reminders.runtimeMetadataForSyntheticUserMessageSource("subagent").source,
    "queued_system_notification",
  );
  assert.equal(
    reminders.runtimeMetadataForSyntheticUserMessageSource("goal-continuation").source,
    "target_continuation",
  );
  assert.equal(
    reminders.runtimeMetadataForSyntheticUserMessageSource("rewind_notice").source,
    "rewind_notice",
    "未知来源兜底成 rewind_notice",
  );

  const assistantWithWrite = {
    message: {
      content: "ok",
      role: "assistant",
      toolCalls: [{ id: "c1", input: {}, name: "TodoWrite" }],
    },
  };
  const assistantPlain = { message: { content: "ok", role: "assistant" } };
  assert.equal(reminders.shouldBuildTodoReminder([]), false, "空历史不提醒");
  assert.equal(
    reminders.shouldBuildTodoReminder([
      assistantWithWrite,
      ...Array.from({ length: 9 }, () => assistantPlain),
    ]),
    false,
    "距上次写入 9 轮不够",
  );
  assert.equal(
    reminders.shouldBuildTodoReminder([
      assistantWithWrite,
      ...Array.from({ length: 10 }, () => assistantPlain),
    ]),
    true,
    "距上次写入 10 轮且从未提醒过",
  );
  assert.equal(
    reminders.shouldBuildTodoReminder([
      assistantWithWrite,
      ...Array.from({ length: 10 }, () => assistantPlain),
      { kind: "attachment", content: "reminder", metadata: { source: "todo_reminder" } },
    ]),
    false,
    "距上次提醒不足 10 轮时不重复提醒（写入已够 10 轮）",
  );

  const todoLead = reminders.buildTodoReminderBody([]);
  assert.equal(todoLead.length, 384, "提醒引子长度固定（逐字契约的机器校验）");
  assert.equal(
    todoLead,
    "The TodoWrite tool hasn't been used recently. If you're working on tasks that would benefit from tracking progress, consider using the TodoWrite tool to track progress. Also consider cleaning up the todo list if has become stale and no longer matches what you are working on. Only use it if it's relevant to the current work. This is just a gentle reminder - ignore if not applicable.",
    "无 todo 时只发提醒引子（正文逐字是契约）",
  );
  const withTodos = reminders.buildTodoReminderBody([
    { content: "write the contract", status: "pending" },
    { content: "run the gate", status: "in_progress" },
  ]);
  assert.ok(withTodos.includes("Here are the existing contents of your todo list:"));
  assert.ok(withTodos.includes("1. [pending] write the contract"));
  assert.ok(withTodos.includes("2. [in_progress] run the gate"));

  const planEntries = [
    ...Array.from({ length: 5 }, () => ({
      message: { content: "hi", role: "user" as const },
      metadata: { source: "real_user" as const },
    })),
    {
      kind: "attachment" as const,
      content: "plan reminder",
      metadata: { source: "runtime_mode" as const },
    },
  ];
  assert.equal(
    reminders.buildRuntimeModeReminderBody(planEntries, "build"),
    null,
    "非计划模式不产出提醒",
  );
  assert.equal(
    reminders.buildRuntimeModeReminderBody(planEntries, "plan"),
    null,
    "距上次模式提醒不足 5 个人类轮次",
  );
  const firstPlan = reminders.buildRuntimeModeReminderBody([], "plan");
  assert.ok(firstPlan.startsWith("Plan mode is active."), "第 1 次用完整版");
  const fifthRotation = reminders.buildRuntimeModeReminderBody(
    [
      { kind: "attachment" as const, content: "r1", metadata: { source: "runtime_mode" as const } },
      ...Array.from({ length: 6 }, () => ({
        message: { content: "hi", role: "user" as const },
        metadata: { source: "real_user" as const },
      })),
    ],
    "plan",
  );
  assert.ok(fifthRotation.startsWith("Plan mode still active"), "第 2 次轮换成精简版");

  assert.equal(reminders.buildPlanModeExitReminderBody().split("\n")[0], "## Exited Plan Mode");
  assert.equal(
    reminders.buildRuntimeOutputStyleReminderBody(undefined),
    null,
    "没有输出风格返回 null",
  );
});

test("B20 输出风格提醒：空 prompt 返回 null，非空产出固定句式", () => {
  assert.equal(
    reminders.buildRuntimeOutputStyleReminderBody({ name: "Concise", prompt: "   " }),
    null,
    "prompt 全空白视同没有风格",
  );
  assert.equal(
    reminders.buildRuntimeOutputStyleReminderBody({ name: "Concise", prompt: "keep it short" }),
    "Concise output style is active. Remember to follow the specific guidelines for this style.",
  );
});

test("B21 压缩后的读取状态提醒：排序、去重、预算与跨平台路径归一", async () => {
  const messageHistoryModule = await coreModule("agent/message-history");
  assert.deepEqual(
    postCompactReminders.buildPostCompactReadStateReminderEntries({ readFileState: undefined }),
    [],
    "没有读取状态返回空数组",
  );

  const state = new Map([
    [
      "a",
      {
        content: "line-a1\nline-a2",
        offset: undefined,
        path: "C:\\work\\src\\a.ts",
        readAt: new Date("2026-10-15T01:00:00Z"),
        sourceTool: "Read",
      },
    ],
    [
      "b",
      {
        content: "b-content",
        offset: 0,
        path: "C:/work/src/b.ts",
        readAt: new Date("2026-10-15T02:00:00Z"),
        sourceTool: "Read",
      },
    ],
    [
      "git",
      {
        content: "git-content",
        path: "C:/work/.git/COMMIT_EDITMSG",
        readAt: new Date("2026-10-15T03:00:00Z"),
        sourceTool: "Read",
      },
    ],
    [
      "edited",
      {
        content: "edited-content",
        path: "C:/work/src/c.ts",
        readAt: new Date("2026-10-15T04:00:00Z"),
        sourceTool: "Edit",
      },
    ],
  ]);
  const preservedEntries = [
    {
      message: {
        content: "ok",
        role: "assistant",
        toolCalls: [{ id: "c1", input: { file_path: "C:\\work\\src\\b.ts" }, name: "Read" }],
      },
    },
  ];
  const entries = postCompactReminders.buildPostCompactReadStateReminderEntries({
    preservedEntries: preservedEntries as never,
    readFileState: state as never,
  });
  assert.equal(entries.length, 1, ".git、非 Read 来源与压缩保留段里已读的文件都被排除");
  assert.equal(entries[0].kind, "attachment");
  assert.equal(entries[0].metadata.source, "resume_referenced_session_context");
  assert.ok(
    entries[0].content.includes(
      'Called the Read tool with the following input: {"file_path":"C:\\\\work\\\\src\\\\a.ts"}',
    ),
    "回放正文带 Read 输入（反斜杠路径原样）",
  );
  assert.ok(entries[0].content.includes("Result of calling the Read tool:"));
  assert.ok(entries[0].content.includes("1\tline-a1"), "回放正文带行号");

  const referenceOnly = postCompactReminders.buildPostCompactReadStateReminderEntries({
    readFileState: new Map([
      [
        "big",
        {
          content: "z".repeat(120_000),
          path: "/tmp/big.log",
          readAt: new Date("2026-10-15T05:00:00Z"),
          sourceTool: "Read",
        },
      ],
    ]) as never,
  });
  assert.equal(referenceOnly.length, 1);
  assert.ok(
    referenceOnly[0].content.includes("was read before the last conversation was summarized"),
    "超预算的文件降级成引用提示",
  );
  assert.ok(referenceOnly[0].content.includes("Use Read tool if you need to access it."));
  assert.ok(messageHistoryModule.isRuntimeAttachmentEntry(referenceOnly[0]));
});

test("B22 计划文件：写 → 读 → 再写 → 再读的往返与错误语义", async () => {
  const fileSystem = createFileSystem();
  const workspaceRoot = join(repoRoot, "tmp-workspace");
  const sessionId = "session/with:odd chars" as never;
  const expectedPath = join(
    workspaceRoot,
    ".knorvia-studio",
    "plans",
    "plan-session-with-odd-chars.md",
  );

  const first = await planFile.writeApprovedPlanFile({
    fileSystemPort: fileSystem.port as never,
    plan: "# Plan A\n\nstep one",
    sessionId,
    traceContext: trace,
    workspaceRoot,
  });
  assert.equal(first.path, expectedPath, "路径由 workspaceRoot + 清洗后的会话 id 组成");

  const firstRead = await planFile.readApprovedPlanFileReferenceEntry({
    fileSystemPort: fileSystem.port as never,
    sessionId,
    traceContext: trace,
    workspaceRoot,
  });
  assert.equal(firstRead.kind, "attachment");
  assert.equal(firstRead.metadata.source, "plan_file_reference");
  assert.ok(firstRead.content.includes(`A plan file exists from plan mode at: ${expectedPath}`));
  assert.ok(firstRead.content.includes("# Plan A"));

  const second = await planFile.writeApprovedPlanFile({
    fileSystemPort: fileSystem.port as never,
    plan: "# Plan B\n\nstep two",
    sessionId,
    workspaceRoot,
  });
  assert.equal(second.path, expectedPath, "重复写入覆盖同一路径");
  const secondRead = await planFile.readApprovedPlanFileReferenceEntry({
    fileSystemPort: fileSystem.port as never,
    sessionId,
    workspaceRoot,
  });
  assert.ok(secondRead.content.includes("# Plan B"), "新写的内容能被读回");
  assert.ok(!secondRead.content.includes("# Plan A"), "旧内容已被覆盖");
  assert.deepEqual(
    fileSystem.writes.map((write) => write.path),
    [expectedPath, expectedPath],
    "两次写入同一路径（原子写 + 建父目录）",
  );
  assert.deepEqual(
    fileSystem.ops.filter((op) => op.startsWith("writeTextFile")),
    [`writeTextFile:${expectedPath}`, `writeTextFile:${expectedPath}`],
    "两次写入都落在同一路径（原子写 + 建父目录）",
  );

  await assert.rejects(
    () =>
      planFile.writeApprovedPlanFile({
        fileSystemPort: fileSystem.port as never,
        plan: "   ",
        sessionId,
        workspaceRoot,
      }),
    (error: { recoverable?: boolean; type?: string }) => {
      assert.equal(error.type, deps.CoreErrorType.InvalidInput);
      assert.equal(error.recoverable, true);
      return true;
    },
    "空计划不可写",
  );

  await assert.rejects(
    () =>
      planFile.writeApprovedPlanFile({
        fileSystemPort: fileSystem.port as never,
        plan: "x",
        sessionId: "///" as never,
        workspaceRoot,
      }),
    (error: { recoverable?: boolean; type?: string }) => {
      assert.equal(error.type, deps.CoreErrorType.InvalidInput);
      assert.equal(error.recoverable, false, "清洗后为空的会话 id 不可恢复");
      return true;
    },
  );

  assert.equal(
    await planFile.readApprovedPlanFileReferenceEntry({
      fileSystemPort: fileSystem.port as never,
      sessionId: "missing-session" as never,
      workspaceRoot,
    }),
    undefined,
    "文件不存在返回 undefined",
  );

  fileSystem.files.set(join(workspaceRoot, ".knorvia-studio", "plans", "plan-blank.md"), "   \n");
  assert.equal(
    await planFile.readApprovedPlanFileReferenceEntry({
      fileSystemPort: fileSystem.port as never,
      sessionId: "blank" as never,
      workspaceRoot,
    }),
    undefined,
    "空文件视同没有计划",
  );

  const faulted = createFileSystem();
  faulted.failNext(
    "readTextFile",
    join(workspaceRoot, ".knorvia-studio", "plans", "plan-err.md"),
    Object.assign(new Error("disk broken"), { code: "read_failed" }),
  );
  await assert.rejects(
    () =>
      planFile.readApprovedPlanFileReferenceEntry({
        fileSystemPort: faulted.port as never,
        sessionId: "err" as never,
        workspaceRoot,
      }),
    /disk broken/,
    "非 not_found 的文件系统错误必须冒泡",
  );
});

test("B23 回合文件变更：累加写入计数、合并工具集与排序汇总", () => {
  const changes = new Map();
  assert.equal(
    turnFileChanges.buildTurnFileChangeSummary(changes),
    undefined,
    "空映射返回 undefined",
  );

  turnFileChanges.recordTurnFileChange(changes, {
    afterContent: "a\nB\nc",
    beforeContent: "a\nb\nc",
    path: "/w/z.txt",
    structuredPatch: [{ lines: ["-b", "+B"], newLines: 1, newStart: 2, oldLines: 1, oldStart: 2 }],
    toolName: "Edit",
  });
  turnFileChanges.recordTurnFileChange(changes, {
    afterContent: "a\nB\nc\nd",
    beforeContent: "a\nB\nc",
    path: "/w/z.txt",
    structuredPatch: [{ lines: ["+d"], newLines: 1, newStart: 4, oldLines: 0, oldStart: 4 }],
    toolName: "Write",
  });
  turnFileChanges.recordTurnFileChange(changes, {
    beforeContent: null,
    path: "/w/a.txt",
    structuredPatch: [{ lines: ["+x", "+y"], newLines: 2, newStart: 1, oldLines: 0, oldStart: 0 }],
    toolName: "Edit",
  });

  const summary = turnFileChanges.buildTurnFileChangeSummary(changes);
  assert.equal(summary.files, 2);
  assert.deepEqual(
    summary.items.map((item) => item.path),
    ["/w/a.txt", "/w/z.txt"],
    "按路径字典序排序",
  );
  const edited = summary.items[1];
  assert.equal(edited.writeCount, 2, "同一路径多次写入累加计数");
  assert.deepEqual(edited.toolNames, ["Edit", "Write"], "工具集合并且有序");
  // 汇总时按「改前 → 最后一次改后」重新算 diff：a→B 是替换、末尾再追加一行。
  assert.equal(edited.additions, 3, "有改后内容时用 diff 重算增删行");
  assert.equal(edited.deletions, 2);
  const created = summary.items[0];
  assert.equal(created.additions, 2, "没有改后内容时用累计的兜底计数");
  assert.equal(created.deletions, 0);
  assert.equal(summary.additions, 5);
  assert.equal(summary.deletions, 2);
});
