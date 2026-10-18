// SPDX-License-Identifier: Apache-2.0
// B15 report：即发即忘的中间结果发布（序列化探针 · replay 去重 · 两个上限 · 标签校验）
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dw } from "./entry.mjs";
import {
  eventTypes,
  inst,
  journalEvents,
  makeHarness,
  nodeRow,
  tick,
} from "./harness.mjs";

const { InMemoryJournalStore, REPORT_CAPS, inputHash } = dw;

const RUN_ID = "run-1";
const CAPS = { maxConcurrency: 1 };

/** 一次 report 的 journal 行（默认无标签）。 */
function seededReport(ordinal, item, { artifactId } = {}) {
  return {
    ...(artifactId === undefined ? {} : { artifactId }),
    inputHash: inputHash(item),
    kind: "report",
    ordinal,
    result: item,
    siteId: `report#${ordinal}`,
    status: "completed",
  };
}

function seedJournal(nodes, { status = "stopped" } = {}) {
  const journal = new InMemoryJournalStore();
  journal.createRun({ runId: RUN_ID, caps: CAPS, spentTokens: 0, status: "running" });
  for (const node of nodes) journal.putNode({ runId: RUN_ID, ...node });
  journal.updateRunStatus(RUN_ID, status);
  return journal;
}

describe("B15 report 的发布路径", () => {
  it("一次发布：一行 completed、一个 report 事件、没有节点生命周期事件", async () => {
    const h = makeHarness({});
    h.engine.report("report#1", { n: 1 });
    await tick();
    assert.deepEqual(
      eventTypes(journalEvents(h.journal, RUN_ID)),
      ["run-started", "report"],
    );
    assert.deepEqual(journalEvents(h.journal, RUN_ID)[1], {
      instance: inst("report#1"),
      item: { n: 1 },
      type: "report",
    });
    const row = nodeRow(h.journal, RUN_ID, "report#1");
    assert.equal(row.kind, "report");
    assert.equal(row.status, "completed");
    assert.deepEqual(row.result, { n: 1 });
    assert.equal(row.inputHash, inputHash({ n: 1 }));
    // report 行不带 actor 字段，也不带 input（有界输入是世界读专属）。
    assert.equal(row.actorSiteId, undefined);
    assert.equal(row.input, undefined);
    assert.equal("artifactId" in row, false);
  });

  it("同一站点的第二次调用是 @2（序号是 run 级计数，report 站点之间互不消耗）", () => {
    const h = makeHarness({});
    h.engine.report("report#1", { a: 1 });
    h.engine.report("report#1", { a: 2 });
    h.engine.report("report#2", { b: 1 });
    assert.deepEqual(
      journalEvents(h.journal, RUN_ID)
        .filter((e) => e.type === "report")
        .map((e) => `${e.instance.siteId}@${e.instance.ordinal}`),
      ["report#1@1", "report#1@2", "report#2@1"],
    );
    assert.equal(nodeRow(h.journal, RUN_ID, "report#1", 2).ordinal, 2);
  });

  it("item 不是 JSON（undefined / 函数 / symbol）⇒ failRun DriverError，不落行", async () => {
    for (const [label, item] of [
      ["undefined", undefined],
      ["function", () => 1],
      ["symbol", Symbol("x")],
    ]) {
      const h = makeHarness({});
      h.engine.report("report#1", item);
      const settlement = await h.engine.settled;
      assert.equal(settlement.status, "errored", label);
      assert.equal(settlement.error.code, "DriverError", label);
      assert.match(settlement.error.message, /is not a JSON value/, label);
      assert.equal(nodeRow(h.journal, RUN_ID, "report#1"), undefined, label);
      assert.deepEqual(
        eventTypes(journalEvents(h.journal, RUN_ID)),
        ["run-started", "run-settled"],
        label,
      );
    }
  });

  it("item 带环 ⇒ failRun DriverError（探针先于 canonicalJson，否则是爆栈而不是一次可读失败）", async () => {
    const item = { name: "root" };
    item.self = item;
    const h = makeHarness({});
    h.engine.report("report#1", item);
    const settlement = await h.engine.settled;
    assert.equal(settlement.error.code, "DriverError");
    assert.match(settlement.error.message, /cannot be serialized to JSON/);
  });

  it("单条超过 32KB ⇒ ReportCapExceeded 让整个 run 失败（上限论字节，不是字符）", async () => {
    const h = makeHarness({});
    // 一个字符一字节、恰好越线的 ASCII 串，与一条同样字节数的中文串（字符数是三分之一）。
    const tooBig = "x".repeat(REPORT_CAPS.maxItemSerializedBytes + 1);
    h.engine.report("report#1", tooBig);
    const overBytes = "中".repeat(Math.floor(REPORT_CAPS.maxItemSerializedBytes / 3) + 2);
    const other = makeHarness({});
    other.engine.report("report#1", overBytes);
    assert.equal((await h.engine.settled).error.code, "ReportCapExceeded");
    assert.equal((await other.engine.settled).error.code, "ReportCapExceeded");
    // 报的是序列化后的字节数（JSON 的两个引号也算）。
    assert.match(
      (await h.engine.settled).error.message,
      new RegExp(`is ${tooBig.length + 2} bytes, over the 32768-byte limit`),
    );
  });

  it("第 257 条 ⇒ ReportCapExceeded（条数上限是 run 级的）", async () => {
    const h = makeHarness({});
    for (let index = 0; index < REPORT_CAPS.maxItemsPerRun; index += 1) {
      h.engine.report("report#1", { index });
    }
    assert.equal(h.engine.status(), "running");
    h.engine.report("report#1", { index: REPORT_CAPS.maxItemsPerRun });
    const settlement = await h.engine.settled;
    assert.equal(settlement.error.code, "ReportCapExceeded");
    assert.match(settlement.error.message, /already reported 256 items/);
  });

  it("上限计数跨 resume 连续：journal 里已有的 report 行照样计数", async () => {
    const nodes = Array.from({ length: REPORT_CAPS.maxItemsPerRun }, (_, index) =>
      seededReport(index + 1, { index }),
    );
    const h = makeHarness({ journal: seedJournal(nodes) });
    h.engine.report("report#257", { one: "too many" });
    const settlement = await h.engine.settled;
    assert.equal(settlement.error.code, "ReportCapExceeded");
  });

  it("标签必须指向已声明的预置产物，否则 ArtifactUndeclared 让 run 失败", async () => {
    const h = makeHarness({});
    h.engine.report("report#1", { n: 1 }, "dash");
    const settlement = await h.engine.settled;
    assert.equal(settlement.error.code, "ArtifactUndeclared");
    assert.match(settlement.error.message, /Declared presets: \(none\)/);
    assert.equal(nodeRow(h.journal, RUN_ID, "report#1"), undefined);
  });

  it("标签指向内容产物（file/markdown）同样非法：只有预置成员能被认领", async () => {
    const h = makeHarness({ artifact: { id: "notes", kind: "markdown", version: 1 } });
    await h.engine.publishArtifact("artifact#1", "markdown", ["notes", "# hi"]);
    h.engine.report("report#1", { n: 1 }, "notes");
    const settlement = await h.engine.settled;
    assert.equal(settlement.error.code, "ArtifactUndeclared");
  });

  it("标签合法：行与事件都带 artifactId（看板 = journal 的投影）", () => {
    const h = makeHarness({});
    h.engine.declareArtifact("artifact#1", "table", ["dash", { columns: [{ field: "n" }] }]);
    h.engine.report("report#1", { n: 1 }, "dash");
    assert.deepEqual(journalEvents(h.journal, RUN_ID)[2], {
      artifactId: "dash",
      instance: inst("report#1"),
      item: { n: 1 },
      type: "report",
    });
    assert.equal(nodeRow(h.journal, RUN_ID, "report#1").artifactId, "dash");
  });

  it("replay 命中：静默跳过——不发事件、不重写行、不动上限", async () => {
    const journal = seedJournal([seededReport(1, { index: 0 })]);
    const h = makeHarness({ journal });
    h.engine.report("report#1", { index: 0 });
    await tick();
    assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)).slice(1), []);
    assert.deepEqual(nodeRow(h.journal, RUN_ID, "report#1").result, { index: 0 });
    // 上限按已存在的行连续计数，且**命中那次不重复计入**：已有 1 行 → 再 255 条正当，第 256 条撞线。
    for (let index = 1; index < REPORT_CAPS.maxItemsPerRun; index += 1) {
      h.engine.report("report#1", { index });
    }
    assert.equal(h.engine.status(), "running");
    h.engine.report("report#1", { over: "the line" });
    assert.equal((await h.engine.settled).error.code, "ReportCapExceeded");
  });

  it("replay 命中但 item 变了 ⇒ InputHashMismatch 让整个 run 失败（防御性比对）", async () => {
    const journal = seedJournal([seededReport(1, { index: 0 })]);
    const h = makeHarness({ journal });
    h.engine.report("report#1", { index: 1 });
    const settlement = await h.engine.settled;
    assert.equal(settlement.error.code, "InputHashMismatch");
    assert.deepEqual(settlement.error.mismatch, {
      expected: inputHash({ index: 0 }),
      got: inputHash({ index: 1 }),
    });
  });

  it("标签不进哈希：同一 item 换个标签在 replay 时不算纯度违约", () => {
    const journal = seedJournal([seededReport(1, { index: 0 }, { artifactId: "dash" })]);
    const h = makeHarness({ journal });
    h.engine.declareArtifact("artifact#1", "table", ["dash", { columns: [{ field: "n" }] }]);
    h.engine.report("report#1", { index: 0 });
    assert.equal(h.engine.status(), "running");
  });

  it("结算之后不再受理：report 与 log 同规", async () => {
    const h = makeHarness({});
    h.engine.complete({ done: true });
    await tick();
    h.engine.report("report#1", { n: 1 });
    assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)).slice(1), ["run-settled"]);
    assert.equal(nodeRow(h.journal, RUN_ID, "report#1"), undefined);
  });
});
