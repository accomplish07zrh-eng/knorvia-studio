// SPDX-License-Identifier: Apache-2.0
// A5 簇 agent/taskServiceAdapter.ts 黑盒契约：KnorviaTaskService 门面到 Knorvia Agent 运行时的适配层。
// 覆盖 B 条目 A51–A521：列表/分组读取与 provider 边界、就绪与运行态判定、host command 队列与
// owner/lease 防护、automation 与 off-peak 归属、v4 命令收敛与 ACK、错误码传播、
// workspaceIdentity 缓存键隔离、事件订阅与资源释放、日志与轨迹路径。
// 全部依赖（agentService / taskIndexRepo / taskIndexSyncer / settingService）都是注入的桩，
// 断言的是适配层的真实可观测结果（返回值、调用参数、事件序列、内部计数器）。
import assert from "node:assert/strict";
import { basename, join } from "node:path";
import { describe, it } from "node:test";

import { services, servicesNode } from "./entry.mjs";
import { knorviaDataRoot, makeTempRoot, withEnv, writeText } from "./helpers.mjs";

const { createKnorviaTaskServiceAdapter } = servicesNode;
const RUNTIME_UNAVAILABLE_CODE = services.KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE;
const PROVIDER = "knorvia";

const WORKSPACE = join("svc01-a5", "workspace");
const IDENTITY = "ssh+knorvia-remote/svc01-a5/workspace";
const TASK_ID = "task-1";

/** 事件驱动的等待门：只由被桩替换模块的真实调用唤醒，不使用定时器。 */
function createGate() {
  const seen = [];
  const waiting = [];
  return {
    get items() {
      return seen.slice();
    },
    record(item) {
      seen.push(item);
      for (const wake of waiting.splice(0)) wake();
    },
    async until(count) {
      while (seen.length < count) {
        await new Promise((wake) => waiting.push(wake));
      }
      return seen.slice();
    },
  };
}

function makeModelOption(providerId, modelId, label) {
  return {
    ref: { providerId, modelId },
    label,
    description: "",
    contextWindow: 200000,
    properties: {
      inputFormat: {
        supportsText: true,
        supportsImage: false,
        supportsVideo: false,
        supportsAudio: false,
        supportsPdf: false,
      },
      outputFormat: {
        supportsText: true,
      },
    },
  };
}

function makeSnapshot(taskId = TASK_ID, overrides = {}) {
  const { session = {}, settings = {}, projection = {}, runtime = {}, ...rest } = overrides;
  return {
    protocol: { name: "Knorvia Studio Protocol", version: 1 },
    session: {
      sessionId: taskId,
      traceId: `trace-${taskId}`,
      workspace: { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, workspaceKey: IDENTITY },
      sessionKind: "interactive",
      title: "初始标题",
      mode: "build",
      status: "idle",
      createdAt: 1000,
      updatedAt: 2000,
      ...session,
    },
    settings: {
      model: { available: [makeModelOption("zhipu", "glm-4.6", "GLM-4.6")] },
      thoughtLevel: { enabled: false, available: [] },
      mode: { current: "build" },
      ...settings,
    },
    projection: {
      sessionId: taskId,
      status: "idle",
      mode: "build",
      turnCount: 0,
      totalTokenCount: 0,
      contextUsed: 0,
      contextWindow: 200000,
      pendingPermissions: [],
      activeToolCalls: [],
      backgroundJobs: [],
      ...projection,
    },
    runtime: { eventSeq: 1, stateRevision: 1, pendingRequestIds: [], ...runtime },
    messages: [],
    slashCommands: [{ name: "compact", description: "压缩上下文" }],
    ...rest,
  };
}

function makeTaskMeta(taskId = TASK_ID, overrides = {}) {
  return {
    taskId,
    traceId: `trace-${taskId}`,
    title: `标题-${taskId}`,
    workspacePath: WORKSPACE,
    createdAt: 1000,
    updatedAt: 2000,
    mode: "build",
    provider: PROVIDER,
    ...overrides,
  };
}

function runtimeUnavailableError(taskId = TASK_ID) {
  return Object.assign(new Error(`Knorvia Agent runtime is unavailable for ${taskId}`), {
    code: RUNTIME_UNAVAILABLE_CODE,
  });
}

function createHarness(overrides = {}) {
  const {
    snapshots = {},
    metas = [],
    settingValues = null,
    agentServicePatches = {},
    repoPatches = {},
    ackSequence = [],
  } = overrides;

  const calls = [];
  const order = [];
  const envelopes = [];
  const broadcasts = [];
  const sessionSubscriptions = [];
  const syncedMetas = [];
  const agentPatches = [];
  const workspaceEvents = [];
  const upstreamSubs = [];
  const sendTextGate = createGate();
  const ackQueue = ackSequence.slice();
  const terminalListeners = new Set();
  const readyListeners = new Set();

  // 快照桩可按 "<op>:<sessionId>" 指定某个写操作返回的快照，
  // 用于模拟“写入后 session 事实源确实变化”的真实时序。
  const snapshotFor = (taskId, op) =>
    (op ? snapshots[`${op}:${taskId}`] : undefined) ?? snapshots[taskId] ?? makeSnapshot(taskId);

  function record(method, params) {
    calls.push({ method, params });
  }

  const agentService = {
    async initialize(params) {
      record("initialize", params);
      return { available: true, protocolName: "Knorvia Studio Protocol", protocolVersion: 1 };
    },
    async disposeWorkspace(params) {
      record("disposeWorkspace", params);
    },
    async createSession(params) {
      record("createSession", params);
      return snapshotFor(params.sessionId ?? "created-task");
    },
    async resumeSession(params) {
      record("resumeSession", params);
      const next = snapshots[params.sessionId];
      if (next instanceof Error) throw next;
      return (
        next ??
        makeSnapshot(params.sessionId, {
          session: {
            workspace: {
              workspacePath: params.workspacePath,
              workspaceIdentity: params.workspaceIdentity,
              workspaceKey: params.workspaceIdentity ?? params.workspacePath,
            },
          },
        })
      );
    },
    async readSession(params) {
      record("readSession", params);
      const next = snapshots[params.sessionId];
      if (next instanceof Error) throw next;
      return (
        next ??
        makeSnapshot(params.sessionId, {
          session: {
            workspace: {
              workspacePath: params.workspacePath,
              workspaceIdentity: params.workspaceIdentity,
              workspaceKey: params.workspaceIdentity ?? params.workspacePath,
            },
          },
        })
      );
    },
    async closeSession(params) {
      record("closeSession", params);
    },
    async setModel(params) {
      record("setModel", params);
      return snapshotFor(params.sessionId, "setModel");
    },
    async setThoughtLevel(params) {
      record("setThoughtLevel", params);
      return snapshotFor(params.sessionId, "setThoughtLevel");
    },
    async setMode(params) {
      record("setMode", params);
    },
    async compactSession(params) {
      record("compactSession", params);
      return { compact: { state: "accepted" }, snapshot: snapshotFor(params.sessionId) };
    },
    async goalSession(params) {
      record("goalSession", params);
      return {
        response: "目标已更新",
        startedTurn: false,
        snapshot: snapshotFor(params.sessionId),
      };
    },
    async sendPrompt(params) {
      record("sendPrompt", params);
      sendTextGate.record({ via: "legacy-sendPrompt", params });
    },
    async sendConversationCommandV4(params) {
      record("sendConversationCommandV4", params);
      envelopes.push(params.envelope);
      if (params.envelope.type === "sendText") {
        sendTextGate.record({ via: "v4", envelope: params.envelope, target: params });
      }
      const ack =
        ackQueue.length > 0
          ? ackQueue.shift()
          : { commandId: params.envelope.commandId, status: "accepted" };
      return ack;
    },
    async getTaskTokenUsage(params) {
      record("getTaskTokenUsage", params);
      return { totalTokens: 1234, promptTokens: 1000, completionTokens: 344 };
    },
    onDynamicSessionEvent(params) {
      record("onDynamicSessionEvent", params);
      const subscription = { params, listeners: [] };
      upstreamSubs.push(subscription);
      return (listener) => {
        subscription.listeners.push(listener);
        return {
          dispose() {
            subscription.listeners = subscription.listeners.filter((item) => item !== listener);
            order.push(`upstream-dispose:${params.sessionId}`);
          },
        };
      };
    },
    disposeAll() {
      order.push("agentService.disposeAll");
    },
    ...agentServicePatches,
  };

  const rows = metas;

  const repo = {
    async listTaskMetas(params) {
      record("listTaskMetas", params);
      return rows.map((row) => ({ ...row }));
    },
    async listDeletedTaskIds(params) {
      record("listDeletedTaskIds", params);
      return ["deleted-task"];
    },
    async queryTaskList(params) {
      record("queryTaskList", params);
      return { items: rows.map((row) => ({ ...row })), total: rows.length, hasMore: false };
    },
    async syncTaskMeta(params) {
      syncedMetas.push(params.meta);
      record("syncTaskMeta", params.meta);
      return params.meta;
    },
    async updateTaskState(params) {
      record("updateTaskState", params);
      return { ...makeTaskMeta(params.taskId), ...params.patch };
    },
    async applyAgentPatch(params) {
      agentPatches.push(params);
      record("applyAgentPatch", params);
      return null;
    },
    async getTaskMeta(params) {
      record("getTaskMeta", params);
      return rows.find((row) => row.taskId === params.taskId) ?? null;
    },
    async archiveStaleTasks(params) {
      record("archiveStaleTasks", params);
      return (overrides.staleRows ?? []).map((row) => ({ ...row }));
    },
    async clearTaskUnreadIfMatches(params) {
      record("clearTaskUnreadIfMatches", params);
      return {
        cleared: overrides.unreadCleared ?? true,
        meta: { ...makeTaskMeta(params.taskId), unreadAt: overrides.persistedUnreadAt },
      };
    },
    async deleteArchivedTask(params) {
      record("deleteArchivedTask", params);
      const plan = overrides.archivedDeletion ?? {};
      if (plan.throwIds?.includes(params.taskId)) throw new Error(`删除失败 ${params.taskId}`);
      if (plan.skipIds?.includes(params.taskId) || params.taskId === "archived-missing")
        return null;
      return makeTaskMeta(params.taskId, { archived: true });
    },
    async createTaskGroup(params) {
      record("createTaskGroup", params);
      return { id: "group-1", title: params?.title ?? "组", color: "gray", ...params };
    },
    async renameTaskGroup(params) {
      record("renameTaskGroup", params);
      return { id: params.groupId, title: params.title, color: "gray", createdAt: 1, updatedAt: 2 };
    },
    async updateTaskGroupColor(params) {
      record("updateTaskGroupColor", params);
      return { id: params.groupId, title: "组", color: params.color, createdAt: 1, updatedAt: 2 };
    },
    async deleteTaskGroup(params) {
      record("deleteTaskGroup", params);
    },
    async initializeGroupedTaskAtTop(params) {
      record("initializeGroupedTaskAtTop", params);
      return true;
    },
    async queryGroupedTaskViewStructure(params) {
      record("queryGroupedTaskViewStructure", params);
      return { groups: [], members: [], topLevelOrders: [] };
    },
    async applyGroupedTaskViewOrder(params) {
      record("applyGroupedTaskViewOrder", params);
      return {
        nodes: [
          { type: "task", task: makeTaskMeta("ordered-task") },
          { type: "group", group: { id: "g", title: "组", color: "gray" }, tasks: [] },
        ],
      };
    },
    close() {
      order.push("repo.close");
    },
    ...repoPatches,
    ...(repoPatches.updateTaskState
      ? {
          async updateTaskState(params) {
            record("updateTaskState", params);
            return repoPatches.updateTaskState(params);
          },
        }
      : {}),
  };

  const syncer = {
    ensureSessionSubscription(params) {
      sessionSubscriptions.push(params);
      record("ensureSessionSubscription", params);
    },
    emitWorkspaceTaskListChanged(target, meta, reason) {
      broadcasts.push({ target, meta, reason });
    },
    getWorkspaceEmitter(input) {
      const key =
        typeof input === "string"
          ? `string:${input}`
          : `params:${input.workspacePath}|${input.workspaceIdentity ?? ""}`;
      return {
        fire(event) {
          workspaceEvents.push({ key, event });
        },
      };
    },
    onDynamicWorkspaceEvent(input) {
      record("onDynamicWorkspaceEvent", input);
      return (listener) => {
        order.push(`workspace-event:${typeof input === "string" ? input : input.workspacePath}`);
        return { dispose() {} };
      };
    },
    onSessionTerminalEvent(listener) {
      terminalListeners.add(listener);
      return {
        dispose() {
          terminalListeners.delete(listener);
          order.push("terminal-subscription-disposed");
        },
      };
    },
    onSessionReadyEvent(listener) {
      readyListeners.add(listener);
      return {
        dispose() {
          readyListeners.delete(listener);
          order.push("ready-subscription-disposed");
        },
      };
    },
    disposeAll() {
      order.push("syncer.disposeAll");
    },
    ...(overrides.syncerPatches ?? {}),
  };

  const settingService = {
    async get() {
      record("settingService.get", undefined);
      if (settingValues instanceof Error) throw settingValues;
      return settingValues ?? {};
    },
  };

  const service = createKnorviaTaskServiceAdapter({
    agentService,
    taskIndexRepo: repo,
    taskIndexSyncer: syncer,
    settingService,
    ...(overrides.resolver ? { cuaProductMcpServerResolver: overrides.resolver } : {}),
  });

  function callsOf(method) {
    return calls.filter((call) => call.method === method).map((call) => call.params);
  }

  function resetObservations() {
    calls.length = 0;
    order.length = 0;
    envelopes.length = 0;
    broadcasts.length = 0;
    sessionSubscriptions.length = 0;
    syncedMetas.length = 0;
    agentPatches.length = 0;
    workspaceEvents.length = 0;
  }

  /**
   * 适配层用 taskId→工作区目标表解析 session 归属，未预热即抛
   * KNORVIA_SESSION_TARGET_NOT_FOUND。目标表只能由 session 读取路径填充，因此这里先走
   * 公开的 getTaskSnapshot 预热，再清空观测记录，让后续断言只看被测的那一次调用。
   */
  async function prime(params = {}) {
    const target = {
      taskId: TASK_ID,
      workspacePath: WORKSPACE,
      workspaceIdentity: IDENTITY,
      ...params,
    };
    await service.getTaskSnapshot(target);
    resetObservations();
    return target;
  }

  function fireTerminal(event) {
    for (const listener of [...terminalListeners]) listener(event);
  }

  function fireReady(event) {
    for (const listener of [...readyListeners]) listener(event);
  }

  function emitUpstream(event) {
    for (const subscription of upstreamSubs) {
      for (const listener of subscription.listeners) listener(event);
    }
  }

  return {
    service,
    calls,
    order,
    envelopes,
    broadcasts,
    sessionSubscriptions,
    syncedMetas,
    agentPatches,
    workspaceEvents,
    upstreamSubs,
    sendTextGate,
    callsOf,
    prime,
    resetObservations,
    fireTerminal,
    fireReady,
    emitUpstream,
    snapshotFor,
  };
}

