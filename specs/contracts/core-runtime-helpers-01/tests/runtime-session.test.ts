// SPDX-License-Identifier: Apache-2.0
// core-runtime-helpers-01 契约测试：工具装配与命令解析、会话数据与项目记忆（B37–B47）。
import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { contractsBundle, coreDeps, coreModule, helpers, repoRoot } from "./entry.mjs";
import { createLogger, createSessionStore } from "./fixtures.js";

const deps = await coreDeps();
const contracts = await contractsBundle();
const allowlist = await helpers("tool-allowlist");
const runtimeTools = await helpers("runtime-tools");
const commands = await helpers("commands");
const toolResult = await helpers("tool-result");
const project = await helpers("project");
const dataGuards = await helpers("data");
const conversation = await helpers("conversation");
const rewind = await helpers("rewind");
const remoteRepair = await helpers("persisted-remote-session-path-repair");
const projectMemory = await helpers("project-memory");
const extraction = await helpers("project-memory-extraction");
const usageBreakdown = await helpers("context-usage-breakdown");

const trace = { spanId: "span", traceId: "trace" } as never;

test("B37 工具允许/禁用清单：别名归一、explore 交集与 workflow child 结构性禁用", () => {
  const plain = { toolDisallowlist: ["Custom"], taskType: "interactive" };
  assert.equal(
    allowlist.resolveRuntimeDisallowedTools(plain as never),
    plain.toolDisallowlist,
    "非 workflow child 原样返回 turn 级禁用清单",
  );

  const workflowChild = allowlist.resolveRuntimeDisallowedTools({
    taskType: "workflow_child",
    toolDisallowlist: ["Custom"],
  } as never);
  assert.deepEqual(workflowChild, [
    "Custom",
    contracts.CREATE_WORKFLOW_TOOL_NAME,
    contracts.AMEND_WORKFLOW_TOOL_NAME,
    contracts.SAVE_WORKFLOW_TOOL_NAME,
    contracts.RESUME_WORKFLOW_RUN_TOOL_NAME,
    contracts.RESOLVE_WORKFLOW_QUESTION_TOOL_NAME,
  ]);
  assert.equal(new Set(workflowChild).size, workflowChild.length, "重复叠加不会产生重复项");
  assert.deepEqual(
    allowlist.resolveRuntimeDisallowedTools({ taskType: "workflow_child" } as never),
    [
      contracts.CREATE_WORKFLOW_TOOL_NAME,
      contracts.AMEND_WORKFLOW_TOOL_NAME,
      contracts.SAVE_WORKFLOW_TOOL_NAME,
      contracts.RESUME_WORKFLOW_RUN_TOOL_NAME,
      contracts.RESOLVE_WORKFLOW_QUESTION_TOOL_NAME,
    ],
    "workflow child 但没有 turn 级禁用时仍返回结构性禁用",
  );

  assert.equal(
    allowlist.resolveRuntimeDynamicWorkflowToolsIncluded({} as never),
    true,
    "缺席即开启",
  );
  assert.equal(
    allowlist.resolveRuntimeDynamicWorkflowToolsIncluded({ dynamicWorkflowEnabled: true } as never),
    true,
  );
  assert.equal(
    allowlist.resolveRuntimeDynamicWorkflowToolsIncluded({
      dynamicWorkflowEnabled: false,
    } as never),
    false,
    "只有显式 false 才关闭",
  );

  assert.equal(
    allowlist.resolveBuiltInToolAllowlist({ taskType: "interactive" } as never),
    undefined,
    "没有 allowlist 时不限制工具面",
  );
  const normalized = allowlist.resolveBuiltInToolAllowlist({
    taskType: "interactive",
    toolAllowlist: ["Read", "Glob"],
  } as never);
  assert.deepEqual(normalized, ["Read", "Glob"]);
  assert.notEqual(normalized[0], undefined);

  const exploreOnly = allowlist.resolveBuiltInToolAllowlist({ toolset: "explore" } as never);
  assert.ok(exploreOnly.length > 0, "explore 工具集给出探查白名单");

  const exploreIntersection = allowlist.resolveBuiltInToolAllowlist({
    taskType: "interactive",
    toolAllowlist: ["Read", "Write"],
    toolset: "explore",
  } as never);
  assert.ok(exploreIntersection.includes("Read"));
  assert.equal(
    exploreIntersection.includes("Write"),
    false,
    "explore 下与白名单求交集，越界工具被裁掉",
  );

  const childAllow = allowlist.resolveBuiltInToolAllowlist({
    taskType: "subagent_child",
    toolAllowlist: ["Read"],
  } as never);
  assert.deepEqual(childAllow, ["Read", contracts.RESPOND_TO_COORDINATOR_TOOL_NAME]);
  const childAllowTwice = allowlist.resolveBuiltInToolAllowlist({
    taskType: "subagent_child",
    toolAllowlist: ["Read", contracts.RESPOND_TO_COORDINATOR_TOOL_NAME],
  } as never);
  assert.deepEqual(
    childAllowTwice,
    ["Read", contracts.RESPOND_TO_COORDINATOR_TOOL_NAME],
    "已含则不重复",
  );
});

/** 记录注册进注册表的工具名（B38 的黑盒观察点）。 */
function createRegistry() {
  const names: string[] = [];
  return {
    get: () => undefined,
    names,
    registry: {
      get: () => undefined,
      register(entry: { metadata: { name: string } }) {
        names.push(entry.metadata.name);
      },
    },
  };
}

