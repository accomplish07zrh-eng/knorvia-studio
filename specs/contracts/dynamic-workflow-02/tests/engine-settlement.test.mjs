// SPDX-License-Identifier: Apache-2.0
// B18 结算时对在飞 ask 的中止（emitCancelled 的分野）· B19 run 的三条终态路径与 first-wins
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dw } from "./entry.mjs";
import {
  eventTypes,
  inst,
  journalEvents,
  makeHarness,
  rejectionOf,
  tick,
  wfError,
} from "./harness.mjs";

const { WorkflowError } = dw;

const RUN_ID = "run-1";

/** 起一个正在飞的 untyped ask：返回 harness、实例、以及那条 promise 的拒绝捕获器。 */
async function withInFlightAsk(options = {}) {
  const h = makeHarness({ askSpecs: { "ask#1": { typed: false } }, ...options });
  const actor = h.engine.createActor("actor#1");
  const pending = h.engine.ask("ask#1", actor, "work");
  await tick();
  assert.equal(h.recorded.starts.length, 1);
  return { h, pending };
}

describe("B19 三条终态路径", () => {
  it("complete：结算 {completed, artifact}，产物与状态同一笔落库，dispose 恰好一次", async () => {
    const h = makeHarness({});
    h.engine.complete({ answer: 42 });
    assert.deepEqual(await h.engine.settled, { artifact: { answer: 42 }, status: "completed" });
    const run = h.journal.getRun(RUN_ID);
    assert.equal(run.status, "completed");
    assert.deepEqual(run.result, { answer: 42 });
    assert.equal(run.failure, undefined);
    assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)), ["run-started", "run-settled"]);
    assert.deepEqual(journalEvents(h.journal, RUN_ID)[1], {
      status: "completed",
      type: "run-settled",
    });
    assert.equal(h.recorded.disposeCount, 1);
    assert.equal(h.engine.status(), "completed");
  });

  it("stop(user)：stopped + stopReason，run 可 resume（终态不是 errored）", async () => {
    const h = makeHarness({});
    h.engine.stop("user");
    assert.deepEqual(await h.engine.settled, { reason: "user", status: "stopped" });
    const run = h.journal.getRun(RUN_ID);
    assert.equal(run.status, "stopped");
    assert.equal(run.stopReason, "user");
    assert.equal(run.failure, undefined);
    assert.deepEqual(journalEvents(h.journal, RUN_ID)[1], {
      stopReason: "user",
      status: "stopped",
      type: "run-settled",
    });
    assert.equal(h.recorded.disposeCount, 1);
  });

  it("stop(superseded, error, nextRunId)：后继 id 与原因同一笔落库", async () => {
    const h = makeHarness({});
    const error = wfError("Interrupted", "replaced by a revised run");
    h.engine.stop("superseded", error, "run-2");
    const settlement = await h.engine.settled;
    assert.equal(settlement.reason, "superseded");
    assert.equal(settlement.supersededBy, "run-2");
    assert.equal(settlement.error, error);
    const run = h.journal.getRun(RUN_ID);
    assert.deepEqual(run.supersededBy, "run-2");
    assert.deepEqual(run.failure, error.toJSON());
    assert.deepEqual(journalEvents(h.journal, RUN_ID)[1], {
      error: error.toJSON(),
      status: "stopped",
      stopReason: "superseded",
      supersededBy: "run-2",
      type: "run-settled",
    });
  });

  it("fail：errored + failure_json，run 状态是逻辑终态而不是伪装成 cancel", async () => {
    const h = makeHarness({});
    const error = new WorkflowError("Interrupted", "sandbox died");
    h.engine.fail(error);
    const settlement = await h.engine.settled;
    assert.equal(settlement.status, "errored");
    assert.equal(settlement.error, error);
    assert.equal(h.journal.getRun(RUN_ID).failure.code, "Interrupted");
    assert.equal(h.engine.status(), "errored");
  });

  it("first-wins：第二条终态路径整体被忽略，run-settled 只有一条", async () => {
    const h = makeHarness({});
    h.engine.complete("first");
    h.engine.stop("user");
    h.engine.fail(wfError("Interrupted"));
    const settlement = await h.engine.settled;
    assert.deepEqual(settlement, { artifact: "first", status: "completed" });
    assert.equal(h.journal.getRun(RUN_ID).status, "completed");
    assert.equal(h.journal.getRun(RUN_ID).stopReason, undefined);
    assert.deepEqual(
      eventTypes(journalEvents(h.journal, RUN_ID)).filter((t) => t === "run-settled"),
      ["run-settled"],
    );
    assert.equal(h.recorded.disposeCount, 1);
  });

  it("settle 之前的一切在飞 / 观察调用照常，之后一律不再受理", async () => {
    const h = makeHarness({});
    h.engine.log("before");
    h.engine.complete(null);
    await h.engine.settled;
    h.engine.log("after");
    h.engine.enterPhase("after");
    h.engine.report("report#1", { n: 1 });
    h.engine.concurrencyChanged({ key: "p/m", previous: 2, next: 3, reason: "idle_reset" });
    h.engine.runStalled({ sinceMs: 5_000, reason: "no-progress" });
    h.engine.askProgress(inst("ask#1"), { turn: 1, toolCalls: 0 });
    h.engine.askStats(inst("ask#1"), { tokens: 10, toolCalls: 0, turns: 1 });
    assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)), [
      "run-started",
      "log",
      "run-settled",
    ]);
  });

  it("没有 dispose 的 driver 照样结算（dispose 是可选接缝）", async () => {
    const h = makeHarness({});
    delete h.driver.dispose;
    h.engine.complete(1);
    assert.deepEqual(await h.engine.settled, { artifact: 1, status: "completed" });
  });
});