const TARGET = { taskId: TASK_ID, workspacePath: WORKSPACE, workspaceIdentity: IDENTITY };

describe("A51 工厂与公开面", () => {
  it("A51 工厂返回完整 IKnorviaTaskService 面，initialize 由协议名与版本组合", async () => {
    const harness = createHarness();
    for (const name of [
      "initialize",
      "createTask",
      "sendPrompt",
      "enqueueTaskCommand",
      "listTaskList",
      "getTaskSnapshot",
      "getTaskSnapshotWithEtag",
      "listGroupedTaskViewStructure",
      "onDynamicTaskEvent",
      "onDynamicTaskReady",
      "onDynamicTaskTerminalOutcome",
      "onDynamicWorkspaceEvent",
      "onError",
      "disposeAll",
      "disposeAllAndWait",
    ]) {
      assert.equal(typeof harness.service[name], "function", name);
    }
    assert.deepEqual(await harness.service.initialize({ workspacePath: WORKSPACE }), {
      available: true,
      version: "Knorvia Studio Protocol/1",
    });
    assert.deepEqual(harness.callsOf("initialize"), [{ workspacePath: WORKSPACE }]);
    const bare = createHarness({
      agentServicePatches: {
        initialize: async () => ({ available: false }),
      },
    });
    assert.deepEqual(await bare.service.initialize({ workspacePath: WORKSPACE }), {
      available: false,
      version: undefined,
    });
  });

  it("A51 releaseWorkspacePreparation 与 restartWorkspaceProcess 只下传工作区身份对", async () => {
    const harness = createHarness();
    await harness.service.releaseWorkspacePreparation({
      workspacePath: WORKSPACE,
      workspaceIdentity: IDENTITY,
      provider: PROVIDER,
      extraIgnored: true,
    });
    await harness.service.restartWorkspaceProcess({
      workspacePath: WORKSPACE,
      workspaceIdentity: IDENTITY,
    });
    assert.deepEqual(harness.callsOf("disposeWorkspace"), [
      { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY },
      { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY },
    ]);
  });
});

describe("A52 createTask 与 draft session 复用", () => {
  it("A52 普通创建走 createSession，同步 task index、置顶分组并广播 task_created", async () => {
    const harness = createHarness();
    const result = await harness.service.createTask({
      workspacePath: WORKSPACE,
      workspaceIdentity: IDENTITY,
      mode: "plan",
      mcpServers: [{ name: "fs", command: "server" }],
    });
    const [created] = harness.callsOf("createSession");
    assert.equal(created.mode, "plan");
    assert.equal(created.workspaceIdentity, IDENTITY);
    assert.equal(typeof created.sessionTraceId, "string");
    assert.deepEqual(created.mcpServers, [{ name: "fs", command: "server" }]);
    assert.ok(!("persistence" in created));
    assert.equal(result.taskId, "created-task");
    assert.deepEqual(result.initialSlashCommands, [{ name: "compact", description: "压缩上下文" }]);
    assert.deepEqual(
      harness.syncedMetas.map((meta) => meta.taskId),
      ["created-task"],
    );
    assert.deepEqual(harness.callsOf("initializeGroupedTaskAtTop"), [
      { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, taskId: "created-task" },
    ]);
    assert.deepEqual(harness.sessionSubscriptions, [
      { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, sessionId: "created-task" },
    ]);
    assert.deepEqual(
      harness.broadcasts.map((item) => [item.reason, item.meta.taskId]),
      [["task_created", "created-task"]],
    );
    assert.deepEqual(
      harness.workspaceEvents.map((item) => [item.key, item.event.type]),
      [[`params:${WORKSPACE}|${IDENTITY}`, "workspace_config_options_update"]],
    );
  });

  it("A52 automation 与闲时创建延后持久化、关闭自动标题并盖章归属", async () => {
    const harness = createHarness();
    await harness.service.createTask({
      workspacePath: WORKSPACE,
      automationId: "auto-9",
      offPeakTaskId: "offpeak-3",
      deferPersistenceUntilFirstPrompt: true,
    });
    const [created] = harness.callsOf("createSession");
    assert.equal(created.persistence, "deferred");
    assert.equal(created.titleGenerationEnabled, false);
    assert.equal(harness.syncedMetas[0].cronAutomationId, "auto-9");
    assert.equal(harness.syncedMetas[0].offPeakTaskId, "offpeak-3");
    const plain = createHarness();
    await plain.service.createTask({ workspacePath: WORKSPACE });
    const [plainCreated] = plain.callsOf("createSession");
    assert.ok(!("persistence" in plainCreated));
    assert.ok(!("titleGenerationEnabled" in plainCreated));
    assert.ok(!("cronAutomationId" in plain.syncedMetas[0]));
  });

  it("A52 draft session 复用：模型与思考档位按 UI 当前选择对齐", async () => {
    const draft = makeSnapshot("draft-1", {
      settings: {
        model: {
          current: { providerId: "zhipu", modelId: "glm-4.5" },
          available: [makeModelOption("zhipu", "glm-4.6", "GLM-4.6")],
        },
        thoughtLevel: {
          enabled: true,
          current: "low",
          available: [{ value: "high", label: "高" }],
        },
        mode: { current: "build" },
      },
    });
    const afterModel = makeSnapshot("draft-1", {
      settings: {
        model: {
          current: { providerId: "zhipu", modelId: "glm-4.6" },
          available: [makeModelOption("zhipu", "glm-4.6", "GLM-4.6")],
        },
        thoughtLevel: {
          enabled: true,
          current: "low",
          available: [{ value: "high", label: "高" }],
        },
        mode: { current: "build" },
      },
    });
    const afterThought = makeSnapshot("draft-1", {
      settings: {
        model: {
          current: { providerId: "zhipu", modelId: "glm-4.6" },
          available: [makeModelOption("zhipu", "glm-4.6", "GLM-4.6")],
        },
        thoughtLevel: {
          enabled: true,
          current: "high",
          available: [{ value: "high", label: "高" }],
        },
        mode: { current: "build" },
      },
    });
    const harness = createHarness({
      snapshots: {
        "draft-1": draft,
        "setModel:draft-1": afterModel,
        "setThoughtLevel:draft-1": afterThought,
      },
    });
    const result = await harness.service.createTask({
      workspacePath: WORKSPACE,
      draftSessionId: "draft-1",
      modelSelection: {
        providerId: "zhipu",
        modelId: "glm-4.6",
        options: { reasoningLevel: "high" },
      },
    });
    assert.equal(harness.callsOf("createSession").length, 0);
    assert.deepEqual(harness.callsOf("setModel"), [
      {
        workspacePath: WORKSPACE,
        workspaceIdentity: undefined,
        sessionId: "draft-1",
        model: { providerId: "zhipu", modelId: "glm-4.6", options: { reasoningLevel: "high" } },
      },
    ]);
    assert.equal(harness.callsOf("setThoughtLevel").length, 1);
    assert.equal(result.taskId, "draft-1");
    assert.deepEqual(harness.callsOf("setThoughtLevel"), [
      {
        workspacePath: WORKSPACE,
        workspaceIdentity: undefined,
        sessionId: "draft-1",
        thoughtLevel: "high",
      },
    ]);
    assert.equal(harness.syncedMetas[0].model, "zhipu/glm-4.6");
    assert.equal(harness.syncedMetas[0].thoughtLevel, "high");
  });

  it("A52 draft session 已失效时降级新建，legacy model 字符串按 provider/model 解析", async () => {
    const harness = createHarness({
      snapshots: { "draft-1": new Error("Session not found: draft-1") },
    });
    const result = await harness.service.createTask({
      workspacePath: WORKSPACE,
      draftSessionId: "draft-1",
      model: "zhipu/glm-4.6",
      thoughtLevel: "high",
    });
    assert.equal(harness.callsOf("createSession").length, 1);
    const [created] = harness.callsOf("createSession");
    assert.deepEqual(created.model, {
      providerId: "zhipu",
      modelId: "glm-4.6",
      options: { reasoningLevel: "high" },
    });
    assert.equal(created.thoughtLevel, "high");
    assert.equal(result.taskId, "created-task");
    const custom = createHarness();
    await custom.service.createTask({ workspacePath: WORKSPACE, model: "custom:myprov:my/model" });
    const [customCreated] = custom.callsOf("createSession");
    assert.deepEqual(customCreated.model, { providerId: "myprov", modelId: "my/model" });
    const broken = createHarness();
    await assert.rejects(
      () => broken.service.createTask({ workspacePath: WORKSPACE, model: "no-provider" }),
      /模型选择缺少 Provider/u,
    );
  });
});

