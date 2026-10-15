// SPDX-License-Identifier: Apache-2.0
// core-runtime-helpers-01 契约测试：压缩触发/选择/超长重试与提供方请求消息投影（B24–B27、B34–B36）。
import assert from "node:assert/strict";
import test from "node:test";
import { coreDeps, helpers } from "./entry.mjs";
import { createLogger, createSessionStore } from "./fixtures.js";

const deps = await coreDeps();
const compactModule = await helpers("compact");
const compactSelection = await helpers("compact-selection");
const compactPreservation = await helpers("compact-preservation");
const providerRequests = await helpers("provider-request-messages");
const entryOrigins = await helpers("provider-entry-origins");
const midSystem = await helpers("provider-mid-conversation-system");

const trace = { spanId: "span", traceId: "trace" } as never;

const prefixEntry = () => ({
  kind: "attachment" as const,
  content: "<system-reminder>prefix</system-reminder>",
  metadata: { source: "context_prefix" as const },
});
const userEntry = (text: string) => ({
  message: { content: text, role: "user" as const },
  metadata: { source: "real_user" as const },
});
const assistantEntry = (text: string) => ({
  message: { content: text, role: "assistant" as const },
});
const toolResultEntry = (text: string) => ({
  message: { content: text, role: "user" as const, toolCallId: "call-1", toolName: "Read" },
});
const reminderEntry = (source: string, content = "reminder body") => ({
  kind: "attachment" as const,
  content,
  metadata: { source },
});

/** 前缀 1 条 + 3 轮（每轮 1 助手）= 4 组：[u1] [a1,u2] [a2,u3] [a3]。 */
const selectionEntries = () => [
  prefixEntry(),
  userEntry("u1"),
  assistantEntry("a1"),
  userEntry("u2"),
  assistantEntry("a2"),
  userEntry("u3"),
  assistantEntry("a3"),
];

test("B24 压缩触发 → 阶段与原因映射，失败原因归一", () => {
  assert.equal(
    compactModule.defaultCompactPhaseForTrigger(deps.CompactTrigger.Auto),
    deps.CompactPhase.PreRequest,
  );
  assert.equal(
    compactModule.defaultCompactPhaseForTrigger(deps.CompactTrigger.Reactive),
    deps.CompactPhase.Reactive,
  );
  for (const trigger of [
    deps.CompactTrigger.Manual,
    deps.CompactTrigger.Partial,
    deps.CompactTrigger.SessionMemory,
  ]) {
    assert.equal(
      compactModule.defaultCompactPhaseForTrigger(trigger),
      deps.CompactPhase.StandaloneTurn,
    );
  }

  assert.equal(
    compactModule.defaultCompactReasonForTrigger(deps.CompactTrigger.Auto),
    deps.CompactReason.ContextLimit,
  );
  assert.equal(
    compactModule.defaultCompactReasonForTrigger(deps.CompactTrigger.Reactive),
    deps.CompactReason.ProviderOverflow,
  );
  assert.equal(
    compactModule.defaultCompactReasonForTrigger(deps.CompactTrigger.Manual),
    deps.CompactReason.UserRequested,
  );
  assert.equal(
    compactModule.defaultCompactReasonForTrigger(deps.CompactTrigger.Partial),
    deps.CompactReason.UserRequested,
  );
  assert.equal(
    compactModule.defaultCompactReasonForTrigger(deps.CompactTrigger.SessionMemory),
    deps.CompactReason.ContextLimit,
  );

  const coreError = deps.createCoreError(deps.CoreErrorType.ModelContextExceeded, "boom");
  assert.equal(
    compactModule.compactFailureReasonFromError(coreError),
    deps.CoreErrorType.ModelContextExceeded,
    "核心错误取其类型",
  );
  assert.equal(compactModule.compactFailureReasonFromError(new Error("boom")), "boom");
  assert.equal(compactModule.compactFailureReasonFromError(new Error("")), "unknown");
  assert.equal(compactModule.compactFailureReasonFromError("plain string"), "unknown");
});

