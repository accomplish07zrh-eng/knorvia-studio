// SPDX-License-Identifier: Apache-2.0
// B16 用户面产物·内容族（artifact.file / artifact.markdown）
// B17 用户面产物·预置族（artifact.chart / table / metrics / board）
//
// 两族共享身份与上限账，但**失败通道按族分裂**：内容有 promise 可拒 ⇒ 节点级；
// 预置返回 void ⇒ failRun。两族都**不发节点生命周期事件**（产物站点不进任何图）。
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
  tick,
  wfError,
} from "./harness.mjs";

const { ARTIFACT_CAPS, InMemoryJournalStore, canonicalJson, inputHash } = dw;

const RUN_ID = "run-1";
const CAPS = { maxConcurrency: 1 };

/** driver 侧的落库记录（身份字段由引擎盖章，这里给出 driver 真正拥有的那几项）。 */
const record = (id, kind, version, extra = {}) => ({
  bytes: 4,
  contentType: "text/markdown",
  id,
  kind,
  uri: `knorvia-artifact://${id}/v${version}`,
  version,
  ...extra,
});

const hashFor = (op, id, args) => inputHash({ args, id, op });

function seedJournal(nodes, { status = "stopped" } = {}) {
  const journal = new InMemoryJournalStore();
  journal.createRun({ runId: RUN_ID, caps: CAPS, spentTokens: 0, status: "running" });
  for (const node of nodes) journal.putNode({ runId: RUN_ID, ...node });
  journal.updateRunStatus(RUN_ID, status);
  return journal;
}

/** 一个成功发布的产物行（resume 认领 id 只认 completed 行）。 */
function artifactRow({ ordinal = 1, siteId = "artifact#1", id, kind, op, version, args }) {
  return {
    artifactId: id,
    inputHash: hashFor(op, id, args ?? [id, "# hi"]),
    kind: "artifact",
    ordinal,
    result: record(id, kind, version),
    siteId,
    status: "completed",
  };
}

/** 内容族：一个只认 markdown 的装配。 */
function contentHarness(options = {}) {
  return makeHarness({ artifact: (request) => record(request.id, request.op, request.version), ...options });
}

const tableSpec = { columns: [{ field: "n" }] };