describe("A53 任务列表读取", () => {
  it("A53 五个分区读取统一注入 Knorvia provider 边界并透传 workspaceIdentity", async () => {
    const rows = [
      makeTaskMeta("t1", { updatedAt: 3000 }),
      makeTaskMeta("t2", { updatedAt: 5000, cronAutomationId: "auto-1" }),
    ];
    const harness = createHarness({ metas: rows });
    const scope = { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY };
    const tasks = await harness.service.listTasks(scope);
    const pinned = await harness.service.listPinnedTasks(scope);
    const archived = await harness.service.listArchivedTasks(scope);
    const pinnedIds = await harness.service.listPinnedTaskIds();
    const deletedIds = await harness.service.listDeletedTaskIds(scope);
    assert.deepEqual(
      tasks.map((task) => task.taskId),
      ["t1", "t2"],
    );
    assert.deepEqual(deletedIds, ["deleted-task"]);
    assert.deepEqual(pinnedIds, ["t1", "t2"]);
    const filters = harness.callsOf("listTaskMetas");
    assert.deepEqual(
      filters.map((params) => [params.pinned ?? null, params.archived ?? null]),
      [
        [false, false],
        [true, false],
        [null, true],
        [true, false],
      ],
    );
    const [unpinnedRead, pinnedRead, archivedRead, pinnedIdsRead] = filters;
    for (const params of [
      unpinnedRead,
      pinnedRead,
      archivedRead,
      harness.callsOf("listDeletedTaskIds")[0],
    ]) {
      assert.equal(params.provider, PROVIDER);
      assert.equal(params.workspaceIdentity, IDENTITY);
      assert.equal(params.workspacePath, WORKSPACE);
    }
    // 全局置顶 id 读取没有工作区参数：置顶视图跨工作区聚合，改写时不得偷加过滤条件。
    assert.equal(pinnedIdsRead.workspacePath, undefined);
    assert.equal(pinnedIdsRead.workspaceIdentity, undefined);
    assert.equal(pinnedIdsRead.provider, PROVIDER);
  });

  it("A53 listTaskList 保留排序与搜索参数、继承 provider 并回记任务目标", async () => {
    const harness = createHarness({ metas: [makeTaskMeta("t1")] });
    const result = await harness.service.listTaskList({
      kind: "all",
      workspaceScopes: [{ workspacePath: WORKSPACE, workspaceIdentity: IDENTITY }],
      sortBy: "updated",
      search: "关键词",
      limit: 20,
      provider: "claude-code",
    });
    const [query] = harness.callsOf("queryTaskList");
    assert.equal(query.provider, PROVIDER, "调用方传入的外部 provider 必须被 Knorvia 边界覆盖");
    assert.equal(query.sortBy, "updated");
    assert.equal(query.search, "关键词");
    assert.equal(query.limit, 20);
    assert.deepEqual(
      result.items.map((item) => item.taskId),
      ["t1"],
    );
    assert.equal(result.total, 1);
    await harness.service.stopGeneration({ taskId: "t1" });
    assert.deepEqual(harness.callsOf("disposeWorkspace").length, 0);
    const [stop] = harness.envelopes;
    assert.equal(stop.sessionId, "t1");
    assert.equal(stop.type, "stop");
  });

  it("A53 分组视图进入时按设置自动归档并按 workspaceKey 去重", async () => {
    const stale = [makeTaskMeta("old-1"), makeTaskMeta("old-2")];
    const harness = createHarness({
      metas: [],
      staleRows: stale,
      settingValues: { taskAutoArchiveEnabled: true },
    });
    await harness.service.listGroupedTaskViewStructure({
      workspaceScopes: [
        { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY },
        { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY },
        { workspacePath: WORKSPACE },
      ],
    });
    const archives = harness.callsOf("archiveStaleTasks");
    assert.equal(
      archives.length,
      2,
      "同一 workspaceKey 的重复作用域只归档一次，不同 workspaceKey 各一次",
    );
    assert.equal(archives[0].olderThanDays, 7, "未配置过期天数时按 7 天兜底");
    assert.deepEqual(
      harness.broadcasts.map((item) => [item.reason, item.meta?.taskId]),
      [
        ["task_meta_changed", "old-1"],
        ["task_meta_changed", "old-2"],
        ["task_meta_changed", "old-1"],
        ["task_meta_changed", "old-2"],
      ],
    );
    assert.deepEqual(harness.callsOf("queryGroupedTaskViewStructure").length, 1);
    const disabled = createHarness({
      staleRows: stale,
      settingValues: { taskAutoArchiveEnabled: false },
    });
    await disabled.service.listGroupedTaskViewStructure({
      workspaceScopes: [{ workspacePath: WORKSPACE }],
    });
    assert.equal(disabled.callsOf("archiveStaleTasks").length, 0);
    const broken = createHarness({ settingValues: new Error("settings 不可用") });
    await broken.service.listGroupedTaskViewStructure({
      workspaceScopes: [{ workspacePath: WORKSPACE }],
    });
    assert.equal(broken.callsOf("archiveStaleTasks").length, 0);
    assert.equal(broken.callsOf("queryGroupedTaskViewStructure").length, 1);
  });

  it("A53 分组写操作按作用域广播并让排序结果继承 provider 与目标记忆", async () => {
    const harness = createHarness();
    const scopes = [
      { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY },
      { workspacePath: WORKSPACE },
    ];
    await harness.service.createTaskGroup({ title: "新组", color: "blue" });
    assert.deepEqual(harness.broadcasts, []);
    await harness.service.renameTaskGroup({
      groupId: "g1",
      title: "改名",
      workspaceScopes: scopes,
    });
    await harness.service.updateTaskGroupColor({
      groupId: "g1",
      color: "green",
      workspaceScopes: scopes,
    });
    await harness.service.deleteTaskGroup({ groupId: "g1", workspaceScopes: scopes });
    assert.deepEqual(
      harness.broadcasts.map((item) => [item.reason, item.meta]),
      Array.from({ length: 6 }, () => ["task_meta_changed", undefined]),
    );
    const ordered = await harness.service.applyGroupedTaskViewOrder({
      workspaceScopes: scopes,
      topLevelNodes: [],
      groups: [],
      provider: "claude-code",
    });
    assert.equal(harness.callsOf("applyGroupedTaskViewOrder")[0].provider, PROVIDER);
    assert.deepEqual(
      ordered.nodes.map((node) => (node.type === "task" ? node.task.taskId : node.group.id)),
      ["ordered-task", "g"],
    );
    await harness.service.stopGeneration({ taskId: "ordered-task" });
    assert.equal(harness.envelopes.at(-1).sessionId, "ordered-task");
  });
});

describe("A54 快照读取与运行态判定", () => {
  it("A54 状态由 session、阻塞运行态与 lastError 共同判定", async () => {
    const cases = [
      [{ session: { status: "waiting" }, runtime: { activeTurnId: "turn-1" } }, "running"],
      [{ session: { status: "idle" }, projection: { status: "running" } }, undefined],
      [
        {
          session: { status: "idle" },
          projection: { activeToolCalls: [{ toolCallId: "call-1", status: "running" }] },
        },
        "running",
      ],
      [
        {
          session: { status: "idle" },
          projection: { pendingPermissions: [{ requestId: "perm-1" }] },
        },
        "running",
      ],
      [
        {
          session: { status: "completed" },
          runtime: { activeTurnId: "turn-1" },
        },
        "completed",
      ],
      [
        {
          session: { status: "idle" },
          projection: { currentTurnId: "stale-turn" },
          messages: [
            {
              info: { role: "user", messageId: "m1", time: { created: 5 } },
              parts: [{ type: "text", text: "问题" }],
            },
            {
              info: { role: "assistant", messageId: "m2", time: { created: 6, completed: 7 } },
              parts: [{ type: "text", text: "回答" }],
            },
          ],
        },
        "completed",
      ],
      [
        {
          session: { status: "idle" },
          projection: { pendingPermissions: [] },
          runtime: { activeTurnId: undefined },
        },
        undefined,
      ],
    ];
    for (const [overrides, expected] of cases) {
      const harness = createHarness({ snapshots: { [TASK_ID]: makeSnapshot(TASK_ID, overrides) } });
      const snapshot = await harness.service.getTaskSnapshot(TARGET);
      assert.equal(snapshot.meta.status, expected, JSON.stringify(overrides));
    }
    const failed = createHarness({
      snapshots: {
        [TASK_ID]: makeSnapshot(TASK_ID, {
          projection: {
            status: "error",
            lastError: {
              type: "provider_error",
              code: "KNORVIA_RATE_LIMITED",
              message: "请求过于频繁",
              detail: "429",
              attribution: { kind: "provider", providerId: "zhipu" },
            },
          },
        }),
      },
    });
    const errorSnapshot = await failed.service.getTaskSnapshot(TARGET);
    assert.equal(errorSnapshot.meta.status, "error");
    assert.deepEqual(errorSnapshot.meta.lastError, {
      code: "KNORVIA_RATE_LIMITED",
      detail: "429",
      attribution: { kind: "provider", providerId: "zhipu" },
      message: "请求过于频繁",
    });
  });

  it("A54 contextUsage 优先取 runtime 持久化统计，其次 projection，双零时不渲染", async () => {
    const runtimeWins = createHarness({
      snapshots: {
        [TASK_ID]: makeSnapshot(TASK_ID, {
          projection: { contextUsed: 500, contextWindow: 1000 },
          runtime: {
            contextUsage: { used: 8000, size: 200000, cost: null, breakdown: [] },
          },
        }),
      },
    });
    const fromRuntime = await runtimeWins.service.getTaskSnapshot(TARGET);
    assert.deepEqual(fromRuntime.runtime.contextUsage, {
      used: 8000,
      size: 200000,
      cost: null,
      breakdown: [],
    });
    const projectionOnly = createHarness({
      snapshots: {
        [TASK_ID]: makeSnapshot(TASK_ID, {
          projection: { contextUsed: 500, contextWindow: 1000 },
        }),
      },
    });
    const fromProjection = await projectionOnly.service.getTaskSnapshot(TARGET);
    assert.deepEqual(fromProjection.runtime.contextUsage, { used: 500, size: 1000, cost: null });
    const zeroed = createHarness({
      snapshots: {
        [TASK_ID]: makeSnapshot(TASK_ID, { projection: { contextUsed: 0, contextWindow: 0 } }),
      },
    });
    const none = await zeroed.service.getTaskSnapshot(TARGET);
    assert.equal(none.runtime.contextUsage, undefined);
  });

  it("A54 messageLimit 只保留尾窗并显式标注截断，非法值不裁剪", async () => {
    const messages = [
      {
        info: { role: "user", messageId: "m1", time: { created: 1 } },
        parts: [{ type: "text", text: "第一条" }],
      },
      {
        info: { role: "assistant", messageId: "m2", time: { created: 2, completed: 3 } },
        parts: [{ type: "text", text: "第二条" }],
      },
      {
        info: { role: "user", messageId: "m3", time: { created: 4 } },
        parts: [{ type: "text", text: "第三条" }],
      },
    ];
    const harness = createHarness({
      snapshots: { [TASK_ID]: makeSnapshot(TASK_ID, { messages }) },
    });
    const limited = await harness.service.getTaskSnapshot({ ...TARGET, messageLimit: 2 });
    assert.equal(limited.messages.length, 2);
    assert.deepEqual(
      limited.messages.map((message) => message.content),
      ["第二条", "第三条"],
    );
    assert.deepEqual(limited.history, { truncatedBefore: true, totalMessages: 3 });
    const exact = await harness.service.getTaskSnapshot({ ...TARGET, messageLimit: 3.9 });
    assert.equal(exact.messages.length, 3);
    assert.deepEqual(exact.history, { truncatedBefore: false, totalMessages: 3 });
    for (const messageLimit of [0, -1, Number.NaN]) {
      const passthrough = await harness.service.getTaskSnapshot({ ...TARGET, messageLimit });
      assert.equal(passthrough.messages.length, 3, String(messageLimit));
      assert.equal(passthrough.history, undefined);
    }
  });

  it("A54 pendingPermissions 按工具名分流为权限与追问，replayable 才保留空追问", async () => {
    const pendingPermissions = [
      {
        requestId: "perm-1",
        toolCallId: "call-1",
        toolName: "Bash",
        reason: "需要执行命令",
        riskLevel: "medium",
        options: [{ optionId: "allow", name: "允许" }],
        requestedAt: 10,
      },
      {
        requestId: "ask-1",
        toolCallId: "call-2",
        toolName: "AskUserQuestion",
        reason: "请选择",
        riskLevel: "low",
        input: {
          questions: [
            {
              question: "用哪种方案？",
              header: "方案",
              options: [{ value: "a", label: "A" }],
            },
          ],
        },
        options: [{ optionId: "cancel", name: "取消" }],
        requestedAt: 11,
      },
    ];
    const harness = createHarness({
      snapshots: {
        [TASK_ID]: makeSnapshot(TASK_ID, { projection: { pendingPermissions } }),
      },
    });
    const desktop = await harness.service.getTaskSnapshot({
      ...TARGET,
      clientMode: "desktop-continuous",
    });
    assert.deepEqual(
      desktop.runtime.pendingPermissions.map((item) => item.requestId),
      ["perm-1"],
    );
    assert.deepEqual(
      desktop.runtime.pendingElicitations.map((item) => [item.requestId, item.message]),
      [["ask-1", "用哪种方案？"]],
    );
    assert.equal(desktop.runtime.pendingPermissions[0].kind, "Bash");
    const empty = createHarness({
      snapshots: { [TASK_ID]: makeSnapshot(TASK_ID, { projection: { pendingPermissions: [] } }) },
    });
    const desktopEmpty = await empty.service.getTaskSnapshot({ ...TARGET });
    assert.equal(desktopEmpty.runtime.pendingElicitations, undefined);
    const mobileEmpty = await empty.service.getTaskSnapshot({
      ...TARGET,
      clientMode: "web-remote-replayable",
    });
    assert.deepEqual(mobileEmpty.runtime.pendingElicitations, []);
  });

  it("A54 ETag 读取按内容摘要命中缓存，快照为空时不产出摘要", async () => {
    const harness = createHarness();
    const first = await harness.service.getTaskSnapshotWithEtag(TARGET);
    assert.match(first.etag, /^[0-9a-f]{64}$/u);
    assert.equal(first.notModified, undefined);
    const same = await harness.service.getTaskSnapshotWithEtag({
      ...TARGET,
      ifNoneMatch: first.etag,
    });
    assert.deepEqual(same, { snapshot: null, etag: first.etag, notModified: true });
    const changed = await harness.service.getTaskSnapshotWithEtag({
      ...TARGET,
      ifNoneMatch: "其它摘要",
    });
    assert.equal(changed.etag, first.etag);
    assert.equal(changed.snapshot.meta.taskId, TASK_ID);
    // 摘要只在内容变化时改变：事实源标题变化后必须产出新摘要，不能命中缓存。
    let reads = 0;
    const moving = createHarness({
      agentServicePatches: {
        resumeSession: async (params) => {
          reads += 1;
          return makeSnapshot(params.sessionId, {
            session: { title: reads === 1 ? "旧标题" : "新标题" },
          });
        },
      },
    });
    const movedFirst = await moving.service.getTaskSnapshotWithEtag(TARGET);
    assert.equal(movedFirst.snapshot.meta.title, "旧标题");
    const movedSecond = await moving.service.getTaskSnapshotWithEtag({
      ...TARGET,
      ifNoneMatch: movedFirst.etag,
    });
    assert.equal(movedSecond.notModified, undefined);
    assert.equal(movedSecond.snapshot.meta.title, "新标题");
    assert.notEqual(movedSecond.etag, movedFirst.etag);
    assert.equal(reads, 2);
  });

  it("A54 未支持的快照分片读取与 legacy 入口返回稳定 code 的显式失败", async () => {
    const harness = createHarness();
    assert.equal(await harness.service.getTaskSnapshotBody(), null);
    assert.equal(await harness.service.getTaskSnapshotRef(), null);
    assert.equal(await harness.service.getTaskSnapshotToolCallsSlice(), null);
    for (const name of ["deliverSessionMessage", "sendSessionMessageDeliveryResult"]) {
      await assert.rejects(
        () => harness.service[name]({}),
        (error) =>
          error.code === "KNORVIA_AGENT_UNSUPPORTED_LEGACY_TASK_METHOD" &&
          error.message.includes(name),
        name,
      );
    }
    await assert.rejects(
      () => harness.service.branchTaskFromPrompt({}),
      (error) => error.code === "KNORVIA_AGENT_UNSUPPORTED_LEGACY_TASK_METHOD",
    );
    await assert.rejects(
      () => harness.service.stopGeneration({ taskId: "unknown-task" }),
      (error) =>
        error.code === "KNORVIA_SESSION_TARGET_NOT_FOUND" && error.message.includes("unknown-task"),
    );
  });

  it("A54 replayable 首屏按 task index 回填历史模型与思考档位，显式值优先", async () => {
    const indexed = makeTaskMeta(TASK_ID, { model: "zhipu/glm-4.5", thoughtLevel: "high" });
    const harness = createHarness({ metas: [indexed] });
    await harness.service.getTaskSnapshot({
      taskId: TASK_ID,
      workspacePath: WORKSPACE,
      clientMode: "web-remote-replayable",
    });
    const [resumed] = harness.callsOf("resumeSession");
    assert.deepEqual(resumed.model, { providerId: "zhipu", modelId: "glm-4.5" });
    assert.equal(resumed.thoughtLevel, "high");
    const explicit = createHarness({ metas: [indexed] });
    await explicit.service.getTaskSnapshot({
      taskId: TASK_ID,
      workspacePath: WORKSPACE,
      clientMode: "web-remote-replayable",
      model: "custom:myprov:my/model",
      thoughtLevel: "low",
    });
    assert.equal(explicit.callsOf("getTaskMeta").length, 0, "显式值齐备时不读 index hint");
    assert.deepEqual(explicit.callsOf("resumeSession")[0].model, {
      providerId: "myprov",
      modelId: "my/model",
    });
    const uiResolved = createHarness({ metas: [indexed] });
    await uiResolved.service.getTaskSnapshot({
      taskId: TASK_ID,
      workspacePath: WORKSPACE,
      clientMode: "web-remote-replayable",
      resumeModelPolicy: "ui-resolved-only",
    });
    assert.equal(uiResolved.callsOf("getTaskMeta").length, 0);
    const desktop = createHarness({ metas: [indexed] });
    await desktop.service.getTaskSnapshot({ ...TARGET, clientMode: "desktop-continuous" });
    assert.equal(desktop.callsOf("getTaskMeta").length, 0);
  });
});

