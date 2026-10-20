// SPDX-License-Identifier: Apache-2.0
// A73–A78：task index syncer 的 workspace 订阅装配、双 topic 独立代际、runtime 生命周期
// 失效、快照投影与模型写回。断言落在「向 agentService 发了什么」与「向 repo 写了什么」上，
// 不 sleep、不碰真实 SQLite。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Emitter } from "../../../../packages/rpc/src/foundation.ts";
import { importDeep } from "./entry.mjs";

const { createKnorviaTaskIndexSyncer } = await importDeep("agent/taskIndexSyncer.ts");
const { projectSnapshotMeta, projectSnapshotSearchText } = await importDeep(
  "agent/task-index-ingestion/snapshotProjection.ts",
);

const WORKSPACE_PATH = "/ws/alpha";
const IDENTITY = "alpha";
const WORKSPACE_KEY = IDENTITY;
const TOPIC_INDEX = `sessions-index/${WORKSPACE_KEY}`;
const TOPIC_CONFIG = `workspace-config/${WORKSPACE_KEY}`;
const TARGET = { workspacePath: WORKSPACE_PATH, workspaceIdentity: IDENTITY };

const summary = (sessionId, overrides = {}) => ({
  sessionId,
  workspaceId: WORKSPACE_KEY,
  title: `标题 ${sessionId}`,
  phase: "running",
  sessionEnded: false,
  hasBackgroundWork: false,
  lastActivityAt: 2_000,
  createdAt: 1_000,
  ...overrides,
});

const snapshotFrame = (sessions, overrides = {}) => ({
  topic: TOPIC_INDEX,
  subscriptionId: "sub-index",
  fromSeq: 0,
  toSeq: 1,
  sentAt: 1,
  payload: {
    kind: "snapshot",
    snapshot: {
      protocolVersion: 1,
      workspaceId: WORKSPACE_KEY,
      logEpoch: "epoch-1",
      sessions,
    },
  },
  ...overrides,
});

// 逻辑帧序号必须严格递增，否则装配器会把后到的帧当重复帧丢弃。
let ordinal = 0;
const completeWire = (frame, overrides = {}) => {
  ordinal += 1;
  return {
    wireVersion: 3,
    kind: "complete",
    deliveryKind: "initial",
    logicalFrameId: `lf-${ordinal}`,
    logicalFrameOrdinal: ordinal,
    topic: frame.topic,
    subscriptionId: frame.subscriptionId,
    frame,
    ...overrides,
  };
};

const ack = (subscriptionId, logEpoch = "epoch-1") => ({
  ack: { subscriptionId, mode: "snapshot", logEpoch },
});