describe("B16 内容族：发布是效应", () => {
  it("一次成功发布：driver 收到带版本号的请求，行落 completed，脚本拿到 {id, version}", async () => {
    const h = contentHarness();
    const ref = await h.engine.publishArtifact("artifact#1", "markdown", ["notes", "# hi"]);
    await tick();
    assert.deepEqual(ref, { id: "notes", version: 1 });
    assert.deepEqual(h.recorded.artifactCalls, [
      {
        content: "# hi",
        id: "notes",
        op: "markdown",
        ordinal: 1,
        runId: RUN_ID,
        siteId: "artifact#1",
        version: 1,
      },
    ]);
    const row = nodeRow(h.journal, RUN_ID, "artifact#1");
    assert.equal(row.kind, "artifact");
    assert.equal(row.status, "completed");
    assert.equal(row.artifactId, "notes");
    assert.equal(row.inputHash, hashFor("markdown", "notes", ["notes", "# hi"]));
    assert.deepEqual(row.result, record("notes", "markdown", 1));
    assert.deepEqual(journalEvents(h.journal, RUN_ID)[1], {
      artifact: record("notes", "markdown", 1),
      instance: inst("artifact#1"),
      type: "artifact-published",
    });
  });

  it("产物站点不发任何节点生命周期事件（queued / dispatched / settled）", async () => {
    const h = contentHarness();
    await h.engine.publishArtifact("artifact#1", "markdown", ["notes", "# hi"]);
    const failing = contentHarness({ artifact: { error: "disk gone" } });
    await rejectionOf(failing.engine.publishArtifact("artifact#1", "markdown", ["notes", "# hi"]));
    for (const harness of [h, failing]) {
      assert.deepEqual(
        eventTypes(journalEvents(harness.journal, RUN_ID)).filter((t) => t.startsWith("node-")),
        [],
      );
    }
  });

  it("file 成员把第二个实参当路径传下去，opts 原样透传", async () => {
    const h = contentHarness();
    await h.engine.publishArtifact("artifact#1", "file", [
      "book",
      "out/book.pdf",
      { contentType: "application/pdf", title: "Book" },
    ]);
    assert.deepEqual(h.recorded.artifactCalls[0], {
      id: "book",
      op: "file",
      ordinal: 1,
      opts: { contentType: "application/pdf", title: "Book" },
      path: "out/book.pdf",
      runId: RUN_ID,
      siteId: "artifact#1",
      version: 1,
    });
  });

  it("同一 id 再发布是下一版；版本号由引擎按 journal 派生并下发", async () => {
    const h = contentHarness();
    assert.deepEqual(await h.engine.publishArtifact("artifact#1", "markdown", ["notes", "v1"]), {
      id: "notes",
      version: 1,
    });
    assert.deepEqual(await h.engine.publishArtifact("artifact#2", "markdown", ["notes", "v2"]), {
      id: "notes",
      version: 2,
    });
    assert.equal(h.recorded.artifactCalls[1].version, 2);
    assert.equal(h.recorded.artifactCalls[1].siteId, "artifact#2");
  });

  it("确定性实参护栏（id / payload / opts.primary）：拒绝但不落行、不发事件", async () => {
    const cases = [
      [[undefined, "# hi"], /id must be a non-empty string/],
      [["", "# hi"], /id must be a non-empty string/],
      [["notes", 42], /content must be a string/],
      [["notes", "# hi", { primary: "yes" }], /opts.primary must be a boolean/],
    ];
    for (const [args, pattern] of cases) {
      const h = contentHarness();
      const error = await rejectionOf(h.engine.publishArtifact("artifact#1", "markdown", args));
      assert.equal(error.code, "DriverError");
      assert.match(error.message, pattern);
      assert.equal(nodeRow(h.journal, RUN_ID, "artifact#1"), undefined);
      assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)), ["run-started"]);
      assert.deepEqual(h.recorded.artifactCalls, []);
    }
  });

  it("driver 的普通错误包成 DriverError：failed 行 + artifact-failed 事件，run 仍活着", async () => {
    const h = contentHarness({ artifact: { error: "disk gone" } });
    const error = await rejectionOf(
      h.engine.publishArtifact("artifact#1", "markdown", ["notes", "# hi"]),
    );
    assert.equal(error.code, "DriverError");
    assert.match(error.message, /Artifact publish failed: markdown "notes"/);
    assert.equal(h.engine.status(), "running");
    const row = nodeRow(h.journal, RUN_ID, "artifact#1");
    assert.equal(row.status, "failed");
    assert.equal(row.artifactId, "notes");
    assert.deepEqual(journalEvents(h.journal, RUN_ID)[1], {
      error: { code: "DriverError", message: error.message },
      id: "notes",
      instance: inst("artifact#1"),
      op: "markdown",
      type: "artifact-failed",
    });
  });

  it("driver 抛 WorkflowError 时原样保留（据码行动是脚本的出路）", async () => {
    const h = contentHarness({ artifact: { error: wfError("ArtifactTooLarge", "over 20 MiB") } });
    const error = await rejectionOf(
      h.engine.publishArtifact("artifact#1", "file", ["book", "out/big.pdf"]),
    );
    assert.equal(error.code, "ArtifactTooLarge");
    assert.equal(nodeRow(h.journal, RUN_ID, "artifact#1").error.code, "ArtifactTooLarge");
  });

  it("装配没有发布能力 ⇒ ArtifactStoreUnavailable（大声的命名失败，不是静默空产物）", async () => {
    const h = makeHarness({});
    const error = await rejectionOf(
      h.engine.publishArtifact("artifact#1", "markdown", ["notes", "# hi"]),
    );
    assert.equal(error.code, "ArtifactStoreUnavailable");
    assert.equal(nodeRow(h.journal, RUN_ID, "artifact#1").status, "failed");
  });

  it("一个 id 属于一种成员：markdown 成功后再按 file 发布同 id ⇒ 节点级 ArtifactKindMismatch", async () => {
    const h = contentHarness();
    await h.engine.publishArtifact("artifact#1", "markdown", ["notes", "# hi"]);
    const error = await rejectionOf(h.engine.publishArtifact("artifact#2", "file", ["notes", "a"]));
    assert.equal(error.code, "ArtifactKindMismatch");
    assert.equal(h.engine.status(), "running");
    assert.equal(nodeRow(h.journal, RUN_ID, "artifact#2").status, "failed");
  });

  it("primary 由引擎盖章且**粘着**：同 id 的下一版不再写也仍是 primary", async () => {
    const h = contentHarness();
    await h.engine.publishArtifact("artifact#1", "markdown", ["notes", "v1", { primary: true }]);
    const second = await h.engine.publishArtifact("artifact#2", "markdown", ["notes", "v2"]);
    assert.deepEqual(second, { id: "notes", version: 2 });
    assert.equal(nodeRow(h.journal, RUN_ID, "artifact#2").result.primary, true);
    assert.equal(nodeRow(h.journal, RUN_ID, "artifact#1").result.primary, true);
  });

  it("第二个 id 想当 primary ⇒ 节点级 ArtifactPrimaryConflict（排在上限之前）", async () => {
    const h = contentHarness();
    await h.engine.publishArtifact("artifact#1", "markdown", ["notes", "v1", { primary: true }]);
    const error = await rejectionOf(
      h.engine.publishArtifact("artifact#2", "markdown", ["other", "x", { primary: true }]),
    );
    assert.equal(error.code, "ArtifactPrimaryConflict");
    assert.match(error.message, /"notes" is already this run's primary artifact/);
  });

  it("同一 id 的第 17 版 ⇒ ArtifactVersionCapExceeded", async () => {
    const h = contentHarness();
    for (let version = 1; version <= ARTIFACT_CAPS.maxVersionsPerArtifact; version += 1) {
      assert.deepEqual(await h.engine.publishArtifact(`artifact#${version}`, "markdown", ["notes", `v${version}`]), {
        id: "notes",
        version,
      });
    }
    const error = await rejectionOf(
      h.engine.publishArtifact("artifact#17", "markdown", ["notes", "v17"]),
    );
    assert.equal(error.code, "ArtifactVersionCapExceeded");
    assert.match(error.message, /already has 16 versions/);
  });

  it("第 33 个新 id ⇒ ArtifactCapExceeded；复用已有 id 不受影响", async () => {
    const h = contentHarness();
    for (let index = 1; index <= ARTIFACT_CAPS.maxArtifactsPerRun; index += 1) {
      await h.engine.publishArtifact(`artifact#${index}`, "markdown", [`id-${index}`, "x"]);
    }
    const fresh = await rejectionOf(
      h.engine.publishArtifact("artifact#33", "markdown", ["one-too-many", "x"]),
    );
    assert.equal(fresh.code, "ArtifactCapExceeded");
    assert.deepEqual(await h.engine.publishArtifact("artifact#34", "markdown", ["id-1", "again"]), {
      id: "id-1",
      version: 2,
    });
  });

  it("replay 命中 completed：返回记录里的 {id, version}，不过 driver、不发事件", async () => {
    const journal = seedJournal([artifactRow({ id: "notes", kind: "markdown", op: "markdown", version: 3 })]);
    const h = contentHarness({ journal });
    assert.deepEqual(await h.engine.publishArtifact("artifact#1", "markdown", ["notes", "# hi"]), {
      id: "notes",
      version: 3,
    });
    assert.deepEqual(h.recorded.artifactCalls, []);
    assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)).slice(1), []);
  });

  it("replay 命中 failed：按记录重新拒绝（resume 是崩溃恢复，不是复验）", async () => {
    const error = { code: "ArtifactTooLarge", message: "over 20 MiB" };
    const journal = seedJournal([
      {
        artifactId: "notes",
        error,
        inputHash: hashFor("markdown", "notes", ["notes", "# hi"]),
        kind: "artifact",
        ordinal: 1,
        siteId: "artifact#1",
        status: "failed",
      },
    ]);
    const h = contentHarness({ journal });
    const thrown = await rejectionOf(h.engine.publishArtifact("artifact#1", "markdown", ["notes", "# hi"]));
    assert.deepEqual(thrown.toJSON(), error);
    assert.deepEqual(h.recorded.artifactCalls, []);
  });

  it("replay 命中 running（崩在拷贝字节的路上）：重新执行，版本号不跳号", async () => {
    const journal = seedJournal([
      artifactRow({ id: "notes", kind: "markdown", op: "markdown", version: 1 }),
      {
        artifactId: "notes",
        inputHash: hashFor("markdown", "notes", ["notes", "second"]),
        kind: "artifact",
        ordinal: 1,
        siteId: "artifact#2",
        status: "running",
      },
    ]);
    const h = contentHarness({ journal });
    assert.deepEqual(await h.engine.publishArtifact("artifact#2", "markdown", ["notes", "second"]), {
      id: "notes",
      version: 2,
    });
    assert.equal(h.recorded.artifactCalls[0].version, 2);
  });

  it("resume 后上限账连续：已 completed 的行认领 id，新版本号从行数续", async () => {
    const journal = seedJournal([
      artifactRow({ id: "notes", kind: "markdown", op: "markdown", version: 1 }),
      artifactRow({ id: "notes", ordinal: 2, kind: "markdown", op: "markdown", siteId: "artifact#2", version: 2 }),
    ]);
    const h = contentHarness({ journal });
    assert.deepEqual(await h.engine.publishArtifact("artifact#3", "markdown", ["notes", "third"]), {
      id: "notes",
      version: 3,
    });
  });

  it("结算之后的发布直接以 run 的错误拒绝", async () => {
    const h = contentHarness();
    h.engine.stop("user");
    const error = await rejectionOf(h.engine.publishArtifact("artifact#1", "markdown", ["notes", "# hi"]));
    assert.equal(error.code, "Cancelled");
    assert.deepEqual(h.recorded.artifactCalls, []);
  });
});