function createRuntimeStub(overrides: Record<string, unknown> = {}) {
  const logger = createLogger();
  return {
    agentTelemetry: { actorKind: "main", captureCausation: () => ({}), port: {} },
    appendEvent: async () => undefined,
    backgroundTaskNotificationSealReason: undefined,
    backgroundTaskNotificationsSealed: false,
    config: { mode: "build", taskType: "interactive", toolConcurrency: { maxConcurrency: 2 } },
    enqueueBackgroundTaskNotification: () => undefined,
    getTools: () => [],
    logger,
    permissionBroker: {},
    permissionService: {},
    readFileState: new Map(),
    rootTraceContext: trace,
    runtimeTaskRegistry: new Map(),
    sessionId: "session-contract",
    setWorkingDirectory: () => undefined,
    shuttingDown: false,
    stopBackgroundTask: () => undefined,
    steerTurn: async () => ({ kind: "accepted" }),
    workingDirectory: repoRoot,
    workspaceRoot: repoRoot,
    ...overrides,
  };
}

test("B38 运行时工具装配：注册面随配置收敛，返回执行器与钩子执行器", () => {
  const baseline = createRegistry();
  const baselineRuntime = createRuntimeStub({ registry: baseline.registry });
  const baselineResult = runtimeTools.initializeRuntimeTooling(
    baselineRuntime,
    {} as never,
    "session-contract" as never,
  );
  assert.ok(baselineResult.executor, "返回工具执行器");
  assert.ok("execute" in baselineResult.executor, "执行器带 execute 入口");
  assert.equal(baselineResult.hookRunner, undefined, "没启用钩子也没有邮箱端口时不建钩子执行器");
  assert.ok(baseline.names.length > 0, "默认配置下注册了内置工具");
  assert.equal(baseline.names.includes("Read"), true);
  assert.equal(
    baseline.names.includes(contracts.CREATE_WORKFLOW_TOOL_NAME),
    true,
    "动态工作流默认开启",
  );

  const explore = createRegistry();
  runtimeTools.initializeRuntimeTooling(
    createRuntimeStub({ config: { toolset: "explore" }, registry: explore.registry }),
    {} as never,
    "session-contract" as never,
  );
  assert.ok(explore.names.length < baseline.names.length, "explore 工具集比默认面更小");
  for (const name of explore.names) {
    assert.ok(baseline.names.includes(name), `explore 注册的 ${name} 必须也在默认面里`);
  }

  const workflowChild = createRegistry();
  runtimeTools.initializeRuntimeTooling(
    createRuntimeStub({ config: { taskType: "workflow_child" }, registry: workflowChild.registry }),
    {} as never,
    "session-contract" as never,
  );
  assert.equal(
    workflowChild.names.includes(contracts.CREATE_WORKFLOW_TOOL_NAME),
    false,
    "workflow child 不注册结构性禁用的工具",
  );
  assert.equal(
    workflowChild.names.includes(contracts.SAVE_WORKFLOW_TOOL_NAME),
    false,
    "SaveWorkflow 同一道门一起被禁",
  );

  const dynamicOff = createRegistry();
  runtimeTools.initializeRuntimeTooling(
    createRuntimeStub({
      config: { dynamicWorkflowEnabled: false },
      registry: dynamicOff.registry,
    }),
    {} as never,
    "session-contract" as never,
  );
  assert.equal(
    dynamicOff.names.includes(contracts.CREATE_WORKFLOW_TOOL_NAME),
    false,
    "灰度关闭的会话不注册动态工作流工具",
  );

  const injected = { execute: () => undefined };
  const withExecutor = runtimeTools.initializeRuntimeTooling(
    createRuntimeStub({ registry: createRegistry().registry }),
    { toolExecutor: injected } as never,
    "session-contract" as never,
  );
  assert.equal(withExecutor.executor, injected, "依赖给了执行器就直接用");
});

test("B39 斜杠命令解析：compact / rewind / fork 全分支", () => {
  assert.equal(commands.parseCompactCommand("/compact"), undefined, "裸调用没有说明");
  assert.equal(commands.parseCompactCommand("  /compact  "), undefined, "两端空白被忽略");
  assert.equal(commands.parseCompactCommand("/compact keep it short"), "keep it short");
  assert.equal(commands.parseCompactCommand("/compact    "), undefined, "空说明按裸调用");
  assert.equal(commands.parseCompactCommand("/compactx"), null, "前缀不匹配不是该命令");
  assert.equal(commands.parseCompactCommand("hello"), null);

  assert.deepEqual(commands.parseRewindCommand("/rewind"), { action: "status" });
  assert.deepEqual(commands.parseRewindCommand("/rewind "), { action: "status" });
  assert.deepEqual(commands.parseRewindCommand("/rewind status"), { action: "status" });
  assert.deepEqual(commands.parseRewindCommand("/rewind help"), { action: "status" });
  assert.deepEqual(commands.parseRewindCommand("/rewind -h"), { action: "status" });
  assert.deepEqual(commands.parseRewindCommand("/rewind latest"), { action: "apply" });
  assert.deepEqual(commands.parseRewindCommand("/rewind cp-1"), {
    action: "apply",
    targetCheckpointId: "cp-1",
  });
  assert.deepEqual(commands.parseRewindCommand("/rewind fork"), { action: "fork" });
  assert.deepEqual(commands.parseRewindCommand("/rewind fork cp-2"), {
    action: "fork",
    targetCheckpointId: "cp-2",
  });
  assert.deepEqual(commands.parseRewindCommand("/fork"), { action: "fork" });
  assert.deepEqual(commands.parseRewindCommand("/fork latest"), { action: "fork" });
  assert.deepEqual(commands.parseRewindCommand("/fork cp-3"), {
    action: "fork",
    targetCheckpointId: "cp-3",
  });
  assert.deepEqual(commands.parseRewindCommand("/rewind conversation msg-1"), {
    action: "message",
    scope: deps.RewindScope.Conversation,
    targetMessageId: "msg-1",
  });
  assert.deepEqual(
    commands.parseRewindCommand("/rewind message msg-1").scope,
    deps.RewindScope.Conversation,
  );
  assert.equal(
    commands.parseRewindCommand("/rewind workspace msg-1").scope,
    deps.RewindScope.Workspace,
    "code/workspace 同义",
  );
  assert.equal(commands.parseRewindCommand("/rewind code msg-1").scope, deps.RewindScope.Workspace);
  assert.equal(commands.parseRewindCommand("/rewind both msg-1").scope, deps.RewindScope.Both);
  assert.equal(
    commands.parseRewindCommand("/rewind cascade conversation msg-1").action,
    "cascade-message",
    "cascade 前缀升级成级联回退",
  );
  assert.deepEqual(
    commands.parseRewindCommand("/rewind bogus msg-1"),
    { action: "apply", targetCheckpointId: "bogus msg-1" },
    "两段参数但 scope 不认识 → 整串当检查点 id",
  );
  assert.deepEqual(
    commands.parseRewindCommand("/rewind conversation"),
    { action: "apply", targetCheckpointId: "conversation" },
    "缺消息 id → 单个参数按检查点 id 处理",
  );
  assert.equal(commands.parseRewindCommand("no command"), null);
});