test("B25 压缩后条目重建：前缀 → 摘要 → 保留 → 提醒，且全部克隆", () => {
  const prefix = prefixEntry();
  const summary = assistantEntry("summary");
  const preserved = { ...assistantEntry("kept"), tokens: { input: 10, output: 5 } as never };
  const reminder = reminderEntry("plan_file_reference");

  const rebuilt = compactModule.buildPostCompactRuntimeEntries(
    [prefix, userEntry("u1"), summary] as never,
    summary as never,
    { postCompactReminderEntries: [reminder], preservedEntries: [preserved] } as never,
  );
  assert.equal(rebuilt.length, 4);
  assert.equal(rebuilt[0].metadata.source, "context_prefix", "先放元数据标记的前缀");
  assert.equal(rebuilt[1].message.content, "summary", "接着是摘要");
  assert.equal(rebuilt[2].message.content, "kept", "然后是保留条目");
  assert.equal(rebuilt[3].metadata.source, "plan_file_reference", "最后是压缩后提醒");
  assert.notEqual(rebuilt[1], summary, "摘要条目是克隆");
  assert.notEqual(rebuilt[2], preserved, "保留条目是克隆");
  assert.notEqual(rebuilt[2].tokens, preserved.tokens, "保留助手条目的 token 用量被标记失效");

  const noOptions = compactModule.buildPostCompactRuntimeEntries(
    [prefix, summary] as never,
    summary as never,
  );
  assert.equal(noOptions.length, 2, "缺省选项只放前缀 + 摘要");
});

test("B25 本地微压缩：无清理 payload 时保持原数组引用", () => {
  const entries = [userEntry("u1"), assistantEntry("a1")];
  const result = compactModule.maybeLocalMicrocompactRuntimeEntries({ entries: entries as never });
  assert.equal(result.entries, entries, "没做任何清理就不拷贝历史");
  assert.equal(result.payload, undefined);
  assert.notEqual(result.decision, undefined, "决策总是有值（由策略模块给出）");
});

test("B26 压缩选择：触发枚举决定保留组数，前缀单列", () => {
  const entries = selectionEntries();

  const manual = compactSelection.selectCompactEntries({
    entries: entries as never,
    trigger: deps.CompactTrigger.Manual,
  });
  assert.equal(manual.groupsPreserved, 0, "手动压缩不保留最近轮次");
  assert.equal(manual.preservedEntries.length, 0);
  assert.equal(manual.totalGroups, 4, "前缀单列后，3 个助手起 3 组 + 首组共 4 组");
  assert.equal(manual.entriesForSummary.length, entries.length, "全部条目进入摘要");

  const auto = compactSelection.selectCompactEntries({
    entries: entries as never,
    trigger: deps.CompactTrigger.Auto,
  });
  assert.equal(auto.groupsPreserved, 1, "自动压缩至少保留最近 1 组");
  assert.equal(auto.entriesForSummary.length + auto.preservedEntries.length, entries.length);
  assert.equal(auto.preservedEntries.at(-1).message.content, "a3", "保留的是最后一组（最新一轮）");
  assert.notEqual(auto.preservedEntries.at(-1), entries.at(-1), "保留条目是克隆");

  const requested = compactSelection.selectCompactEntries({
    entries: entries as never,
    minimumGroupsToPreserve: 99,
    trigger: deps.CompactTrigger.Auto,
  });
  assert.equal(requested.groupsPreserved, 3, "保留组数封顶为 总组数 - 1");

  const negative = compactSelection.selectCompactEntries({
    entries: entries as never,
    minimumGroupsToPreserve: -5,
    trigger: deps.CompactTrigger.Auto,
  });
  assert.equal(negative.groupsPreserved, 1, "非法的最少保留数按缺省处理");

  assert.equal(compactSelection.hasEnoughRuntimeEntriesToCompact(entries as never), true);
  assert.equal(
    compactSelection.hasEnoughRuntimeEntriesToCompact([userEntry("only")] as never),
    false,
    "不足两组不能压缩",
  );
  assert.equal(
    compactSelection.hasEnoughRuntimeEntriesToCompact([assistantEntry("a")] as never),
    false,
  );

  const summarized = compactSelection.getRuntimeEntriesToSummarize(entries as never);
  assert.equal(summarized.length, entries.length - 1, "上下文前缀不进摘要");
  assert.notEqual(summarized[0], entries[0], "返回的是克隆");

  const tokens = compactSelection.estimateRuntimeEntryTokens(entries as never);
  assert.equal(typeof tokens, "number");
  assert.ok(tokens > 0, "估算出正数 token");
});