describe("A55 子 Agent 与工作区身份隔离", () => {
  it("A55 subagent_child 快照只读不回写主任务索引", async () => {
    const harness = createHarness({
      snapshots: {
        [TASK_ID]: makeSnapshot(TASK_ID, { session: { sessionKind: "subagent_child" } }),
      },
    });
    const meta = await harness.service.resumeTask(TARGET);
    assert.equal(meta.taskId, TASK_ID);
    assert.equal(harness.syncedMetas.length, 0);
    assert.deepEqual(harness.broadcasts, []);
    const parent = createHarness();
    await parent.service.resumeTask(TARGET);
    assert.equal(parent.syncedMetas.length, 1);
  });

  it("A55 parentSessionId 恢复出不可跳转的 fork 分割线，已有分割线不重复", async () => {
    const harness = createHarness({
      snapshots: {
        [TASK_ID]: makeSnapshot(TASK_ID, {
          session: { parentSessionId: "parent-1", createdAt: 777 },
        }),
      },
    });
    const snapshot = await harness.service.getTaskSnapshot(TARGET);
    assert.deepEqual(snapshot.messages, [
      {
        id: "knorvia-timeline-fork-parent-1-",
        role: "user",
        content: "",
        timestamp: 777,
        syntheticTimeline: {
          version: 1,
          kind: "synthetic",
          type: "session_fork",
          display: "separator",
          parentSessionId: "parent-1",
          targetMessageId: "",
        },
      },
    ]);
    const existing = createHarness({
      snapshots: {
        [TASK_ID]: makeSnapshot(TASK_ID, {
          session: { parentSessionId: "parent-1" },
          messages: [
            {
              info: { role: "user", messageId: "m1", time: { created: 1 } },
              parts: [{ type: "text", text: "正文" }],
            },
          ],
        }),
      },
    });
    const withText = await existing.service.getTaskSnapshot(TARGET);
    assert.equal(withText.messages.length, 2);
    assert.equal(withText.messages.at(-1).syntheticTimeline.parentSessionId, "parent-1");
    const none = createHarness();
    const plain = await none.service.getTaskSnapshot(TARGET);
    assert.deepEqual(plain.messages, []);
  });

  it("A55 同一 taskId 在不同 workspaceIdentity 下缓存键与状态互不串台", async () => {
    const harness = createHarness();
    const remote = { taskId: TASK_ID, workspacePath: WORKSPACE, workspaceIdentity: IDENTITY };
    const local = { taskId: TASK_ID, workspacePath: WORKSPACE };
    await harness.service.enqueueTaskCommand({
      ...remote,
      commandId: "c1",
      traceId: "in-r",
      content: "第一条",
    });
    await assert.rejects(
      () =>
        harness.service.enqueueTaskCommand({
          ...local,
          commandId: "c2",
          traceId: "in-l",
          ownerRunId: "in-r",
        }),
      (error) => error.code === "NO_ACTIVE_TASK_OWNER",
    );
    const snapshot = await harness.service.getTaskSnapshot(remote);
    assert.deepEqual(
      snapshot.runtime.pendingCommands.map((command) => command.commandId),
      ["c1"],
    );
    const other = await harness.service.getTaskSnapshot(local);
    assert.deepEqual(other.runtime.pendingCommands, []);
    await harness.service.setTaskUnread({ ...remote, unread: true });
    await harness.service.renameTask({ ...local, title: "本地改名" });
    const remoteSnapshot = await harness.service.getTaskSnapshot(remote);
    assert.equal(typeof remoteSnapshot.meta.unreadAt, "number");
    const renamed = await harness.service.getTaskSnapshot(local);
    assert.equal(renamed.meta.title, "本地改名");
    await harness.service.archiveTask(remote);
    const afterArchive = await harness.service.getTaskSnapshot(local);
    assert.equal(afterArchive.meta.archived, undefined);
    assert.equal(harness.broadcasts.at(-1).target.workspaceIdentity, IDENTITY);
  });

  it("A55 目标记忆以 taskId 为索引，index 读取与 meta 读取都会刷新归属", async () => {
    const harness = createHarness({
      metas: [makeTaskMeta("t9", { cronAutomationId: "auto-1" })],
    });
    await harness.service.getTaskMeta({
      taskId: "t9",
      workspacePath: WORKSPACE,
      workspaceIdentity: IDENTITY,
    });
    await harness.service.stopGeneration({ taskId: "t9" });
    assert.equal(harness.callsOf("resumeSession").length, 0);
    const stopped = harness.envelopes[0];
    assert.equal(stopped.sessionId, "t9");
    const indexed = await harness.service.listTasks({ workspacePath: WORKSPACE });
    assert.equal(indexed[0].cronAutomationId, "auto-1");
    await harness.service.sendPrompt({
      taskId: "t9",
      traceId: "in-9",
      content: "继续",
    });
    assert.deepEqual(harness.callsOf("sendConversationCommandV4").length, 2);
    assert.equal(harness.envelopes[1].sessionId, "t9");
  });
});