test("B40 工具结果文本化与错误判定", () => {
  assert.deepEqual(toolResult.emptyTokenUsageInfo(), {
    cache: { read: 0, write: 0 },
    input: 0,
    output: 0,
    reasoning: 0,
  });
  assert.deepEqual(
    toolResult.toTokenUsageInfo({
      cacheReadTokens: 2,
      cacheWriteTokens: 3,
      inputTokens: 4,
      outputTokens: 5,
      reasoningTokens: 6,
      totalTokens: 20,
    }),
    { cache: { read: 2, write: 3 }, input: 4, output: 5, reasoning: 6, total: 20 },
  );
  assert.deepEqual(toolResult.toTokenUsageInfo(undefined), {
    cache: { read: 0, write: 0 },
    input: 0,
    output: 0,
    reasoning: 0,
    total: undefined,
  });

  assert.deepEqual(toolResult.toRecordInput({ a: 1 }), { a: 1 });
  assert.deepEqual(toolResult.toRecordInput("text"), { value: "text" }, "非对象包一层 value");
  assert.deepEqual(toolResult.toRecordInput(null), { value: null });

  assert.equal(
    toolResult.stringifyToolResultOutput({ modelContent: "from model" } as never),
    "from model",
    "modelContent 优先",
  );
  assert.equal(
    toolResult.stringifyToolResultOutput({
      modelContent: [{ text: "block", type: "text" }],
    } as never),
    "block",
    "块内容转文本",
  );
  assert.equal(
    toolResult.stringifyToolResultOutput({ error: { message: "boom" }, success: false } as never),
    "boom",
    "失败时给错误消息",
  );
  assert.equal(
    toolResult.stringifyToolResultOutput({ output: "raw", success: true } as never),
    "raw",
  );
  assert.equal(
    toolResult.stringifyToolResultOutput({ success: true } as never),
    "",
    "无输出给空串",
  );
  assert.equal(
    toolResult.stringifyToolResultOutput({ output: { a: 1 }, success: true } as never),
    '{"a":1}',
    "对象走 JSON 序列化",
  );

  assert.equal(
    toolResult.modelContentForToolResult({ modelContent: "m", success: true } as never),
    "m",
  );
  assert.equal(
    toolResult.modelContentForToolResult({ output: "o", success: true } as never),
    "o",
    "没有 modelContent 时退回文本化",
  );

  assert.equal(toolResult.isErrorForToolResult({ success: false } as never), true);
  assert.equal(toolResult.isErrorForToolResult({ success: true, output: {} } as never), false);
  assert.equal(
    toolResult.isErrorForToolResult({ output: { isError: true }, success: true } as never),
    true,
    "显式 isError 布尔位说了算",
  );
  assert.equal(
    toolResult.isErrorForToolResult({ output: { is_error: false }, success: true } as never),
    false,
  );
  assert.equal(
    toolResult.isErrorForToolResult({
      output: { interrupted: true },
      success: true,
      toolName: "Bash",
    } as never),
    true,
    "Bash 中断按错误处理",
  );
  assert.equal(
    toolResult.isErrorForToolResult({
      output: { interrupted: false },
      success: true,
      toolName: "Bash",
    } as never),
    false,
  );

  assert.equal(toolResult.stringifyForEstimation({ a: 1 }), '{"a":1}');
  assert.equal(toolResult.stringifyForEstimation(undefined), "undefined");
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(
    typeof toolResult.stringifyForEstimation(circular),
    "string",
    "循环引用退化成 String",
  );

  assert.deepEqual(toolResult.parseMcpToolName("mcp__server__do_thing"), {
    serverName: "server",
    toolName: "do_thing",
  });
  assert.deepEqual(toolResult.parseMcpToolName("mcp__srv__a__b"), {
    serverName: "srv",
    toolName: "a__b",
  });
  assert.equal(toolResult.parseMcpToolName("Read"), undefined, "非 MCP 名返回 undefined");
  assert.equal(toolResult.parseMcpToolName("mcp__only"), undefined, "缺工具段返回 undefined");

  assert.equal(
    toolResult.findParallelGroupIndex(
      { parallelGroups: [["c1"], ["c2", "c3"]] } as never,
      "c3" as never,
    ),
    1,
  );
  assert.equal(
    toolResult.findParallelGroupIndex({ parallelGroups: [["c1"]] } as never, "missing" as never),
    -1,
    "不在任何分组返回 -1",
  );
});