test("B26 超长续压：按错误链解析差距并推进保留组数", () => {
  const entries = selectionEntries();

  const noGap = compactSelection.selectCompactEntriesAfterPromptTooLong({
    currentGroupsPreserved: 0,
    entries: entries as never,
    promptTooLongCause: { message: "provider exploded" },
    trigger: deps.CompactTrigger.Auto,
  });
  assert.ok(noGap, "解析不到差距时按缺省步长（1 组）推进");
  assert.equal(noGap.groupsPreserved, 1, "缺省只多保留 1 组");

  const withGap = compactSelection.selectCompactEntriesAfterPromptTooLong({
    currentGroupsPreserved: 0,
    entries: entries as never,
    promptTooLongCause: { message: "prompt too long: 120000 tokens > 100000" },
    trigger: deps.CompactTrigger.Auto,
  });
  assert.ok(withGap, "差距可解析时推进保留组数");
  assert.equal(withGap.groupsPreserved, 2, "差距远大于单组体量 → 覆盖到一半组数");

  const nestedGap = compactSelection.selectCompactEntriesAfterPromptTooLong({
    currentGroupsPreserved: 0,
    entries: entries as never,
    promptTooLongCause: {
      cause: { errorDetails: "context at 130,000 tokens > 100,000" },
      message: "wrapper",
    },
    trigger: deps.CompactTrigger.Auto,
  });
  assert.ok(nestedGap, "沿 cause/errorDetails 下钻也能解析（兼容千分位逗号）");

  assert.equal(
    compactSelection.selectCompactEntriesAfterPromptTooLong({
      currentGroupsPreserved: 3,
      entries: entries as never,
      promptTooLongCause: { message: "120000 tokens > 100000" },
      trigger: deps.CompactTrigger.Auto,
    }),
    null,
    "已经保留到上限时不再推进",
  );
  assert.equal(
    compactSelection.selectCompactEntriesAfterPromptTooLong({
      currentGroupsPreserved: 0,
      entries: entries as never,
      promptTooLongCause: { message: "120000 tokens > 100000" },
      trigger: deps.CompactTrigger.Manual,
    }),
    null,
    "手动压缩不走「保留最近」策略",
  );

  const initial = compactSelection.selectCompactEntriesForInitialPromptTooLong({
    entries: entries as never,
    promptTooLongCause: { message: "120000 tokens > 100000" },
    trigger: deps.CompactTrigger.Auto,
  });
  assert.ok(initial, "首次超长在组数 >3 时也能算出保留量");
  assert.ok(initial.groupsPreserved >= 1);

  assert.equal(
    compactSelection.selectCompactEntriesForInitialPromptTooLong({
      entries: [userEntry("u1"), assistantEntry("a1"), userEntry("u2")] as never,
      promptTooLongCause: { message: "120000 tokens > 100000" },
      trigger: deps.CompactTrigger.Auto,
    }),
    null,
    "组数不足 3 组时不做首次超长切分",
  );
  assert.equal(
    compactSelection.selectCompactEntriesForInitialPromptTooLong({
      entries: entries as never,
      promptTooLongCause: new Error("other failure"),
      trigger: deps.CompactTrigger.Auto,
    }),
    null,
    "解析不到差距时返回 null",
  );
});

test("B26 摘要重试截断：丢最旧轮次、补重试标记、到上限记 retry_limit", () => {
  const entries = selectionEntries();
  const summary = entries as never;

  const truncated = compactSelection.truncateCompactSummaryRequestEntriesAfterPromptTooLong({
    attempt: 0,
    cause: { message: "prompt too long: 120000 tokens > 100000" },
    entriesForSummary: summary,
    logger: undefined,
    traceContext: trace,
  });
  assert.ok(truncated, "可截断");
  assert.equal(truncated[0].metadata.source, "context_prefix", "前缀保留在最前");
  assert.equal(
    truncated[1].message.content,
    deps.COMPACT_PROMPT_TOO_LONG_RETRY_MARKER,
    "截断后以助手开头时补一条重试标记用户条目",
  );
  assert.equal(truncated[1].metadata, undefined, "重试标记是纯用户条目");
  assert.ok(truncated.length < entries.length, "确实丢掉了更旧的轮次");

  const noGap = compactSelection.truncateCompactSummaryRequestEntriesAfterPromptTooLong({
    attempt: 0,
    cause: new Error("unrelated"),
    entriesForSummary: summary,
    traceContext: trace,
  });
  assert.ok(noGap, "解析不到差距时按固定比例丢组");

  const logger = createLogger();
  const atLimit = compactSelection.truncateCompactSummaryRequestEntriesAfterPromptTooLong({
    attempt: 3,
    cause: { message: "120000 tokens > 100000" },
    entriesForSummary: summary,
    logger,
    traceContext: trace,
  });
  assert.equal(atLimit, null, "达到重试上限返回 null");
  assert.equal(logger.records.length, 1);
  assert.equal(logger.records[0].level, "warn");
  const limitContext = logger.records[0].context[0] as Record<string, unknown>;
  assert.equal(limitContext.event, "compact.prompt_too_long.retry_limit");
  assert.equal(limitContext.attempt, 3);
  assert.equal(limitContext.maxAttempts, 3);
});