/** 造一个可观测的假 agentService + 假 repo。 */
function harness({ lifecycle = false } = {}) {
  const calls = {
    subscribeIndex: [],
    subscribeConfig: [],
    unsubscribeIndex: [],
    unsubscribeConfig: [],
    resyncIndex: [],
    resyncConfig: [],
  };
  const indexFrames = new Emitter();
  const configFrames = new Emitter();
  const lifecycleEmitter = new Emitter();
  const restartedEmitter = new Emitter();
  const indexListeners = [];
  const configListeners = [];
  let indexAck = Promise.resolve(ack("sub-index"));
  let configAck = Promise.resolve(ack("sub-config"));

  const agentService = {
    async subscribeSessionsIndexV4(params) {
      calls.subscribeIndex.push(params);
      return indexAck;
    },
    async subscribeWorkspaceConfigV4(params) {
      calls.subscribeConfig.push(params);
      return configAck;
    },
    async unsubscribeSessionsIndexV4(params) {
      calls.unsubscribeIndex.push(params);
    },
    async unsubscribeWorkspaceConfigV4(params) {
      calls.unsubscribeConfig.push(params);
    },
    async resyncSessionsIndexV4(params) {
      calls.resyncIndex.push(params);
      return { ack: { subscriptionId: params.subscriptionId, mode: "snapshot", logEpoch: "e" } };
    },
    async resyncWorkspaceConfigV4(params) {
      calls.resyncConfig.push(params);
      return { ack: { subscriptionId: params.subscriptionId, mode: "snapshot", logEpoch: "e" } };
    },
    onDynamicSessionsIndexFrame() {
      return (listener) => {
        indexListeners.push(listener);
        return indexFrames.event(listener);
      };
    },
    onDynamicWorkspaceConfigFrame() {
      return (listener) => {
        configListeners.push(listener);
        return configFrames.event(listener);
      };
    },
    async listSessions() {
      return [];
    },
    async readSession() {
      throw new Error("not used");
    },
  };
  if (lifecycle)
    agentService.onAgentRuntimeLifecycle = (listener) => lifecycleEmitter.event(listener);
  else agentService.onAgentRuntimeRestarted = (listener) => restartedEmitter.event(listener);

  const repo = {
    seeded: [],
    patches: [],
    syncs: [],
    models: [],
    async seedTaskMetaIfMissing(meta) {
      repo.seeded.push(meta);
      return meta;
    },
    async applyAgentPatch(input) {
      repo.patches.push(input);
      return null;
    },
    async syncTaskMeta(input) {
      repo.syncs.push({ kind: "syncTaskMeta", ...input });
      return input.meta;
    },
    async syncTaskMetaAtGroupedTop(input) {
      repo.syncs.push({ kind: "syncTaskMetaAtGroupedTop", ...input });
      return { meta: input.meta, initializedGroupedOrder: true };
    },
    async updateTaskState(input) {
      repo.models.push(input);
      return { taskId: input.taskId, model: input.patch.model };
    },
    async listTaskMetas() {
      return [];
    },
  };

  const syncer = createKnorviaTaskIndexSyncer({ agentService, taskIndexRepo: repo });
  return {
    syncer,
    repo,
    calls,
    indexFrames,
    configFrames,
    lifecycleEmitter,
    restartedEmitter,
    indexListeners,
    configListeners,
    setIndexAck: (value) => {
      indexAck = value;
    },
    setConfigAck: (value) => {
      configAck = value;
    },
  };
}