test("B41 会话标题、项目标识与数据守卫", () => {
  assert.equal(project.titleFromInput("   a \n b   "), "a b");
  assert.equal(project.titleFromInput("   "), "Untitled session", "空白输入给兜底标题");
  assert.equal(project.titleFromInput("x".repeat(80)).length, 60, "超过 60 字符截断");
  assert.ok(project.titleFromInput("x".repeat(80)).endsWith("..."));

  assert.equal(project.slugify("Hello World!"), "hello-world");
  assert.equal(project.slugify("///"), "session", "空 slug 兜底");
  assert.equal(project.slugify("  MixED  Case  "), "mixed-case");
  assert.equal(project.slugify("a/b\\c"), "a-b-c", "路径分隔符压成连字符");
  const projectId = project.projectIdFromDirectory("D:/work/My Project");
  assert.ok(projectId.length > 0, "项目 id 非空");
  assert.equal(
    projectId,
    project.projectIdFromDirectory("D:/work/My Project"),
    "同一目录得到同一 id（确定性）",
  );
  assert.notEqual(
    projectId,
    project.projectIdFromDirectory("D:/work/Other"),
    "不同目录得到不同 id",
  );

  assert.equal(dataGuards.isPlainRecord({}), true);
  assert.equal(dataGuards.isPlainRecord([]), false, "数组不是 plain record");
  assert.equal(dataGuards.isPlainRecord(null), false);
  assert.equal(dataGuards.isPlainRecord("x"), false);
  assert.equal(dataGuards.stringProperty({ a: "text" }, "a"), "text");
  assert.equal(dataGuards.stringProperty({ a: 5 }, "a"), undefined, "非字符串返回 undefined");
  assert.equal(dataGuards.stringProperty({}, "missing"), undefined);
  assert.deepEqual(dataGuards.objectKeys({ a: 1, b: 2 }), ["a", "b"]);
  assert.equal(dataGuards.objectKeys(undefined), undefined);
  assert.ok(
    (
      dataGuards.objectKeys(
        Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i])),
      ) ?? []
    ).length === 20,
    "最多取 20 个键",
  );
  assert.equal(
    dataGuards.isRuntimeDiffHunk({
      lines: ["+x"],
      newLines: 1,
      newStart: 1,
      oldLines: 0,
      oldStart: 0,
    }),
    true,
  );
  assert.equal(dataGuards.isRuntimeDiffHunk({ lines: ["x"] }), false, "缺数字字段不算 hunk");
  assert.equal(
    dataGuards.isRuntimeDiffHunk({
      lines: [1],
      newLines: 1,
      newStart: 1,
      oldLines: 0,
      oldStart: 0,
    }),
    false,
    "行必须是字符串",
  );
});

test("B42 回合输入的附件准入与用户内容构造", () => {
  assert.equal(
    conversation.isMetaUserContextMessage({ content: "<system-reminder>x", role: "user" }),
    true,
  );
  assert.equal(conversation.isMetaUserContextMessage({ content: "hi", role: "user" }), false);
  assert.equal(
    conversation.findLatestRealUserMessageIndex([
      { content: "first", role: "user" },
      { content: "<system-reminder>meta", role: "user" },
      { content: "latest", role: "user" },
    ]),
    2,
  );
  assert.equal(
    conversation.findLatestRealUserMessageIndex([
      { content: "<system-reminder>meta", role: "user" },
      { content: "<system-reminder>meta only", role: "user" },
    ]),
    -1,
    "全是系统提醒时返回 -1",
  );

  assert.equal(conversation.buildUserContentFromTurn("plain", []), "plain", "无附件原样返回");

  const ordinaryImage = {
    contentBlock: { dataUrl: "data:image/png;base64,QUJD", mediaType: "image/png", type: "image" },
    metadata: { recoverability: "provider_ready", storageKind: "artifact" },
    mime: "image/png",
    url: "knorvia-artifact://session-contract/1",
  };
  const withImage = conversation.buildUserContentFromTurn("look", [ordinaryImage as never]);
  assert.ok(Array.isArray(withImage), "有附件时转成块数组");
  assert.equal(withImage.length, 2);
  assert.equal(withImage[0].type, "image", "附件块在前");
  assert.equal(withImage[1].text, "look", "用户输入文本紧随其后（回合输入排在附件之后）");

  const failed = {
    contentBlock: { text: "[Attached text/plain: missing.txt]", type: "text" },
    metadata: {
      errorCode: "attachment_read_failed",
      recoverability: "metadata_only",
      storageKind: "local_ref",
    },
    mime: "text/plain",
    source: { text: { value: "missing.txt" }, type: "file" },
    url: "missing.txt",
  };
  assert.equal(
    conversation.buildUserContentFromTurn("text only", [failed as never]),
    "text only",
    "读取失败的文本附件被丢弃，丢光就回退成原输入",
  );

  const entries = conversation.buildRuntimeUserEntriesFromTurn("hello", [ordinaryImage as never]);
  assert.equal(entries.length, 1, "图片直接进用户内容，不产生提醒条目");
  assert.equal(entries[0].message.role, "user");
  assert.equal(entries[0].metadata.source, "real_user");

  const promptAttachment = {
    contentBlock: { text: "file body", type: "text" },
    filename: "note.md",
    metadata: {
      preview: { text: "file body", truncated: false },
      recoverability: "provider_ready",
      storageKind: "inline",
    },
    mime: "text/plain",
    source: { text: { value: "note.md" }, type: "file" },
    url: "note.md",
  };
  const withPrompt = conversation.buildRuntimeUserEntriesFromTurn("hi", [
    promptAttachment as never,
  ]);
  assert.equal(withPrompt.length, 2, "用户条目 + 提醒条目");
  assert.equal(withPrompt[0].metadata.source, "real_user");
  assert.equal(withPrompt[1].kind, "attachment");
  assert.equal(withPrompt[1].metadata.source, "prompt_attachment");

  const withBrowser = conversation.buildRuntimeUserEntriesFromTurn("hi", [], {
    browserAmbientContext: { currentUrl: "https://example.invalid/page", tabCount: 2 },
  });
  const browserText = withBrowser[0].message.content;
  assert.ok(browserText.includes("<in-app-browser-context"), "浏览器环境块被注入");
  assert.ok(browserText.includes("with 2 tabs"), "标签页数进入正文");
  assert.ok(browserText.endsWith("hi"), "用户请求留在最后");

  const noTabs = conversation.buildRuntimeUserEntriesFromTurn("hi", [], {
    browserAmbientContext: { tabCount: 0 },
  });
  assert.equal(noTabs[0].message.content, "hi", "tabCount 非正整数不注入环境块");
});

