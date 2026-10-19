// SPDX-License-Identifier: Apache-2.0
// B23 JournalStorePort 的内存实现语义（深拷贝边界 · 复合键 · 结算袋的三种写入规则 · 事件分页）。
//
// 端口是「一实现两处用」的：内存版给 fake-driver 测试与 replay/resume，SQLite 版给生产。
// 因此这里钉的全是**两侧必须共用的语义**，而不是 Map 的实现细节：谁抛错、谁返回空、
// 哪一列整体改写、cursor 是「严格大于」而不是偏移量。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dw } from "./entry.mjs";

const { InMemoryJournalStore } = dw;

const RUN = "run-1";
const OTHER = "run-2";

function newStore(runIds = [RUN]) {
  const store = new InMemoryJournalStore();
  for (const runId of runIds) {
    store.createRun({ runId, caps: { maxConcurrency: 2 }, spentTokens: 0, status: "running" });
  }
  return store;
}

function nodeRecord(runId = RUN, siteId = "ask#1", ordinal = 1, extra = {}) {
  return {
    inputHash: "hash",
    kind: "ask",
    ordinal,
    runId,
    siteId,
    status: "running",
    ...extra,
  };
}

function actorRecord(runId = RUN, siteId = "actor#1", ordinal = 1, extra = {}) {
  return { ordinal, runId, siteId, ...extra };
}

describe("B23 run 行的建立与未知 run", () => {
  it("createRun 落一份克隆，重复 runId 直接抛", () => {
    const store = new InMemoryJournalStore();
    const record = {
      caps: { maxConcurrency: 1 },
      runId: RUN,
      scriptText: "s",
      spentTokens: 7,
      status: "pending",
    };
    store.createRun(record);
    record.spentTokens = 99;
    assert.deepEqual(store.getRun(RUN), {
      caps: { maxConcurrency: 1 },
      runId: RUN,
      scriptText: "s",
      spentTokens: 7,
      status: "pending",
    });
    assert.throws(() => store.createRun({ ...record, spentTokens: 1 }), /already exists/);
  });

  it("未知 runId：写侧全抛，读侧全空", () => {
    const store = new InMemoryJournalStore();
    assert.throws(() => store.updateRunStatus(RUN, "running"), /unknown run/);
    assert.throws(() => store.updateRunUsage(RUN, 5), /unknown run/);
    assert.throws(() => store.putActor(actorRecord("nope")), /unknown run/);
    assert.throws(() => store.putNode(nodeRecord("nope")), /unknown run/);
    assert.throws(() => store.appendEvent("nope", { type: "log", message: "x" }), /unknown run/);
    assert.equal(store.getRun("nope"), undefined);
    assert.equal(store.getActor("nope", "actor#1", 1), undefined);
    assert.equal(store.getNode("nope", "ask#1", 1), undefined);
    assert.deepEqual(store.listActors("nope"), []);
    assert.deepEqual(store.listNodes("nope"), []);
    assert.deepEqual(store.listEvents("nope"), []);
    assert.deepEqual(store.listEvents("nope", { afterSequence: 0, limit: 10 }), []);
  });

  it("每个 run 一套桶：跨 run 的读写互不可见", () => {
    const store = newStore([RUN, OTHER]);
    store.putNode(nodeRecord(RUN, "ask#1", 1, { result: "a" }));
    store.putNode(nodeRecord(OTHER, "ask#1", 1, { result: "b" }));
    store.appendEvent(RUN, { type: "log", message: "only-run-1" });
    assert.deepEqual(store.getNode(OTHER, "ask#1", 1).result, "b");
    assert.deepEqual(store.getNode(RUN, "ask#1", 1).result, "a");
    assert.deepEqual(
      store.listNodes(OTHER).map((row) => row.runId),
      [OTHER],
    );
    assert.deepEqual(store.listEvents(OTHER), []);
    assert.equal(store.listEvents(RUN).length, 1);
  });
});

