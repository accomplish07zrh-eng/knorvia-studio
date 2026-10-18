// SPDX-License-Identifier: Apache-2.0
// B11 世界读取（files.* / git.* / world.run）· B12 世界读取的有界输入（journal input_json）
//
// 断言的是**事件序列 + journal 行 + driver 收到的实参**，不看引擎内部。
// 行为条目见 behavior.md，条目↔测试对照表见 README。
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

const { InMemoryJournalStore, WORLD_READ_INPUT_MAX_BYTES, inputHash } = dw;

const RUN_ID = "run-1";
const CAPS = { maxConcurrency: 1 };

/** 一次 live 世界读取的公共形状：glob 一个 pattern，driver 回 `["a.ts"]`。 */
function worldHarness(options = {}) {
  return makeHarness({ world: [{ op: "glob", result: ["a.ts"] }], ...options });
}

/**
 * 预置一份**已有 journal**（模拟上一世留下的库）：先建 run，再按 `nodes` 落节点行，
 * 然后把同一个 store 交给新引擎——构造函数因此走 resume 分支。
 */
function seedJournal(nodes, { status = "stopped" } = {}) {
  const journal = new InMemoryJournalStore();
  journal.createRun({ runId: RUN_ID, caps: CAPS, spentTokens: 0, status: "running" });
  for (const node of nodes) journal.putNode({ kind: "world-read", runId: RUN_ID, ...node });
  journal.updateRunStatus(RUN_ID, status);
  return journal;
}

/** 一条 world 节点行的哈希（与引擎同一次准入的算法）。 */
const hashFor = (op, args) => inputHash({ op, args });