test("B27 压缩保留：保留条数统计与 ≤0 的短路", async () => {
  assert.equal(
    compactPreservation.countCompactPreservedRuntimeMessages([
      userEntry("u1"),
      assistantEntry("a1"),
      { ...userEntry("continuation"), queryScope: "output_token_continuation" },
      reminderEntry("todo_reminder"),
      reminderEntry("incoming_message"),
    ] as never),
    3,
    "数非 queryScope 的助手/用户条目 + 可持久化的系统提醒附件；按请求注入的提醒不数",
  );
  assert.equal(compactPreservation.countCompactPreservedRuntimeMessages([]), 0);

  const store = createSessionStore();
  const shortCircuit = await compactPreservation.selectPersistedCompactTail({
    groupsPreserved: 0,
    sessionStore: store.port as never,
    sessionId: "session-contract" as never,
    summaryMessageId: "msg-summary" as never,
  });
  assert.deepEqual(shortCircuit, { keptMessageCount: 0 }, "保留 0 组时根本不读存储");
  assert.equal(store.calls.length, 0);

  store.messages = [
    { info: { id: "m1", role: "user" }, parts: [] },
    { info: { id: "m2", role: "assistant" }, parts: [] },
    { info: { id: "m3", role: "user" }, parts: [] },
    { info: { id: "m4", role: "assistant" }, parts: [] },
  ];
  store.session = undefined;
  const tail = await compactPreservation.selectPersistedCompactTail({
    groupsPreserved: 1,
    sessionStore: store.port as never,
    sessionId: "session-contract" as never,
    summaryMessageId: "msg-summary" as never,
  });
  assert.deepEqual(
    store.calls.map((call) => call.method),
    ["messages", "getSession"],
    "消息与会话记录并发读取",
  );
  assert.equal(tail.keptMessageCount, 1, "保留最后 1 组");
  assert.deepEqual(tail.preservedSegment, {
    anchorMessageId: "msg-summary",
    headMessageId: "m4",
    tailMessageId: "m4",
  });
});

test("B34 请求投影管线：角色序列、诊断计数与相邻用户不合并", () => {
  const entries = [
    { message: { content: "sys", role: "system" } },
    userEntry("hello"),
    assistantEntry("hi"),
    toolResultEntry("tool output"),
    userEntry("second question"),
  ];
  const projection = providerRequests.buildProviderRequestMessages({ entries: entries as never });
  assert.deepEqual(
    projection.messages.map((message) => message.role),
    ["system", "user", "assistant", "user", "user"],
    "相邻用户消息保持分离（协议策略关闭合并）",
  );
  assert.equal(projection.diagnostics.strippedRuntimeMetaCount, 2, "两条真实用户条目带元数据");
  assert.equal(projection.diagnostics.bubbledAttachmentEntryCount, 0);
  assert.equal(
    projection.diagnostics.latestRealUserMessageIndex,
    4,
    "最近的真实用户是最后一条提问",
  );
  assert.equal(projection.diagnostics.cacheControlIndex, undefined, "没要求就不错插缓存点");
  assert.equal(projection.sourceEntries.length, projection.messages.length);
  assert.equal(projection.sourceEntries[1], entries[1], "没有投影时代表条目就是原条目");

  const cached = providerRequests.buildProviderRequestMessages({
    applyCacheControl: true,
    entries: entries as never,
  });
  assert.equal(cached.diagnostics.cacheControlIndex, 4, "最后一个非 system 消息拿到缓存点");
  assert.equal(cached.messages[4].cacheControl.type, "ephemeral");
  assert.equal(cached.messages[1].cacheControl, undefined, "其余消息上的旧缓存点被剥掉");

  const skipWrite = providerRequests.buildProviderRequestMessages({
    applyCacheControl: true,
    entries: entries as never,
    skipCacheWrite: true,
  });
  assert.equal(skipWrite.diagnostics.cacheControlIndex, 3, "跳过一次写后落点前移一位");

  const empty = providerRequests.buildProviderRequestMessages({ entries: [] as never });
  assert.deepEqual(empty.messages, []);
  assert.deepEqual(empty.sourceEntries, []);
  assert.equal(empty.diagnostics.strippedRuntimeMetaCount, 0);

  assert.throws(
    () =>
      providerRequests.buildProviderRequestMessages({
        entries: [
          { kind: "attachment", content: "x", metadata: { source: "not_a_known_source" } },
        ] as never,
      }),
    /is not a system reminder source/u,
    "未知附件来源必须显式失败",
  );
});

