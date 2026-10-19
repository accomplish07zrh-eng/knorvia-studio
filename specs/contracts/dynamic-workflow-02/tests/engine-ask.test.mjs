// SPDX-License-Identifier: Apache-2.0
// B1 实例身份与站点序号 · B2 actor 身份/persona/重名 · B3 ask 准入的两条硬错误
// B4 typed submit 裁决与 repair 预算 · B5 untyped 结算与 nudge 预算 · B6 每 actor FIFO + 并发上限
// B7 ask 的 journal 行与事件序列 · B10 askFailed
//
// 只经公开入口（根桶）拿 WorkflowEngine / InMemoryJournalStore / WorkflowError，
// 模型与世界由 tests/harness.mjs 的假 driver 扮演；断言的是**事件序列与 journal 行**，
// 不看引擎内部。行为条目见 behavior.md，条目↔测试对照表见 README。
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
  wfError,
} from "./harness.mjs";

const { REPAIR_ATTEMPTS, NUDGE_ATTEMPTS, INSTRUCTIONS_HEAD_MAX_CHARS, inputHash } = dw;

/** 一个 typed 站点表 + 一条永远合法的校验脚本。 */
const typedSpecs = (sites) =>
  Object.fromEntries(sites.map((site) => [site, { typed: true, schema: { type: "object" } }]));

/** 一次干净的 typed ask 到结算：返回 harness 与已解析结果。 */
async function runTypedAsk(options = {}) {
  const h = makeHarness({
    askSpecs: typedSpecs(["ask#1"]),
    ...options,
    engine: { ...options.engine, scriptHash: undefined },
  });
  const actor = h.engine.createActor("actor#1", undefined, { system: "be brief" });
  const pending = h.engine.ask("ask#1", actor, "summarise the diff");
  await tick();
  return { h, actor, pending };
}

describe("B1 实例身份 = 站点 × 每站点序号", () => {
  it("同一站点的第二次调用是 @2，不同站点各自从 1 起", async () => {
    const h = makeHarness({ askSpecs: typedSpecs(["ask#1", "ask#2"]) });
    const actor = h.engine.createActor("actor#1");
    const first = h.engine.ask("ask#1", actor, "a");
    const second = h.engine.ask("ask#1", actor, "b");
    const other = h.engine.ask("ask#2", actor, "c");
    await tick();
    assert.deepEqual(
      eventTypes(journalEvents(h.journal, h.runId)).filter((t) => t === "node-queued"),
      ["node-queued", "node-queued", "node-queued"],
    );
    const queued = journalEvents(h.journal, h.runId).filter((e) => e.type === "node-queued");
    assert.deepEqual(
      queued.map((e) => `${e.instance.siteId}@${e.instance.ordinal}`),
      ["ask#1@1", "ask#1@2", "ask#2@1"],
    );
    // 三条 promise 逐一兑现：同一 actor 上严格 FIFO，闸开一处，所以下一条要等上一条结算并
    // 重新派发之后才接受 submit（早到的 submit 按"幽灵实例"惰性丢弃，那是 B4 的合同）。
    const pending = [first, second, other];
    const refs = [inst("ask#1", 1), inst("ask#1", 2), inst("ask#2", 1)];
    for (const index of [0, 1, 2]) {
      await tick();
      settleAsk(h.engine, refs[index], true, { ok: index });
      assert.deepEqual(await pending[index], { ok: index });
    }
    assert.deepEqual(
      journalEvents(h.journal, h.runId)
        .filter((e) => e.type === "node-settled")
        .map((e) => `${e.instance.siteId}@${e.instance.ordinal}`),
      ["ask#1@1", "ask#1@2", "ask#2@1"],
    );
  });

  it("createActor / world / report / artifact 共用同一个计数器，但站点 id 互不消耗", () => {
    const h = makeHarness({});
    h.engine.createActor("actor#1");
    h.engine.report("report#1", { a: 1 });
    h.engine.worldRead("world#1", "files.glob", ["**/*.ts"]);
    const queued = journalEvents(h.journal, h.runId)
      .filter((e) => e.type === "node-queued" || e.type === "actor-created")
      .map((e) => e.type);
    assert.deepEqual(queued, ["actor-created", "node-queued"]);
    // 三个不同站点各占一行，序号都是 1。
    assert.equal(nodeRow(h.journal, h.runId, "report#1").ordinal, 1);
    assert.equal(nodeRow(h.journal, h.runId, "world#1").ordinal, 1);
    assert.deepEqual(h.journal.getActor(h.runId, "actor#1", 1), {
      runId: h.runId,
      siteId: "actor#1",
      ordinal: 1,
      name: undefined,
      persona: {},
      sessionId: undefined,
      resolvedModel: undefined,
    });
  });

  it("阶段名不消耗站点序号，也不被站点序号消耗", () => {
    const h = makeHarness({ askSpecs: typedSpecs(["ask#1"]) });
    h.engine.enterPhase("ask#1");
    const actor = h.engine.createActor("actor#2");
    h.engine.ask("ask#1", actor, "x");
    const queued = journalEvents(h.journal, h.runId).filter((e) => e.type === "node-queued");
    assert.deepEqual(
      queued.map((e) => `${e.instance.siteId}@${e.instance.ordinal}`),
      ["ask#1@1"],
    );
  });
});