describe("B11 世界读取：准入、结算与 replay", () => {
  it("live 一次：running 行换成 completed 行，三段事件，driver 收到原样实参", async () => {
    const h = worldHarness();
    const value = await h.engine.worldRead("world-read#1", "glob", ["src/**/*.ts"]);
    await tick();
    assert.deepEqual(value, ["a.ts"]);
    assert.deepEqual(h.recorded.worldCalls, [{ args: ["src/**/*.ts"], op: "glob" }]);
    assert.deepEqual(
      eventTypes(journalEvents(h.journal, RUN_ID)),
      ["run-started", "node-queued", "node-dispatched", "node-settled"],
    );
    const row = nodeRow(h.journal, RUN_ID, "world-read#1");
    assert.equal(row.kind, "world-read");
    assert.equal(row.ordinal, 1);
    assert.equal(row.status, "completed");
    assert.deepEqual(row.result, ["a.ts"]);
    assert.equal(row.inputHash, hashFor("glob", ["src/**/*.ts"]));
    assert.deepEqual(row.input, { args: ["src/**/*.ts"], op: "glob" });
    assert.equal(row.error, undefined);
  });

  it("world.run 单列一种 kind（效应不是读），并在派发前关掉导入缓存", async () => {
    const importedCache = { actors: new Map(), world: new Map() };
    const h = worldHarness({ engine: { importedCache } });
    h.engine.worldRead("world-run#1", "run", ["pnpm", ["test"]]);
    await tick();
    assert.equal(nodeRow(h.journal, RUN_ID, "world-run#1").kind, "world-run");
    const queued = journalEvents(h.journal, RUN_ID).find((e) => e.type === "node-queued");
    assert.equal(queued.kind, "world-run");
    // 关门事件只在**修订 run**（有导入表）在场，cause 指认写入者。
    const closed = journalEvents(h.journal, RUN_ID).find((e) => e.type === "import-cache-closed");
    assert.deepEqual(closed, {
      cause: "world-run",
      instance: inst("world-run#1"),
      type: "import-cache-closed",
    });
  });

  it("非修订 run 的 world.run 不发关门事件（没有表可关）", async () => {
    const h = worldHarness();
    h.engine.worldRead("world-run#1", "run", ["pnpm", ["test"]]);
    await tick();
    assert.deepEqual(
      eventTypes(journalEvents(h.journal, RUN_ID)).filter((t) => t === "import-cache-closed"),
      [],
    );
  });

  it("driver 拒绝的普通错误包成 DriverError：节点失败、可 catch，run 仍活着", async () => {
    const h = makeHarness({ world: [{ op: "read", error: "ENOENT: missing.ts" }] });
    const error = await rejectionOf(h.engine.worldRead("world-read#1", "read", ["missing.ts"]));
    assert.equal(error.code, "DriverError");
    assert.match(error.message, /World read failed: read/);
    assert.equal(h.engine.status(), "running");
    const row = nodeRow(h.journal, RUN_ID, "world-read#1");
    assert.equal(row.status, "failed");
    assert.equal(row.error.code, "DriverError");
    // cause 不进 journal，因此也不进拒绝通道递给脚本的那条错：可序列化形态只有 code/message。
    assert.deepEqual(Object.keys(row.error).sort(), ["code", "message"]);
    assert.equal(error.cause, undefined);
    assert.equal(row.error.message, error.message);
  });

  it("带环 / 不可序列化的实参在准入即抛（世界读没有 report 那样的序列化探针）", () => {
    const cyclic = { name: "root" };
    cyclic.self = cyclic;
    const h = worldHarness();
    assert.throws(() => h.engine.worldRead("world-read#1", "run", [cyclic]), RangeError);
    const other = worldHarness();
    assert.throws(() => other.engine.worldRead("world-read#1", "run", [1n]), TypeError);
  });

  it("driver 抛 WorkflowError 时原样保留，不折进 DriverError", async () => {
    const h = makeHarness({
      world: [{ op: "grep", error: wfError("WorldReadCapExceeded", "too many matches") }],
    });
    const error = await rejectionOf(h.engine.worldRead("world-read#1", "grep", ["TODO"]));
    assert.equal(error.code, "WorldReadCapExceeded");
    assert.equal(error.message, "too many matches");
  });

  it("replay 命中 completed：不调 driver，只发一条 cached 的 node-settled", async () => {
    const args = ["src/**/*.ts"];
    const journal = seedJournal([
      {
        input: { args, op: "glob" },
        inputHash: hashFor("glob", args),
        ordinal: 1,
        result: ["recorded.ts"],
        siteId: "world-read#1",
        status: "completed",
      },
    ]);
    const h = worldHarness({ journal });
    assert.deepEqual(await h.engine.worldRead("world-read#1", "glob", args), ["recorded.ts"]);
    assert.deepEqual(h.recorded.worldCalls, []);
    assert.deepEqual(
      eventTypes(journalEvents(h.journal, RUN_ID)).slice(1),
      ["node-settled"],
    );
    const settled = journalEvents(h.journal, RUN_ID)[1];
    assert.deepEqual(settled, { cached: true, instance: inst("world-read#1"), outcome: "ok", type: "node-settled" });
  });

  it("replay 命中 failed：cached 的失败结算，错误从行里重建", async () => {
    const args = ["missing.ts"];
    const error = { code: "WorldReadCapExceeded", message: "over the cap" };
    const journal = seedJournal([
      {
        error,
        input: { args, op: "read" },
        inputHash: hashFor("read", args),
        ordinal: 1,
        siteId: "world-read#1",
        status: "failed",
      },
    ]);
    const h = worldHarness({ journal });
    const thrown = await rejectionOf(h.engine.worldRead("world-read#1", "read", args));
    assert.deepEqual(thrown.toJSON(), error);
    assert.deepEqual(h.recorded.worldCalls, []);
    const settled = journalEvents(h.journal, RUN_ID)[1];
    assert.deepEqual(settled, {
      cached: true,
      error,
      instance: inst("world-read#1"),
      outcome: "failed",
      type: "node-settled",
    });
  });

  it("replay 命中 running（崩在执行中）：重新 live 执行并覆盖成 completed", async () => {
    const args = ["src/**/*.ts"];
    const journal = seedJournal([
      {
        input: { args, op: "glob" },
        inputHash: hashFor("glob", args),
        ordinal: 1,
        siteId: "world-read#1",
        status: "running",
      },
    ]);
    const h = worldHarness({ journal });
    assert.deepEqual(await h.engine.worldRead("world-read#1", "glob", args), ["a.ts"]);
    assert.deepEqual(h.recorded.worldCalls, [{ args, op: "glob" }]);
    assert.deepEqual(
      eventTypes(journalEvents(h.journal, RUN_ID)).slice(1),
      ["node-queued", "node-dispatched", "node-settled"],
    );
    assert.equal(nodeRow(h.journal, RUN_ID, "world-read#1").status, "completed");
  });

  it("同一 op 第二次调用是 @2；世界读取不受 actor FIFO 与并发上限约束", async () => {
    const h = makeHarness({
      askSpecs: { "ask#1": { typed: false } },
      caps: { maxConcurrency: 1 },
      world: [
        { op: "glob", result: ["one"] },
        { op: "glob", result: ["two"] },
      ],
    });
    // 先把唯一的并发额度占住：一个 actor 的 ask 正在跑。
    const actor = h.engine.createActor("actor#1");
    h.engine.ask("ask#1", actor, "busy");
    await tick();
    const first = h.engine.worldRead("world-read#1", "glob", ["a"]);
    const second = h.engine.worldRead("world-read#1", "glob", ["b"]);
    assert.deepEqual(await first, ["one"]);
    assert.deepEqual(await second, ["two"]);
    assert.deepEqual(
      journalEvents(h.journal, RUN_ID)
        .filter((e) => e.type === "node-queued")
        .map((e) => `${e.instance.siteId}@${e.instance.ordinal}`),
      ["ask#1@1", "world-read#1@1", "world-read#1@2"],
    );
    assert.equal(nodeRow(h.journal, RUN_ID, "world-read#1", 2).ordinal, 2);
  });

  it("结算之后的世界读取直接以 run 的错误拒绝，不落任何行", async () => {
    const h = worldHarness();
    h.engine.stop("user");
    await tick();
    const error = await rejectionOf(h.engine.worldRead("world-read#1", "glob", ["a"]));
    assert.equal(error.code, "Cancelled");
    assert.deepEqual(h.recorded.worldCalls, []);
    assert.equal(nodeRow(h.journal, RUN_ID, "world-read#1"), undefined);
  });

  it("导入缓存命中（journal 无行）：写一行 completed + cached 事件，绝不调 driver", async () => {
    const args = ["src/**/*.ts"];
    const hash = hashFor("glob", args);
    const importedCache = {
      actors: new Map(),
      world: new Map([[hash, [{ inputHash: hash, kind: "world-read", result: ["imported.ts"] }]]]),
    };
    const h = worldHarness({ engine: { importedCache } });
    assert.deepEqual(await h.engine.worldRead("world-read#1", "glob", args), ["imported.ts"]);
    assert.deepEqual(h.recorded.worldCalls, []);
    const row = nodeRow(h.journal, RUN_ID, "world-read#1");
    assert.equal(row.status, "completed");
    assert.deepEqual(row.input, { args, op: "glob" });
    assert.equal(row.inputHash, hash);
    const types = eventTypes(journalEvents(h.journal, RUN_ID));
    assert.deepEqual(types.slice(1), ["node-settled"]);
  });

  it("关门之后不再问导入表：同一哈希的下一条导入条目不再被消费", async () => {
    const args = ["src/**/*.ts"];
    const hash = hashFor("glob", args);
    const importedCache = {
      actors: new Map(),
      world: new Map([[hash, [{ inputHash: hash, kind: "world-read", result: ["imported.ts"] }]]]),
    };
    const h = worldHarness({ engine: { importedCache } });
    h.engine.worldRead("world-run#1", "run", ["pnpm", ["test"]]);
    await tick();
    assert.deepEqual(await h.engine.worldRead("world-read#1", "glob", args), ["a.ts"]);
    assert.equal(nodeRow(h.journal, RUN_ID, "world-read#1").status, "completed");
    assert.deepEqual(h.recorded.worldCalls.map((c) => c.op), ["run", "glob"]);
  });
});