/** 等微任务队列排空（订阅 ACK 都是 promise）。 */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("A73 workspace 订阅与双 topic 独立代际", () => {
  it("每个 workspace 起两条 topic 订阅，参数带 background/task-index/existing-only", async () => {
    const h = harness();
    h.syncer.ensureWorkspaceSubscription(TARGET);
    await settle();
    assert.equal(h.calls.subscribeIndex.length, 1);
    assert.equal(h.calls.subscribeConfig.length, 1);
    assert.deepEqual(h.calls.subscribeIndex[0], {
      ...TARGET,
      visibility: "background",
      subscriberScope: "task-index",
      runtimePolicy: "existing-only",
    });
    assert.deepEqual(h.calls.subscribeConfig[0], {
      ...TARGET,
      visibility: "background",
      subscriberScope: "task-index",
      runtimePolicy: "existing-only",
    });
    h.syncer.disposeAll();
  });

  it("同一 workspaceKey 重复 ensure 只建一次；空 workspacePath 直接忽略", async () => {
    const h = harness();
    h.syncer.ensureWorkspaceSubscription(TARGET);
    h.syncer.ensureWorkspaceSubscription({ ...TARGET, workspacePath: WORKSPACE_PATH });
    h.syncer.ensureWorkspaceSubscription({ workspacePath: "" });
    await settle();
    assert.equal(h.calls.subscribeIndex.length, 1);
    assert.equal(h.calls.subscribeConfig.length, 1);
    h.syncer.disposeAll();
  });

  it("两条 topic 的 ACK 互不阻塞：config 慢不影响 index 的初始帧", async () => {
    const h = harness();
    h.setConfigAck(new Promise(() => {}));
    h.syncer.ensureWorkspaceSubscription(TARGET);
    await settle();
    assert.equal(h.calls.subscribeIndex.length, 1);
    assert.equal(h.calls.subscribeConfig.length, 1);
    // index 已 ACK：initial snapshot 能被接收并播种。
    h.indexFrames.fire(completeWire(snapshotFrame([summary("s-1")])));
    await settle();
    assert.deepEqual(
      h.repo.seeded.map((meta) => meta.taskId),
      ["s-1"],
      "index 侧不受 config 未 ACK 影响",
    );
    h.syncer.disposeAll();
  });

  it("workspace-config 的 apply 忽略空 configOptions，非空时广播 workspace_config_options_update", async () => {
    const h = harness();
    const seen = [];
    h.syncer.onDynamicWorkspaceEvent(TARGET)((event) => seen.push(event));
    h.syncer.ensureWorkspaceSubscription(TARGET);
    await settle();

    const configWire = (config, toSeq = 2) =>
      completeWire(
        {
          topic: TOPIC_CONFIG,
          subscriptionId: "sub-config",
          fromSeq: 1,
          toSeq,
          sentAt: 1,
          payload: {
            kind: "deltas",
            deltas: [{ op: "config.updated", config }],
          },
        },
        { deliveryKind: "online" },
      );
    // 先建立 base，否则 delta 会走 recovery。
    h.configFrames.fire(
      completeWire(
        {
          topic: TOPIC_CONFIG,
          subscriptionId: "sub-config",
          fromSeq: 0,
          toSeq: 1,
          sentAt: 1,
          payload: {
            kind: "snapshot",
            snapshot: {
              protocolVersion: 1,
              workspaceId: WORKSPACE_KEY,
              logEpoch: "epoch-1",
              config: { configOptions: [], slashCommands: [] },
            },
          },
        },
        { deliveryKind: "initial" },
      ),
    );
    await settle();
    assert.deepEqual(seen, [], "空 configOptions 不广播");

    h.configFrames.fire(
      configWire({
        configOptions: [
          { id: "model", name: "模型", type: "select", currentValue: "glm-4.6", options: [] },
        ],
        slashCommands: [],
      }),
    );
    await settle();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].type, "workspace_config_options_update");
    assert.deepEqual(
      seen[0].configOptions.map((option) => option.id),
      ["model"],
    );
    assert.equal(seen[0].workspacePath, WORKSPACE_PATH);
    assert.equal(seen[0].workspaceIdentity, IDENTITY);
    h.syncer.disposeAll();
  });

  it("getWorkspaceEmitter 对同一 key 复用；emitWorkspaceTaskListChanged 带 meta 与 unreadSignal", async () => {
    const h = harness();
    const first = h.syncer.getWorkspaceEmitter(TARGET);
    const second = h.syncer.getWorkspaceEmitter({
      workspacePath: WORKSPACE_PATH,
      workspaceIdentity: IDENTITY,
    });
    const byPath = h.syncer.getWorkspaceEmitter(WORKSPACE_PATH);
    assert.equal(first, second, "同一身份 key 复用同一 emitter");
    assert.notEqual(first, byPath, "纯字符串按路径作 key，与带 identity 的不是同一桶");

    const seen = [];
    first.event((event) => seen.push(event));
    const meta = { taskId: "s-1", title: "t" };
    h.syncer.emitWorkspaceTaskListChanged({ ...TARGET, taskId: "s-1" }, meta, "task_created", {
      unreadSignal: "background_terminal",
    });
    h.syncer.emitWorkspaceTaskListChanged(
      { ...TARGET, taskId: "s-1" },
      undefined,
      "task_meta_changed",
    );
    assert.equal(seen.length, 2);
    assert.deepEqual(seen[0], {
      type: "workspace_task_list_changed",
      workspacePath: WORKSPACE_PATH,
      workspaceIdentity: IDENTITY,
      taskId: "s-1",
      reason: "task_created",
      taskMeta: meta,
      unreadSignal: "background_terminal",
    });
    assert.equal("taskMeta" in seen[1], false, "无 meta 时不带该键");
    assert.equal("unreadSignal" in seen[1], false);
    h.syncer.disposeAll();
  });
});