test("B34 上浮重排：legacy 合成输入被推到所属段落，计数可观察", () => {
  const entries = [
    userEntry("question"),
    assistantEntry("answer"),
    {
      message: { content: "background notice", role: "user" },
      metadata: { source: "legacy_synthetic" },
    },
    reminderEntry("goal_state_change"),
  ];
  const projection = providerRequests.buildProviderRequestMessages({ entries: entries as never });
  assert.deepEqual(
    projection.messages.map((message) => message.role),
    ["user", "assistant", "user", "system"],
    "legacy 输入留在原位，目标状态提醒合并成 system 消息",
  );
  assert.equal(
    projection.diagnostics.bubbledAttachmentEntryCount,
    1,
    "被上浮的 legacy 合成输入计入诊断",
  );

  const noBoundary = providerRequests.buildProviderRequestMessages({
    entries: [
      userEntry("q"),
      { message: { content: "notice", role: "user" }, metadata: { source: "legacy_synthetic" } },
    ] as never,
  });
  assert.equal(noBoundary.diagnostics.bubbledAttachmentEntryCount, 1);
});

test("B35 输入呈现投影与来源登记", async () => {
  const origins = new entryOrigins.ProviderEntryOrigins();
  const realUser = userEntry("hello");
  assert.deepEqual(origins.get(realUser as never), [realUser as never], "缺省来源是自身");
  assert.equal(origins.hasRealUser(realUser as never), true);
  assert.equal(origins.representative(realUser as never), realUser);

  const synthetic = { message: { content: "x", role: "user" as const } };
  origins.set(synthetic as never, [realUser as never]);
  assert.equal(origins.hasRealUser(synthetic as never), true, "来源链会继承真实用户");
  assert.equal(origins.representative(synthetic as never), realUser, "代表条目优先取真实用户");

  const attachment = {
    kind: "attachment" as const,
    content: "c",
    metadata: { source: "todo_reminder" as const },
  };
  assert.equal(origins.representative(attachment as never), undefined, "纯附件没有代表条目");

  const withoutPresentation = { message: { content: "plain", role: "user" as const } };
  const unchanged = entryOrigins.projectIncomingMessageEntries(
    [withoutPresentation as never, assistantEntry("a") as never],
    origins,
  );
  assert.equal(unchanged[0], withoutPresentation, "没有呈现标记原样返回");
  assert.equal(unchanged[1].message.role, "assistant");

  assert.equal(entryOrigins.isPresentedInput(realUser as never), false);
  assert.equal(
    entryOrigins.isPresentedInput({
      message: { content: "x", role: "user" },
      metadata: { inputPresentation: "nonsense" },
    } as never),
    false,
    "非法呈现标记按缺失处理",
  );

  const steerInput = {
    message: { content: "steered text", role: "user" as const },
    metadata: { inputPresentation: "user_steer" as const },
  };
  const steerEntries = entryOrigins.projectIncomingMessageEntries([steerInput as never], origins);
  assert.equal(steerEntries[0].kind, "attachment", "中途呈现转成附件条目");
  assert.equal(steerEntries[0].metadata.source, "incoming_message");
  assert.ok(steerEntries[0].content.includes("steered text"), "正文保留并套用呈现格式");
  assert.equal(origins.hasRealUser(steerEntries[0] as never), false, "附件本身不是真实用户");
  assert.equal(
    origins.representative(steerEntries[0] as never),
    steerInput,
    "代表条目回到投影前的原条目",
  );

  const notificationEntries = entryOrigins.projectIncomingMessageEntries(
    [
      {
        message: { content: "task finished", role: "user" },
        metadata: { inputPresentation: "task_notification" },
      },
    ] as never,
    origins,
  );
  assert.equal(
    (notificationEntries[0] as { kind?: string }).kind,
    undefined,
    "非中途呈现保持消息形态（不带 kind 字段）",
  );
  assert.equal(notificationEntries[0].message.role, "user");
  assert.ok(
    notificationEntries[0].message.content.includes("task finished"),
    "通知正文被包进系统提醒后仍含原文",
  );
  assert.ok(
    String(notificationEntries[0].message.content).includes("<system-reminder>"),
    "task_notification 走系统提醒包装",
  );

  const withBlock = {
    message: {
      content: [
        { text: "text", type: "text" as const },
        { dataUrl: "data:image/png;base64,QUJD", mediaType: "image/png", type: "image" as const },
      ],
      role: "user" as const,
    },
    metadata: { inputPresentation: "user_steer" as const },
  };
  const blocked = entryOrigins.projectIncomingMessageEntries([withBlock as never], origins);
  assert.equal(blocked[0], withBlock, "含非文本块的输入不做呈现投影");
});