describe("B17 预置族：声明不是效应", () => {
  it("一次声明：一行 completed + presetRecord，全程不过 driver", () => {
    const h = makeHarness({});
    h.engine.declareArtifact("artifact#1", "table", ["dash", tableSpec]);
    assert.deepEqual(h.recorded.artifactCalls, []);
    const row = nodeRow(h.journal, RUN_ID, "artifact#1");
    assert.equal(row.status, "completed");
    assert.equal(row.artifactId, "dash");
    assert.deepEqual(row.result, { id: "dash", kind: "table", spec: tableSpec, version: 1 });
    assert.deepEqual(journalEvents(h.journal, RUN_ID)[1], {
      artifact: { id: "dash", kind: "table", spec: tableSpec, version: 1 },
      instance: inst("artifact#1"),
      type: "artifact-published",
    });
  });

  it("title / description 从 spec 提上来（卡片读者不该为了解标题去解 spec）", () => {
    const h = makeHarness({});
    h.engine.declareArtifact("artifact#1", "chart", [
      "c",
      { baseline: { field: "b" }, description: "d", title: "t", x: { field: "a" }, y: { field: "b" } },
    ]);
    const result = nodeRow(h.journal, RUN_ID, "artifact#1").result;
    assert.equal(result.title, "t");
    assert.equal(result.description, "d");
    assert.equal(result.version, 1);
  });

  it("spec 非法（空 columns / 超长的 title）⇒ ArtifactSpecInvalid 让 run 失败，不落行", async () => {
    for (const spec of [{ columns: [] }, { columns: [{ field: "n" }], title: "x".repeat(ARTIFACT_CAPS.maxTitleLength + 1) }]) {
      const h = makeHarness({});
      h.engine.declareArtifact("artifact#1", "table", ["dash", spec]);
      const settlement = await h.engine.settled;
      assert.equal(settlement.error.code, "ArtifactSpecInvalid");
      assert.equal(nodeRow(h.journal, RUN_ID, "artifact#1"), undefined);
    }
  });

  it("同 id 同 spec 再声明是幂等 no-op：不落新行、不发事件", () => {
    const h = makeHarness({});
    h.engine.declareArtifact("artifact#1", "table", ["dash", tableSpec]);
    h.engine.declareArtifact("artifact#2", "table", ["dash", { columns: [{ field: "n" }] }]);
    assert.deepEqual(
      eventTypes(journalEvents(h.journal, RUN_ID)),
      ["run-started", "artifact-published"],
    );
    assert.equal(nodeRow(h.journal, RUN_ID, "artifact#2"), undefined);
  });

  it("同 id 换 spec ⇒ ArtifactRedeclared 让 run 失败（void 家族没有拒绝通道）", async () => {
    const h = makeHarness({});
    h.engine.declareArtifact("artifact#1", "table", ["dash", tableSpec]);
    h.engine.declareArtifact("artifact#2", "table", ["dash", { columns: [{ field: "other" }] }]);
    const settlement = await h.engine.settled;
    assert.equal(settlement.error.code, "ArtifactRedeclared");
    assert.match(settlement.error.message, /already declared with a different spec/);
  });

  it("同 id 换种类 ⇒ ArtifactKindMismatch 让 run 失败", async () => {
    const h = makeHarness({});
    h.engine.declareArtifact("artifact#1", "table", ["dash", tableSpec]);
    h.engine.declareArtifact("artifact#2", "metrics", [
      "dash",
      { metrics: [{ field: "n" }] },
    ]);
    assert.equal((await h.engine.settled).error.code, "ArtifactKindMismatch");
  });

  it("第二个 id 想当 primary ⇒ ArtifactPrimaryConflict 让 run 失败", async () => {
    const h = makeHarness({});
    h.engine.declareArtifact("artifact#1", "table", ["dash", { ...tableSpec, primary: true }]);
    h.engine.declareArtifact("artifact#2", "metrics", [
      "tiles",
      { metrics: [{ field: "n" }], primary: true },
    ]);
    const settlement = await h.engine.settled;
    assert.equal(settlement.error.code, "ArtifactPrimaryConflict");
    assert.match(settlement.error.message, /"dash" is already this run's primary artifact/);
  });

  it("旗子进 canonical spec：同 id 改旗子算 ArtifactRedeclared 而不是 PrimaryConflict", async () => {
    const h = makeHarness({});
    h.engine.declareArtifact("artifact#1", "table", ["dash", tableSpec]);
    h.engine.declareArtifact("artifact#2", "table", ["dash", { ...tableSpec, primary: true }]);
    assert.equal((await h.engine.settled).error.code, "ArtifactRedeclared");
  });

  it("第 33 个 id ⇒ ArtifactCapExceeded 让 run 失败", async () => {
    const h = makeHarness({});
    for (let index = 1; index <= ARTIFACT_CAPS.maxArtifactsPerRun; index += 1) {
      h.engine.declareArtifact(`artifact#${index}`, "table", [`dash-${index}`, tableSpec]);
    }
    assert.equal(h.engine.status(), "running");
    h.engine.declareArtifact("artifact#33", "table", ["one-too-many", tableSpec]);
    assert.equal((await h.engine.settled).error.code, "ArtifactCapExceeded");
  });

  it("spec 序列化超过 8KB ⇒ ArtifactSpecInvalid（形状合法也不放行）", async () => {
    const h = makeHarness({});
    const fat = {
      columns: Array.from({ length: 300 }, (_, index) => ({ field: `${index}`.padStart(3, "0") + "f".repeat(40) })),
    };
    assert.ok(canonicalJson(fat).length > ARTIFACT_CAPS.maxSpecSerializedBytes);
    h.engine.declareArtifact("artifact#1", "table", ["dash", fat]);
    assert.equal((await h.engine.settled).error.code, "ArtifactSpecInvalid");
  });

  it("replay 命中：同一哈希静默跳过（不重写、不再发事件）", () => {
    const spec = { columns: [{ field: "n" }] };
    const journal = seedJournal([
      {
        artifactId: "dash",
        inputHash: inputHash({ args: ["dash", spec], id: "dash", op: "table" }),
        kind: "artifact",
        ordinal: 1,
        result: { id: "dash", kind: "table", spec, version: 1 },
        siteId: "artifact#1",
        status: "completed",
      },
    ]);
    const h = makeHarness({ journal });
    h.engine.declareArtifact("artifact#1", "table", ["dash", spec]);
    assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)).slice(1), []);
    // 认领仍然发生：同 id 换 spec 在 resume 后照样是 ArtifactRedeclared。
    h.engine.declareArtifact("artifact#2", "table", ["dash", { columns: [{ field: "other" }] }]);
    assert.equal(h.engine.status(), "errored");
  });

  it("replay 命中但 spec 变了 ⇒ InputHashMismatch 让 run 失败", async () => {
    const journal = seedJournal([
      {
        artifactId: "dash",
        inputHash: inputHash({ args: ["dash", tableSpec], id: "dash", op: "table" }),
        kind: "artifact",
        ordinal: 1,
        result: { id: "dash", kind: "table", spec: tableSpec, version: 1 },
        siteId: "artifact#1",
        status: "completed",
      },
    ]);
    const h = makeHarness({ journal });
    h.engine.declareArtifact("artifact#1", "table", ["dash", { columns: [{ field: "z" }] }]);
    assert.equal((await h.engine.settled).error.code, "InputHashMismatch");
  });

  it("结算之后不再受理（与 report / log 同规）", async () => {
    const h = makeHarness({});
    h.engine.complete("done");
    await tick();
    h.engine.declareArtifact("artifact#1", "table", ["dash", tableSpec]);
    assert.equal(nodeRow(h.journal, RUN_ID, "artifact#1"), undefined);
    assert.deepEqual(eventTypes(journalEvents(h.journal, RUN_ID)), ["run-started", "run-settled"]);
  });
});