describe("B23 深拷贝边界", () => {
  it("写侧：调用方随后改动自己那份，存储不动", () => {
    const store = newStore();
    const record = nodeRecord(RUN, "ask#1", 1, {
      result: { list: [1, 2] },
      stats: { tokens: 1, toolCalls: 1, turns: 1 },
    });
    store.putNode(record);
    record.result.list.push(3);
    record.status = "completed";
    record.stats.tokens = 500;
    const row = store.getNode(RUN, "ask#1", 1);
    assert.deepEqual(row.result.list, [1, 2]);
    assert.equal(row.status, "running");
    assert.equal(row.stats.tokens, 1);
  });

  it("读侧：改返回的那份不动存储，且每次读拿到的是新对象", () => {
    const store = newStore();
    store.putActor(actorRecord(RUN, "actor#1", 1, { persona: { name: "n", system: "s" } }));
    const first = store.getActor(RUN, "actor#1", 1);
    const second = store.getActor(RUN, "actor#1", 1);
    assert.notEqual(first, second);
    assert.deepEqual(first, second);
    first.persona.system = "改了";
    assert.equal(store.getActor(RUN, "actor#1", 1).persona.system, "s");
    const listed = store.listActors(RUN);
    assert.notEqual(listed[0], store.listActors(RUN)[0]);
    assert.notEqual(listed[0].persona, store.getActor(RUN, "actor#1", 1).persona);
  });

  it("列表返回的是克隆数组：改数组本身也不影响下一次读", () => {
    const store = newStore();
    store.putNode(nodeRecord(RUN, "ask#1", 1));
    const rows = store.listNodes(RUN);
    rows.length = 0;
    rows.push(nodeRecord(RUN, "ask#9", 9));
    assert.deepEqual(
      store.listNodes(RUN).map((row) => row.siteId),
      ["ask#1"],
    );
  });

  it("克隆是结构化克隆而不是 JSON 往返：undefined 值键被原样保留", () => {
    const store = newStore();
    store.putNode(nodeRecord(RUN, "ask#1", 1, { result: undefined, messageBoundary: undefined }));
    const row = store.getNode(RUN, "ask#1", 1);
    assert.equal("result" in row, true);
    assert.equal(row.result, undefined);
    assert.equal("messageBoundary" in row, true);
    // JSON 往返会把这些键抹掉，端口两侧都必须留住「键在场但值是 undefined」这一种形态。
    assert.deepEqual(Object.keys(row).sort(), [
      "inputHash",
      "kind",
      "messageBoundary",
      "ordinal",
      "result",
      "runId",
      "siteId",
      "status",
    ]);
  });

  it("不可克隆的值进不了存储（端口边界拒绝非纯数据）", () => {
    const store = newStore();
    assert.throws(() => store.putNode(nodeRecord(RUN, "ask#1", 1, { result: () => 1 })));
    assert.throws(() => store.putNode(nodeRecord(RUN, "ask#2", 1, { result: Symbol("s") })));
  });
});

describe("B23 行的身份与 upsert", () => {
  it("复合键是 (siteId, ordinal)：同站点不同序号是两行", () => {
    const store = newStore();
    store.putNode(nodeRecord(RUN, "ask#1", 1, { result: "one" }));
    store.putNode(nodeRecord(RUN, "ask#1", 2, { result: "two" }));
    store.putNode(nodeRecord(RUN, "ask#2", 1, { result: "other-site" }));
    assert.equal(store.getNode(RUN, "ask#1", 1).result, "one");
    assert.equal(store.getNode(RUN, "ask#1", 2).result, "two");
    assert.equal(store.getNode(RUN, "ask#1", 3), undefined);
    assert.deepEqual(
      store.listNodes(RUN).map((row) => `${row.siteId}@${row.ordinal}`),
      ["ask#1@1", "ask#1@2", "ask#2@1"],
    );
  });

  it("putNode/putActor 是整行替换而不是补丁：第二次写没带的键就没了", () => {
    const store = newStore();
    store.putNode(
      nodeRecord(RUN, "ask#1", 1, {
        result: "r",
        stats: { tokens: 3, toolCalls: 1, turns: 1 },
        messageBoundary: 11,
      }),
    );
    store.putNode(nodeRecord(RUN, "ask#1", 1, { status: "completed" }));
    const row = store.getNode(RUN, "ask#1", 1);
    assert.equal("result" in row, false);
    assert.equal("stats" in row, false);
    assert.equal("messageBoundary" in row, false);
    assert.equal(row.status, "completed");
    assert.equal(row.inputHash, "hash");
  });

  it("listNodes/listActors 按写入顺序返回，与站点 id 的字典序无关", () => {
    const store = newStore();
    store.putNode(nodeRecord(RUN, "ask#9", 1));
    store.putNode(nodeRecord(RUN, "ask#1", 2));
    store.putNode(nodeRecord(RUN, "ask#1", 1));
    assert.deepEqual(
      store.listNodes(RUN).map((row) => `${row.siteId}@${row.ordinal}`),
      ["ask#9@1", "ask#1@2", "ask#1@1"],
    );
  });
});

