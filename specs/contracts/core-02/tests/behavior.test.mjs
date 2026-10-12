// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// core-02 契约测试：运行时可观察行为（B2–B8）。只经模块入口与区域桶加载。
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadArea, loadModule } from "./entry.mjs";

const samples = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/samples.json", import.meta.url)), "utf8"),
);

const memoryProjectRoot = await loadModule("memory/project-root");
const memoryIndexContent = await loadModule("memory/index-content");
const memoryExtraction = await loadModule("memory/extraction");
const recallTypes = await loadModule("memory/recall/types");
const modelOptions = await loadModule("model/auxiliary-model-options");
const draftPath = await loadModule("permission/workflow-draft-path");
const permission = await loadArea("permission");
const references = await loadModule("plugin-reference/references");
const catalog = await loadModule("plugin-reference/catalog");
const reminder = await loadModule("plugin-reference/reminder");
const notificationPolicy = await loadModule("runtime-task/notification-policy");
const registryModule = await loadModule("runtime-task/registry");
const notification = await loadModule("runtime-task/notification");
const sessionParts = await loadModule("session-context/parts");
const sessionReferences = await loadModule("session-context/references");
const sessionUtils = await loadModule("session-context/utils");
const subagentToolPolicy = await loadModule("subagent/tool-policy");
const subagentOrigin = await loadModule("subagent/interaction-origin");
const subagentGeneralPurpose = await loadModule("subagent/general-purpose");
const subagentModelSelection = await loadModule("subagent/profile-model-selection");
const subagentSteering = await loadModule("subagent/message-steering");
const subagentCompletion = await loadModule("subagent/completion-notification");

test("B2 memory：项目记忆根可确定、随工作区身份区分", () => {
  const { resolveProjectMemoryRoot } = memoryProjectRoot;
  const base = {
    cliStorageRoot: path.join("C:", "store"),
    workspacePath: path.join("C:", "Work", "My Project"),
  };
  const first = resolveProjectMemoryRoot(base);
  const second = resolveProjectMemoryRoot(base);
  assert.equal(first, second, "同一输入必须给出同一个根");
  assert.match(first, /memories[\\/]projects[\\/]my-project-[0-9a-f]{16}[\\/]memory$/u);
  assert.ok(first.startsWith(base.cliStorageRoot));

  const other = resolveProjectMemoryRoot({
    ...base,
    workspacePath: path.join("C:", "Work", "Another"),
  });
  assert.notEqual(other, first, "不同工作区必须落在不同的根");

  const byIdentity = resolveProjectMemoryRoot({ ...base, workspaceIdentity: "ws-abc" });
  assert.match(
    byIdentity,
    /memories[\\/]projects[\\/]project-[0-9a-f]{16}[\\/]memory$/u,
    "给了身份时 slug 固定为 project",
  );
  assert.notEqual(byIdentity, first, "身份与路径是不同的键");
});

test("B3 memory：索引内容的裁剪与提示", () => {
  const { formatMemoryIndexContent, formatProjectMemoryIndexContent } = memoryIndexContent;
  assert.equal(formatMemoryIndexContent(""), "");
  assert.equal(formatMemoryIndexContent("  hello  "), "hello", "短内容原样返回（仅去首尾空白）");

  const manyLines = Array.from({ length: 250 }, (_, index) => `entry ${index}`).join("\n");
  const clipped = formatMemoryIndexContent(manyLines);
  assert.ok(clipped.includes("WARNING: MEMORY.md is"), "超限要给出提示");
  assert.ok(clipped.split("\n").length < 250, "超限内容必须被裁短");
  assert.ok(clipped.startsWith("entry 0"), "裁的是尾巴");

  const withFrontMatter = `---\ntitle: x\n---\n\nbody line\n`;
  assert.equal(
    formatProjectMemoryIndexContent(withFrontMatter),
    "body line",
    "YAML front matter 不进索引",
  );

  const withComment = `<!-- hidden -->\nvisible\n`;
  assert.equal(formatProjectMemoryIndexContent(withComment), "visible", "HTML 注释不进索引");
});

test("B4 memory：提取提示与召回类型常量", () => {
  const prompt = memoryExtraction.buildMemoryExtractionPrompt({
    manifest: [{ filePath: "/mem/user.md", filename: "user.md", mtimeMs: 1, type: "user" }],
    messageCount: 3,
  });
  assert.equal(typeof prompt, "string");
  assert.ok(prompt.length > 0);
  assert.ok(prompt.includes("user.md"), "提示里要列出清单条目");

  assert.deepEqual([...recallTypes.MEMORY_RECALL_TYPES], samples.expected.memoryRecallTypes);
});

