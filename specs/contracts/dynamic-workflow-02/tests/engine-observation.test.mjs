// SPDX-License-Identifier: Apache-2.0
// B8 ask 的进度与用量观察 · B9 展示与自适应观察通道（log / phase / waiting / executing /
// mutating / concurrency-changed / run-stalled）
//
// 这一族的共同形状：引擎**只 record**，不做任何解释或再加工。因此每个测试都有两半——
// 一半钉「发什么、载荷逐字节是什么」，一半钉「不发什么」（不落 dwf_node 行、不改调度、结算后到达即丢）。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dw } from "./entry.mjs";
import {
  eventTypes,
  inst,
  journalEvents,
  makeHarness,
  nodeRow,
  refOf,
  tick,
  wfError,
} from "./harness.mjs";

const { InMemoryJournalStore } = dw;

const RUN_ID = "run-1";

/**
 * 记调用顺序的 journal 包裹层：`askStats` 承诺「列值先于事件」，那只能从写入顺序上钉，
 * 断言两侧的值相等是钉不住的（同一同步步骤里谁先谁后都相等）。
 */
function tracedJournal(store) {
  const trace = [];
  const at = (label) => trace.push(label);
  return {
    trace,
    journal: {
      createRun(record) {
        at("createRun");
        return store.createRun(record);
      },
      getRun: (runId) => store.getRun(runId),
      updateRunStatus(runId, status, settlement) {
        at(`updateRunStatus:${status}`);
        return store.updateRunStatus(runId, status, settlement);
      },
      updateRunUsage(runId, spentTokens) {
        at(`updateRunUsage:${spentTokens}`);
        return store.updateRunUsage(runId, spentTokens);
      },
      putActor(record) {
        at("putActor");
        return store.putActor(record);
      },
      getActor: (runId, siteId, ordinal) => store.getActor(runId, siteId, ordinal),
      listActors: (runId) => store.listActors(runId),
      putNode(record) {
        at(`putNode:${record.status}`);
        return store.putNode(record);
      },
      getNode: (runId, siteId, ordinal) => store.getNode(runId, siteId, ordinal),
      listNodes: (runId) => store.listNodes(runId),
      appendEvent(runId, event) {
        at(`appendEvent:${event.type}`);
        return store.appendEvent(runId, event);
      },
      listEvents: (runId, opts) => store.listEvents(runId, opts),
    },
  };
}

/** 一条 live 的 untyped ask：返回 harness、实例、以及那次 ask 的 promise。 */
async function withLiveAsk(options = {}) {
  const h = makeHarness({ askSpecs: { "ask#1": { typed: false } }, ...options });
  const actor = h.engine.createActor("actor#1", "researcher");
  const pending = h.engine.ask("ask#1", actor, "work");
  await tick();
  assert.equal(h.recorded.starts.length, 1);
  return { h, actor, pending, ref: inst("ask#1", 1) };
}