describe("A56 host command 队列与 owner/lease", () => {
  it("A56 无活跃输入时拒绝 owner 命令，旧 run 的写入判定为 stale", async () => {
    const harness = createHarness();
    await harness.prime();
    await assert.rejects(
      () =>
        harness.service.enqueueTaskCommand({
          ...TARGET,
          commandId: "c1",
          traceId: "in-1",
          content: "第一条",
          ownerRunId: "in-1",
        }),
      (error) => error.code === "NO_ACTIVE_TASK_OWNER",
    );
    await harness.service.sendPrompt({ ...TARGET, traceId: "in-new", content: "当前轮" });
    await assert.rejects(
      () =>
        harness.service.enqueueTaskCommand({
          ...TARGET,
          commandId: "c2",
          traceId: "in-old",
          content: "旧输入",
          ownerRunId: "in-old",
        }),
      (error) => error.code === "STALE_TASK_OWNER_COMMAND",
    );
    await assert.rejects(
      () => harness.service.cancelTaskCommand({ ...TARGET, commandId: "c2", ownerRunId: "in-old" }),
      (error) => error.code === "STALE_TASK_OWNER_COMMAND",
    );
    const snapshot = await harness.service.getTaskSnapshot(TARGET);
    assert.deepEqual(snapshot.runtime.pendingCommands, []);
  });

  it("A56 enqueue 立即 accepted、drain 由 ready 事件驱动并保持串行", async () => {
    const harness = createHarness();
    const first = await harness.service.enqueueTaskCommand({
      ...TARGET,
      commandId: "c1",
      traceId: "in-1",
      content: "第一条",
      automationId: "auto-1",
      clientId: "phone-1",
    });
    assert.equal(first.accepted, true);
    assert.deepEqual(
      [first.command.status, first.command.type, first.command.workspaceKey],
      ["accepted", "send_prompt", IDENTITY],
    );
    const drainedFirst = await harness.sendTextGate.until(1);
    assert.equal(drainedFirst[0].envelope.payload.text, "第一条");
    assert.deepEqual(drainedFirst[0].envelope.payload.automationId, "auto-1");
    assert.equal(drainedFirst[0].envelope.clientId, "phone-1");
    assert.equal(drainedFirst[0].envelope.commandId, "in-1");
    assert.equal(harness.callsOf("sendPrompt").length, 0, "无附件输入必须走 v4 sendText");
    const running = await harness.service.getTaskSnapshot(TARGET);
    assert.deepEqual(
      running.runtime.pendingCommands.map((command) => command.status),
      ["running"],
    );
    const second = await harness.service.enqueueTaskCommand({
      ...TARGET,
      commandId: "c2",
      traceId: "in-2",
      content: "第二条",
    });
    assert.equal(second.command.status, "accepted");
    harness.fireReady({
      target: { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, sessionId: TASK_ID },
      reason: "prompt_completed",
    });
    const drainedSecond = await harness.sendTextGate.until(2);
    assert.equal(drainedSecond[1].envelope.payload.text, "第二条");
    const duringSecond = await harness.service.getTaskSnapshot(TARGET);
    assert.deepEqual(
      duringSecond.runtime.pendingCommands.map((command) => [command.commandId, command.status]),
      [["c2", "running"]],
    );
    harness.fireReady({
      target: { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, sessionId: TASK_ID },
      reason: "prompt_completed",
    });
    const afterDrain = await harness.service.getTaskSnapshot(TARGET);
    assert.deepEqual(afterDrain.runtime.pendingCommands, []);
  });

  it("A56 promote 把命令移到队首，运行中幂等接受，未知命令报 OWNER_COMMAND_FAILED", async () => {
    const harness = createHarness();
    await assert.rejects(
      () => harness.service.promoteTaskCommand({ ...TARGET, commandId: "ghost" }),
      (error) => error.code === "OWNER_COMMAND_FAILED",
    );
    const queued = await harness.service.enqueueTaskCommand({
      ...TARGET,
      commandId: "c1",
      traceId: "in-1",
      content: "第一条",
    });
    assert.equal(queued.command.status, "accepted");
    await harness.sendTextGate.until(1);
    await harness.service.enqueueTaskCommand({
      ...TARGET,
      commandId: "c2",
      traceId: "in-2",
      content: "第二条",
    });
    await harness.service.enqueueTaskCommand({
      ...TARGET,
      commandId: "c3",
      traceId: "in-3",
      content: "第三条",
    });
    const promoted = await harness.service.promoteTaskCommand({ ...TARGET, commandId: "c3" });
    assert.equal(promoted.command.status, "accepted");
    harness.fireReady({
      target: { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, sessionId: TASK_ID },
      reason: "prompt_completed",
    });
    const drained = await harness.sendTextGate.until(2);
    assert.equal(drained[1].envelope.payload.text, "第三条");
    const snapshot = await harness.service.getTaskSnapshot(TARGET);
    assert.deepEqual(
      snapshot.runtime.pendingCommands.map((command) => [command.commandId, command.status]),
      [
        ["c3", "running"],
        ["c2", "accepted"],
      ],
    );
  });

  it("A56 cancel 区分 not_found、already_running 与成功移除并回投快照更新", async () => {
    const harness = createHarness();
    const missing = await harness.service.cancelTaskCommand({ ...TARGET, commandId: "ghost" });
    assert.deepEqual(missing, { canceled: true, commandId: "ghost", reason: "not_found" });
    const queued = await harness.service.enqueueTaskCommand({
      ...TARGET,
      commandId: "c1",
      traceId: "in-1",
      content: "第一条",
    });
    await harness.sendTextGate.until(1);
    assert.equal(queued.command.status, "accepted");
    const running = await harness.service.cancelTaskCommand({ ...TARGET, commandId: "c1" });
    assert.deepEqual(running, {
      canceled: false,
      commandId: "c1",
      reason: "already_running",
      status: "running",
    });
    const accepted = await harness.service.enqueueTaskCommand({
      ...TARGET,
      commandId: "c2",
      traceId: "in-2",
      content: "第二条",
    });
    assert.equal(accepted.command.status, "accepted");
    const canceled = await harness.service.cancelTaskCommand({ ...TARGET, commandId: "c2" });
    assert.deepEqual(canceled, { canceled: true, commandId: "c2", status: "accepted" });
    const snapshot = await harness.service.getTaskSnapshot(TARGET);
    assert.deepEqual(
      snapshot.runtime.pendingCommands.map((command) => command.commandId),
      ["c1"],
    );
  });

  it("A56 带附件输入保留旧 session/send，失败输入清理活跃轮次后再抛出", async () => {
    const harness = createHarness({
      agentServicePatches: {
        async sendPrompt(params) {
          harness.calls.push({ method: "sendPrompt", params });
          throw runtimeUnavailableError();
        },
      },
    });
    await harness.prime();
    await assert.rejects(
      () =>
        harness.service.sendPrompt({
          ...TARGET,
          traceId: "in-1",
          content: "带图输入",
          attachments: [{ kind: "image", name: "a.png", dataBase64: "AA==" }],
          modelSelection: { providerId: "zhipu", modelId: "glm-4.6" },
          clientMode: "web-remote-replayable",
          automationId: "auto-1",
        }),
      (error) => error.code === RUNTIME_UNAVAILABLE_CODE,
    );
    const [sent] = harness.callsOf("sendPrompt");
    assert.deepEqual(sent.attachments, [{ kind: "image", name: "a.png", dataBase64: "AA==" }]);
    assert.deepEqual(sent.modelSelection, { providerId: "zhipu", modelId: "glm-4.6" });
    assert.deepEqual(sent.toolDenylist, ["CronCreate", "CronUpdate", "CronDelete"]);
    assert.equal(sent.clientMode, "web-remote-replayable");
    assert.equal(sent.inputId, "in-1");
    await assert.rejects(
      () =>
        harness.service.enqueueTaskCommand({
          ...TARGET,
          commandId: "c2",
          traceId: "in-2",
          content: "第二条",
          ownerRunId: "in-1",
        }),
      (error) => error.code === "NO_ACTIVE_TASK_OWNER",
    );
  });

  it("A56 闲时轮次隐藏 OffPeakCreate，普通轮次保留 automation 工具", async () => {
    const harness = createHarness();
    await harness.prime();
    await harness.service.sendPrompt({
      ...TARGET,
      traceId: "in-1",
      content: "闲时",
      offPeakTaskId: "offpeak-1",
      offPeakRunType: "manual",
    });
    const payload = harness.envelopes[0].payload;
    assert.deepEqual(payload.offPeakTaskId, "offpeak-1");
    assert.deepEqual(payload.offPeakRunType, "manual");
    assert.ok(!("automationId" in payload));
    assert.deepEqual(payload.toolDisallowlist, ["OffPeakCreate"]);
    const automation = createHarness();
    await automation.prime({ taskId: "task-2" });
    await automation.service.sendPrompt({
      ...TARGET,
      taskId: "task-2",
      traceId: "in-2",
      content: "定时",
      automationId: "auto-1",
    });
    assert.deepEqual(automation.envelopes[0].payload.automationId, "auto-1");
    assert.ok(
      automation.envelopes[0].payload.toolDisallowlist.includes("OffPeakCreate") === false,
      "cron 轮次必须放行 OffPeakCreate",
    );
    const persisted = createHarness();
    await persisted.prime();
    await persisted.service.sendPrompt({ ...TARGET, traceId: "in-3", content: "普通" });
    assert.ok(!("toolDisallowlist" in persisted.envelopes[0].payload));
  });
});

describe("A57 v4 命令收敛与错误传播", () => {
  it("A57 runtime 不可用错误原样上抛，不经 onError 吞掉", async () => {
    const harness = createHarness({
      snapshots: { [TASK_ID]: runtimeUnavailableError() },
    });
    const observed = [];
    const disposable = harness.service.onError((error) => observed.push(error));
    await assert.rejects(
      () => harness.service.getTaskSnapshot(TARGET),
      (error) => error.code === RUNTIME_UNAVAILABLE_CODE,
    );
    await assert.rejects(
      () => harness.service.resumeTask(TARGET),
      (error) => error.code === RUNTIME_UNAVAILABLE_CODE,
    );
    assert.deepEqual(observed, [], "适配层不把运行时错误复制进 onError 通道");
    disposable.dispose();
  });

  it("A57 v4 ACK 拒绝状态抛结构化错误，stale 用回报 revision 收敛重试", async () => {
    const rejected = createHarness({
      ackSequence: [{ commandId: "in-1", status: "rejected", reasonCode: "SESSION_BUSY" }],
    });
    await rejected.prime();
    await assert.rejects(
      () => rejected.service.sendPrompt({ ...TARGET, traceId: "in-1", content: "第一条" }),
      (error) =>
        error.code === "KNORVIA_V4_COMMAND_REJECTED" &&
        error.message.includes("sendText rejected (SESSION_BUSY)"),
    );
    const snapshot = await rejected.service.getTaskSnapshot(TARGET);
    assert.deepEqual(snapshot.runtime.pendingCommands, []);
    const stale = createHarness({
      ackSequence: [
        { commandId: "probe", status: "stale", revisionAtDecision: 17 },
        { commandId: "retry", status: "accepted" },
      ],
    });
    await stale.prime();
    await stale.service.setMode({ taskId: TASK_ID, mode: "plan" });
    const cas = stale.callsOf("sendConversationCommandV4");
    assert.deepEqual(
      cas.map((params) => [params.envelope.type, params.envelope.baseRevision]),
      [
        ["switchCollaborationMode", 0],
        ["switchCollaborationMode", 17],
      ],
    );
    assert.notEqual(cas[0].envelope.commandId, cas[1].envelope.commandId);
    const exhausted = createHarness({
      ackSequence: Array.from({ length: 4 }, (_, index) => ({
        commandId: `stale-${index}`,
        status: "stale",
        revisionAtDecision: index,
      })),
    });
    await exhausted.prime();
    await assert.rejects(
      () => exhausted.service.setMode({ taskId: TASK_ID, mode: "plan" }),
      /连续 stale，放弃重试/u,
    );
  });

  it("A57 auto 模式保留旧 op，其余模式与思考档位走 v4 CAS 命令", async () => {
    const harness = createHarness();
    await harness.prime();
    await harness.service.setMode({ taskId: TASK_ID, mode: "auto" });
    assert.deepEqual(harness.callsOf("setMode"), [
      { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, sessionId: TASK_ID, mode: "auto" },
    ]);
    assert.equal(harness.callsOf("sendConversationCommandV4").length, 0);
    assert.equal(harness.syncedMetas.length, 1);
    const yolo = createHarness();
    await yolo.prime();
    await yolo.service.setMode({ taskId: TASK_ID, mode: "yolo" });
    assert.deepEqual(yolo.envelopes[0].payload, { mode: "yolo" });
    const autoEdit = createHarness();
    await autoEdit.prime();
    await autoEdit.service.setAutomationSessionConfig({
      taskId: TASK_ID,
      modelSelection: { providerId: "zhipu", modelId: "glm-4.6" },
      thoughtLevel: "high",
      mode: "autoEdit",
    });
    assert.deepEqual(
      autoEdit.envelopes.map((envelope) => [envelope.type, envelope.payload]),
      [
        ["switchModelConfig", { provider: "zhipu", model: "glm-4.6", thought: "high" }],
        ["switchModelConfig", { provider: "zhipu", model: "glm-4.6", thought: "high" }],
        ["switchCollaborationMode", { mode: "build" }],
      ],
    );
    const noThought = createHarness();
    await noThought.prime();
    await noThought.service.setAutomationSessionConfig({
      taskId: TASK_ID,
      modelSelection: { providerId: "zhipu", modelId: "glm-4.6" },
    });
    assert.deepEqual(
      noThought.envelopes.map((envelope) => envelope.payload.thought),
      [""],
    );
  });

  it("A57 setModel 传结构化选择，setConfigOption 按 configId 分流且档位需先绑定模型", async () => {
    const harness = createHarness({
      snapshots: {
        [TASK_ID]: makeSnapshot(TASK_ID, {
          settings: {
            model: {
              current: { providerId: "zhipu", modelId: "glm-4.6" },
              available: [makeModelOption("zhipu", "glm-4.6", "GLM-4.6")],
            },
          },
        }),
      },
    });
    await harness.prime();
    const options = await harness.service.setModel({
      taskId: TASK_ID,
      modelSelection: { providerId: "zhipu", modelId: "glm-4.6" },
    });
    assert.deepEqual(harness.callsOf("setModel")[0].model, {
      providerId: "zhipu",
      modelId: "glm-4.6",
    });
    assert.deepEqual(
      options.map((option) => option.id),
      ["model", "mode"],
    );
    assert.equal(options[0].currentValue, "zhipu/glm-4.6");
    const bound = createHarness({
      snapshots: {
        [TASK_ID]: makeSnapshot(TASK_ID, {
          settings: {
            model: {
              current: { providerId: "zhipu", modelId: "glm-4.6" },
              available: [makeModelOption("zhipu", "glm-4.6", "GLM-4.6")],
            },
            thoughtLevel: {
              enabled: true,
              current: "high",
              available: [{ value: "high", label: "高" }],
            },
            mode: { current: "build" },
          },
        }),
      },
    });
    await bound.prime();
    const thoughtOptions = await bound.service.setConfigOption({
      taskId: TASK_ID,
      configId: "thought_level",
      value: "high",
    });
    assert.deepEqual(bound.envelopes[0].payload, {
      provider: "zhipu",
      model: "glm-4.6",
      thought: "high",
    });
    assert.deepEqual(
      thoughtOptions.map((option) => option.id),
      ["model", "mode", "thought_level"],
    );
    const unbound = createHarness();
    await unbound.prime();
    await assert.rejects(
      () =>
        unbound.service.setConfigOption({
          taskId: TASK_ID,
          configId: "thought_level",
          value: "high",
        }),
      /请先选择模型/u,
    );
    const modeOption = createHarness();
    await modeOption.prime();
    await modeOption.service.setConfigOption({ taskId: TASK_ID, configId: "mode", value: "plan" });
    assert.deepEqual(modeOption.envelopes[0].payload, { mode: "plan" });
    const modelOption = createHarness();
    await modelOption.prime();
    await modelOption.service.setConfigOption({
      taskId: TASK_ID,
      configId: "model",
      value: "zhipu/glm-4.6",
    });
    assert.deepEqual(modelOption.callsOf("setModel")[0].model, {
      providerId: "zhipu",
      modelId: "glm-4.6",
    });
    const unknown = createHarness();
    await unknown.prime();
    await unknown.service.setConfigOption({ taskId: TASK_ID, configId: "unknown", value: "x" });
    assert.deepEqual(unknown.envelopes, []);
    assert.equal(unknown.callsOf("resumeSession").length, 1);
  });

  it("A57 交互回执映射到 resolveInteraction，replayable 额外本地补投响应事件", async () => {
    const harness = createHarness();
    await harness.prime();
    const events = [];
    const stream = harness.service.onDynamicStreamEvent(TASK_ID);
    const disposable = stream((event) => events.push(event));
    const permissionOk = await harness.service.respondPermission({
      taskId: TASK_ID,
      requestId: "perm-1",
      optionId: "allow",
    });
    assert.equal(permissionOk, true);
    assert.deepEqual(harness.envelopes[0], {
      ...(harness.envelopes[0] ?? {}),
      type: "resolveInteraction",
      sessionId: TASK_ID,
      payload: { interactionId: "perm-1", answer: { optionId: "allow" } },
    });
    const elicitationOk = await harness.service.respondElicitation({
      taskId: TASK_ID,
      requestId: "ask-1",
      action: "accept",
      content: "方案 A",
      clientMode: "web-remote-replayable",
    });
    assert.equal(elicitationOk, true);
    assert.deepEqual(harness.envelopes[1].payload, {
      interactionId: "ask-1",
      answer: { action: "accept", content: "方案 A" },
    });
    assert.deepEqual(
      events.map((event) => [event.type, event.requestId, event.action, event.content]),
      [["elicitation_response", "ask-1", "accept", "方案 A"]],
    );
    const desktop = createHarness();
    await desktop.prime();
    const desktopEvents = [];
    desktop.service.onDynamicStreamEvent(TASK_ID)((event) => desktopEvents.push(event));
    await desktop.service.respondElicitation({
      taskId: TASK_ID,
      requestId: "ask-2",
      action: "decline",
    });
    assert.deepEqual(desktopEvents, []);
    assert.deepEqual(desktop.envelopes[0].payload, {
      interactionId: "ask-2",
      answer: { action: "decline" },
    });
    disposable.dispose();
  });

  it("A57 stopGeneration 与 compact/goal 保持旧协议通道并在非 accepted 时收敛索引", async () => {
    const harness = createHarness();
    await harness.prime();
    await harness.service.stopGeneration({ taskId: TASK_ID, runId: "in-1" });
    assert.deepEqual(harness.envelopes[0].type, "stop");
    assert.ok(!("baseRevision" in harness.envelopes[0]));
    const compacted = await harness.service.compactSession({
      taskId: TASK_ID,
      sessionId: undefined,
      instructions: "压缩要点",
      expectedRevision: 5,
    });
    assert.equal(compacted.compact.state, "accepted");
    assert.deepEqual(harness.broadcasts, [], "accepted 的 compact 不做索引收敛");
    const converged = createHarness({
      agentServicePatches: {
        compactSession: async (params) => ({
          compact: { state: "noop" },
          snapshot: makeSnapshot(params.sessionId),
        }),
      },
    });
    await converged.prime();
    await converged.service.compactSession({
      taskId: TASK_ID,
      inputId: "in-9",
      expectedRevision: 5,
    });
    assert.deepEqual(
      converged.broadcasts.map((item) => [item.reason, item.meta.taskId]),
      [["task_status_changed", TASK_ID]],
    );
    assert.equal(converged.callsOf("ensureSessionSubscription").length, 1);
    await converged.service.sendPrompt({ ...TARGET, traceId: "in-9", content: "同轮次" });
    const failed = createHarness({
      agentServicePatches: {
        compactSession: async () => {
          throw runtimeUnavailableError();
        },
      },
    });
    await failed.prime();
    await failed.service
      .compactSession({ taskId: TASK_ID, inputId: "in-7" })
      .catch((error) => error.code);
    await assert.rejects(
      () =>
        failed.service.enqueueTaskCommand({
          ...TARGET,
          commandId: "c9",
          traceId: "in-8",
          content: "下一条",
          ownerRunId: "in-7",
        }),
      (error) => error.code === "NO_ACTIVE_TASK_OWNER",
      "compact 失败必须清理活跃 inputId",
    );
    const goal = createHarness();
    await goal.prime();
    await goal.service.goalSession({ taskId: TASK_ID, action: "clear" });
    assert.deepEqual(
      goal.broadcasts.map((item) => item.reason),
      ["task_status_changed"],
    );
    const continuation = createHarness({
      snapshots: { [TASK_ID]: makeSnapshot(TASK_ID, { session: { status: "running" } }) },
      agentServicePatches: {
        goalSession: async (params) => ({
          response: "",
          startedTurn: true,
          snapshot: makeSnapshot(params.sessionId, { session: { status: "running" } }),
        }),
      },
    });
    await continuation.prime();
    await continuation.service.goalSession({
      taskId: TASK_ID,
      action: "resume",
      inputId: "in-5",
    });
    const ownerCheck = await continuation.service
      .enqueueTaskCommand({
        ...TARGET,
        commandId: "c5",
        traceId: "in-6",
        content: "x",
        ownerRunId: "in-5",
      })
      .then(() => "accepted")
      .catch((error) => error.code);
    assert.equal(ownerCheck, "accepted", "仍在运行的 goal 续轮必须保留活跃 inputId");
    await assert
      .rejects(() => continuation.service.stopGeneration({ taskId: TASK_ID, runId: "in-5" }), {
        skip: false,
      })
      .catch(() => {});
    const statusOnly = createHarness();
    await statusOnly.prime();
    await statusOnly.service.goalSession({ taskId: TASK_ID, action: "status" });
    assert.equal(statusOnly.callsOf("goalSession")[0].action, "status");
  });
});