test("B5 model：辅助调用的档位与输出预算", () => {
  const { auxiliaryModelOptions } = modelOptions;
  const model = {
    optionSpecs: {
      reasoningLevel: { values: samples.auxiliaryModel.reasoningLevels },
      maxOutputTokens: { max: samples.auxiliaryModel.maxOutputTokens },
    },
  };
  assert.deepEqual(auxiliaryModelOptions(model), {
    reasoningLevel: samples.auxiliaryModel.reasoningLevels[0],
    maxOutputTokens: samples.expected.auxiliaryMaxOutputTokens,
  });
  const small = {
    optionSpecs: {
      reasoningLevel: { values: ["low"] },
      maxOutputTokens: { max: 1_200 },
    },
  };
  assert.equal(auxiliaryModelOptions(small).maxOutputTokens, 1_200, "模型上限更低时取模型上限");
});

test("B6 permission：草稿目录免确认判定的边界（含 Windows 语义）", () => {
  const { isPreapprovedWorkflowDraftWrite } = draftPath;
  const drafts = path.join(".knorvia-studio", "workflow-drafts");
  const workingDirectory = path.join("C:", "proj");

  assert.equal(
    isPreapprovedWorkflowDraftWrite({
      toolName: "Write",
      input: { file_path: path.join(drafts, "draft.ts") },
      workingDirectory,
    }),
    true,
  );
  assert.equal(
    isPreapprovedWorkflowDraftWrite({
      toolName: "Edit",
      input: { file_path: path.join(drafts, "draft.ts") },
      workingDirectory,
    }),
    true,
  );
  // 目录本身、目录外、前缀相近的兄弟目录、向上穿越都不算。
  for (const filePath of [
    drafts,
    path.join("src", "index.ts"),
    path.join(".knorvia-studio", "workflow-drafts-other", "draft.ts"),
    path.join(drafts, "..", "..", "escape.ts"),
  ]) {
    assert.equal(
      isPreapprovedWorkflowDraftWrite({
        toolName: "Write",
        input: { file_path: filePath },
        workingDirectory,
      }),
      false,
      `${filePath} 不应免确认`,
    );
  }
  // 工具名、输入形状、工作目录缺席都必须落回「不免确认」。
  assert.equal(
    isPreapprovedWorkflowDraftWrite({
      toolName: "ApplyPatch",
      input: { file_path: path.join(drafts, "d.ts") },
      workingDirectory,
    }),
    false,
  );
  assert.equal(
    isPreapprovedWorkflowDraftWrite({
      toolName: "Write",
      input: { patch_text: "x" },
      workingDirectory,
    }),
    false,
  );
  assert.equal(
    isPreapprovedWorkflowDraftWrite({
      toolName: "Write",
      input: { file_path: path.join(drafts, "d.ts") },
    }),
    false,
  );
  assert.equal(
    isPreapprovedWorkflowDraftWrite({ toolName: "Write", input: null, workingDirectory }),
    false,
  );
  assert.equal(
    isPreapprovedWorkflowDraftWrite({
      toolName: "Write",
      input: { file_path: path.join(drafts, "d.ts") },
      workingDirectory: "",
    }),
    false,
  );

  // 注入 win32 语义：跨盘符不能算命中（relative 会返回绝对路径）。
  assert.equal(
    isPreapprovedWorkflowDraftWrite({
      toolName: "Write",
      input: { file_path: "D:\\elsewhere\\draft.ts" },
      workingDirectory: "C:\\proj",
      pathModule: path.win32,
    }),
    false,
  );
  assert.equal(
    isPreapprovedWorkflowDraftWrite({
      toolName: "Write",
      input: { file_path: "C:\\proj\\.knorvia-studio\\workflow-drafts\\draft.ts" },
      workingDirectory: "C:\\proj",
      pathModule: path.win32,
    }),
    true,
  );
});

test("B6 permission：默认拒绝的 broker 与区域桶导出", () => {
  assert.equal(typeof permission.createDenyPermissionBroker, "function");
  const broker = permission.createDenyPermissionBroker();
  assert.equal(typeof broker, "object");
  assert.equal(typeof permission.createManualPermissionBroker, "function");
  assert.equal(typeof permission.PermissionService, "function");
  assert.equal(typeof permission.defaultPermissionConfig, "object");
});