test("B43 rewind：检查点选择、产物往返、评估项与不可用提示", () => {
  const workspaceCheckpoint = {
    checkpointId: "cp-1",
    messageId: "msg-1",
    scope: deps.RewindScope.Workspace,
    snapshotRef: "snap-1",
  };
  const conversationCheckpoint = {
    checkpointId: "cp-2",
    messageId: "msg-2",
    scope: deps.RewindScope.Conversation,
    snapshotRef: "snap-2",
  };
  const events = [
    { payload: workspaceCheckpoint, type: deps.SessionEventType.CheckpointCreated },
    { payload: conversationCheckpoint, type: deps.SessionEventType.CheckpointCreated },
  ];
  assert.deepEqual(rewind.selectCheckpointForRewind(events as never), workspaceCheckpoint);
  assert.deepEqual(
    rewind.selectCheckpointForRewind(events as never, "cp-1"),
    workspaceCheckpoint,
    "按 id 精确命中",
  );
  assert.equal(
    rewind.selectCheckpointForRewind(events as never, "missing"),
    undefined,
    "会话域检查点不参与工作区回退",
  );
  assert.equal(
    rewind.selectCheckpointForRewind(events as never, "cp-2"),
    undefined,
    "对话域 scope 被过滤",
  );

  assert.deepEqual(
    rewind.selectCheckpointForMessage(events as never, "msg-1" as never),
    workspaceCheckpoint,
    "按消息 id 命中检查点",
  );
  assert.deepEqual(
    rewind.selectCheckpointsForMessages(events as never, [] as never),
    [],
    "空目标集返回空数组",
  );
  assert.equal(rewind.selectCheckpointsForMessages(events as never, ["msg-1"] as never).length, 1);

  const candidate = rewind.getFileMutationCheckpointCandidate({
    filePath: "/w/a.txt",
    originalFile: "old",
    structuredPatch: [{ lines: ["+x"], newLines: 1, newStart: 1, oldLines: 0, oldStart: 0 }],
    type: "edit",
  });
  assert.equal(candidate.filePath, "/w/a.txt");
  assert.equal(
    rewind.getFileMutationCheckpointCandidate({ filePath: "" }),
    undefined,
    "缺路径不算候选",
  );
  assert.equal(
    rewind.getFileMutationCheckpointCandidate({
      filePath: "/w/a.txt",
      originalFile: null,
      structuredPatch: [{ bogus: true }],
    }),
    undefined,
    "非法规 hunk 整条拒绝",
  );
  assert.equal(
    rewind.getFileMutationCheckpointCandidate({
      filePath: "/w/a.txt",
      originalFile: 5,
      structuredPatch: [],
    }),
    undefined,
    "originalFile 类型不符拒绝",
  );

  const serialized = rewind.stringifyWorkspaceCheckpointArtifact(
    candidate as never,
    {
      toolCallId: "call-1",
      toolName: "Edit",
    } as never,
  );
  const parsed = JSON.parse(serialized) as Record<string, unknown>;
  assert.equal(parsed.kind, "workspace_file_before_change");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.toolCallId, "call-1");
  assert.equal(parsed.toolName, "Edit");
  assert.equal((parsed.files as unknown[]).length, 1, "产物按文件成条");
  assert.equal(typeof parsed.createdAt, "string");
  const roundTripped = deps.parseWorkspaceCheckpointArtifact(parsed);
  assert.equal(
    roundTripped.kind,
    "workspace_file_before_change",
    "旧写 → 新读：产物 JSON 往返可解析",
  );

  assert.equal(
    rewind.activeSuffixMessageIdsForRewind(
      [{ info: { id: "m1" } }, { info: { id: "m2" } }, { info: { id: "m3" } }] as never,
      "m2" as never,
    ).length,
    2,
    "从目标消息起到结尾的后缀",
  );
  assert.deepEqual(
    rewind.activeSuffixMessageIdsForRewind([{ info: { id: "m1" } }] as never, "missing" as never),
    [],
    "目标不在分支里返回空数组",
  );

  assert.equal(
    rewind.previewTextFromMessage({
      info: { id: "m1" },
      parts: [{ text: "  hello   world  ", type: "text" }],
    } as never),
    "hello world",
    "预览做空白归一",
  );
  assert.equal(
    rewind.previewTextFromMessage({
      info: { id: "m1" },
      parts: [{ text: "   ", type: "text" }],
    } as never),
    undefined,
    "全空白没有预览",
  );
  const longPreview = rewind.previewTextFromMessage({
    info: { id: "m1" },
    parts: [{ text: "y".repeat(300), type: "text" }],
  } as never);
  assert.equal(longPreview.length, 140, "预览截到 140 字符");
  assert.ok(longPreview.endsWith("..."));

  assert.deepEqual(
    rewind.buildRewindEvaluationItems(events as never).map((item) => item.id),
    ["msg-1", "msg-2"],
    "评估项按事件顺序生成",
  );
  const evaluations = rewind.buildMessageRewindEvaluationItems([
    { info: { id: "m1" }, parts: [] },
    {
      info: { id: "m2" },
      parts: [
        {
          compactBoundary: {
            boundaryId: "b1",
            preCompactTokenCount: 1000,
            summarizedMessageCount: 3,
            traceId: "trace-contract",
            trigger: deps.CompactTrigger.Auto,
          },
          type: "compaction",
        },
      ],
    },
  ] as never);
  assert.equal(evaluations.length, 2);
  assert.equal(evaluations[0].id, "m1");
  assert.equal(evaluations[0].compactBoundary, undefined, "没有压缩部件就只有 id");
  assert.equal(evaluations[1].id, "m2");
  assert.equal(evaluations[1].compactBoundary.boundaryId, "b1");
  assert.equal(evaluations[1].compactBoundary.summarizedMessageCount, 3, "边界载荷按 schema 解析");

  const notice = rewind.formatWorkspaceRewindNoticeBody({
    checkpoint: workspaceCheckpoint as never,
    evaluation: { strategy: deps.RewindStrategy.FileOnly } as never,
    restoredFiles: [{ action: "restored", path: "/w/a.txt" } as never],
    rewindId: "rw-1",
  });
  assert.ok(notice.startsWith("Workspace rewind applied."));
  assert.ok(notice.includes("rewindId: rw-1"));
  assert.ok(notice.includes("restored /w/a.txt"));
  assert.ok(notice.endsWith("Conversation history was not rewritten by this file restore."));

  const forkNotice = rewind.formatWorkspaceForkNoticeBody({
    checkpoint: workspaceCheckpoint as never,
    parentSessionId: "session-parent" as never,
    restoredFiles: [{ action: "restored", path: "/w/a.txt" } as never],
  });
  assert.ok(forkNotice.includes("parentSessionId: session-parent"));
  assert.ok(forkNotice.includes("checkpointId: cp-1"));

  const forkAtMessage = rewind.formatWorkspaceForkAtMessageNoticeBody({
    parentSessionId: "session-parent" as never,
    restoredFiles: [],
    targetMessageId: "msg-9" as never,
    undoneCheckpointCount: 2,
  });
  assert.ok(forkAtMessage.includes("undoneCheckpointCount: 2"));
  assert.ok(forkAtMessage.includes("targetMessageId: msg-9"));

  const conversationFork = rewind.formatConversationForkNoticeBody({
    parentSessionId: "session-parent" as never,
    targetMessageId: "msg-9" as never,
  });
  assert.ok(
    conversationFork.startsWith("This session was forked from a previous session message."),
  );
  assert.ok(conversationFork.includes("No workspace checkpoint was restored for this fork."));

  assert.equal(
    rewind.formatUnavailableRewindResponse("no_checkpoint_available"),
    "No workspace checkpoint is available yet.",
  );
  assert.equal(
    rewind.formatUnavailableRewindResponse("target_checkpoint_not_found", "cp-1"),
    "Checkpoint cp-1 was not found.",
  );
  assert.equal(
    rewind.formatUnavailableRewindResponse("target_checkpoint_not_found", undefined, "msg-1"),
    "No workspace checkpoint was found for message msg-1.",
  );
  assert.equal(
    rewind.formatUnavailableRewindResponse("target_message_not_found", undefined, "msg-1"),
    "Message msg-1 is not available in the active conversation branch.",
  );
  assert.equal(
    rewind.formatUnavailableRewindResponse("target_message_is_not_user_prompt", undefined, "msg-1"),
    "Message msg-1 is not a rewindable user prompt.",
  );
  assert.equal(
    rewind.formatUnavailableRewindResponse("conversation_rewind_requires_session_store"),
    "Conversation rewind is unavailable because session storage is not configured.",
  );
  assert.equal(
    rewind.formatUnavailableRewindResponse("artifact_store_not_configured"),
    "Workspace rewind is unavailable because artifact storage is not configured.",
  );
  assert.equal(
    rewind.formatUnavailableRewindResponse("file_system_port_not_configured"),
    "Workspace rewind is unavailable because file-system access is not configured.",
  );
  assert.equal(
    rewind.formatUnavailableRewindResponse("checkpoint_snapshot_unavailable", "cp-1"),
    "Checkpoint cp-1 cannot be restored because its snapshot artifact is unavailable.",
  );
  assert.equal(
    rewind.formatUnavailableRewindResponse(
      "target_covered_by_compact_requires_fork",
      undefined,
      "msg-1",
    ),
    "Message msg-1 is covered by compact for conversation rewind; create a fork to rewind conversation history.",
  );
  assert.equal(
    rewind.formatUnavailableRewindResponse("something_new"),
    "Workspace rewind is unavailable: something_new.",
    "未知原因走兜底句式",
  );
  assert.equal(
    rewind.WORKSPACE_CHECKPOINT_CONTENT_TYPE,
    "application/vnd.knorvia-studio.workspace-checkpoint+json",
  );
});