describe("B12 世界读取的有界输入", () => {
  it("序列化后不超限：原类型原样落库，truncated 键缺席", async () => {
    const h = worldHarness();
    h.engine.worldRead("world-read#1", "git-log", [20, { opts: { a: 1 } }]);
    await tick();
    const row = nodeRow(h.journal, RUN_ID, "world-read#1");
    assert.deepEqual(row.input, { args: [20, { opts: { a: 1 } }], op: "git-log" });
    assert.equal("truncated" in row.input, false);
  });

  it("超限：逐项字符串预览、至多 8 个实参、置 truncated", async () => {
    const h = worldHarness();
    const big = "x".repeat(WORLD_READ_INPUT_MAX_BYTES + 10);
    // 引擎不看元数（校验归 driver），所以这里给出一个真实 facade 不会给出的宽实参表，
    // 为的是把 MAX_ARGS_KEPT=8 这一半也钉住。
    const args = Array.from({ length: 10 }, (_, index) => (index === 0 ? big : `a${index}`));
    h.engine.worldRead("world-read#1", "run", args);
    await tick();
    const row = nodeRow(h.journal, RUN_ID, "world-read#1");
    assert.equal(row.input.truncated, true);
    assert.equal(row.input.args.length, 8);
    assert.deepEqual(row.input.args.slice(2), ["a2", "a3", "a4", "a5", "a6", "a7"]);
    assert.equal(row.input.args[0].length, 401);
    assert.ok(row.input.args[0].endsWith("…"));
    assert.equal(row.input.args[1], "a1");
    // 哈希仍覆盖完整载荷：截断只影响审计面，不影响 replay 的身份判定。
    assert.equal(row.inputHash, hashFor("run", args));
  });

  it("预览对非字符串实参取 JSON 文本（同样切到 400 字符 + 省略号）", async () => {
    const h = worldHarness();
    const payload = { fill: "y".repeat(WORLD_READ_INPUT_MAX_BYTES) };
    h.engine.worldRead("world-read#1", "run", ["node", payload]);
    await tick();
    const row = nodeRow(h.journal, RUN_ID, "world-read#1");
    assert.equal(row.input.truncated, true);
    assert.deepEqual(row.input.args[0], "node");
    assert.match(row.input.args[1], /^\{"fill":"y{391}…$/);
    assert.equal(row.input.args[1].length, 401); // 切在 400 个字符上（含 9 字符的 JSON 前缀）+ 省略号
  });
});