describe("A74 runtime 生命周期失效与 disposeAll 资源收口", () => {
  it("unavailable 只失效匹配 generation 的 workspace，不反向 unsubscribe", async () => {
    const h = harness({ lifecycle: true });
    h.lifecycleEmitter.fire({
      state: "available",
      workspaceKey: WORKSPACE_KEY,
      workspacePath: WORKSPACE_PATH,
      workspaceIdentity: IDENTITY,
      runtimeIdentity: { generation: 1 },
    });
    await settle();
    assert.equal(h.calls.subscribeIndex.length, 1);

    // generation 不匹配：忽略。
    h.lifecycleEmitter.fire({
      state: "unavailable",
      workspaceKey: WORKSPACE_KEY,
      workspacePath: WORKSPACE_PATH,
      workspaceIdentity: IDENTITY,
      runtimeIdentity: { generation: 2 },
    });
    await settle();
    assert.deepEqual(h.calls.unsubscribeIndex, [], "失效不主动 unsubscribe");

    // generation 匹配：清空代际；随后 available 用新 generation 触发 runtime-restart。
    h.lifecycleEmitter.fire({
      state: "unavailable",
      workspaceKey: WORKSPACE_KEY,
      workspacePath: WORKSPACE_PATH,
      workspaceIdentity: IDENTITY,
      runtimeIdentity: { generation: 1 },
    });
    await settle();
    h.lifecycleEmitter.fire({
      state: "available",
      workspaceKey: WORKSPACE_KEY,
      workspacePath: WORKSPACE_PATH,
      workspaceIdentity: IDENTITY,
      runtimeIdentity: { generation: 3 },
    });
    await settle();
    assert.equal(h.calls.subscribeIndex.length, 2, "新 generation 重订");
    assert.equal(h.calls.subscribeConfig.length, 2);
    h.syncer.disposeAll();
  });

  it("首次 available 事件就为新 workspace 建订阅；后续同 generation 不重订", async () => {
    const h = harness({ lifecycle: true });
    const event = {
      state: "available",
      workspaceKey: WORKSPACE_KEY,
      workspacePath: WORKSPACE_PATH,
      workspaceIdentity: IDENTITY,
      runtimeIdentity: { generation: 7 },
    };
    h.lifecycleEmitter.fire(event);
    await settle();
    assert.equal(h.calls.subscribeIndex.length, 1);
    h.lifecycleEmitter.fire(event);
    await settle();
    assert.equal(h.calls.subscribeIndex.length, 1, "同 generation 不重复订阅");
    h.syncer.disposeAll();
  });

  it("无 onAgentRuntimeLifecycle 时退回 onAgentRuntimeRestarted：创建即启动 + 重启重订", async () => {
    const h = harness({ lifecycle: false });
    h.syncer.ensureWorkspaceSubscription(TARGET);
    await settle();
    assert.equal(h.calls.subscribeIndex.length, 1, "lifecycleAware=false 时创建即启动");
    h.restartedEmitter.fire({ workspaceKey: WORKSPACE_KEY });
    await settle();
    assert.equal(h.calls.subscribeIndex.length, 2, "restart 事件重订");
    h.syncer.disposeAll();
  });

  it("disposeAll 逐个 unsubscribe 两条 topic、清 workspace、并让后续 ensure 变 no-op", async () => {
    const h = harness();
    h.syncer.ensureWorkspaceSubscription(TARGET);
    await settle();
    h.syncer.disposeAll();
    await settle();
    assert.deepEqual(
      h.calls.unsubscribeIndex.map((call) => call.subscriptionId),
      ["sub-index"],
    );
    assert.deepEqual(
      h.calls.unsubscribeConfig.map((call) => call.subscriptionId),
      ["sub-config"],
    );
    assert.equal(h.calls.unsubscribeIndex[0].runtimePolicy, "existing-only");
    assert.equal(h.calls.unsubscribeConfig[0].runtimePolicy, "existing-only");

    const before = h.calls.subscribeIndex.length;
    h.syncer.ensureWorkspaceSubscription(TARGET);
    await settle();
    assert.equal(h.calls.subscribeIndex.length, before, "dispose 后不再订阅");

    // 帧流与 emitter 都已释放：不再写 repo、不再广播。
    h.indexFrames.fire(completeWire(snapshotFrame([summary("late")])));
    await settle();
    assert.deepEqual(h.repo.seeded, []);
    h.syncer.disposeAll();
  });

  it("disposeAll 幂等：重复调用不再发 unsubscribe，也不再接受新 workspace", async () => {
    const h = harness();
    h.syncer.ensureWorkspaceSubscription(TARGET);
    await settle();
    h.syncer.disposeAll();
    await settle();
    assert.equal(h.calls.unsubscribeIndex.length, 1);
    h.syncer.disposeAll();
    await settle();
    assert.equal(h.calls.unsubscribeIndex.length, 1, "重复 disposeAll 不再 unsubscribe");
    assert.equal(h.calls.unsubscribeConfig.length, 1);
  });

  it("disposeAll 之后 emitter 与事件流都已释放：监听器收不到任何广播", async () => {
    const h = harness();
    const seen = [];
    h.syncer.onDynamicWorkspaceEvent(TARGET)((event) => seen.push(event));
    h.syncer.onSessionTerminalEvent((event) => seen.push(event));
    h.syncer.ensureWorkspaceSubscription(TARGET);
    await settle();
    h.syncer.disposeAll();
    await settle();
    h.syncer.emitWorkspaceTaskListChanged(
      { ...TARGET, taskId: "s-1" },
      undefined,
      "task_meta_changed",
    );
    assert.deepEqual(seen, [], "emitter 已 dispose，不再投递");
  });
});

