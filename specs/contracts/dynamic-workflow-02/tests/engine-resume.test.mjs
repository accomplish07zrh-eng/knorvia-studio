// SPDX-License-Identifier: Apache-2.0
// B13 ask 的行恢复与脚本哈希 · B14 amend-resume 的导入缓存
//
// resume 是**崩溃恢复**，不是复验：同一个 runId 再构造一次引擎，已记录的行决定「不再问 driver」，
// 未记录的行才走 live。导入缓存是同一件事的另一个方向——**前驱** run 的行决定本 run 哪些 ask
// 可以不出门。两族断言因此都成对：命中那一侧钉「没出门、落了什么行、发了哪个事件」，
// 分歧那一侧钉「出门了、带什么种子、之后不可复活」。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dw } from "./entry.mjs";
import {
  eventTypes,
  inst,
  journalEvents,
  makeHarness,
  nodeRow,
  rejectionOf,
  settleAsk,
  tick,
  tracedJournal,
} from "./harness.mjs";

const { InMemoryJournalStore, inputHash } = dw;

const RUN_ID = "run-1";

/** 一个已经活过一世、可以 resume 的 journal（节点行的 kind 默认 ask，上一世的终态最后写）。 */
function seededJournal({ nodes = [], events = [], run = {}, settle } = {}) {
  const store = new InMemoryJournalStore();
  store.createRun({
    runId: RUN_ID,
    caps: { maxConcurrency: 1 },
    spentTokens: 0,
    status: "running",
    ...run,
  });
  for (const node of nodes) store.putNode({ runId: RUN_ID, kind: "ask", ...node });
  for (const event of events) store.appendEvent(RUN_ID, event);
  // 上一世的终态要**最后**写：resume 的 updateRunStatus(running) 会清掉结算残影，先写就被清掉了。
  if (settle !== undefined) store.updateRunStatus(RUN_ID, settle.status, settle.settlement);
  return store;
}

/** 一世停在 stopped、有一条 completed ask 行的 journal（脚本哈希固定）。 */
function stoppedRunWithAsk(instructions = "work", result = { from: "world-1" }) {
  return seededJournal({
    run: { scriptHash: "h-recorded" },
    nodes: [askRow("ask#1", 1, instructions, { status: "completed", result })],
    settle: { status: "stopped", settlement: { stopReason: "user" } },
  });
}

/** 一行属于 actor#1@1 的 ask 记录：actorSeq 按站点出现序。 */
function askRow(siteId, ordinal, instructions, extra) {
  return {
    siteId,
    ordinal,
    actorSiteId: "actor#1",
    actorOrdinal: 1,
    actorSeq: ordinal - 1,
    inputHash: inputHash(instructions),
    ...extra,
  };
}

const queuedView = (h) =>
  journalEvents(h.journal, RUN_ID)
    .filter((e) => e.type === "node-queued")
    .map((e) => `${e.instance.siteId}@${e.instance.ordinal}:${e.actorSeq}`);

const settledView = (events) =>
  events
    .filter((e) => e.type === "node-settled")
    .map(
      (e) =>
        `${e.instance.siteId}@${e.instance.ordinal}:${e.outcome}${e.cached === true ? ":cached" : ""}`,
    );