describe("B23 结算袋的三种写入规则", () => {
  it("非终态一律清空失败三件套与产物：running 的行不能同时说「已失败」", () => {
    const store = newStore();
    store.updateRunStatus(RUN, "errored", {
      failure: { code: "X", message: "m", name: "WorkflowError" },
      result: "kept?",
      stopReason: "interrupted",
      supersededBy: OTHER,
    });
    const before = store.getRun(RUN);
    assert.equal(before.status, "errored");
    store.updateRunStatus(RUN, "running");
    const after = store.getRun(RUN);
    for (const key of ["failure", "result", "stopReason", "supersededBy"]) {
      assert.equal(key in after, false, key);
    }
    // 清的是结算袋，不是身份元数据。
    assert.equal(after.caps.maxConcurrency, 2);
    assert.equal(after.spentTokens, before.spentTokens);
  });

  it("pending 与 running 同一条清空规则", () => {
    const store = newStore();
    store.updateRunStatus(RUN, "stopped", { stopReason: "user" });
    store.updateRunStatus(RUN, "pending");
    assert.deepEqual(store.getRun(RUN), {
      caps: { maxConcurrency: 2 },
      runId: RUN,
      spentTokens: 0,
      status: "pending",
    });
  });

  it("终态：失败三件套整体改写，缺席即没有失败", () => {
    const store = newStore();
    store.updateRunStatus(RUN, "errored", {
      failure: { code: "A", message: "first", name: "WorkflowError" },
    });
    assert.equal(store.getRun(RUN).failure.code, "A");
    store.updateRunStatus(RUN, "stopped", { stopReason: "user", supersededBy: OTHER });
    const row = store.getRun(RUN);
    assert.equal("failure" in row, false);
    assert.equal(row.stopReason, "user");
    assert.equal(row.supersededBy, OTHER);
    // 再结算一次不带 stopReason 的终态：上一次的停止原因必须消失。
    store.updateRunStatus(RUN, "stopped", {});
    const again = store.getRun(RUN);
    assert.equal("stopReason" in again, false);
    assert.equal("supersededBy" in again, false);
  });

  it("终态：产物相反，缺席即不触碰，null 是合法产物", () => {
    const store = newStore();
    store.updateRunStatus(RUN, "completed", { result: { n: 1 } });
    store.updateRunStatus(RUN, "completed");
    assert.deepEqual(store.getRun(RUN).result, { n: 1 });
    store.updateRunStatus(RUN, "completed", { result: null });
    const nulled = store.getRun(RUN);
    assert.equal("result" in nulled, true);
    assert.equal(nulled.result, null);
    // 产物能活过终态翻转：errored 的结算袋不带产物不等于「删掉产物」。
    store.updateRunStatus(RUN, "completed", { result: "keep-me" });
    store.updateRunStatus(RUN, "errored", {
      failure: { code: "B", message: "m", name: "WorkflowError" },
    });
    const flipped = store.getRun(RUN);
    assert.equal(flipped.status, "errored");
    assert.equal(flipped.result, "keep-me");
    assert.equal(flipped.failure.code, "B");
  });

  it("结算袋里的 failure 也是克隆进来的", () => {
    const store = newStore();
    const failure = {
      code: "C",
      message: "m",
      name: "WorkflowError",
      providerStop: { kind: "quota", reason: "r" },
    };
    store.updateRunStatus(RUN, "errored", { failure });
    failure.providerStop.reason = "改了";
    assert.equal(store.getRun(RUN).failure.providerStop.reason, "r");
    assert.notEqual(store.getRun(RUN).failure, failure);
  });

  it("updateRunUsage 只动用量列，绝不碰状态或失败", () => {
    const store = newStore();
    store.updateRunStatus(RUN, "errored", {
      failure: { code: "D", message: "m", name: "WorkflowError" },
    });
    store.updateRunUsage(RUN, 1009);
    const row = store.getRun(RUN);
    assert.equal(row.spentTokens, 1009);
    assert.equal(row.status, "errored");
    assert.equal(row.failure.code, "D");
    store.updateRunUsage(RUN, 0);
    assert.equal(store.getRun(RUN).spentTokens, 0);
    assert.equal(store.getRun(RUN).status, "errored");
  });
});