describe("A75 会话帧投影与终态分流", () => {
  it("首次 snapshot 播种基线行；draft 会话不播种", async () => {
    const h = harness();
    h.syncer.ensureWorkspaceSubscription(TARGET);
    await settle();
    h.indexFrames.fire(
      completeWire(
        snapshotFrame([
          summary("s-1"),
          summary("draft-1", { phase: "draft" }),
          summary("s-2", { phase: "error" }),
        ]),
      ),
    );
    await settle();
    assert.deepEqual(
      h.repo.seeded.map((meta) => [meta.taskId, meta.status]),
      [
        ["s-1", "running"],
        ["s-2", "error"],
      ],
      "draft 不播种；running/error 分别映射",
    );
    assert.deepEqual(
      h.repo.seeded.map((meta) => meta.provider),
      ["knorvia", "knorvia"],
    );
    assert.equal(h.repo.seeded[0].mode, "build");
    h.syncer.disposeAll();
  });

  it("running → completedSuccess 走终态：patch status=completed 并发 turn.completed/prompt_completed", async () => {
    const h = harness();
    const terminal = [];
    const ready = [];
    h.syncer.onSessionTerminalEvent((event) => terminal.push(event));
    h.syncer.onSessionReadyEvent((event) => ready.push(event));
    h.syncer.ensureWorkspaceSubscription(TARGET);
    await settle();
    h.indexFrames.fire(completeWire(snapshotFrame([summary("s-1")])));
    await settle();

    h.indexFrames.fire(
      completeWire(
        {
          topic: TOPIC_INDEX,
          subscriptionId: "sub-index",
          fromSeq: 1,
          toSeq: 2,
          sentAt: 1,
          payload: {
            kind: "deltas",
            deltas: [
              { op: "session.upserted", session: summary("s-1", { phase: "completedSuccess" }) },
            ],
          },
        },
        { deliveryKind: "online" },
      ),
    );
    await settle();
    const terminalPatch = h.repo.patches.at(-1);
    assert.equal(terminalPatch.taskId, "s-1");
    assert.equal(terminalPatch.patch.status, "completed");
    assert.equal("lastError" in terminalPatch.patch, true, "成功终态显式清 lastError");
    assert.deepEqual(
      terminal.map((event) => event.kind),
      ["turn.completed"],
    );
    assert.deepEqual(
      ready.map((event) => event.reason),
      ["prompt_completed"],
    );
    h.syncer.disposeAll();
  });

  it("→ error 走失败终态：status=error 且发 turn.failed/prompt_failed", async () => {
    const h = harness();
    const terminal = [];
    const ready = [];
    h.syncer.onSessionTerminalEvent((event) => terminal.push(event));
    h.syncer.onSessionReadyEvent((event) => ready.push(event));
    h.syncer.ensureWorkspaceSubscription(TARGET);
    await settle();
    h.indexFrames.fire(completeWire(snapshotFrame([summary("s-1")])));
    await settle();
    h.indexFrames.fire(
      completeWire(
        {
          topic: TOPIC_INDEX,
          subscriptionId: "sub-index",
          fromSeq: 1,
          toSeq: 2,
          sentAt: 1,
          payload: {
            kind: "deltas",
            deltas: [{ op: "session.upserted", session: summary("s-1", { phase: "error" }) }],
          },
        },
        { deliveryKind: "online" },
      ),
    );
    await settle();
    assert.equal(h.repo.patches.at(-1).patch.status, "error");
    assert.deepEqual(
      terminal.map((event) => event.kind),
      ["turn.failed"],
    );
    assert.deepEqual(
      ready.map((event) => event.reason),
      ["prompt_failed"],
    );
    h.syncer.disposeAll();
  });

  it("session.removed 只删本地摘要，不写 repo", async () => {
    const h = harness();
    h.syncer.ensureWorkspaceSubscription(TARGET);
    await settle();
    h.indexFrames.fire(completeWire(snapshotFrame([summary("s-1")])));
    await settle();
    const patchesBefore = h.repo.patches.length;
    h.indexFrames.fire(
      completeWire(
        {
          topic: TOPIC_INDEX,
          subscriptionId: "sub-index",
          fromSeq: 1,
          toSeq: 2,
          sentAt: 1,
          payload: { kind: "deltas", deltas: [{ op: "session.removed", sessionId: "s-1" }] },
        },
        { deliveryKind: "online" },
      ),
    );
    await settle();
    assert.equal(h.repo.patches.length, patchesBefore, "移除不触发 patch");
    h.syncer.disposeAll();
  });

  it("runtime-restart 换 subscriptionId 后，旧订阅号的帧被丢弃", async () => {
    const h = harness({ lifecycle: true });
    h.lifecycleEmitter.fire({
      state: "available",
      workspaceKey: WORKSPACE_KEY,
      workspacePath: WORKSPACE_PATH,
      workspaceIdentity: IDENTITY,
      runtimeIdentity: { generation: 1 },
    });
    await settle();
    // 换代：订阅返回新的 subscriptionId，旧 route 的帧不再属于当前 owner。
    h.setIndexAck(Promise.resolve(ack("sub-index-2")));
    h.lifecycleEmitter.fire({
      state: "available",
      workspaceKey: WORKSPACE_KEY,
      workspacePath: WORKSPACE_PATH,
      workspaceIdentity: IDENTITY,
      runtimeIdentity: { generation: 2 },
    });
    await settle();
    h.indexFrames.fire(
      completeWire(snapshotFrame([summary("stale")], { subscriptionId: "sub-index" })),
    );
    await settle();
    assert.deepEqual(h.repo.seeded, [], "旧 subscriptionId 的帧不播种");
    h.indexFrames.fire(
      completeWire(snapshotFrame([summary("fresh")], { subscriptionId: "sub-index-2" })),
    );
    await settle();
    assert.deepEqual(
      h.repo.seeded.map((meta) => meta.taskId),
      ["fresh"],
      "新 subscriptionId 的帧正常接收",
    );
    h.syncer.disposeAll();
  });
});