describe("B13 resume：同一 runId 的第二世", () => {
  it("不重建 run：只做一次 running 翻转，并把上一世的结算残影清干净", () => {
    const store = seededJournal({
      run: { scriptText: "s", args: [1], name: "旧名", scriptHash: "h1", resumedFrom: "run-0" },
      settle: { status: "stopped", settlement: { stopReason: "user", result: "残影" } },
    });
    const traced = tracedJournal(store);
    makeHarness({ journal: traced.journal });
    // 第二世不再 createRun；元数据也不重写（它们只属于建 run 那一世）。
    assert.deepEqual(traced.trace, ["updateRunStatus:running", "appendEvent:run-started"]);
    assert.deepEqual(store.getRun(RUN_ID), {
      args: [1],
      caps: { maxConcurrency: 1 },
      name: "旧名",
      resumedFrom: "run-0",
      runId: RUN_ID,
      scriptHash: "h1",
      scriptText: "s",
      spentTokens: 0,
      status: "running",
    });
  });

  it("事件轨跨世拼接：新一世从自己的 run-started 开始", () => {
    const store = seededJournal({
      events: [
        { type: "run-started", runId: RUN_ID, caps: { maxConcurrency: 1 } },
        { type: "log", message: "第一世" },
        { type: "run-settled", status: "stopped", stopReason: "user" },
      ],
      settle: { status: "stopped", settlement: { stopReason: "user" } },
    });
    const h = makeHarness({ journal: store });
    h.engine.log("第二世");
    assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)), [
      "run-started",
      "log",
      "run-settled",
      "run-started",
      "log",
    ]);
    assert.equal(h.journal.listEvents(RUN_ID)[3].sequence, 3);
  });

  it("脚本哈希不一致：同步抛出，这一世根本不开（行、状态、事件零触碰）", () => {
    const store = stoppedRunWithAsk();
    const eventsBefore = store.listEvents(RUN_ID).length;
    assert.throws(
      () => makeHarness({ journal: store, engine: { scriptHash: "另一份脚本" } }),
      (error) => {
        assert.equal(error.name, "WorkflowError");
        assert.equal(error.code, "ScriptHashMismatch");
        assert.deepEqual(error.mismatch, { expected: "h-recorded", got: "另一份脚本" });
        return true;
      },
    );
    assert.equal(store.getRun(RUN_ID).status, "stopped", "不得翻成 running");
    assert.equal(store.getRun(RUN_ID).stopReason, "user", "残影清理也没发生");
    assert.equal(store.listEvents(RUN_ID).length, eventsBefore, "没有第二条 run-started");
  });

  it("比对要求两侧在场：任一侧缺席即不判（老行没有 script_hash）", () => {
    const withoutRecorded = seededJournal();
    const h1 = makeHarness({ journal: withoutRecorded, engine: { scriptHash: "h2" } });
    assert.equal(h1.engine.status(), "running");

    const withoutGiven = seededJournal({ run: { scriptHash: "h1" } });
    const h2 = makeHarness({ journal: withoutGiven });
    assert.equal(h2.engine.status(), "running");
    assert.equal(h2.journal.getRun(RUN_ID).scriptHash, "h1", "记录的哈希不被缺席的实参抹掉");
  });

  it("completed 行命中：兑现行里的结果，只发 cached 的 node-settled，一次都不问 driver", async () => {
    const store = stoppedRunWithAsk("work", { answer: 1 });
    const h = makeHarness({ journal: store, askSpecs: { "ask#1": { typed: false } } });
    const actor = h.engine.createActor("actor#1");
    assert.deepEqual(await h.engine.ask("ask#1", actor, "work"), { answer: 1 });
    assert.deepEqual(h.recorded.sessions, [], "命中不建会话");
    assert.deepEqual(h.recorded.starts, [], "命中不派发");
    assert.deepEqual(settledView(journalEvents(h.journal, RUN_ID)), ["ask#1@1:ok:cached"]);
    assert.deepEqual(queuedView(h), [], "命中没有排队");
    assert.equal(nodeRow(h.journal, RUN_ID, "ask#1").status, "completed", "行是只读的历史");
  });

  it("命中的 cached 结算就是它的出生事件：phaseName 随它携带", async () => {
    const store = stoppedRunWithAsk();
    const h = makeHarness({ journal: store, askSpecs: { "ask#1": { typed: false } } });
    h.engine.enterPhase("Review");
    const actor = h.engine.createActor("actor#1");
    await h.engine.ask("ask#1", actor, "work");
    const events = journalEvents(h.journal, RUN_ID);
    assert.equal(
      events.find((e) => e.type === "actor-created").phaseName,
      "Review",
      "actor 的出生事件与节点用同一张 instancePhases 表",
    );
    assert.equal(events.find((e) => e.type === "node-settled").phaseName, "Review");
  });

  it("failed 行命中：按记录重新拒绝（不是复验），run 不受影响", async () => {
    const recordedError = { code: "ContextLimit", message: "上下文装不下" };
    const store = seededJournal({
      nodes: [askRow("ask#1", 1, "work", { status: "failed", error: recordedError })],
      settle: { status: "stopped", settlement: { stopReason: "user" } },
    });
    const h = makeHarness({ journal: store, askSpecs: { "ask#1": { typed: false } } });
    const actor = h.engine.createActor("actor#1");
    const error = await rejectionOf(h.engine.ask("ask#1", actor, "work"));
    assert.equal(error.code, "ContextLimit");
    assert.equal(error.message, "上下文装不下");
    assert.deepEqual(
      journalEvents(h.journal, RUN_ID).filter((e) => e.type === "node-settled"),
      [
        {
          cached: true,
          error: recordedError,
          instance: inst("ask#1", 1),
          outcome: "failed",
          type: "node-settled",
        },
      ],
    );
    assert.equal(h.engine.status(), "running", "脚本可以 catch 它，run 继续");
    assert.equal(h.journal.getRun(RUN_ID).failure, undefined);
  });

  it("running 行命中（崩在执行中）：重新 live 走完整一遍并覆盖成终态", async () => {
    const store = seededJournal({
      nodes: [askRow("ask#1", 1, "work", { status: "running" })],
      settle: { status: "stopped", settlement: { stopReason: "interrupted" } },
    });
    const h = makeHarness({ journal: store, askSpecs: { "ask#1": { typed: false } } });
    const actor = h.engine.createActor("actor#1");
    const pending = h.engine.ask("ask#1", actor, "work");
    await tick();
    assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)).slice(1), [
      "actor-created",
      "node-queued",
      "node-dispatched",
    ]);
    assert.equal(h.recorded.starts.length, 1);
    settleAsk(h.engine, inst("ask#1", 1), false, "补完的答案");
    assert.deepEqual(await pending, "补完的答案");
    assert.equal(nodeRow(h.journal, RUN_ID, "ask#1").status, "completed");
  });

  it("命中的行与本次指令哈希不符 ⇒ InputHashMismatch：run 大声失败，行零触碰", async () => {
    const store = stoppedRunWithAsk("work");
    const h = makeHarness({ journal: store, askSpecs: { "ask#1": { typed: false } } });
    const actor = h.engine.createActor("actor#1");
    const error = await rejectionOf(h.engine.ask("ask#1", actor, "改了口的同一站"));
    assert.equal(error.code, "InputHashMismatch");
    assert.deepEqual(error.mismatch, {
      expected: inputHash("work"),
      got: inputHash("改了口的同一站"),
    });
    const settlement = await h.engine.settled;
    assert.equal(settlement.status, "errored");
    assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)).slice(1), [
      "actor-created",
      "run-settled",
    ]);
    assert.equal(h.journal.getRun(RUN_ID).failure.code, "InputHashMismatch");
    assert.equal(nodeRow(h.journal, RUN_ID, "ask#1").status, "completed", "历史行不被改写");
  });

  it("站点身份跨世稳定：同一脚本重跑到同一 (siteId, ordinal)，没重放的行零触碰", async () => {
    const store = seededJournal({
      nodes: [
        askRow("ask#1", 1, "one", { status: "completed", result: "r1" }),
        askRow("ask#1", 2, "two", { status: "completed", result: "r2" }),
        askRow("ask#1", 3, "three", { status: "completed", result: "r3" }),
      ],
      settle: { status: "stopped", settlement: { stopReason: "user" } },
    });
    const h = makeHarness({ journal: store, askSpecs: { "ask#1": { typed: false } } });
    const actor = h.engine.createActor("actor#1");
    assert.deepEqual(await h.engine.ask("ask#1", actor, "one"), "r1");
    assert.deepEqual(await h.engine.ask("ask#1", actor, "two"), "r2");
    h.engine.complete("提前收工");
    await h.engine.settled;
    assert.deepEqual(
      h.journal.listNodes(RUN_ID).map((n) => `${n.siteId}@${n.ordinal}:${n.status}`),
      ["ask#1@1:completed", "ask#1@2:completed", "ask#1@3:completed"],
    );
  });

  it("actorSeq 从行里续账：fresh ask 不得越过已记录的排队前缀", async () => {
    const store = seededJournal({
      // 只有 @1 有行（崩在执行中），ask#9 是这一世新加的站点。
      nodes: [askRow("ask#1", 1, "one", { status: "running" })],
      settle: { status: "stopped", settlement: { stopReason: "user" } },
    });
    const h = makeHarness({
      askSpecs: { "ask#1": { typed: false }, "ask#9": { typed: false } },
      journal: store,
    });
    const actor = h.engine.createActor("actor#1");
    const fresh = h.engine.ask("ask#9", actor, "新的");
    await tick();
    assert.deepEqual(h.recorded.starts, [], "fresh 被扣住：已记录的前缀还没重放到");
    assert.deepEqual(queuedView(h), []);
    const recorded = h.engine.ask("ask#1", actor, "one");
    await tick();
    assert.deepEqual(queuedView(h), ["ask#1@1:0", "ask#9@1:1"]);
    settleAsk(h.engine, inst("ask#1", 1), false, "a");
    assert.deepEqual(await recorded, "a");
    await tick();
    settleAsk(h.engine, inst("ask#9", 1), false, "b");
    assert.deepEqual(await fresh, "b");
    assert.equal(nodeRow(h.journal, RUN_ID, "ask#9").actorSeq, 1, "续的是行里的账，不是本世的计数");
  });
});