test("B36 中途系统提醒合并成 system 消息，legacy 提醒挪到工具结果段之后", () => {
  const origins = new entryOrigins.ProviderEntryOrigins();
  const entries = [
    userEntry("question"),
    toolResultEntry("tool output"),
    reminderEntry("runtime_mode", "mode changed"),
    assistantEntry("answer"),
  ];
  const projected = midSystem.projectMidConversationSystemEntries(entries as never, origins);
  assert.equal(projected.entries.length, 4);
  assert.equal(projected.entries[2].message.role, "system", "工具结果之后的中途提醒合并成 system");
  assert.equal(projected.entries[2].message.content, "mode changed");
  assert.equal(
    (projected.entries[2] as { midSystemProjection?: unknown }).midSystemProjection !== undefined,
    true,
    "投影条目保留降级正文",
  );
  assert.equal(projected.entries[3].message.role, "assistant");

  const identityOrigins = new entryOrigins.ProviderEntryOrigins();
  const standalone = midSystem.projectMidConversationSystemEntries(
    [assistantEntry("a"), reminderEntry("runtime_mode", "solo")] as never,
    identityOrigins,
  );
  assert.equal(standalone.entries[1].kind, "attachment", "前面没有工具结果/用户锚点时保持附件形态");

  assert.equal(midSystem.isToolResultUserMessage({ content: "x", role: "user" }), false);
  assert.equal(
    midSystem.isToolResultUserMessage({ content: "x", role: "user", toolCallId: "c1" }),
    true,
    "带调用 id 的用户消息是工具结果",
  );
  assert.equal(
    midSystem.isToolResultUserMessage({ content: "x", role: "user", toolName: "Read" }),
    true,
  );
  assert.equal(midSystem.isToolResultUserMessage({ content: "x", role: "tool" }), false);

  const moved = midSystem.moveLegacySystemRemindersAfterToolResultRun([
    userEntry("q") as never,
    toolResultEntry("first") as never,
    {
      message: { content: "legacy", role: "user" },
      metadata: { source: "legacy_synthetic" },
    } as never,
    toolResultEntry("second") as never,
  ]);
  assert.deepEqual(
    moved.map((entry) => entry.message.content),
    ["q", "first", "second", "legacy"],
    "紧跟工具结果的 legacy 提醒被挪到该段工具结果之后",
  );
  assert.equal(moved[3].metadata.source, "legacy_synthetic");

  const untouched = midSystem.moveLegacySystemRemindersAfterToolResultRun([
    userEntry("q") as never,
    {
      message: { content: "legacy", role: "user" },
      metadata: { source: "legacy_synthetic" },
    } as never,
  ]);
  assert.deepEqual(
    untouched.map((entry) => entry.message.content),
    ["q", "legacy"],
    "没有后续工具结果时保持原位",
  );
});