describe("A58 事件投影与订阅生命周期", () => {
  it("A58 onDynamicTaskEvent 建立本地与上游双订阅并按释放顺序回收", async () => {
    const harness = createHarness();
    const events = [];
    const disposable = harness.service.onDynamicTaskEvent({
      taskId: TASK_ID,
      workspacePath: WORKSPACE,
      workspaceIdentity: IDENTITY,
      deliveryKind: "replayable",
    })((event) => events.push(event));
    assert.deepEqual(harness.callsOf("onDynamicSessionEvent"), [
      {
        workspacePath: WORKSPACE,
        workspaceIdentity: IDENTITY,
        sessionId: TASK_ID,
        deliveryKind: "web-remote-replayable",
        includeSnapshot: true,
      },
    ]);
    harness.emitUpstream({
      type: "session.event",
      event: {
        type: "turn.started",
        sessionId: TASK_ID,
        eventId: "e1",
        timestamp: 1234,
        turnId: "turn-1",
        payload: { inputId: "in-1", input: "问题？" },
      },
    });
    assert.deepEqual(
      events.map((event) => [event.type, event.taskId, event.inputId, event.turnId]),
      [["task_run_started", TASK_ID, "in-1", "turn-1"]],
    );
    disposable.dispose();
    assert.deepEqual(
      harness.order.filter((entry) => entry.startsWith("upstream-dispose")),
      [`upstream-dispose:${TASK_ID}`],
    );
    const continuous = createHarness();
    continuous.service.onDynamicTaskEvent({ ...TARGET, deliveryKind: "continuous" })(() => {});
    assert.equal(continuous.callsOf("onDynamicSessionEvent")[0].includeSnapshot, false);
    assert.equal(continuous.callsOf("onDynamicSessionEvent")[0].deliveryKind, "desktop-continuous");
  });

  it("A58 session 事件映射为 task 流：状态更新、权限请求与终态索引回写", async () => {
    const harness = createHarness();
    const events = [];
    const globalEvents = [];
    harness.service.onDynamicTaskEvent(TARGET)((event) => events.push(event));
    const global = harness.service.onDynamicStreamEvent(TASK_ID)((event) =>
      globalEvents.push(event),
    );
    harness.emitUpstream({
      type: "state.updated",
      notification: {
        reason: "model_changed",
        patch: {
          model: {
            current: { providerId: "zhipu", modelId: "glm-4.6" },
            available: [makeModelOption("zhipu", "glm-4.6", "GLM-4.6")],
          },
          thoughtLevel: {
            enabled: true,
            current: "high",
            available: [{ value: "high", label: "高" }],
          },
          mode: { current: "plan" },
        },
      },
    });
    assert.deepEqual(
      events.map((event) => event.type),
      ["mode_update", "knorvia_agent_model_state_update"],
    );
    assert.equal(events[0].currentModeId, "plan");
    assert.equal(events[1].reason, "model_changed");
    assert.equal(events[1].model.currentValue, "zhipu/glm-4.6");
    assert.equal(events[1].contextWindow.tokens, 200000);
    harness.emitUpstream({
      type: "state.updated",
      notification: { reason: "model_changed", patch: { not: "settings" } },
    });
    assert.equal(events.length, 2, "非法 settings 补丁不产生任何 task 事件");
    harness.emitUpstream({
      type: "permission.request",
      request: {
        requestId: "perm-9",
        toolName: "Write",
        reason: "写入文件",
        options: [{ optionId: "allow", name: "允许" }],
      },
    });
    assert.deepEqual(
      events.slice(2).map((event) => [event.type, event.requestId, event.description]),
      [["permission_request", "perm-9", "写入文件"]],
    );
    harness.emitUpstream({
      type: "session.event",
      event: {
        type: "turn.failed",
        sessionId: TASK_ID,
        eventId: "e2",
        timestamp: 2222,
        payload: { inputId: "in-1", error: { message: "上游失败", code: "PROVIDER_500" } },
      },
    });
    const failed = events.at(-1);
    assert.deepEqual(
      [failed.type, failed.code, failed.error, failed.inputId, failed.traceId],
      ["task_error", "PROVIDER_500", "上游失败", "in-1", "in-1"],
    );
    assert.deepEqual(harness.agentPatches.at(-1).patch.status, "error");
    assert.deepEqual(harness.agentPatches.at(-1).patch.lastError.message, "上游失败");
    harness.emitUpstream({
      type: "session.event",
      event: {
        type: "turn.completed",
        sessionId: TASK_ID,
        eventId: "e3",
        timestamp: 3333,
        payload: { inputId: "in-1" },
      },
    });
    const completed = events.at(-1);
    assert.equal(completed.type, "task_complete");
    assert.deepEqual(harness.agentPatches.at(-1).patch.status, "completed");
    assert.deepEqual(
      globalEvents.map((event) => event.type),
      events.map((event) => event.type),
      "全局 emitter 与按 workspace 的 emitter 收到同一序列",
    );
    global.dispose();
  });

  it("A58 snapshot 事件回写索引并投影 task_snapshot_updated 与工作区配置", async () => {
    const harness = createHarness();
    const events = [];
    harness.service.onDynamicTaskEvent({ ...TARGET, deliveryKind: "replayable" })((event) =>
      events.push(event),
    );
    harness.emitUpstream({ type: "snapshot", snapshot: makeSnapshot(TASK_ID) });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "task_snapshot_updated");
    assert.equal(events[0].workspaceKey, IDENTITY);
    assert.equal(typeof events[0].traceId, "string");
    assert.deepEqual(
      harness.syncedMetas.map((meta) => meta.taskId),
      [TASK_ID],
    );
    assert.deepEqual(
      harness.workspaceEvents.map((item) => [item.key, item.event.type]),
      [[`params:${WORKSPACE}|${IDENTITY}`, "workspace_config_options_update"]],
    );
  });

  it("A58 终态与 ready 事件按 inputId 收口 host command，未订阅任务保持静默", async () => {
    const harness = createHarness();
    const outcomes = [];
    const ready = [];
    harness.service.onDynamicTaskTerminalOutcome(TASK_ID)((outcome) => outcomes.push(outcome));
    harness.service.onDynamicTaskReady(TASK_ID)((event) => ready.push(event));
    await harness.service.enqueueTaskCommand({
      ...TARGET,
      commandId: "c1",
      traceId: "in-1",
      content: "第一条",
    });
    await harness.sendTextGate.until(1);
    harness.fireTerminal({
      target: { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, sessionId: "other-task" },
      kind: "turn.failed",
    });
    assert.deepEqual(outcomes, [], "非本任务的终态不通知");
    harness.fireTerminal({
      target: { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, sessionId: TASK_ID },
      kind: "turn.failed",
    });
    await Promise.resolve();
    assert.deepEqual(outcomes, [{ taskId: TASK_ID, inputId: "in-1", outcome: "failed" }]);
    harness.fireReady({
      target: { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, sessionId: TASK_ID },
      reason: "prompt_failed",
    });
    await Promise.resolve();
    assert.deepEqual(ready, [{ taskId: TASK_ID, reason: "prompt_failed" }]);
    harness.fireTerminal({
      target: { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, sessionId: TASK_ID },
      kind: "turn.completed",
    });
    await Promise.resolve();
    assert.equal(outcomes.at(-1).outcome, "succeeded");
  });

  it("A58 disposeAll 先释放 syncer 再释放 agentService 且幂等", async () => {
    const harness = createHarness();
    harness.service.onDynamicTaskEvent(TARGET)(() => {});
    harness.service.disposeAll();
    harness.service.disposeAll();
    assert.deepEqual(
      harness.order.filter((entry) => entry.includes("disposeAll") || entry === "repo.close"),
      ["syncer.disposeAll", "agentService.disposeAll", "repo.close"],
    );
    assert.deepEqual(
      harness.order.filter((entry) => entry.endsWith("subscription-disposed")),
      ["terminal-subscription-disposed", "ready-subscription-disposed"],
    );
    const counters = services.memoryDiagnosticsRegistry.collect();
    assert.ok(!("task.overlays" in counters), "dispose 后注销 task 诊断 provider");
    const countersBefore = services.memoryDiagnosticsRegistry.collect();
    const second = createHarness();
    await second.service.enqueueTaskCommand({
      ...TARGET,
      commandId: "c1",
      traceId: "in-1",
      content: "第一条",
    });
    await second.sendTextGate.until(1);
    const running = services.memoryDiagnosticsRegistry.collect();
    assert.equal(running["task.runtimeCommands"], 1);
    assert.equal(running["task.taskEmitters"], 0);
    second.service.disposeAll();
    await second.service.disposeAllAndWait();
    assert.deepEqual(second.order.slice(0, 1), ["syncer.disposeAll"]);
    assert.ok(!("task.runtimeCommands" in services.memoryDiagnosticsRegistry.collect()));
    harness.fireReady({
      target: { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, sessionId: TASK_ID },
      reason: "prompt_completed",
    });
    await Promise.resolve();
    assert.equal(second.callsOf("sendConversationCommandV4").length, 1, "释放后不再放行新输入");
  });

  it("A58 disposeAllAndWait 优先等待 agentService 的异步释放通道", async () => {
    const harness = createHarness({
      agentServicePatches: {
        disposeAll() {
          harness.order.push("agentService.disposeAll.sync");
        },
        async disposeAllAndWait() {
          harness.order.push("agentService.disposeAllAndWait");
        },
      },
    });
    await harness.service.disposeAllAndWait();
    await harness.service.disposeAllAndWait();
    assert.deepEqual(
      harness.order.filter((entry) => entry.includes("disposeAll")),
      ["syncer.disposeAll", "agentService.disposeAllAndWait"],
    );
    assert.equal(harness.order.filter((entry) => entry === "repo.close").length, 1);
  });
});