describe("B8 ask 的进度与用量观察", () => {
  it("askProgress 纯透传：逐条落事件、载荷原样、不改调度也不写行", async () => {
    const { h, ref } = await withLiveAsk();
    h.engine.askProgress(ref, {
      turn: 1,
      toolCalls: 3,
      lastTool: { name: "read", target: "a.ts" },
    });
    h.engine.askProgress(ref, { turn: 2, toolCalls: 5 });
    const progress = journalEvents(h.journal, RUN_ID).filter((e) => e.type === "node-progress");
    assert.deepEqual(progress, [
      {
        instance: ref,
        lastTool: { name: "read", target: "a.ts" },
        toolCalls: 3,
        turn: 1,
        type: "node-progress",
      },
      { instance: ref, toolCalls: 5, turn: 2, type: "node-progress" },
    ]);
    // 进度不是工作量：没有 dwf_node 行，节点仍在飞（后续 turn 照常结算）。
    assert.deepEqual(
      h.journal.listNodes(RUN_ID).map((n) => n.status),
      ["running"],
    );
    assert.equal(h.engine.status(), "running");
  });

  it("askProgress 不加工载荷：上限归 driver 所有，引擎切了就是替 driver 兜底", async () => {
    const { h, ref } = await withLiveAsk();
    const name = "x".repeat(200);
    const target = "y".repeat(400);
    h.engine.askProgress(ref, { turn: 1, toolCalls: 1, lastTool: { name, target } });
    const event = journalEvents(h.journal, RUN_ID).find((e) => e.type === "node-progress");
    assert.equal(event.lastTool.name, name);
    assert.equal(event.lastTool.target, target);
  });

  it("askProgress 不问实例是否还活着：引擎唯一的门是 run 结算", async () => {
    const { h, pending, ref } = await withLiveAsk();
    h.engine.askProgress(inst("never-dispatched", 9), { turn: 1, toolCalls: 0 });
    h.engine.askTurnEnded(ref, "done");
    await pending;
    const sites = journalEvents(h.journal, RUN_ID)
      .filter((e) => e.type === "node-progress")
      .map((e) => refOf(e.instance.siteId, e.instance.ordinal));
    assert.deepEqual(sites, ["never-dispatched@9"]);
  });

  it("askStats：先写 spent_tokens 列、再发同值事件，两条写入路径永远一致", async () => {
    const store = new InMemoryJournalStore();
    const traced = tracedJournal(store);
    const { h, pending, ref } = await withLiveAsk({ journal: traced.journal });
    h.engine.askStats(ref, { tokens: 40, toolCalls: 1, turns: 1 });
    h.engine.askProgress(ref, { turn: 2, toolCalls: 2 });
    h.engine.askStats(ref, { tokens: 60, toolCalls: 1, turns: 1 });
    assert.deepEqual(
      traced.trace.filter(
        (t) =>
          t.startsWith("updateRunUsage") ||
          t === "appendEvent:usage-updated" ||
          t === "appendEvent:node-progress",
      ),
      [
        "updateRunUsage:40",
        "appendEvent:usage-updated",
        "appendEvent:node-progress",
        "updateRunUsage:100",
        "appendEvent:usage-updated",
      ],
    );
    assert.equal(h.journal.getRun(RUN_ID).spentTokens, 100);
    assert.deepEqual(
      journalEvents(h.journal, RUN_ID)
        .filter((e) => e.type === "usage-updated")
        .map((e) => e.spentTokens),
      [40, 100],
    );
    // 用量观察与调度正交：ask 还在飞。
    assert.equal(h.engine.status(), "running");
    h.engine.askTurnEnded(ref, "done");
    await pending;
  });

  it("继承的用量在建 run 那一世就起账并补发一条 usage-updated；脏值归一", () => {
    const h = makeHarness({ engine: { inheritedTokens: 1_000 } });
    assert.equal(h.journal.getRun(RUN_ID).spentTokens, 1_000);
    assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)), [
      "run-started",
      "usage-updated",
    ]);
    assert.deepEqual(journalEvents(h.journal, RUN_ID)[1], {
      spentTokens: 1_000,
      type: "usage-updated",
    });
    // 零不发：每个全新 run 都付一条噪音事件没有意义。
    const zero = makeHarness({});
    assert.deepEqual(eventTypes(journalEvents(zero.journal, RUN_ID)), ["run-started"]);
  });

  for (const [label, inherited, expected] of [
    ["小数下取整", 12.9, 12],
    ["负数按缺席", -5, 0],
    ["NaN 按缺席", Number.NaN, 0],
    ["Infinity 按缺席", Number.POSITIVE_INFINITY, 0],
  ]) {
    it(`inheritedTokens 归一：${label}`, () => {
      const h = makeHarness({ engine: { inheritedTokens: inherited } });
      assert.equal(h.journal.getRun(RUN_ID).spentTokens, expected);
      assert.deepEqual(
        eventTypes(journalEvents(h.journal, RUN_ID)),
        expected === 0 ? ["run-started"] : ["run-started", "usage-updated"],
      );
    });
  }

  it("结算后到达的迟到 stats：账照入、节点行回填，但不再发事件", async () => {
    const { h, pending, ref } = await withLiveAsk();
    h.engine.askStats(ref, { tokens: 10, toolCalls: 1, turns: 1 });
    h.engine.complete("done");
    await assert.rejects(pending);
    const before = journalEvents(h.journal, RUN_ID);
    // 真实 actor 的用量常在 turn 解析后才知道，最后一个 ask 的 stats 经常晚于 complete。
    h.engine.askStats(ref, { tokens: 999, toolCalls: 2, turns: 3, worldToolCalls: 1 });
    assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)), eventTypes(before));
    assert.equal(journalEvents(h.journal, RUN_ID).at(-1).type, "run-settled");
    // 可 resume 的 run 用量跨生命周期连续：列值仍然前进了。
    assert.equal(h.journal.getRun(RUN_ID).spentTokens, 1_009);
    // 节点已随结算离开 inFlight，迟到 stats 走「整行回填」那条路，保留既有状态。
    assert.deepEqual(nodeRow(h.journal, RUN_ID, "ask#1").stats, {
      tokens: 999,
      toolCalls: 2,
      turns: 3,
      worldToolCalls: 1,
    });
    assert.equal(nodeRow(h.journal, RUN_ID, "ask#1").status, "running");
  });

  it("结算后到达的迟到 progress：只丢事件，不给已完结的 run 长尾巴", async () => {
    const { h, pending, ref } = await withLiveAsk();
    h.engine.complete("done");
    await assert.rejects(pending);
    const before = journalEvents(h.journal, RUN_ID).length;
    h.engine.askProgress(ref, { turn: 1, toolCalls: 1 });
    assert.equal(journalEvents(h.journal, RUN_ID).length, before);
  });
});