describe("B2 actor 身份、persona 规范化与重名", () => {
  it("字符串 persona 即 system prompt；名字缺席时由 name 实参补上", () => {
    const h = makeHarness({});
    h.engine.createActor("actor#1", "reviewer", "be strict");
    h.engine.createActor("actor#2", undefined, { name: "from-persona", system: "s" });
    const created = journalEvents(h.journal, h.runId).filter((e) => e.type === "actor-created");
    assert.deepEqual(
      created.map((e) => [e.name, e.persona]),
      [
        ["reviewer", { system: "be strict", name: "reviewer" }],
        [undefined, { name: "from-persona", system: "s" }],
      ],
    );
    // persona.name 压过 name 实参：有效名取 persona 那一个。
    const other = makeHarness({});
    other.engine.createActor("actor#1", "arg-name", { name: "persona-name" });
    assert.deepEqual(
      journalEvents(other.journal, other.runId).filter((e) => e.type === "actor-created")[0]
        .persona,
      { name: "persona-name" },
    );
  });

  it("同一个 run 内两次非空有效名 ⇒ DuplicateActorName 让整个 run 失败并同步抛出", () => {
    const h = makeHarness({});
    h.engine.createActor("actor#1", "same");
    assert.throws(
      () => h.engine.createActor("actor#2", "same"),
      (error) => error.code === "DuplicateActorName" && error.name === "WorkflowError",
    );
    assert.equal(h.engine.status(), "errored");
    const settled = journalEvents(h.journal, h.runId).at(-1);
    assert.deepEqual(settled, {
      type: "run-settled",
      status: "errored",
      error: { code: "DuplicateActorName", message: settled.error.message },
    });
    assert.match(settled.error.message, /actor#1@1 and actor#2@1/);
  });

  it("匿名 actor（名缺席或空串）不查重，任意多个都合法", () => {
    const h = makeHarness({});
    h.engine.createActor("actor#1");
    h.engine.createActor("actor#2", "");
    h.engine.createActor("actor#3", "   ");
    assert.equal(h.engine.status(), "running");
    assert.equal(h.journal.listActors(h.runId).length, 3);
  });

  it("resume 逐字节重放同一串 createActor 不会把自己当成重名", () => {
    const h = makeHarness({ engine: { scriptHash: "hash-1", scriptText: "src" } });
    h.engine.createActor("actor#1", "named");
    h.engine.stop("user");
    const resumed = makeHarness({ journal: h.journal, engine: { scriptHash: "hash-1" } });
    assert.doesNotThrow(() => resumed.engine.createActor("actor#1", "named"));
  });
});

describe("B3 ask 准入的两条硬错误", () => {
  it("未知 actor 句柄 ⇒ UnknownActor，run 级失败且 promise 拒绝", async () => {
    const h = makeHarness({ askSpecs: typedSpecs(["ask#1"]) });
    const error = await rejectionOf(h.engine.ask("ask#1", "actor#9@1", "x"));
    assert.equal(error.code, "UnknownActor");
    assert.equal(h.engine.status(), "errored");
    assert.equal(nodeRow(h.journal, h.runId, "ask#1"), undefined);
  });

  it("站点表缺这个 ask 站点 ⇒ MissingAskSpec，不降级成 untyped", async () => {
    const h = makeHarness({ askSpecs: {} });
    const actor = h.engine.createActor("actor#1");
    const error = await rejectionOf(h.engine.ask("ask#1", actor, "x"));
    assert.equal(error.code, "MissingAskSpec");
    assert.equal(h.recorded.starts.length, 0);
  });
});

describe("B4 typed ask 的 submit 裁决", () => {
  it("首次合法 ⇒ accept：respondToSubmit 先于 node-settled，结果原样兑现", async () => {
    const { h, pending } = await runTypedAsk();
    h.engine.askSubmitAttempted(inst("ask#1"), { ok: true, note: "kept" });
    assert.deepEqual(h.recorded.replies, [
      { instance: inst("ask#1"), verdict: { kind: "accept" } },
    ]);
    assert.deepEqual(eventTypes(journalEvents(h.journal, h.runId)).slice(2), [
      "node-queued",
      "node-dispatched",
      "node-settled",
    ]);
    assert.deepEqual(await pending, { ok: true, note: "kept" });
  });

  it("违规在预算内 ⇒ reject + node-repairing(attempt 递增)，节点不结算", async () => {
    const violations = [{ path: "$.ok", expected: "boolean", got: "string" }];
    const validate = (schema, value) => (value?.ok === true ? [] : violations);
    const { h, pending } = await runTypedAsk({ validate });
    for (const attempt of [1, 2, 3]) {
      h.engine.askSubmitAttempted(inst("ask#1"), { ok: String(attempt) });
      const repairing = h.recorded.events.filter((e) => e.type === "node-repairing");
      assert.deepEqual(repairing.at(-1), {
        type: "node-repairing",
        instance: inst("ask#1"),
        attempt,
        violations,
      });
      assert.deepEqual(h.recorded.replies.at(-1).verdict, { kind: "reject", violations });
    }
    assert.equal(h.recorded.cancelled.length, 0);
    assert.equal(nodeRow(h.journal, h.runId, "ask#1").status, "running");
    assert.equal(REPAIR_ATTEMPTS, 3);
    // 第 4 次：预算耗尽 ⇒ ValidationFailed 结算节点，driver 侧 cancelAsk。
    h.engine.askSubmitAttempted(inst("ask#1"), { ok: "nope" });
    assert.deepEqual(h.recorded.cancelled, [inst("ask#1")]);
    const settled = h.recorded.events.at(-1);
    assert.equal(settled.type, "node-settled");
    assert.equal(settled.outcome, "failed");
    assert.equal(settled.error.code, "ValidationFailed");
    assert.deepEqual(settled.error.violations, violations);
    // 内容族走拒绝通道：脚本 await 到的是可 catch 的 WorkflowError，run 仍活着。
    const error = await rejectionOf(pending);
    assert.equal(error.code, "ValidationFailed");
    assert.equal(h.engine.status(), "running");
  });

  it("payload 是 JSON 字符串时解码后再校验：解码合法即 accept 结构化结果", async () => {
    const validate = (schema, value) =>
      typeof value === "object" ? [] : [{ path: "$", expected: "object", got: typeof value }];
    const { h, pending } = await runTypedAsk({ validate });
    h.engine.askSubmitAttempted(inst("ask#1"), '{"ok":true}');
    assert.deepEqual(await pending, { ok: true });
  });

  it("对 untyped 站点的 submit 尝试不做任何事", async () => {
    const h = makeHarness({ askSpecs: { "ask#1": { typed: false } } });
    const actor = h.engine.createActor("actor#1");
    const pending = h.engine.ask("ask#1", actor, "x");
    await tick();
    h.engine.askSubmitAttempted(inst("ask#1"), { ok: true });
    assert.deepEqual(h.recorded.replies, []);
    assert.deepEqual(h.recorded.cancelled, []);
    h.engine.askTurnEnded(inst("ask#1"), "text answer");
    assert.equal(await pending, "text answer");
  });

  it("对不存在的实例回报 submit/turn 是惰性的（不结算、不发事件）", async () => {
    const { h } = await runTypedAsk();
    const before = h.recorded.events.length;
    h.engine.askSubmitAttempted(inst("ghost#1", 7), { ok: true });
    h.engine.askTurnEnded(inst("ghost#1", 7), "late");
    assert.equal(h.recorded.events.length, before);
  });
});

describe("B5 untyped 结算与 typed 的 nudge 预算", () => {
  it("untyped ask 由 turn 结束结算为末轮文本", async () => {
    const h = makeHarness({ askSpecs: { "ask#1": { typed: false } } });
    const actor = h.engine.createActor("actor#1");
    const pending = h.engine.ask("ask#1", actor, "x");
    await tick();
    h.engine.askTurnEnded(inst("ask#1"), "final prose");
    assert.equal(await pending, "final prose");
    assert.equal(nodeRow(h.journal, h.runId, "ask#1").result, "final prose");
  });

  it("typed ask 结束未提交 ⇒ 先 nudge 一次，再结束才 ResultNotSubmitted 且带 finalText", async () => {
    const { h, pending } = await runTypedAsk();
    h.engine.askTurnEnded(inst("ask#1"), "chatter");
    assert.deepEqual(h.recorded.replies.at(-1).verdict, { kind: "nudge" });
    assert.deepEqual(h.recorded.events.at(-1), { type: "node-nudged", instance: inst("ask#1") });
    assert.equal(NUDGE_ATTEMPTS, 1);
    // nudge 之后节点仍在飞：再报一次 turn 结束才走 missing。
    h.engine.askTurnEnded(inst("ask#1"), "still chatter");
    const settled = h.recorded.events.at(-1);
    assert.equal(settled.outcome, "failed");
    assert.equal(settled.error.code, "ResultNotSubmitted");
    assert.equal(settled.error.finalText, "still chatter");
    const error = await rejectionOf(pending);
    assert.equal(error.code, "ResultNotSubmitted");
  });

  it("结算之后的迟到 turn 结束被忽略", async () => {
    const { h, pending } = await runTypedAsk();
    h.engine.askSubmitAttempted(inst("ask#1"), { ok: 1 });
    await pending;
    const before = h.recorded.events.length;
    h.engine.askTurnEnded(inst("ask#1"), "late");
    assert.equal(h.recorded.events.length, before);
  });
});

describe("B6 每 actor FIFO、actorSeq 与并发上限", () => {
  it("同一 actor 的第二条 ask 排在其后：queued 顺序即 actorSeq 顺序", async () => {
    const h = makeHarness({
      askSpecs: typedSpecs(["ask#1", "ask#2"]),
      caps: { maxConcurrency: 2 },
    });
    const actor = h.engine.createActor("actor#1");
    const first = h.engine.ask("ask#1", actor, "one");
    const second = h.engine.ask("ask#2", actor, "two");
    await tick();
    const queued = h.recorded.events.filter((e) => e.type === "node-queued");
    assert.deepEqual(
      queued.map((e) => [e.instance.siteId, e.actorSeq, e.actor]),
      [
        ["ask#1", 0, { siteId: "actor#1", ordinal: 1 }],
        ["ask#2", 1, { siteId: "actor#1", ordinal: 1 }],
      ],
    );
    // 一个 actor 同时只有一个在飞请求：第二条只落 running，不派发。
    assert.deepEqual(
      h.recorded.starts.map((s) => s.instance.siteId),
      ["ask#1"],
    );
    h.engine.askSubmitAttempted(inst("ask#1"), 1);
    await first;
    await tick();
    assert.deepEqual(
      h.recorded.starts.map((s) => s.instance.siteId),
      ["ask#1", "ask#2"],
    );
    h.engine.askSubmitAttempted(inst("ask#2", 1), 2);
    assert.equal(await second, 2);
  });

  it("并发上限只放开 N 个不同 actor：多余的一律等位", async () => {
    const h = makeHarness({
      askSpecs: typedSpecs(["ask#1", "ask#2", "ask#3"]),
      caps: { maxConcurrency: 2 },
    });
    const a1 = h.engine.createActor("actor#1");
    const a2 = h.engine.createActor("actor#2");
    const a3 = h.engine.createActor("actor#3");
    const p1 = h.engine.ask("ask#1", a1, "x");
    const p2 = h.engine.ask("ask#2", a2, "y");
    const p3 = h.engine.ask("ask#3", a3, "z");
    await tick();
    assert.equal(h.recorded.starts.length, 2);
    assert.equal(nodeRow(h.journal, h.runId, "ask#3").status, "running");
    h.engine.askSubmitAttempted(inst("ask#1"), 1);
    await p1;
    await tick();
    assert.deepEqual(
      h.recorded.starts.map((s) => s.instance.siteId),
      ["ask#1", "ask#2", "ask#3"],
    );
    h.engine.askSubmitAttempted(inst("ask#2"), 2);
    h.engine.askSubmitAttempted(inst("ask#3"), 3);
    assert.deepEqual([await p2, await p3], [2, 3]);
  });

  it("会话只在首次 live 派发时铸一次，同一 actor 的第二次 ask 复用", async () => {
    const { h } = await runTypedAsk();
    h.engine.askSubmitAttempted(inst("ask#1"), 1);
    await tick();
    assert.equal(h.recorded.sessions.length, 1);
    assert.equal(h.recorded.starts.length, 1);
  });

  it("driver 建会话失败 ⇒ 节点以 DriverError 结算，run 不受影响", async () => {
    const h = makeHarness({ askSpecs: typedSpecs(["ask#1"]) });
    h.driver.createActorSession = () => Promise.reject(new Error("session exploded"));
    const actor = h.engine.createActor("actor#1");
    const pending = h.engine.ask("ask#1", actor, "x");
    const error = await rejectionOf(pending);
    assert.equal(error.code, "DriverError");
    assert.match(error.message, /session exploded/);
    assert.equal(h.engine.status(), "running");
    assert.equal(nodeRow(h.journal, h.runId, "ask#1").status, "failed");
  });
});

describe("B7 ask 的 journal 行与事件序列", () => {
  it("running 行携带身份与 inputHash，completed 行整条替换后仍保留身份", async () => {
    const { h, pending } = await runTypedAsk();
    const running = nodeRow(h.journal, h.runId, "ask#1");
    assert.deepEqual(running, {
      runId: h.runId,
      siteId: "ask#1",
      ordinal: 1,
      kind: "ask",
      actorSiteId: "actor#1",
      actorOrdinal: 1,
      actorSeq: 0,
      inputHash: inputHash("summarise the diff"),
      status: "running",
    });
    h.engine.askSubmitAttempted(inst("ask#1"), { done: true });
    await pending;
    const completed = nodeRow(h.journal, h.runId, "ask#1");
    assert.equal(completed.status, "completed");
    assert.deepEqual(completed.result, { done: true });
    assert.equal(completed.actorSeq, running.actorSeq);
    assert.equal(completed.inputHash, running.inputHash);
    assert.equal(completed.error, undefined);
  });

  it("node-queued 带 instructionsHead（准入时刻、去空白、≤240 字符），空指令整键缺席", async () => {
    const long = `${"x".repeat(300)}  `;
    const h = makeHarness({ askSpecs: typedSpecs(["ask#1", "ask#2", "ask#3"]) });
    const actor = h.engine.createActor("actor#1");
    const p1 = h.engine.ask("ask#1", actor, `  ${long}`);
    const p2 = h.engine.ask("ask#2", actor, "   ");
    const p3 = h.engine.ask("ask#3", actor, "short");
    await tick();
    const queued = h.recorded.events.filter((e) => e.type === "node-queued");
    assert.equal(queued[0].instructionsHead.length, INSTRUCTIONS_HEAD_MAX_CHARS);
    assert.equal(queued[0].instructionsHead, "x".repeat(300).slice(0, 240));
    assert.equal("instructionsHead" in queued[1], false);
    assert.equal(queued[2].instructionsHead, "short");
    for (const [index, promise] of [p1, p2, p3].entries()) {
      h.engine.askSubmitAttempted(inst(queued[index].instance.siteId), index);
      await promise;
    }
  });

  it("journal 事件轨与 driver.emit 实时轨拿到同一序列", async () => {
    const { h, pending } = await runTypedAsk();
    h.engine.askSubmitAttempted(inst("ask#1"), 1);
    await pending;
    h.engine.complete("artifact");
    assert.deepEqual(h.recorded.events, journalEvents(h.journal, h.runId));
    assert.deepEqual(eventTypes(h.recorded.events), [
      "run-started",
      "actor-created",
      "node-queued",
      "node-dispatched",
      "node-settled",
      "run-settled",
    ]);
  });

  it("指令文本变了就是 InputHashMismatch：run 大声失败并结构化报出两侧哈希", async () => {
    const { h, pending } = await runTypedAsk();
    h.engine.askSubmitAttempted(inst("ask#1"), 1);
    await pending;
    h.engine.stop("user");
    const resumed = makeHarness({
      journal: h.journal,
      askSpecs: typedSpecs(["ask#1"]),
      engine: { scriptHash: undefined },
    });
    const actor = resumed.engine.createActor("actor#1", undefined, { system: "be brief" });
    const error = await rejectionOf(resumed.engine.ask("ask#1", actor, "DIFFERENT text"));
    assert.equal(error.code, "InputHashMismatch");
    assert.deepEqual(error.mismatch, {
      expected: inputHash("summarise the diff"),
      got: inputHash("DIFFERENT text"),
    });
    assert.equal(resumed.engine.status(), "errored");
  });
});

describe("B10 driver 侧不可恢复错误结算该 ask", () => {
  it("askFailed ⇒ 节点 failed + 可 catch 的拒绝，run 仍活着", async () => {
    const { h, pending } = await runTypedAsk();
    const error = wfError("ContextLimit", "context window exhausted");
    h.engine.askFailed(inst("ask#1"), error);
    const rejection = await rejectionOf(pending);
    assert.equal(rejection.code, "ContextLimit");
    assert.equal(nodeRow(h.journal, h.runId, "ask#1").status, "failed");
    assert.equal(nodeRow(h.journal, h.runId, "ask#1").error.code, "ContextLimit");
    assert.equal(h.engine.status(), "running");
    // 已结算的节点再报一次失败不产生第二条事件。
    const before = h.recorded.events.length;
    h.engine.askFailed(inst("ask#1"), error);
    assert.equal(h.recorded.events.length, before);
  });
});