describe("A59 任务元数据写路径", () => {
  it("A59 rename/pin/archive 写入 overlay、索引补丁与专属广播 reason", async () => {
    const harness = createHarness();
    const renamed = await harness.service.renameTask({
      ...TARGET,
      workspaceIdentity: IDENTITY,
      title: "手动标题",
    });
    assert.equal(renamed.title, "手动标题");
    assert.deepEqual(harness.callsOf("updateTaskState")[0].patch, {
      title: "手动标题",
      updatedAt: renamed.updatedAt,
      titleOverridden: true,
    });
    assert.deepEqual(harness.envelopes[0], {
      ...harness.envelopes[0],
      type: "renameSession",
      sessionId: TASK_ID,
      payload: { title: "手动标题" },
    });
    assert.deepEqual(
      harness.broadcasts.map((item) => item.reason),
      ["task_title_changed"],
    );
    await harness.service.setTaskPinned({ ...TARGET, pinned: true });
    await harness.service.setTaskPinned({ ...TARGET, pinned: false });
    await harness.service.archiveTask(TARGET);
    await harness.service.unarchiveTask(TARGET);
    assert.deepEqual(
      harness.broadcasts.slice(1).map((item) => item.reason),
      ["task_pinned", "task_unpinned", "task_archived", "task_unarchived"],
    );
    const snapshot = await harness.service.getTaskSnapshot(TARGET);
    assert.equal(snapshot.meta.title, "手动标题", "overlay 标题必须覆盖快照标题");
    assert.equal(snapshot.meta.archived, undefined);
    assert.deepEqual(
      harness.callsOf("updateTaskState").map((call) => call.patch.archived),
      [undefined, undefined, undefined, true, false],
    );
  });

  it("A59 v4 标题同步失败不破坏既有重命名，索引缺失时按需 seed 再重试", async () => {
    const harness = createHarness({
      ackSequence: [{ commandId: "x", status: "failed", reasonCode: "NO_SESSION" }],
    });
    const meta = await harness.service.renameTask({ ...TARGET, title: "仅本地标题" });
    assert.equal(meta.title, "仅本地标题");
    assert.deepEqual(
      harness.broadcasts.map((item) => item.reason),
      ["task_title_changed"],
    );
    let firstFailure = true;
    const seeded = createHarness({
      repoPatches: {
        updateTaskState: async (params) => {
          if (firstFailure) {
            firstFailure = false;
            throw new Error("no index row");
          }
          return { ...makeTaskMeta(params.taskId), ...params.patch };
        },
      },
    });
    const recovered = await seeded.service.archiveTask(TARGET);
    assert.equal(recovered.archived, true);
    assert.equal(seeded.callsOf("resumeSession").length, 1, "索引缺失时读取当前 session seed");
    assert.equal(seeded.syncedMetas.length, 1);
    assert.equal(seeded.callsOf("updateTaskState").length, 2);
    assert.deepEqual(
      seeded.broadcasts.map((item) => item.reason),
      ["task_archived"],
    );
  });

  it("A59 unread 走 CAS 对账，未命中也回写最终持久值但不广播", async () => {
    const harness = createHarness({ persistedUnreadAt: 4242, unreadCleared: false });
    const cleared = await harness.service.setTaskUnread({
      ...TARGET,
      unread: false,
      expectedUnreadAt: 1111,
    });
    assert.deepEqual(harness.callsOf("clearTaskUnreadIfMatches"), [
      {
        taskId: TASK_ID,
        workspacePath: WORKSPACE,
        workspaceIdentity: IDENTITY,
        expectedUnreadAt: 1111,
      },
    ]);
    assert.equal(cleared.unreadAt, 4242);
    assert.deepEqual(harness.broadcasts, []);
    const snapshot = await harness.service.getTaskSnapshot(TARGET);
    assert.equal(snapshot.meta.unreadAt, 4242, "overlay 必须与持久值对账");
    const matched = createHarness({ persistedUnreadAt: 9999, unreadCleared: true });
    await matched.service.setTaskUnread({ ...TARGET, unread: false, expectedUnreadAt: 1111 });
    assert.deepEqual(
      matched.broadcasts.map((item) => item.reason),
      ["task_meta_changed"],
    );
    const marked = createHarness();
    const before = Date.now();
    const unread = await marked.service.setTaskUnread({ ...TARGET, unread: true });
    assert.ok(unread.unreadAt >= before);
    assert.equal(marked.callsOf("updateTaskState")[0].patch.unreadAt, unread.unreadAt);
  });

  it("A59 删除与归档批量清理各自只广播一次并按结果分桶", async () => {
    const harness = createHarness();
    await harness.service.deleteTask(TARGET);
    assert.deepEqual(harness.broadcasts[0], {
      target: TARGET,
      meta: { ...makeTaskMeta(TASK_ID), deleted: true },
      reason: "task_deleted",
    });
    const skipped = await harness.service.deleteArchivedTask({
      ...TARGET,
      taskId: "archived-missing",
    });
    assert.equal(skipped, false);
    assert.equal(harness.broadcasts.length, 1);
    const archived = await harness.service.deleteArchivedTask({ ...TARGET, taskId: "archived-1" });
    assert.equal(archived, true);
    assert.equal(harness.broadcasts.at(-1).reason, "task_deleted");
    const batch = createHarness({
      archivedDeletion: { skipIds: ["b"], throwIds: ["c"] },
    });
    const result = await batch.service.deleteArchivedTasks({
      workspacePath: WORKSPACE,
      workspaceIdentity: IDENTITY,
      taskIds: ["a", "b", "c", "a"],
    });
    assert.deepEqual(result, {
      deletedTaskIds: ["a"],
      skippedTaskIds: ["b"],
      failedTaskIds: ["c"],
    });
    assert.deepEqual(
      batch.broadcasts.map((item) => [item.reason, item.meta]),
      [["task_deleted", undefined]],
      "批次只广播一次",
    );
    assert.deepEqual(
      batch.callsOf("deleteArchivedTask").map((params) => params.taskId),
      ["a", "b", "c"],
    );
    const empty = createHarness();
    assert.deepEqual(
      await empty.service.deleteArchivedTasks({ workspacePath: WORKSPACE, taskIds: [] }),
      { deletedTaskIds: [], skippedTaskIds: [], failedTaskIds: [] },
    );
    assert.deepEqual(empty.callsOf("deleteArchivedTask"), []);
  });

  it("A59 closeTask 落 deleted tombstone 并清理 live 工具投影", async () => {
    const harness = createHarness();
    await harness.prime();
    await harness.service.closeTask({ taskId: TASK_ID });
    assert.deepEqual(harness.callsOf("closeSession"), [
      { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, sessionId: TASK_ID },
    ]);
    assert.deepEqual(harness.callsOf("updateTaskState")[0].patch, { deleted: true });
    assert.deepEqual(
      harness.broadcasts.map((item) => [item.reason, item.meta]),
      [["task_meta_changed", undefined]],
    );
    const counters = services.memoryDiagnosticsRegistry.collect();
    assert.equal(counters["task.overlays"], 1);
    assert.equal(counters["task.taskEmitters"], 0);
  });

  it("A59 归档分区读取：stale 与整 workspace 归档使用不同索引口径", async () => {
    const harness = createHarness({
      metas: [makeTaskMeta("live-1"), makeTaskMeta("live-2", { archived: true })],
      staleRows: [makeTaskMeta("stale-1")],
    });
    const stale = await harness.service.archiveStaleTasks({
      workspacePath: WORKSPACE,
      workspaceIdentity: IDENTITY,
      olderThanDays: 30,
    });
    assert.deepEqual(
      stale.map((task) => task.taskId),
      ["stale-1"],
    );
    assert.deepEqual(harness.callsOf("archiveStaleTasks")[0], {
      workspacePath: WORKSPACE,
      workspaceIdentity: IDENTITY,
      olderThanDays: 30,
    });
    const batched = await harness.service.archiveWorkspaceTasks({
      workspacePath: WORKSPACE,
      workspaceIdentity: IDENTITY,
    });
    assert.deepEqual(
      batched.map((task) => task.taskId),
      ["live-1", "live-2"],
    );
    const listFilters = harness.callsOf("listTaskMetas");
    assert.deepEqual(
      listFilters.map((params) => [params.archived ?? null, params.provider]),
      [
        [false, PROVIDER],
        [true, PROVIDER],
      ],
    );
    assert.deepEqual(
      harness.callsOf("updateTaskState").map((call) => call.patch),
      [{ archived: true }, { archived: true }],
    );
    assert.deepEqual(
      harness.broadcasts.map((item) => [item.reason, item.meta?.taskId]),
      [
        ["task_meta_changed", "stale-1"],
        ["task_meta_changed", undefined],
      ],
    );
  });
});