describe("B9 展示通道：log 与 phase 标记", () => {
  it("log 只发事件：无 site、无 dwf_node 行", () => {
    const h = makeHarness({});
    h.engine.log("step one");
    h.engine.log("");
    assert.deepEqual(journalEvents(h.journal, RUN_ID).slice(1), [
      { message: "step one", type: "log" },
      { message: "", type: "log" },
    ]);
    assert.deepEqual(h.journal.listNodes(RUN_ID), []);
  });

  it("enterPhase：trim 名字、空名整体忽略、每次求值都发、ordinal 按名字计数", () => {
    const h = makeHarness({});
    h.engine.enterPhase("Plan");
    h.engine.enterPhase("  Plan  ");
    h.engine.enterPhase("");
    h.engine.enterPhase("   ");
    h.engine.enterPhase("Build");
    assert.deepEqual(journalEvents(h.journal, RUN_ID).slice(1), [
      { name: "Plan", ordinal: 1, type: "phase-entered" },
      { name: "Plan", ordinal: 2, type: "phase-entered" },
      { name: "Build", ordinal: 1, type: "phase-entered" },
    ]);
    assert.deepEqual(h.journal.listNodes(RUN_ID), []);
  });

  it("阶段名与站点 id 各数各的：同名互不消耗对方的序号", async () => {
    const h = makeHarness({ askSpecs: { "ask#1": { typed: false } } });
    h.engine.enterPhase("ask#1");
    const actor = h.engine.createActor("actor#1");
    const pending = h.engine.ask("ask#1", actor, "work");
    await tick();
    h.engine.enterPhase("ask#1");
    const queued = journalEvents(h.journal, RUN_ID).find((e) => e.type === "node-queued");
    assert.equal(queued.instance.ordinal, 1);
    assert.equal(queued.actor.ordinal, 1);
    const phases = journalEvents(h.journal, RUN_ID).filter((e) => e.type === "phase-entered");
    assert.deepEqual(
      phases.map((e) => e.ordinal),
      [1, 2],
    );
    h.engine.askTurnEnded(inst("ask#1", 1), "x");
    await pending;
  });

  it("出生阶段随事件向前携带：actor-created 与 node-queued 带 phaseName，标记之前出生则缺席", async () => {
    const h = makeHarness({ askSpecs: { "ask#1": { typed: false } } });
    const before = h.engine.createActor("actor#1");
    await tick();
    h.engine.enterPhase("Build");
    const after = h.engine.createActor("actor#2");
    const pending = h.engine.ask("ask#1", after, "work");
    await tick();
    const events = journalEvents(h.journal, RUN_ID);
    const actorCreated = events.filter((e) => e.type === "actor-created");
    assert.deepEqual(
      actorCreated.map((e) => e.actor.siteId),
      ["actor#1", "actor#2"],
    );
    // 标记之前出生的实例：键**缺席**而不是空串——读面按「有没有 phaseName」判断是否已知阶段。
    assert.equal("phaseName" in actorCreated[0], false);
    assert.equal(before, refOf("actor#1", 1));
    assert.equal(after, refOf("actor#2", 1));
    assert.equal(actorCreated[1].phaseName, "Build");
    const queued = events.find((e) => e.type === "node-queued");
    assert.equal(queued.phaseName, "Build");
    // 只有出生事件带阶段：dispatched / settled 沿用 actorSiteId 那种「同一 ref」的读法就够。
    assert.equal(
      events
        .filter((e) => e.type === "node-dispatched" || e.type === "node-settled")
        .some((e) => "phaseName" in e),
      false,
    );
    h.engine.askTurnEnded(inst("ask#1", 1), "x");
    await pending;
  });

  it("结算后的 log / enterPhase 一律 no-op（结算后不追加任何事件）", async () => {
    const h = makeHarness({});
    h.engine.log("before");
    h.engine.enterPhase("Before");
    h.engine.complete(1);
    await h.engine.settled;
    const before = journalEvents(h.journal, RUN_ID).length;
    h.engine.log("after");
    h.engine.enterPhase("After");
    assert.equal(journalEvents(h.journal, RUN_ID).length, before);
    assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)), [
      "run-started",
      "log",
      "phase-entered",
      "run-settled",
    ]);
  });
});