test("B44 远程会话路径修复：四态判定、CAS 回读与损坏即抛", async () => {
  const identity = "remote:docker:container-1:/home/user/proj";
  const workspacePath = "/home/user/proj";
  const baseSession = {
    directory: identity,
    id: "session-1",
    path: identity,
    time: { updated: 100 },
    workspaceID: identity,
  };

  const untouched = { ...baseSession, directory: workspacePath, path: workspacePath };
  const store = createSessionStore();
  const same = await remoteRepair.repairPersistedRemoteSessionPaths(
    store.port as never,
    untouched as never,
  );
  assert.equal(same, untouched, "已经干净的记录原样返回");
  assert.equal(store.calls.length, 0, "不需要修复时一次存储访问都没有");

  const localSession = { ...baseSession, directory: "/other/place", path: "/other/place" };
  assert.equal(
    await remoteRepair.repairPersistedRemoteSessionPaths(
      store.port as never,
      localSession as never,
    ),
    localSession,
    "非远程身份不做追溯转换",
  );

  await assert.rejects(
    () =>
      remoteRepair.repairPersistedRemoteSessionPaths(
        store.port as never,
        { ...baseSession, workspaceID: "remote:garbage" } as never,
      ),
    (error: { context?: Record<string, unknown>; type?: string }) => {
      assert.equal(error.type, deps.CoreErrorType.SessionCorrupted);
      assert.equal(error.context.reason, "remote_session_workspace_path_corrupted");
      return true;
    },
    "remote: 前缀但文法不合法 → 记录损坏",
  );

  await assert.rejects(
    () =>
      remoteRepair.repairPersistedRemoteSessionPaths(
        store.port as never,
        {
          ...baseSession,
          directory: `/tmp/prefix/${identity}`,
        } as never,
      ),
    (error: { type?: string }) => error.type === deps.CoreErrorType.SessionCorrupted,
    "路径里嵌着身份串 → 无法安全归位",
  );

  store.repairMode = "match";
  store.session = { ...baseSession, directory: workspacePath, path: workspacePath };
  const repaired = await remoteRepair.repairPersistedRemoteSessionPaths(
    store.port as never,
    baseSession as never,
  );
  assert.equal(repaired.directory, workspacePath, "CAS 命中 → 返回回读后的记录");
  assert.equal(repaired.path, workspacePath);
  assert.deepEqual(
    store.calls.map((call) => call.method),
    ["repairRemoteSessionPaths", "getSession"],
    "先窄化写回再回读",
  );
  const repairCall = store.calls[0].payload as Record<string, unknown>;
  assert.equal(repairCall.sessionID, "session-1");
  assert.equal(repairCall.expectedDirectory, identity, "CAS 带旧值");
  assert.equal(repairCall.directory, workspacePath);

  const failures: string[] = [];
  const unsupported = createSessionStore();
  unsupported.session = { ...baseSession, directory: workspacePath, path: workspacePath };
  const fallback = await remoteRepair.repairPersistedRemoteSessionPaths(
    { ...unsupported.port, repairRemoteSessionPaths: undefined } as never,
    baseSession as never,
    { onPersistenceFailure: (error: unknown) => failures.push(String(error)) } as never,
  );
  assert.equal(fallback.directory, workspacePath, "存储不支持窄化修复时返回内存修复结果");
  assert.equal(failures.length, 1);
  assert.ok(failures[0].includes("does not support narrow remote path repair"));

  const mismatch = createSessionStore();
  mismatch.repairResult = false;
  mismatch.session = { ...baseSession, directory: identity, path: identity };
  const mismatchFailures: string[] = [];
  const mismatched = await remoteRepair.repairPersistedRemoteSessionPaths(
    mismatch.port as never,
    baseSession as never,
    { onPersistenceFailure: (error: unknown) => mismatchFailures.push(String(error)) } as never,
  );
  assert.equal(mismatched.directory, workspacePath, "CAS 未命中 → 仍返回内存修复结果");
  assert.ok(mismatchFailures[0].includes("CAS did not match"));

  const broken = createSessionStore();
  broken.repairMode = "unsupported";
  const brokenFailures: string[] = [];
  const brokenResult = await remoteRepair.repairPersistedRemoteSessionPaths(
    {
      ...broken.port,
      repairRemoteSessionPaths: async () => {
        throw new Error("storage exploded");
      },
    } as never,
    baseSession as never,
    { onPersistenceFailure: (error: unknown) => brokenFailures.push(String(error)) } as never,
  );
  assert.equal(brokenResult.directory, workspacePath, "存储异常降级成内存修复");
  assert.ok(brokenFailures[0].includes("storage exploded"));
});