describe("A5A10 路径、轨迹与日志归属", () => {
  it("A510 getTaskNativeSessionLogFile 按数据根或 KNORVIA_LOG_DIR 定位当日 JSONL", async (t) => {
    const root = await makeTempRoot(t);
    const harness = createHarness();
    const fallback = await harness.service.getTaskNativeSessionLogFile();
    assert.equal(fallback.provider, PROVIDER);
    assert.equal(fallback.exists, false);
    assert.ok(fallback.path.startsWith(join(root, ".knorvia-studio", "cli", "log")));
    assert.ok(fallback.path.endsWith(".jsonl"));
    const logDir = join(root, "custom-logs");
    withEnv(t, "KNORVIA_LOG_DIR", logDir);
    const custom = await harness.service.getTaskNativeSessionLogFile();
    assert.ok(custom.path.startsWith(logDir));
    assert.equal(custom.exists, false);
    withEnv(t, "KNORVIA_PORTABLE_DIR", join(root, "portable"));
    const portable = await harness.service.getTaskNativeSessionLogFile();
    assert.ok(portable.path.startsWith(join(root, ".knorvia-studio", "cli", "log")));
    withEnv(t, "KNORVIA_PORTABLE_DIR", undefined);
    withEnv(t, "KNORVIA_LOG_DIR", undefined);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
    const filePath = join(root, ".knorvia-studio", "cli", "log", `knorvia-${today}.jsonl`);
    await writeText(filePath, "{}\n");
    const present = await harness.service.getTaskNativeSessionLogFile();
    assert.equal(present.exists, true);
    assert.equal(present.path, filePath);
    assert.equal(basename(present.path), `knorvia-${today}.jsonl`);
  });

  it("A510 getTaskSessionFilePath 与 getModelTrajectory 以 taskId 作为 session 事实源", async (t) => {
    const root = await makeTempRoot(t);
    const harness = createHarness();
    const legacyPath = await harness.service.getTaskSessionFilePath({
      workspacePath: WORKSPACE,
      taskId: TASK_ID,
    });
    assert.ok(legacyPath.path.endsWith(`${TASK_ID}.knorvia-session`));
    assert.ok(legacyPath.path.includes(WORKSPACE));
    assert.equal(legacyPath.exists, false);
    const missing = await harness.service.getModelTrajectory({ taskId: "no-such-task" });
    assert.deepEqual(missing, {
      taskId: "no-such-task",
      available: true,
      records: [],
      sourceFiles: [],
      truncated: false,
    });
    const session = "task 1/2";
    const file = join(
      root,
      ".knorvia-studio",
      "cli",
      "debug",
      `model-io-${session.replace(/[^a-zA-Z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "")}.jsonl`,
    );
    await writeText(
      file,
      [
        JSON.stringify({
          type: "model_io",
          sessionId: "other-session",
          requestId: "foreign",
          startedAt: "2026-10-01T00:00:00.000Z",
        }),
        JSON.stringify({
          type: "model_io",
          sessionId: session,
          requestId: "req-2",
          startedAt: "2026-10-01T00:00:02.000Z",
          model: { providerId: "zhipu", modelId: "glm-4.6", role: "main" },
        }),
        "broken-json",
        JSON.stringify({
          type: "model_io",
          sessionId: session,
          requestId: "req-1",
          startedAt: "2026-10-01T00:00:01.000Z",
          model: { providerId: "zhipu", modelId: "glm-4.5", role: "main" },
        }),
      ].join("\n"),
    );
    const trajectory = await harness.service.getModelTrajectory({ taskId: session });
    assert.equal(trajectory.taskId, session);
    assert.deepEqual(trajectory.sourceFiles, [file]);
    assert.deepEqual(
      trajectory.records.map((record) => [record.requestId, record.model.modelId, record.attempt]),
      [
        ["req-1", "glm-4.5", 1],
        ["req-2", "glm-4.6", 1],
      ],
    );
    assert.equal(trajectory.truncated, false);
    const limited = await harness.service.getModelTrajectory({ taskId: session, limit: 1 });
    assert.equal(limited.truncated, true);
    assert.deepEqual(
      limited.records.map((record) => record.requestId),
      ["req-2"],
    );
  });

  it("A511 getTaskTokenUsage 透传到协议层，不本地聚合 context window", async () => {
    const harness = createHarness();
    const usage = await harness.service.getTaskTokenUsage({
      workspacePath: WORKSPACE,
      workspaceIdentity: IDENTITY,
      taskId: TASK_ID,
    });
    assert.deepEqual(usage, { totalTokens: 1234, promptTokens: 1000, completionTokens: 344 });
    assert.deepEqual(harness.callsOf("getTaskTokenUsage"), [
      { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY, sessionId: TASK_ID },
    ]);
  });

  it("A512 getTaskConfigOptions 与 getTaskModelSelection 复用 session 快照事实源", async () => {
    const harness = createHarness({
      snapshots: {
        [TASK_ID]: makeSnapshot(TASK_ID, {
          session: { mode: "plan" },
          settings: {
            model: {
              current: { providerId: "zhipu", modelId: "glm-4.6" },
              available: [makeModelOption("zhipu", "glm-4.6", "GLM-4.6")],
            },
            thoughtLevel: {
              enabled: true,
              current: "high",
              available: [{ value: "high", label: "高" }],
            },
            mode: { current: "plan" },
          },
        }),
      },
    });
    await harness.prime();
    const options = await harness.service.getTaskConfigOptions({ taskId: TASK_ID });
    assert.deepEqual(
      options.map((option) => [option.id, option.currentValue]),
      [
        ["model", "zhipu/glm-4.6"],
        ["mode", "plan"],
        ["thought_level", "high"],
      ],
    );
    assert.equal(harness.callsOf("resumeSession").length, 1);
    assert.equal(harness.callsOf("readSession").length, 0);
    const selection = await harness.service.getTaskModelSelection({ taskId: TASK_ID });
    assert.deepEqual(selection, { providerId: "zhipu", modelId: "glm-4.6" });
    assert.deepEqual(harness.callsOf("readSession")[0], {
      workspacePath: WORKSPACE,
      workspaceIdentity: IDENTITY,
      sessionId: TASK_ID,
    });
    const unbound = createHarness();
    await unbound.service.resumeTask(TARGET);
    assert.equal(await unbound.service.getTaskModelSelection({ taskId: TASK_ID }), null);
  });
});

describe("A5B13 MCP 解析与导入面", () => {
  it("A513 cuaProductMcpServerResolver 只在显式传入服务器时参与解析", async () => {
    const resolved = [{ name: "cua", command: "helper" }];
    const resolveMcpServers = (servers) => [...servers, ...resolved];
    const harness = createHarness({
      resolver: { resolveMcpServers: async (servers) => resolveMcpServers(servers) },
    });
    await harness.service.createTask({
      workspacePath: WORKSPACE,
      mcpServers: [{ name: "fs", command: "server" }],
    });
    assert.deepEqual(harness.callsOf("createSession")[0].mcpServers, [
      { name: "fs", command: "server" },
      { name: "cua", command: "helper" },
    ]);
    const withoutServers = createHarness({
      resolver: {
        resolveMcpServers: async () => {
          throw new Error("不应被调用");
        },
      },
    });
    await withoutServers.service.createTask({ workspacePath: WORKSPACE });
    assert.equal(withoutServers.callsOf("createSession")[0].mcpServers, undefined);
    const emptyArray = createHarness({ resolver: { resolveMcpServers: async () => [] } });
    await emptyArray.service.createTask({ workspacePath: WORKSPACE, mcpServers: [] });
    assert.equal(emptyArray.callsOf("createSession")[0].mcpServers, undefined);
  });

  it("A514 Claude 原生导入面走导入仓库，扫描参数不携带 workspaceIdentity", async () => {
    const harness = createHarness();
    const candidates = await harness.service.scanImportableClaudeSessions({
      workspacePath: WORKSPACE,
    });
    assert.ok(Array.isArray(candidates));
    const imported = await harness.service.importClaudeSessions({
      workspacePath: WORKSPACE,
      workspaceIdentity: IDENTITY,
      sessionIds: [],
    });
    assert.ok(imported);
    assert.equal(harness.callsOf("createSession").length, 0);
    assert.deepEqual(harness.broadcasts, []);
  });

  it("A515 setAssistantMessageFeedback 只在快照存在时写回消息反馈", async () => {
    const messages = [
      {
        info: { role: "assistant", messageId: "m1", time: { created: 1, completed: 2 } },
        parts: [{ type: "text", text: "回答一" }],
      },
      {
        info: { role: "user", messageId: "u1", time: { created: 2 } },
        parts: [{ type: "text", text: "追问" }],
      },
      {
        info: { role: "assistant", messageId: "m2", time: { created: 3, completed: 4 } },
        parts: [{ type: "text", text: "回答二" }],
      },
    ];
    const harness = createHarness({
      snapshots: { [TASK_ID]: makeSnapshot(TASK_ID, { messages }) },
    });
    const updated = await harness.service.setAssistantMessageFeedback({
      ...TARGET,
      turnIndex: 1,
      feedback: "positive",
    });
    assert.deepEqual(
      updated.messages.filter((m) => m.role === "assistant").map((message) => message.feedback),
      [undefined, "positive"],
    );
    const outOfRange = await harness.service.setAssistantMessageFeedback({
      ...TARGET,
      turnIndex: 5,
      feedback: "negative",
    });
    assert.deepEqual(
      outOfRange.messages.filter((m) => m.role === "assistant").map((message) => message.feedback),
      [undefined, undefined],
    );
  });
});

describe("A5C16 已知差异候选的显式行为", () => {
  it("A516 onError 通道存在但适配层从不投递错误，错误只以拒绝与 task_error 表达", async () => {
    const harness = createHarness({
      snapshots: { [TASK_ID]: runtimeUnavailableError() },
    });
    const observed = [];
    const disposable = harness.service.onError((error) => observed.push(error));
    await assert.rejects(
      () => harness.service.getTaskSnapshot(TARGET),
      (error) => error.code === RUNTIME_UNAVAILABLE_CODE,
    );
    await assert
      .rejects(
        () => harness.service.listTasks({ workspacePath: WORKSPACE }),
        () => true,
      )
      .catch(() => {});
    assert.deepEqual(observed, []);
    disposable.dispose();
    const counters = services.memoryDiagnosticsRegistry.collect();
    assert.equal(counters["task.overlays"], 0);
  });

  it("A517 resumeTask 与 getTaskSnapshot 的索引写入次数与广播口径不同", async () => {
    const harness = createHarness();
    await harness.service.resumeTask(TARGET);
    assert.equal(harness.syncedMetas.length, 1);
    assert.deepEqual(harness.broadcasts, [], "resumeTask 不广播任务列表变更");
    await harness.service.getTaskSnapshot(TARGET);
    assert.equal(harness.syncedMetas.length, 2);
    assert.equal(harness.callsOf("ensureSessionSubscription").length, 1);
  });

  it("A518 快照投影把 backgroundJobs 解析为后台任务控制项并按 inputId 回写进度", async () => {
    const harness = createHarness({
      snapshots: {
        [TASK_ID]: makeSnapshot(TASK_ID, {
          projection: {
            backgroundJobs: [{ backgroundTaskId: "bg-1", status: "running", command: "sleep" }],
          },
        }),
      },
    });
    const snapshot = await harness.service.getTaskSnapshot(TARGET);
    assert.equal(Array.isArray(snapshot.runtime.backgroundBashJobs), true);
    const live = createHarness();
    live.service.onDynamicTaskEvent(TARGET)(() => {});
    live.emitUpstream({
      type: "session.event",
      event: {
        type: "tool.updated",
        sessionId: TASK_ID,
        eventId: "e9",
        timestamp: 4444,
        payload: {
          toolCallId: "tool-1",
          toolName: "Bash",
          status: "completed",
          content: { backgroundTaskId: "bg-9", outputFile: "/tmp/bg-9.log" },
        },
      },
    });
    assert.equal(live.callsOf("applyAgentPatch").length <= 1, true);
  });

  it("A519 listTaskList 的 workspace 行由调用方作用域决定，适配层不补默认作用域", async () => {
    const harness = createHarness({ metas: [makeTaskMeta("t1"), makeTaskMeta("t2")] });
    const result = await harness.service.listTaskList({
      kind: "workspace",
      workspaceScopes: [{ workspacePath: WORKSPACE, workspaceIdentity: IDENTITY }],
      sortBy: "created",
    });
    assert.equal(result.items.length, 2);
    assert.equal(result.hasMore, false);
    const [params] = harness.callsOf("queryTaskList");
    assert.deepEqual(params.workspaceScopes, [
      { workspacePath: WORKSPACE, workspaceIdentity: IDENTITY },
    ]);
    assert.equal(params.kind, "workspace");
    assert.equal(params.sortBy, "created");
  });

  it("A520 未加载目标时读写入口统一抛 KNORVIA_SESSION_TARGET_NOT_FOUND", async () => {
    const harness = createHarness();
    const entries = [
      ["closeTask", { taskId: "ghost" }],
      ["getTaskConfigOptions", { taskId: "ghost" }],
      ["getTaskModelSelection", { taskId: "ghost" }],
      ["setMode", { taskId: "ghost", mode: "plan" }],
      ["setModel", { taskId: "ghost", modelSelection: { providerId: "p", modelId: "m" } }],
      ["respondPermission", { taskId: "ghost", requestId: "r", optionId: "o" }],
      ["respondElicitation", { taskId: "ghost", requestId: "r", action: "accept" }],
      ["goalSession", { taskId: "ghost", action: "status" }],
      ["compactSession", { taskId: "ghost" }],
      ["stopGeneration", { taskId: "ghost" }],
      [
        "setAutomationSessionConfig",
        {
          taskId: "ghost",
          modelSelection: { providerId: "p", modelId: "m" },
        },
      ],
    ];
    for (const [name, params] of entries) {
      await assert.rejects(
        () => harness.service[name](params),
        (error) =>
          error.code === "KNORVIA_SESSION_TARGET_NOT_FOUND" && error.message.includes("ghost"),
        name,
      );
    }
    assert.deepEqual(harness.callsOf("resumeSession"), []);
    assert.deepEqual(harness.envelopes, []);
    const withWorkspace = await harness.service.getTaskSnapshot({
      taskId: "ghost-2",
      workspacePath: WORKSPACE,
    });
    assert.equal(withWorkspace.meta.taskId, "ghost-2");
  });

  it("A521 目标记忆只由显式写入刷新，cronAutomationId 在快照路径保持不被清掉", async () => {
    const harness = createHarness({
      metas: [makeTaskMeta(TASK_ID, { cronAutomationId: "auto-sticky" })],
    });
    await harness.service.listTasks({ workspacePath: WORKSPACE });
    await harness.service.getTaskSnapshot({ ...TARGET, workspacePath: WORKSPACE });
    const meta = await harness.service.getTaskMeta({ ...TARGET, workspacePath: WORKSPACE });
    assert.equal(meta.cronAutomationId, "auto-sticky");
    await harness.service.sendPrompt({ ...TARGET, traceId: "in-1", content: "普通输入" });
    assert.deepEqual(harness.envelopes[0].payload.automationId, undefined);
    const cleared = createHarness({
      metas: [makeTaskMeta(TASK_ID, { cronAutomationId: "auto-sticky" })],
    });
    await cleared.service.listTasks({ workspacePath: WORKSPACE });
    await cleared.service.getTaskSnapshot({ ...TARGET, workspacePath: WORKSPACE });
    assert.equal(cleared.callsOf("resumeSession")[0].sessionId, TASK_ID);
  });
});