test("B7 plugin-reference：稳定 id 校验与引用抽取", () => {
  const { isValidPluginStableId, extractPluginReferences, MAX_PLUGIN_REFERENCES_PER_TURN } =
    references;
  assert.equal(MAX_PLUGIN_REFERENCES_PER_TURN, samples.expected.maxPluginReferencesPerTurn);

  for (const valid of samples.pluginStableIds.valid) {
    assert.equal(isValidPluginStableId(valid), true, valid);
  }
  for (const invalid of [...samples.pluginStableIds.invalid, `${"a".repeat(257)}@1`]) {
    assert.equal(isValidPluginStableId(invalid), false, invalid);
  }

  const result = extractPluginReferences(samples.pluginReferenceMarkdown);
  assert.deepEqual(result.references, ["plugin-a@1.0.0", "plugin-b@2.0.0"]);
  assert.equal(result.invalidCount, 1);
  assert.equal(result.truncatedCount, 0);

  const many = Array.from({ length: 12 }, (_, index) => `[p](plugin://p${index}@1.0.0)`).join(" ");
  const limited = extractPluginReferences(many);
  assert.equal(limited.references.length, MAX_PLUGIN_REFERENCES_PER_TURN);
  assert.equal(limited.truncatedCount, 4);

  const emptyCatalog = catalog.buildPluginReferenceCatalog([]);
  assert.equal(catalog.findPluginReferenceCatalogEntry(emptyCatalog, "plugin-a"), undefined);
  assert.equal(catalog.findPluginReferenceCatalogEntry(undefined, "plugin-a"), undefined);
  assert.equal(typeof reminder.buildPluginReferenceReminderBody, "function");
  assert.ok(reminder.MAX_PLUGIN_REFERENCE_REMINDER_BYTES > 0);
});

test("B8 runtime-task：密封子代理通知抑制的判定表", () => {
  const { shouldSuppressSealedSubagentBashNotification: should } = notificationPolicy;
  assert.equal(
    should({ isSubagentChildRuntime: false, notificationSealed: true, toolName: "Bash" }),
    false,
  );
  assert.equal(
    should({ isSubagentChildRuntime: true, notificationSealed: false, toolName: "Bash" }),
    false,
  );
  assert.equal(
    should({ isSubagentChildRuntime: true, notificationSealed: true, toolName: "Bash" }),
    true,
  );
  assert.equal(
    should({ isSubagentChildRuntime: true, notificationSealed: true, toolName: "Read" }),
    false,
  );
  assert.equal(
    should({
      isSubagentChildRuntime: true,
      notificationSealed: true,
      registryTask: { type: "local_bash" },
    }),
    true,
  );
  assert.equal(
    should({
      isSubagentChildRuntime: true,
      notificationSealed: true,
      registryTask: { type: "local_agent" },
    }),
    false,
  );
});

test("B8 runtime-task：注册表生命周期与终态判定", () => {
  const { InMemoryRuntimeTaskRegistry, isTerminalRuntimeTask, hasRunningBackgroundRuntimeTask } =
    registryModule;
  const registry = new InMemoryRuntimeTaskRegistry();
  assert.deepEqual(registry.all(), {});

  registry.register({ taskId: "t1", status: "running", type: "local_bash", summary: "run" });
  assert.equal(registry.get("t1").status, "running");
  assert.equal(registry.get("missing"), undefined);
  assert.equal(Object.keys(registry.all()).length, 1);

  const updated = registry.update("t1", (task) => ({ ...task, status: "completed" }));
  assert.equal(updated.status, "completed");
  assert.equal(
    registry.update("missing", (task) => task),
    undefined,
  );

  assert.equal(isTerminalRuntimeTask({ status: "completed" }), true);
  assert.equal(isTerminalRuntimeTask({ status: "running" }), false);
  assert.equal(hasRunningBackgroundRuntimeTask(registry), false, "终态任务不算在跑");

  registry.register({
    taskId: "t2",
    status: "running",
    type: "local_bash",
    summary: "bg",
    isBackgrounded: true,
  });
  assert.equal(hasRunningBackgroundRuntimeTask(registry), true);

  const queued = registry.queueMessage("t2", { id: "m1", message: "hello", queuedAt: new Date(0) });
  assert.equal(queued.pendingMessages.length, 1);
  assert.deepEqual(
    registry.drainMessages("t2").map((message) => message.id),
    ["m1"],
  );
  assert.deepEqual(registry.drainMessages("t2"), [], "取过一次就空了");
  assert.equal(
    registry.queueMessage("missing", { id: "m2", message: "x", queuedAt: new Date(0) }),
    undefined,
  );

  assert.equal(registry.remove("t2"), undefined);
  assert.equal(registry.get("t2"), undefined, "移除后不再可见");
});