describe("B14 amend-resume 的导入缓存", () => {
  const PERSONA = { name: "researcher", system: "同一份 prompt" };
  const pureStats = { tokens: 10, toolCalls: 1, turns: 1, worldToolCalls: 0 };

  /**
   * 一条可导入条目：`stats` 决定关门后它还算不算「纯」。
   * 缺席要用 **null** 表达——`undefined` 会落回默认值，那正是老 journal 行没有这个键的形状。
   */
  function importedEntry(instructions, result, messageBoundary, stats = pureStats) {
    const extra = stats === null ? {} : { stats };
    return { inputHash: inputHash(instructions), result, messageBoundary, ...extra };
  }

  /** 一个具名 actor 的导入候选（键 = 有效名）；world 队列表由各测试自己给。 */
  function actorCache(entries, extra = {}) {
    return {
      actors: new Map([
        [
          "researcher",
          {
            persona: PERSONA,
            entries,
            transcriptSourceSessionId: "src-session",
            ...extra,
          },
        ],
      ]),
      world: new Map(),
    };
  }

  /** 三个 ask 站点够用；导入缓存整表由调用方构建（引擎只查表）。 */
  function importedHarness(cache, options = {}) {
    return makeHarness({
      askSpecs: {
        "ask#1": { typed: false },
        "ask#2": { typed: false },
        "ask#3": { typed: false },
        "ask#4": { typed: false },
      },
      engine: { importedCache: cache },
      ...options,
    });
  }

  /** 建好 researcher 装配，并把它的 ActorId 一并交出来。 */
  function researcherHarness(cache, options = {}) {
    const h = importedHarness(cache, options);
    const actor = h.engine.createActor("actor#1", "researcher", "同一份 prompt");
    return { ...h, actor };
  }

  /**
   * 关门：让一个**没有候选**的匿名 helper live 起来，再由 driver 上报它即将改写工作区。
   * 用 researcher 自己关会把它的导入前缀一并弄分歧（哈希不符即分歧），后面就什么都测不到了。
   */
  async function closeGate(h, siteId = "ask#4") {
    const helper = h.engine.createActor("actor#9");
    const live = h.engine.ask(siteId, helper, "出门改文件");
    await tick();
    h.engine.askMutating(inst(siteId, 1));
    settleAsk(h.engine, inst(siteId, 1), false, "改了");
    await live;
    assert.equal(
      journalEvents(h.journal, RUN_ID).some((e) => e.type === "import-cache-closed"),
      true,
    );
  }

  it("命中即落一行真 dwf_node：结果 / 用量 / 转录边界整体拷来，且一次都不问 driver", async () => {
    const h = researcherHarness(
      actorCache([importedEntry("one", "r1", 11), importedEntry("two", "r2", 22)]),
    );
    assert.deepEqual(await h.engine.ask("ask#1", h.actor, "one"), "r1");
    assert.deepEqual(await h.engine.ask("ask#2", h.actor, "two"), "r2");
    assert.deepEqual(nodeRow(h.journal, RUN_ID, "ask#1"), {
      actorOrdinal: 1,
      actorSeq: 0,
      actorSiteId: "actor#1",
      inputHash: inputHash("one"),
      kind: "ask",
      messageBoundary: 11,
      ordinal: 1,
      result: "r1",
      runId: RUN_ID,
      siteId: "ask#1",
      stats: pureStats,
      status: "completed",
    });
    assert.deepEqual(h.recorded.sessions, []);
    assert.deepEqual(h.recorded.starts, []);
    assert.deepEqual(settledView(journalEvents(h.journal, RUN_ID)), [
      "ask#1@1:ok:cached",
      "ask#2@1:ok:cached",
    ]);
  });

  it("分歧后首个 live actor 的会话种子 = 最后一条被消费条目的边界 + 承袭的模型 pin", async () => {
    const h = researcherHarness(
      actorCache([importedEntry("one", "r1", 11), importedEntry("two", "r2", 22)], {
        resolvedModel: "model-a",
      }),
    );
    await h.engine.ask("ask#1", h.actor, "one");
    const pending = h.engine.ask("ask#2", h.actor, "换了指令的第二次问答");
    await tick();
    assert.deepEqual(h.recorded.sessions, [
      {
        actor: inst("actor#1", 1),
        persona: PERSONA,
        seed: { messageCount: 11, resolvedModel: "model-a", sourceSessionId: "src-session" },
      },
    ]);
    settleAsk(h.engine, inst("ask#2", 1), false, "live 的答案");
    assert.deepEqual(await pending, "live 的答案");
  });

  it("一条也没消费 ⇒ 没有种子：全新会话、不带 pin", async () => {
    const h = researcherHarness(actorCache([importedEntry("one", "r1", 11)]));
    const pending = h.engine.ask("ask#1", h.actor, "第一句就改了口");
    await tick();
    assert.deepEqual(h.recorded.sessions, [
      { actor: inst("actor#1", 1), persona: PERSONA, seed: undefined },
    ]);
    settleAsk(h.engine, inst("ask#1", 1), false, "x");
    await pending;
  });

  it("分歧单调：后缀即便哈希对上也不复活", async () => {
    const h = researcherHarness(
      actorCache([importedEntry("one", "r1", 11), importedEntry("two", "r2", 22)]),
    );
    const first = h.engine.ask("ask#1", h.actor, "改了口");
    await tick();
    settleAsk(h.engine, inst("ask#1", 1), false, "live-1");
    assert.deepEqual(await first, "live-1");
    // seq 1 的条目哈希正是 "two"——分歧之后也不许导入。
    const second = h.engine.ask("ask#2", h.actor, "two");
    await tick();
    assert.equal(h.recorded.starts.length, 2);
    settleAsk(h.engine, inst("ask#2", 1), false, "live-2");
    assert.deepEqual(await second, "live-2");
    assert.equal(nodeRow(h.journal, RUN_ID, "ask#2").result, "live-2");
  });

  it("persona 不一致即弃整个候选（改 prompt 的意图本来就是重跑）", async () => {
    const h = importedHarness(actorCache([importedEntry("one", "r1", 11)]));
    h.engine.createActor("actor#1", "researcher", "改了的一份 prompt");
    const pending = h.engine.ask("ask#1", "actor#1@1", "one");
    await tick();
    assert.equal(h.recorded.starts.length, 1, "哈希对上了也不导入");
    assert.equal(h.recorded.sessions[0].seed, undefined);
    settleAsk(h.engine, inst("ask#1", 1), false, "x");
    await pending;
  });

  it("persona 比对是规范化的：键序与 undefined 成员无关，多一个有值成员就是另一份身份", async () => {
    const same = importedHarness(actorCache([importedEntry("one", "r1", 11)]));
    // system 在前、name 在后，还带一个 undefined 成员：canonicalJson 排序 + 跳过 undefined ⇒ 同一份。
    const attached = same.engine.createActor("actor#1", undefined, {
      system: "同一份 prompt",
      name: "researcher",
      model: undefined,
    });
    assert.deepEqual(await same.engine.ask("ask#1", attached, "one"), "r1");

    const different = importedHarness(actorCache([importedEntry("one", "r1", 11)]));
    const diverged = different.engine.createActor("actor#1", undefined, {
      system: "同一份 prompt",
      name: "researcher",
      note: "多了一个成员",
    });
    const pending = different.engine.ask("ask#1", diverged, "one");
    await tick();
    assert.equal(different.recorded.starts.length, 1, "弃整个候选，全新重跑");
    assert.equal(different.recorded.sessions[0].seed, undefined);
    settleAsk(different.engine, inst("ask#1", 1), false, "x");
    assert.deepEqual(await pending, "x");
  });

  it("匿名 actor 永不附着：名字就是缓存的身份键", async () => {
    const h = importedHarness(actorCache([importedEntry("one", "r1", 11)]));
    const actor = h.engine.createActor("actor#1", undefined, "同一份 prompt");
    const pending = h.engine.ask("ask#1", actor, "one");
    await tick();
    assert.equal(h.recorded.starts.length, 1);
    settleAsk(h.engine, inst("ask#1", 1), false, "x");
    await pending;
  });

  it("关门后只有纯条目还能命中；碰过外部世界的即便同哈希也转 live", async () => {
    const h = researcherHarness(
      actorCache([
        importedEntry("one", "r1", 11),
        importedEntry("two", "r2", 22, { tokens: 20, toolCalls: 3, turns: 2, worldToolCalls: 2 }),
      ]),
    );
    await closeGate(h);
    assert.deepEqual(await h.engine.ask("ask#2", h.actor, "one"), "r1", "纯 ask 与工作区无关");
    const touched = h.engine.ask("ask#3", h.actor, "two");
    await tick();
    assert.equal(h.recorded.starts.length, 2, "碰过世界 ⇒ 转 live");
    settleAsk(h.engine, inst("ask#3", 1), false, "重跑");
    assert.deepEqual(await touched, "重跑");
  });

  it("没有用量记录的老条目按「碰过」保守处理", async () => {
    const h = researcherHarness(actorCache([importedEntry("one", "r1", 11, null)]));
    await closeGate(h);
    const pending = h.engine.ask("ask#2", h.actor, "one");
    await tick();
    assert.equal(h.recorded.starts.length, 2);
    settleAsk(h.engine, inst("ask#2", 1), false, "重跑");
    assert.deepEqual(await pending, "重跑");
  });

  it("world 队列按出现序消费：第 n 次同一 {op,args} 对第 n 条记录，耗尽即转 live", async () => {
    const hash = inputHash({ op: "glob", args: ["*.ts"] });
    const h = importedHarness({
      actors: new Map(),
      world: new Map([
        [
          hash,
          [
            { inputHash: hash, kind: "world-read", result: ["a.ts"] },
            { inputHash: hash, kind: "world-read", result: ["a.ts", "b.ts"] },
          ],
        ],
      ]),
    });
    assert.deepEqual(await h.engine.worldRead("world#1", "glob", ["*.ts"]), ["a.ts"]);
    assert.deepEqual(await h.engine.worldRead("world#1", "glob", ["*.ts"]), ["a.ts", "b.ts"]);
    assert.deepEqual(h.recorded.worldCalls, [], "两条命中都没出门");
    assert.deepEqual(await h.engine.worldRead("world#1", "glob", ["*.ts"]), {
      args: ["*.ts"],
      op: "glob",
    });
    assert.equal(h.recorded.worldCalls.length, 1, "队列耗尽 ⇒ live");
    assert.deepEqual(
      h.journal.listNodes(RUN_ID).map((n) => `${n.siteId}@${n.ordinal}:${n.status}`),
      ["world#1@1:completed", "world#1@2:completed", "world#1@3:completed"],
    );
  });

  it("resume 据行重推分歧点：哈希对得上、但当时是 live 跑的那一步不得算成已消费", async () => {
    // 条目 1 非纯（worldToolCalls 1），所以关门之后它即便同哈希也必须 live——这正是哈希推不出来的
    // 那种 live，只有 node-queued 事件记着。
    const entries = [
      importedEntry("one", "r1", 11),
      importedEntry("two", "r2", 22, { tokens: 5, toolCalls: 2, turns: 1, worldToolCalls: 1 }),
    ];
    const first = researcherHarness(actorCache(entries));
    await closeGate(first);
    assert.deepEqual(await first.engine.ask("ask#1", first.actor, "one"), "r1", "seq 0 纯 ⇒ 导入");
    const liveAsk = first.engine.ask("ask#2", first.actor, "two");
    await tick();
    settleAsk(first.engine, inst("ask#2", 1), false, "live-2");
    assert.deepEqual(await liveAsk, "live-2");
    first.engine.complete("done");
    await first.engine.settled;

    // 第二世：同一张缓存、同一份脚本。ask#2 的行与导入条目同哈希——按哈希它会被算成「已消费」，
    // 种子边界就会取 22，而本 run 的转录在那个位置根本不是那批消息。
    const h = researcherHarness(actorCache(entries, { resolvedModel: "model-a" }), {
      journal: first.journal,
    });
    assert.deepEqual(await h.engine.ask("ask#1", h.actor, "one"), "r1", "命中的是本 run 自己的行");
    assert.deepEqual(await h.engine.ask("ask#2", h.actor, "two"), "live-2");
    const tail = h.engine.ask("ask#3", h.actor, "third");
    await tick();
    assert.deepEqual(h.recorded.sessions, [
      {
        actor: inst("actor#1", 1),
        persona: PERSONA,
        // 分歧点重推到 seq 1 ⇒ 边界取最后一条**真正被消费**的（seq 0 → 11）。
        seed: { messageCount: 11, resolvedModel: "model-a", sourceSessionId: "src-session" },
      },
    ]);
    settleAsk(h.engine, inst("ask#3", 1), false, "live-3");
    assert.deepEqual(await tail, "live-3");
  });

  it("关门状态从 import-cache-closed 事件恢复：门已关 ⇒ 非纯条目转 live", async () => {
    const first = researcherHarness(actorCache([importedEntry("one", "r1", 11)]));
    await closeGate(first);
    first.engine.stop("interrupted");
    await first.engine.settled;

    const impureStats = { tokens: 1, toolCalls: 2, turns: 1, worldToolCalls: 1 };
    const h = researcherHarness(actorCache([importedEntry("one", "r1", 11, impureStats)]), {
      journal: first.journal,
    });
    const pending = h.engine.ask("ask#2", h.actor, "one");
    await tick();
    assert.equal(h.recorded.starts.length, 1, "关门已恢复 ⇒ 非纯条目转 live");
    assert.equal(h.recorded.sessions[0].seed, undefined, "一条也没消费");
    settleAsk(h.engine, inst("ask#2", 1), false, "重跑");
    assert.deepEqual(await pending, "重跑");
  });

  it("没有那条事件 ⇒ 门是开的：非纯条目照样导入（关门是唯一事实来源）", async () => {
    const first = researcherHarness(actorCache([importedEntry("one", "r1", 11)]));
    // 同一个 helper live 过，但 driver 从没报它改写工作区，也没有 world.run。
    const helper = first.engine.createActor("actor#9");
    const live = first.engine.ask("ask#1", helper, "只读不写");
    await tick();
    settleAsk(first.engine, inst("ask#1", 1), false, "没改");
    await live;
    first.engine.stop("interrupted");
    await first.engine.settled;

    const impureStats = { tokens: 1, toolCalls: 2, turns: 1, worldToolCalls: 1 };
    const h = researcherHarness(actorCache([importedEntry("one", "r1", 11, impureStats)]), {
      journal: first.journal,
    });
    assert.deepEqual(await h.engine.ask("ask#2", h.actor, "one"), "r1");
    assert.deepEqual(h.recorded.starts, [], "门没关 ⇒ 纯度不参与判定");
  });
});