describe("B9 自适应并发与 run 级观察", () => {
  it("concurrencyChanged / runStalled：载荷原样展开，引擎不解释", () => {
    const h = makeHarness({});
    h.engine.concurrencyChanged({
      key: "prov/model",
      previous: 4,
      next: 2,
      reason: "rate_limited",
      lastGood: 3,
      lastBad: 8,
      cooldownMs: 1_500,
    });
    h.engine.runStalled({ sinceMs: 30_000, reason: "no-progress", cap: 300_000 });
    h.engine.runStalled({ sinceMs: 1 });
    const events = journalEvents(h.journal, RUN_ID).slice(1);
    assert.deepEqual(events, [
      {
        cooldownMs: 1_500,
        key: "prov/model",
        lastBad: 8,
        lastGood: 3,
        next: 2,
        previous: 4,
        reason: "rate_limited",
        type: "concurrency-changed",
      },
      { cap: 300_000, reason: "no-progress", sinceMs: 30_000, type: "run-stalled" },
      { sinceMs: 1, type: "run-stalled" },
    ]);
    assert.deepEqual(h.journal.listNodes(RUN_ID), []);
  });

  it("askWaiting / askExecuting：只报 live 节点，节点或 run 一旦结算即忽略", async () => {
    const { h, pending, ref } = await withLiveAsk();
    h.engine.askWaiting(ref, { cause: "slot" });
    h.engine.askExecuting(ref);
    h.engine.askWaiting(inst("ask#1", 7), { cause: "backoff", attempt: 2, delayMs: 400 });
    const seen = journalEvents(h.journal, RUN_ID).filter(
      (e) => e.type === "node-waiting" || e.type === "node-executing",
    );
    assert.deepEqual(seen, [
      { cause: "slot", instance: ref, type: "node-waiting" },
      { instance: ref, type: "node-executing" },
    ]);
    h.engine.askTurnEnded(ref, "done");
    await pending;
    const after = journalEvents(h.journal, RUN_ID).length;
    h.engine.askWaiting(ref, { cause: "slot" });
    h.engine.askExecuting(ref);
    assert.equal(journalEvents(h.journal, RUN_ID).length, after);
  });

  it("askMutating：只在 live 节点上关门，一个 run 最多一条 import-cache-closed", async () => {
    const importedCache = { actors: new Map(), world: new Map() };
    const { h, pending, ref } = await withLiveAsk({ engine: { importedCache } });
    h.engine.askMutating(ref);
    h.engine.askMutating(ref);
    h.engine.askMutating(inst("ask#1", 42));
    h.engine.complete("done");
    await assert.rejects(pending);
    const closed = journalEvents(h.journal, RUN_ID).filter((e) => e.type === "import-cache-closed");
    assert.deepEqual(closed, [
      {
        actorName: "researcher",
        cause: "mutating-tool",
        instance: ref,
        type: "import-cache-closed",
      },
    ]);
  });

  it("askMutating 在非修订 run 上只置标志、不发事件（没有表可关）", async () => {
    const { h, ref } = await withLiveAsk();
    h.engine.askMutating(ref);
    assert.equal(
      journalEvents(h.journal, RUN_ID).some((e) => e.type === "import-cache-closed"),
      false,
    );
  });

  it("stopRun：确定性模型侧错误 ⇒ stopped(provider)，ProviderStop 补上该子代理的出生阶段", async () => {
    const h = makeHarness({ askSpecs: { "ask#1": { typed: false } } });
    h.engine.enterPhase("Plan");
    // createActor 返回的就是 `site@ordinal` 那个字符串句柄，driver 侧上报的 subagent 是同一个串。
    const actor = h.engine.createActor("actor#1");
    const pending = h.engine.ask("ask#1", actor, "work");
    await tick();
    h.engine.enterPhase("Build");
    h.engine.stopRun(
      wfError("ProviderStop", "model refused", {
        providerStop: { kind: "other", reason: "content_policy", subagent: actor },
      }),
    );
    const settlement = await h.engine.settled;
    await assert.rejects(pending);
    assert.equal(settlement.reason, "provider");
    assert.equal(settlement.error.code, "ProviderStop");
    assert.equal(settlement.error.providerStop.phase, "Plan");
    assert.equal(h.journal.getRun(RUN_ID).failure.providerStop.phase, "Plan");
  });

  it("stopRun：已经带 phase、或子代理出生在任何一个标记之前 ⇒ 原样转发", async () => {
    const h = makeHarness({});
    const carried = wfError("ProviderStop", "with phase", {
      providerStop: {
        kind: "quota",
        reason: "rate_limited",
        subagent: "actor#9@1",
        phase: "Given",
      },
    });
    h.engine.stopRun(carried);
    assert.equal((await h.engine.settled).error, carried);

    const plain = makeHarness({});
    const unknown = wfError("ProviderStop", "no such subagent", {
      providerStop: { kind: "auth", reason: "auth_failed", subagent: "actor#404@1" },
    });
    plain.engine.stopRun(unknown);
    const error = (await plain.engine.settled).error;
    assert.equal(error, unknown);
    assert.equal("phase" in error.providerStop, false);
  });

  it("stopRun 不带 providerStop 时原样转发（enrich 只碰它自己那件事）", async () => {
    const h = makeHarness({});
    const error = wfError("ProviderStop", "upstream 5xx");
    h.engine.stopRun(error);
    const settlement = await h.engine.settled;
    assert.equal(settlement.error, error);
    assert.equal(settlement.reason, "provider");
  });
});