describe("B18 结算时对在飞 ask 的中止", () => {
  for (const [label, settle] of [
    ["complete", (h) => h.engine.complete("done")],
    ["stop", (h) => h.engine.stop("user")],
  ]) {
    it(`${label}：cancelAsk 只发给已派发的节点，deferred 以 Cancelled 拒绝并补发 node-settled(cancelled)`, async () => {
      const { h, pending } = await withInFlightAsk();
      settle(h);
      const error = await rejectionOf(pending);
      assert.equal(error.code, "Cancelled");
      assert.match(error.message, /in-flight subagent tasks were abandoned|Run stopped/);
      assert.deepEqual(h.recorded.cancelled, [inst("ask#1")]);
      const settled = journalEvents(h.journal, RUN_ID).filter((e) => e.type === "node-settled");
      assert.deepEqual(settled, [
        { instance: inst("ask#1"), outcome: "cancelled", type: "node-settled" },
      ]);
      assert.equal(h.recorded.disposeCount, 1);
    });
  }

  it("fail：在飞 ask 拿到的是 run 的那条错，且**不**补发 cancelled 事件", async () => {
    const { h, pending } = await withInFlightAsk();
    const error = wfError("Interrupted", "sandbox died");
    h.engine.fail(error);
    const thrown = await rejectionOf(pending);
    assert.equal(thrown, error);
    assert.deepEqual(h.recorded.cancelled, [inst("ask#1")]);
    assert.deepEqual(
      eventTypes(journalEvents(h.journal, RUN_ID)).filter((t) => t === "node-settled"),
      [],
    );
  });

  it("排队未派发的 ask：不 cancelAsk（driver 那里还没有东西可取消），但仍以 Cancelled 拒绝", async () => {
    const h = makeHarness({
      askSpecs: { "ask#1": { typed: false }, "ask#2": { typed: false } },
      caps: { maxConcurrency: 1 },
    });
    const actor = h.engine.createActor("actor#1");
    const first = h.engine.ask("ask#1", actor, "one");
    const second = h.engine.ask("ask#2", actor, "two");
    await tick();
    h.engine.stop("model");
    assert.deepEqual((await rejectionOf(first)).code, "Cancelled");
    assert.deepEqual((await rejectionOf(second)).code, "Cancelled");
    assert.deepEqual(h.recorded.cancelled, [inst("ask#1")]);
    assert.deepEqual(
      journalEvents(h.journal, RUN_ID)
        .filter((e) => e.type === "node-settled")
        .map((e) => `${e.instance.siteId}@${e.instance.ordinal}:${e.outcome}`),
      ["ask#1@1:cancelled", "ask#2@1:cancelled"],
    );
  });

  it("结算后的 submit / turn 回报惰性（节点已随中止 settled，不会二次结算）", async () => {
    const { h, pending } = await withInFlightAsk();
    h.engine.complete("done");
    await rejectionOf(pending);
    const before = journalEvents(h.journal, RUN_ID).length;
    h.engine.askTurnEnded(inst("ask#1"), "late text");
    h.engine.askSubmitAttempted(inst("ask#1"), { late: true });
    assert.equal(journalEvents(h.journal, RUN_ID).length, before);
    assert.deepEqual(h.recorded.replies, []);
  });
});