test("B8 runtime-task：通知文案的转义与截断", () => {
  const { escapeXml, truncateTaskNotification, formatTaskNotification } = notification;
  assert.equal(escapeXml(`<a & "b" 'c'>`), "&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;");

  const long = "x".repeat(samples.expected.notificationTruncateChars + 10_000);
  const clipped = truncateTaskNotification(long);
  assert.equal(
    clipped.slice(0, samples.expected.notificationTruncateChars).length,
    samples.expected.notificationTruncateChars,
    "保留的前缀正好是上限",
  );
  assert.ok(
    clipped.length <= samples.expected.notificationTruncateChars + 12,
    "截断后不超过上限（含标记）",
  );
  assert.ok(clipped.endsWith("[truncated]"));

  const body = formatTaskNotification({
    taskId: "task-1",
    taskType: "local_bash",
    status: "completed",
    summary: "done <ok>",
    description: "say <hi>",
  });
  assert.equal(typeof body, "string");
  assert.ok(body.includes("task-1"), "通知里带任务 id");
  assert.ok(body.includes("done &lt;ok&gt;"), "摘要按 XML 转义");
  assert.ok(!body.includes("done <ok>"), "不注入原始尖括号");
});

test("B8 session-context：会话引用、部件投影与工具函数", () => {
  const { extractSessionReferences, buildReferencedSessionContextReminderBody } = sessionReferences;
  assert.deepEqual(
    [...extractSessionReferences(samples.sessionReferenceText)],
    ["sess_abc.1", "sess_def"],
    "去重且保序",
  );
  assert.deepEqual([...extractSessionReferences("no references here")], []);
  assert.equal(buildReferencedSessionContextReminderBody("nothing"), null);
  const reminderBody = buildReferencedSessionContextReminderBody("look at #sess_abc");
  assert.ok(reminderBody.includes("sess_abc"));
  assert.ok(reminderBody.includes("call ReadSessionContext"));

  const { truncateText, safeJson } = sessionUtils;
  assert.equal(truncateText("short", 100), "short");
  assert.equal(truncateText("abcdefghijklmnopqrstuvwxyz", 5), "abcde", "极小上限直接硬切");
  const truncated = truncateText("y".repeat(100), 50);
  assert.ok(truncated.endsWith("...[truncated]"));
  assert.equal(safeJson({ a: 1 }), '{"a":1}');
  const circular = {};
  circular.self = circular;
  assert.equal(typeof safeJson(circular), "string", "循环引用不能抛");

  const { dedupeParts, formatPartForContext } = sessionParts;
  const first = { id: "p1", type: "text", text: "first" };
  const second = { id: "p1", type: "text", text: "second" };
  assert.deepEqual(
    dedupeParts([first, second]).map((part) => part.text),
    ["second"],
    "同 id 保留最后一个",
  );
  assert.equal(formatPartForContext({ id: "t1", type: "text", text: "hello" }), "hello");
  assert.equal(formatPartForContext({ id: "t2", type: "text", text: "x", ignored: true }), null);
  assert.equal(
    formatPartForContext({
      id: "t3",
      type: "text",
      text: "<system-reminder>hidden</system-reminder>",
    }),
    null,
    "system-reminder 不进上下文",
  );
  assert.equal(
    formatPartForContext({
      id: "t4",
      type: "text",
      text: "synthetic",
      synthetic: true,
      metadata: { source: "todo_reminder" },
    }),
    null,
    "被抑制的合成来源不进上下文",
  );
  assert.equal(
    formatPartForContext({ id: "a1", type: "agent", name: "reviewer" }),
    "[Selected agent: reviewer]",
  );
  assert.equal(
    formatPartForContext({ id: "p1", type: "patch", files: ["a.ts", "b.ts"] }),
    "Patch files: a.ts, b.ts",
  );
  assert.equal(formatPartForContext({ id: "r1", type: "reasoning" }), null);
});