test("B45 项目记忆根的启用判定", () => {
  const memoryConfig = {
    cliStorageRoot: join(repoRoot, ".knorvia-studio"),
    enabled: true,
    workspaceIdentity: "workspace-1",
  };
  const root = projectMemory.resolveEnabledProjectMemoryRoot(
    { memory: memoryConfig, taskType: "interactive" } as never,
    repoRoot,
  );
  assert.equal(typeof root, "string");
  assert.ok((root ?? "").length > 0);

  assert.equal(
    projectMemory.resolveEnabledProjectMemoryRoot({ taskType: "interactive" } as never, repoRoot),
    undefined,
    "没配置存储根就不启用",
  );
  assert.equal(
    projectMemory.resolveEnabledProjectMemoryRoot(
      { memory: { ...memoryConfig, enabled: false }, taskType: "interactive" } as never,
      repoRoot,
    ),
    undefined,
    "显式关闭不启用",
  );
  assert.equal(
    projectMemory.resolveEnabledProjectMemoryRoot(
      { memory: { ...memoryConfig, use: false }, taskType: "interactive" } as never,
      repoRoot,
    ),
    undefined,
    "use=false 不启用",
  );
  for (const taskType of ["workflow_child", "subagent_child", "automation_child"]) {
    assert.equal(
      projectMemory.resolveEnabledProjectMemoryRoot(
        { memory: memoryConfig, taskType } as never,
        repoRoot,
      ),
      undefined,
      `${taskType} 不是主记忆任务类型`,
    );
  }
});