describe("A78 快照投影、搜索文本预算与模型写回", () => {
  it("projectSnapshotMeta 用 override 优先、缺省回落到快照与 traceId 生成", () => {
    const snapshot = {
      session: {
        sessionId: "s-1",
        traceId: undefined,
        workspace: { workspacePath: WORKSPACE_PATH, workspaceIdentity: IDENTITY },
        title: "标题",
        mode: "build",
        createdAt: 1_000,
        updatedAt: 2_000,
      },
      settings: {
        model: { current: { providerId: "p1", modelId: "m1" } },
        thoughtLevel: { current: "high" },
      },
      projection: {
        status: "idle",
        target: undefined,
        pendingPermissions: [],
        activeToolCalls: [],
      },
      runtime: { activeTurnId: undefined },
      messages: [],
    };
    const meta = projectSnapshotMeta(snapshot, {});
    assert.equal(meta.taskId, "s-1");
    assert.equal(meta.provider, "knorvia");
    assert.match(
      meta.traceId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
      "缺 traceId 时新生成一个 uuid",
    );
    assert.notEqual(
      projectSnapshotMeta(snapshot, {}).traceId,
      meta.traceId,
      "每次投影生成不同 traceId（不是确定性派生）",
    );
    assert.equal(meta.thoughtLevel, "high");

    const overridden = projectSnapshotMeta(snapshot, {
      modelOverride: "  custom-model  ",
      thoughtLevelOverride: "  low  ",
    });
    assert.equal(overridden.model, "custom-model", "override 先 trim");
    assert.equal(overridden.thoughtLevel, "low");

    // 空白 override 视为未给，回落到快照。
    const blank = projectSnapshotMeta(snapshot, { modelOverride: "   ", thoughtLevelOverride: "" });
    assert.equal(blank.thoughtLevel, "high");
    assert.notEqual(blank.model, "   ");
  });

  it("projectSnapshotSearchText 只收用户可见消息、按换行连接、上限 200000 字符", () => {
    const textPart = (text) => ({ type: "text", text });
    const message = (role, parts) => ({ info: { role }, parts });
    const snapshot = (messages) => ({
      session: {
        sessionId: "s-1",
        workspace: { workspacePath: WORKSPACE_PATH },
        title: "",
      },
      projection: { target: undefined },
      messages,
    });
    assert.equal(
      projectSnapshotSearchText(
        snapshot([
          message("user", [textPart("  第一条  ")]),
          message("assistant", [textPart("  第二条  ")]),
          message("user", [textPart("第三条")]),
        ]),
      ),
      "第一条\n第二条\n第三条",
    );
    // 助手消息只取最后一段 text。
    assert.equal(
      projectSnapshotSearchText(
        snapshot([message("assistant", [textPart("中间"), textPart("最后")])]),
      ),
      "最后",
    );
    // 纯空白片段被跳过。
    assert.equal(
      projectSnapshotSearchText(snapshot([message("user", [textPart("   "), textPart("x")])])),
      "x",
    );
    // 超长正文被截到 200000。
    const huge = "y".repeat(250_000);
    const truncated = projectSnapshotSearchText(snapshot([message("user", [textPart(huge)])]));
    assert.equal(truncated.length, 200_000);
  });

  it("sync 在 subagent_child 上只回 meta，不写 repo 不广播", async () => {
    const h = harness();
    const seen = [];
    h.syncer.onDynamicWorkspaceEvent(TARGET)((event) => seen.push(event));
    const snapshot = {
      session: {
        sessionId: "child-1",
        sessionKind: "subagent_child",
        workspace: { workspacePath: WORKSPACE_PATH, workspaceIdentity: IDENTITY },
        title: "子代理",
        mode: "build",
        createdAt: 1,
        updatedAt: 2,
      },
      settings: {
        thoughtLevel: { current: "high" },
        model: { current: { providerId: "p", modelId: "m" } },
      },
      projection: { status: "idle", pendingPermissions: [], activeToolCalls: [] },
      runtime: { activeTurnId: undefined },
      messages: [],
    };
    const meta = await h.syncer.syncSnapshotAndBroadcast(snapshot, {
      broadcastReason: "task_created",
    });
    assert.equal(meta.taskId, "child-1");
    assert.deepEqual(h.repo.syncs, [], "subagent_child 不写 repo");
    assert.deepEqual(seen, [], "subagent_child 不广播");
    h.syncer.disposeAll();
  });

  it("sync 对可见快照写 repo 并广播；不可见快照只入库不广播", async () => {
    const h = harness();
    const seen = [];
    h.syncer.onDynamicWorkspaceEvent(TARGET)((event) => seen.push(event));
    const base = {
      session: {
        sessionId: "s-1",
        workspace: { workspacePath: WORKSPACE_PATH, workspaceIdentity: IDENTITY },
        title: "可见标题",
        mode: "build",
        createdAt: 1,
        updatedAt: 2,
      },
      settings: {
        thoughtLevel: { current: "high" },
        model: { current: { providerId: "p", modelId: "m" } },
      },
      projection: { status: "idle", pendingPermissions: [], activeToolCalls: [] },
      runtime: { activeTurnId: undefined },
      messages: [],
    };
    await h.syncer.syncSnapshotAndBroadcast(base, { broadcastReason: "task_created" });
    assert.equal(h.repo.syncs.length, 1);
    assert.equal(h.repo.syncs[0].kind, "syncTaskMeta");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].reason, "task_created");
    assert.equal(seen[0].taskMeta.taskId, "s-1");

    // 不可见：无标题、无目标、无用户文本。
    const invisible = {
      ...base,
      session: { ...base.session, sessionId: "s-2", title: "" },
    };
    const before = seen.length;
    await h.syncer.syncSnapshotAndBroadcast(invisible, { broadcastReason: "task_created" });
    assert.equal(h.repo.syncs.length, 2, "不可见快照仍然入库");
    assert.equal(seen.length, before, "不可见快照不广播");
    h.syncer.disposeAll();
  });

  it("moveGroupedTaskToTop 走 syncTaskMetaAtGroupedTop，并把 reason 改成 task_created", async () => {
    const h = harness();
    const seen = [];
    h.syncer.onDynamicWorkspaceEvent(TARGET)((event) => seen.push(event));
    const snapshot = {
      session: {
        sessionId: "s-1",
        workspace: { workspacePath: WORKSPACE_PATH, workspaceIdentity: IDENTITY },
        title: "标题",
        mode: "build",
        createdAt: 1,
        updatedAt: 2,
      },
      settings: {
        thoughtLevel: { current: "high" },
        model: { current: { providerId: "p", modelId: "m" } },
      },
      projection: { status: "idle", pendingPermissions: [], activeToolCalls: [] },
      runtime: { activeTurnId: undefined },
      messages: [],
    };
    await h.syncer.syncSnapshotAndBroadcast(snapshot, {
      broadcastReason: "task_status_changed",
      moveGroupedTaskToTop: true,
    });
    assert.equal(h.repo.syncs[0].kind, "syncTaskMetaAtGroupedTop");
    assert.equal(seen[0].reason, "task_created", "initializedGroupedOrder 时 reason 改写");
    h.syncer.disposeAll();
  });

  it("syncTaskModel 对空白返回 null 不写盘；正常值写单字段 patch", async () => {
    const h = harness();
    assert.equal(await h.syncer.syncTaskModel({ ...TARGET, sessionId: "s-1" }, "   "), null);
    assert.deepEqual(h.repo.models, [], "空白模型不写盘");

    const meta = await h.syncer.syncTaskModel({ ...TARGET, sessionId: "s-1" }, "  glm-4.6  ");
    assert.equal(meta.model, "glm-4.6", "写盘前 trim");
    assert.deepEqual(h.repo.models[0], {
      workspacePath: WORKSPACE_PATH,
      workspaceIdentity: IDENTITY,
      taskId: "s-1",
      patch: { model: "glm-4.6" },
    });

    // repo 同步抛错时返回 null，不向上抛。
    h.repo.updateTaskState = () => {
      throw new Error("db locked");
    };
    assert.equal(await h.syncer.syncTaskModel({ ...TARGET, sessionId: "s-1" }, "m"), null);
    // 异步 reject 走同一个 decline 分支。
    h.repo.updateTaskState = () => Promise.reject(new Error("db locked"));
    assert.equal(await h.syncer.syncTaskModel({ ...TARGET, sessionId: "s-1" }, "m"), null);
    h.syncer.disposeAll();
  });
});