test("B9 subagent：子代理工具面强制剔除 plan 工具", () => {
  const { buildSubagentChildDisallowRules, filterSubagentChildToolNames } = subagentToolPolicy;
  const forced = buildSubagentChildDisallowRules(undefined);
  assert.equal(forced.length, 2, "plan 两个工具名恒被剔除");
  assert.ok(
    forced.every((name) => /PlanMode$/u.test(name)),
    forced.join(","),
  );

  const withExtras = buildSubagentChildDisallowRules(["Bash"]);
  assert.equal(withExtras.length, 3);
  assert.ok(withExtras.includes("Bash"));

  const [enter, exit] = forced;
  assert.deepEqual(
    [...filterSubagentChildToolNames(["Read", enter, exit, "Grep"], undefined)],
    ["Read", "Grep"],
  );
  assert.deepEqual([...filterSubagentChildToolNames(["Read", "Bash"], ["Bash"])], ["Read"]);
});

test("B10 subagent：交互来源的形状与可选键", () => {
  const { buildSubagentInteractionOrigin } = subagentOrigin;
  const base = {
    agentId: "agent-1",
    agentType: "general-purpose",
    childSessionId: "sess_child",
    description: "do work",
    parentSessionId: "sess_parent",
  };
  const origin = buildSubagentInteractionOrigin(base);
  assert.equal(origin.kind, "subagent");
  assert.equal(origin.agentId, "agent-1");
  assert.equal(origin.childSessionId, "sess_child");
  assert.equal(origin.parentSessionId, "sess_parent");
  assert.equal("childTurnId" in origin, false, "缺席就整个键缺席");
  assert.equal("parentToolCallId" in origin, false);
  assert.equal("parentTurnId" in origin, false);

  const full = buildSubagentInteractionOrigin(
    { ...base, parentToolCallId: "call-1", parentTurnId: "turn-1" },
    "turn-child",
  );
  assert.equal(full.childTurnId, "turn-child");
  assert.equal(full.parentToolCallId, "call-1");
  assert.equal(full.parentTurnId, "turn-1");
});

test("B11 subagent：通用提示与档案模型选择", () => {
  assert.equal(subagentGeneralPurpose.GENERAL_PURPOSE_AGENT_TYPE, "general-purpose");
  const prompt = subagentGeneralPurpose.buildGeneralPurposeSystemPrompt();
  assert.ok(prompt.includes("Knorvia Studio CLI"));
  assert.ok(prompt.includes("Guidelines:"));
  assert.ok(prompt.length > 200);

  const selection = subagentModelSelection.resolveProfileModelSelection({});
  assert.equal(selection, undefined, "空 frontmatter 解析不出选择");
});

test("B12 subagent：消息 steer 与完成通知", async () => {
  const { createSubagentMessageSink } = subagentSteering;
  const accepted = { steerTurn: async () => ({ kind: "accepted" }) };
  const sink = createSubagentMessageSink(accepted, { traceContext: undefined });
  assert.equal(
    await sink.send({ id: "m1", message: "please continue", queuedAt: new Date(0) }),
    "steered",
  );

  // no_active_turn 会重试，随后接受。
  let attempts = 0;
  const flaky = {
    steerTurn: async () => {
      attempts += 1;
      return attempts < 3 ? { kind: "rejected", reason: "no_active_turn" } : { kind: "accepted" };
    },
  };
  const flakySink = createSubagentMessageSink(flaky, { traceContext: undefined });
  assert.equal(
    await flakySink.send({ id: "m2", message: "retry", queuedAt: new Date(0) }),
    "steered",
  );
  assert.equal(attempts, 3, "前两次被拒后重试");

  const rejected = {
    steerTurn: async () => ({ kind: "rejected", reason: "turn_sealed" }),
  };
  const rejectedSink = createSubagentMessageSink(rejected, { traceContext: undefined });
  await assert.rejects(
    () => rejectedSink.send({ id: "m3", message: "nope", queuedAt: new Date(0) }),
    /Subagent message rejected: turn_sealed/u,
  );

  const { formatLocalAgentTaskNotification } = subagentCompletion;
  const body = formatLocalAgentTaskNotification({
    agentId: "agent-7",
    agentType: "general-purpose",
    description: "review <code>",
    outputFile: "/tmp/out.txt",
    parentToolCallId: "call-7",
    status: "failed",
    error: "boom & <stop>",
    totalDurationMs: 1_200,
    totalTokens: 42,
    totalToolUseCount: 3,
  });
  assert.ok(body.includes("agent-7"));
  assert.ok(body.includes("general-purpose"));
  assert.ok(body.includes("boom &amp; &lt;stop&gt;"), "失败原因按 XML 转义");
  assert.ok(body.includes("&lt;code&gt;"), "描述按 XML 转义");
});