test("B46 记忆抽取：前置条件短路与排空", async () => {
  const shuttingDown = { config: { memory: { enabled: true } }, shuttingDown: true };
  extraction.scheduleProjectMemoryExtraction(shuttingDown as never, {
    model: {} as never,
    traceContext: trace,
  });
  assert.equal(
    (shuttingDown as { memoryExtractionScheduler?: unknown }).memoryExtractionScheduler,
    undefined,
    "运行时关闭期直接跳过调度",
  );

  const disabled = {
    config: { memory: { cliStorageRoot: "/tmp/knorvia", enabled: true, extractionEnabled: false } },
    shuttingDown: false,
    workspaceRoot: repoRoot,
  };
  extraction.scheduleProjectMemoryExtraction(disabled as never, {
    model: {} as never,
    traceContext: trace,
  });
  assert.equal(
    (disabled as { memoryExtractionScheduler?: unknown }).memoryExtractionScheduler,
    undefined,
    "抽取被显式关闭时不调度",
  );

  const noMemory = { config: {}, shuttingDown: false, workspaceRoot: repoRoot };
  extraction.scheduleProjectMemoryExtraction(noMemory as never, {
    model: {} as never,
    traceContext: trace,
  });
  assert.equal(
    (noMemory as { memoryExtractionScheduler?: unknown }).memoryExtractionScheduler,
    undefined,
    "没有记忆根时不调度",
  );

  assert.equal(
    extraction.isProjectMemoryEnabled.call({
      config: { memory: { cliStorageRoot: "/tmp/knorvia", enabled: true } },
      workspaceRoot: repoRoot,
    } as never),
    true,
  );
  assert.equal(
    extraction.isProjectMemoryEnabled.call({ config: {}, workspaceRoot: repoRoot } as never),
    false,
  );

  let drained = false;
  await extraction.drainMemoryExtractions.call(
    { memoryExtractionScheduler: { drain: async () => (drained = true) } } as never,
    null,
  );
  assert.equal(drained, true, "timeoutMs=null 时直接等排空");

  await extraction.drainMemoryExtractions.call({} as never, null);
  assert.ok(true, "没有调度器时空操作");

  const childHistory = await coreModule("agent/message-history");
  assert.equal(
    childHistory.isRuntimeAttachmentEntry({
      kind: "attachment",
      content: "x",
      metadata: { source: "diagnostics" },
    }),
    true,
  );
  assert.equal(
    childHistory.isRuntimeAttachmentEntry({ message: { content: "x", role: "user" } }),
    false,
  );
});

test("B47 上下文用量分类贡献者", () => {
  const category = { id: "cat-1", name: "Context sections", source: "sections" } as never;
  const categories = new Map([["sections", category]]);
  const emptyBreakdown = usageBreakdown.buildCategoryBreakdown(categories, "sections", []);
  assert.ok(emptyBreakdown, "来源对得上就产出分类");
  assert.deepEqual(emptyBreakdown.contributors, []);
  assert.equal(
    usageBreakdown.buildCategoryBreakdown(categories, "unknown-source", []),
    undefined,
    "来源对不上返回 undefined",
  );

  const section = usageBreakdown.sectionContributor("sections", {
    cacheHint: "cache-1",
    chars: 120,
    confidence: 0.9,
    injectionTarget: "system",
    name: "Project context",
    source: "project",
    tokenMethod: "estimate",
    tokens: 30,
    tokenizer: "chars/4",
  });
  assert.equal(section.kind, "context_section");
  assert.equal(section.label, "Project context");
  assert.equal(section.injectionTarget, "system");
  assert.equal(section.tokens, 30);

  const tool = usageBreakdown.toolContributor("tools", {
    chars: 400,
    confidence: 1,
    name: "Read",
    readOnly: true,
    serverName: "builtin",
    sideEffectScope: "workspace",
    source: "builtin",
    tokenMethod: "json",
    tokens: 100,
    tokenizer: "json",
  });
  assert.equal(tool.kind, "tool_schema");
  assert.equal(tool.readOnly, true);
  assert.equal(tool.sideEffectScope, "workspace");

  const skill = usageBreakdown.skillContributor("skills", {
    chars: 80,
    confidence: 0.5,
    name: "release",
    path: "skills/release/SKILL.md",
    scope: "project",
    source: "project",
    tokenMethod: "estimate",
    tokens: 20,
    tokenizer: "chars/4",
  });
  assert.equal(skill.kind, "skill");
  assert.equal(skill.path, "skills/release/SKILL.md");

  const role = usageBreakdown.messageRoleContributor({
    chars: 1000,
    confidence: 1,
    count: 12,
    role: "user",
    tokenMethod: "estimate",
    tokens: 250,
    tokenizer: "chars/4",
  });
  assert.equal(role.kind, "message_role");
  assert.equal(role.categorySource, "messages");
  assert.equal(role.count, 12);

  const breakdown = usageBreakdown.buildCategoryBreakdown(categories, "sections", [section]);
  assert.equal(breakdown.name, "Context sections");
  assert.equal(breakdown.contributors.length, 1);
  assert.equal(breakdown.contributors[0], section);
});