describe("B23 事件轨：sequence、时刻与分页", () => {
  it("appendEvent 从 0 起单调分配 sequence，并填上追加时刻", () => {
    const store = newStore();
    const before = Date.now();
    const first = store.appendEvent(RUN, { type: "log", message: "a" });
    const second = store.appendEvent(RUN, { status: "completed", type: "run-settled" });
    const after = Date.now();
    assert.equal(first.sequence, 0);
    assert.equal(second.sequence, 1);
    assert.equal(typeof first.timeCreated, "number");
    assert.ok(first.timeCreated >= before && first.timeCreated <= after + 1);
    assert.ok(second.timeCreated >= first.timeCreated);
  });

  it("返回值与存储都是克隆：调用方改不动已落库的事件", () => {
    const store = newStore();
    const event = { type: "log", message: "a" };
    const stored = store.appendEvent(RUN, event);
    event.message = "改了";
    stored.event.message = "也改了";
    assert.deepEqual(store.listEvents(RUN)[0].event, { type: "log", message: "a" });
    assert.notEqual(store.listEvents(RUN)[0], store.listEvents(RUN)[0]);
  });

  it("端口不解释事件内容：事件对象逐字节进、逐字节出", () => {
    const store = newStore();
    const payload = {
      actorSeq: 3,
      instance: { ordinal: 1, siteId: "ask#1" },
      instructionsHead: "头",
      type: "node-queued",
    };
    store.appendEvent(RUN, payload);
    assert.deepEqual(store.listEvents(RUN)[0].event, payload);
    assert.deepEqual(Object.keys(store.listEvents(RUN)[0]).sort(), [
      "event",
      "sequence",
      "timeCreated",
    ]);
  });

  it("cursor 是「严格大于」而不是偏移量", () => {
    const store = newStore();
    for (const message of ["m0", "m1", "m2", "m3"])
      store.appendEvent(RUN, { type: "log", message });
    const all = store.listEvents(RUN);
    assert.deepEqual(
      all.map((e) => e.sequence),
      [0, 1, 2, 3],
    );
    assert.deepEqual(
      store.listEvents(RUN, { afterSequence: all[1].sequence }).map((e) => e.sequence),
      [2, 3],
    );
    assert.deepEqual(
      store.listEvents(RUN, { afterSequence: -1 }).map((e) => e.sequence),
      [0, 1, 2, 3],
    );
    assert.deepEqual(store.listEvents(RUN, { afterSequence: 3 }), []);
    assert.deepEqual(store.listEvents(RUN, { afterSequence: 99 }), []);
  });

  it("limit 在过滤之后生效，0 与负数得到空页", () => {
    const store = newStore();
    for (const message of ["m0", "m1", "m2", "m3"])
      store.appendEvent(RUN, { type: "log", message });
    assert.deepEqual(
      store.listEvents(RUN, { limit: 2 }).map((e) => e.sequence),
      [0, 1],
    );
    assert.deepEqual(
      store.listEvents(RUN, { afterSequence: 1, limit: 2 }).map((e) => e.sequence),
      [2, 3],
    );
    assert.deepEqual(
      store.listEvents(RUN, { afterSequence: 1, limit: 1 }).map((e) => e.sequence),
      [2],
    );
    assert.deepEqual(store.listEvents(RUN, { limit: 0 }), []);
    assert.deepEqual(store.listEvents(RUN, { limit: -5 }), []);
    assert.deepEqual(store.listEvents(RUN, { limit: 99 }).length, 4);
    assert.deepEqual(store.listEvents(RUN, {}), store.listEvents(RUN));
  });

  it("分页读到的窗口不重叠、不漏：按 cursor 翻到底等于全量", () => {
    const store = newStore();
    for (let i = 0; i < 9; i += 1) store.appendEvent(RUN, { type: "log", message: `m${i}` });
    const paged = [];
    let cursor;
    for (;;) {
      const page = store.listEvents(RUN, { afterSequence: cursor, limit: 4 });
      if (page.length === 0) break;
      paged.push(...page);
      cursor = page[page.length - 1].sequence;
    }
    assert.deepEqual(
      paged.map((e) => e.sequence),
      [0, 1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.deepEqual(paged, store.listEvents(RUN));
  });
});
