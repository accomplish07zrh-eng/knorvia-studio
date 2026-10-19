// SPDX-License-Identifier: Apache-2.0
// B21 确定性哈希（canonicalJson · fnv1a · inputHash）与 B22 上限常量表（数字即契约）。
//
// 这两个族是「replay 一致性」与「容量契约」的底座：哈希决定一次录制能不能被认出来，
// 常量决定同一份数字在引擎侧与 driver 侧只有一份真相。测试因此钉三件事：稳定字节序、
// 全函数性的边界（undefined/非 JSON 值/非纯数据）、以及每张表恰好有哪些键。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dw } from "./entry.mjs";
import { inst, journalEvents, makeHarness, settleAsk, tick } from "./harness.mjs";

const {
  ARTIFACT_CAPS,
  ARTIFACT_ID_PATTERN,
  CONCURRENCY_DECREASE_FACTOR,
  CONCURRENCY_FLOOR,
  CONCURRENCY_IDLE_RESET_MS,
  CONCURRENCY_INCREASE_AFTER_SUCCESSES,
  CONCURRENCY_INCREASE_STEP,
  FANOUT_EXPAND_CAP,
  HOST_BINDING,
  INSTRUCTIONS_HEAD_MAX_CHARS,
  LAST_TOOL_NAME_MAX_CHARS,
  LAST_TOOL_TARGET_MAX_CHARS,
  NUDGE_ATTEMPTS,
  REPAIR_ATTEMPTS,
  REPORT_CAPS,
  WORLD_READ_CAPS,
  WORLD_READ_INPUT_MAX_BYTES,
  canonicalJson,
  fnv1a,
  inputHash,
} = dw;

describe("B21 canonicalJson：规范化字节序", () => {
  it("对象键按 UTF-16 码元排序，递归到每一层", () => {
    assert.equal(
      canonicalJson({ b: { d: 1, c: 2 }, a: [3, { z: 1, y: 2 }] }),
      '{"a":[3,{"y":2,"z":1}],"b":{"c":2,"d":1}}',
    );
    // 排序是字符串序而不是数字序："10" 排在 "2" 前，抹掉了 JS 对象整数键的插入序特权。
    assert.equal(canonicalJson({ 10: "x", 2: "y" }), '{"10":"x","2":"y"}');
    assert.equal(
      canonicalJson({ b: 1, B: 2, _: 3, 0: 4, 中: 5, a: 6 }),
      '{"0":4,"B":2,"_":3,"a":6,"b":1,"中":5}',
    );
  });

  it("数组保持原序，元素内部照样规范化", () => {
    assert.equal(canonicalJson([{ b: 1, a: 2 }, "x"]), '[{"a":2,"b":1},"x"]');
    assert.equal(canonicalJson([3, 1, 2]), "[3,1,2]");
  });

  it("对象里的 undefined 成员被跳过，数组里的 undefined 记成 null——与 JSON.stringify 同语义", () => {
    assert.equal(canonicalJson({ a: undefined, b: 1 }), '{"b":1}');
    assert.equal(canonicalJson({ a: undefined }), "{}");
    assert.equal(canonicalJson([1, undefined, 3]), "[1,null,3]");
  });

  it("标量交给 JSON.stringify，非 JSON 的基本值一律回落成 null（全函数性）", () => {
    assert.equal(canonicalJson("s"), '"s"');
    assert.equal(canonicalJson(""), '""');
    assert.equal(canonicalJson(0), "0");
    assert.equal(canonicalJson(-0), "0");
    assert.equal(canonicalJson(true), "true");
    assert.equal(canonicalJson(null), "null");
    assert.equal(canonicalJson(undefined), "null");
    assert.equal(
      canonicalJson(() => 1),
      "null",
    );
    assert.equal(canonicalJson(Symbol("s")), "null");
    assert.equal(canonicalJson(Number.NaN), "null");
    assert.equal(canonicalJson(Number.POSITIVE_INFINITY), "null");
  });

  it("数字用 JSON 的字面量形态，不做任何定点化", () => {
    assert.equal(canonicalJson(1e21), "1e+21");
    assert.equal(canonicalJson(0.1 + 0.2), "0.30000000000000004");
  });

  it("字符串走 JSON 转义，非 ASCII 原样保留", () => {
    assert.equal(canonicalJson('a"b\\c\nd\te'), '"a\\"b\\\\c\\nd\\te"');
    assert.equal(canonicalJson("中文😀"), '"中文😀"');
  });

  it("只看自有可枚举属性：原型链、访问器与宿主对象都会被吃掉", () => {
    const base = { inherited: 1 };
    const own = Object.create(base);
    own.own = 2;
    assert.equal(canonicalJson(own), '{"own":2}');

    class Point {
      constructor() {
        this.x = 1;
      }
      get y() {
        return 2;
      }
    }
    assert.equal(canonicalJson(new Point()), '{"x":1}');
    assert.equal(canonicalJson(new Date(0)), "{}");
    assert.equal(canonicalJson(new Map([["a", 1]])), "{}");
    assert.equal(canonicalJson(new Set([1])), "{}");
  });

  it("循环结构溢出栈、BigInt 由 JSON.stringify 抛——都不是干净返回值", () => {
    const cyclic = {};
    cyclic.self = cyclic;
    assert.throws(() => canonicalJson(cyclic), RangeError);
    assert.throws(() => canonicalJson({ n: 1n }), /BigInt/);
    assert.throws(() => canonicalJson(1n), /BigInt/);
  });

  it("输出总是可 parse 的 JSON，且与输入同内容", () => {
    for (const value of [{ a: 1, b: [1, "2", null, { c: 3 }] }, [], {}, "s", 7, true, null]) {
      assert.deepEqual(JSON.parse(canonicalJson(value)), value);
    }
  });
});

describe("B21 fnv1a：32 位 FNV-1a 变体", () => {
  it("固定向量与偏移基数", () => {
    assert.equal(fnv1a(""), "811c9dc5");
    assert.equal(fnv1a("a"), "e40c292c");
    assert.equal(fnv1a("hello"), "4f9f2cab");
    assert.equal(fnv1a("The quick brown fox"), "ae4d67e2");
  });

  it("输出恒为 8 位小写十六进制", () => {
    for (const input of ["", "a", "中文😀", "x".repeat(4096)]) {
      assert.match(fnv1a(input), /^[0-9a-f]{8}$/);
    }
  });

  it("纯 ASCII 与标准 UTF-8 FNV-1a 逐字节一致，非 ASCII 才分家", () => {
    const stdFnv1a32 = (text) => {
      let hash = 0x811c9dc5;
      for (const byte of new TextEncoder().encode(text)) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    };
    for (const text of ["", "a", "hello", "workflow:ask#1:[1,2]"]) {
      assert.equal(fnv1a(text), stdFnv1a32(text));
    }
    // 实现把每个 UTF-16 码元拆成高低两字节喂进哈希，因此与 UTF-8 编码的字节流不同。
    assert.notEqual(fnv1a("中文"), stdFnv1a32("中文"));
    assert.notEqual(fnv1a("😀"), stdFnv1a32("😀"));
    assert.equal(fnv1a("中文"), "d52a5910");
    assert.equal(fnv1a("😀"), "efde461a");
  });

  it("同一个码元不会因为超过 0xFF 而被丢掉一半", () => {
    // 只取低字节的话这些串会撞上；变体把高字节也异或进去正是为了挡这个。
    assert.notEqual(fnv1a(String.fromCharCode(0x100)), fnv1a(String.fromCharCode(0x0)));
    assert.notEqual(fnv1a("Ā"), fnv1a("\0"));
    assert.notEqual(fnv1a("ā"), fnv1a("à"));
    // 哈希不做 Unicode 规范化：同音异形的组合式与预组合式是两个不同的串。
    assert.equal(fnv1a("ā"), fnv1a("ā".normalize("NFC")));
    assert.notEqual(fnv1a("ā"), fnv1a("a\u0301"));
  });
});

describe("B21 inputHash：host 调用输入的防御性哈希", () => {
  it("就是 fnv1a 作用在 canonicalJson 上", () => {
    for (const value of [{ b: 1, a: [1, 2] }, "s", 42, null]) {
      assert.equal(inputHash(value), fnv1a(canonicalJson(value)));
    }
  });

  it("同内容不同键序同一个哈希，数组与对象永不混淆", () => {
    assert.equal(inputHash({ a: 1, b: 2 }), inputHash({ b: 2, a: 1 }));
    assert.equal(inputHash({ a: undefined }), inputHash({}));
    assert.notEqual(inputHash([1, 2]), inputHash({ 0: 1, 1: 2 }));
    assert.equal(inputHash([1, 2]), "7d8e8676");
    assert.equal(inputHash({ 0: 1, 1: 2 }), "9fbfb225");
  });

  it("钉住几个真实录制值的哈希（改一个字面量都会变）", () => {
    assert.equal(
      inputHash({ op: "glob", args: ["*.ts"] }),
      inputHash({ args: ["*.ts"], op: "glob" }),
    );
    assert.equal(inputHash({ x: [{ y: "z" }] }), "8d02ee00");
    assert.equal(inputHash("重跑"), fnv1a('"重跑"'));
  });

  it("规范化是幂等的：先规范化再哈希与直接哈希同串", () => {
    const sample = { list: [{ b: 2, a: [1, "x", null] }], flag: true, n: 3.5 };
    assert.equal(inputHash(sample), inputHash(JSON.parse(canonicalJson(sample))));
    assert.equal(canonicalJson(JSON.parse(canonicalJson(sample))), canonicalJson(sample));
    assert.match(inputHash(sample), /^[0-9a-f]{8}$/);
  });
});

describe("B22 上限常量表", () => {
  it("WORLD_READ_CAPS 恰好这九个键与这些数字", () => {
    assert.deepEqual(WORLD_READ_CAPS, {
      gitDiffMaxBytes: 512 * 1024,
      gitLogDefaultCount: 20,
      gitLogMaxCount: 100,
      globMaxFiles: 2000,
      grepMaxMatches: 2000,
      grepMaxSerializedBytes: 256 * 1024,
      runDefaultTimeoutMs: 300_000,
      runStderrMaxBytes: 256 * 1024,
      runStdoutMaxBytes: 256 * 1024,
    });
    assert.deepEqual(Object.keys(WORLD_READ_CAPS).sort(), [
      "gitDiffMaxBytes",
      "gitLogDefaultCount",
      "gitLogMaxCount",
      "globMaxFiles",
      "grepMaxMatches",
      "grepMaxSerializedBytes",
      "runDefaultTimeoutMs",
      "runStderrMaxBytes",
      "runStdoutMaxBytes",
    ]);
  });

  it("REPORT_CAPS 与 ARTIFACT_CAPS 的键集合", () => {
    assert.deepEqual(REPORT_CAPS, { maxItemsPerRun: 256, maxItemSerializedBytes: 32 * 1024 });
    assert.deepEqual(ARTIFACT_CAPS, {
      maxArtifactsPerRun: 32,
      maxDescriptionLength: 500,
      maxFileBytes: 20 * 1024 * 1024,
      maxIdLength: 64,
      maxMarkdownBytes: 256 * 1024,
      maxSpecSerializedBytes: 8 * 1024,
      maxTitleLength: 120,
      maxVersionsPerArtifact: 16,
    });
    assert.deepEqual(Object.keys(ARTIFACT_CAPS).sort(), [
      "maxArtifactsPerRun",
      "maxDescriptionLength",
      "maxFileBytes",
      "maxIdLength",
      "maxMarkdownBytes",
      "maxSpecSerializedBytes",
      "maxTitleLength",
      "maxVersionsPerArtifact",
    ]);
  });

  it("三张表互不共享键：读侧、报侧、产物侧各有各的数字", () => {
    const keys = (table) => new Set(Object.keys(table));
    for (const [left, right] of [
      [keys(WORLD_READ_CAPS), keys(REPORT_CAPS)],
      [keys(WORLD_READ_CAPS), keys(ARTIFACT_CAPS)],
      [keys(REPORT_CAPS), keys(ARTIFACT_CAPS)],
    ]) {
      assert.deepEqual(
        [...left].filter((key) => right.has(key)),
        [],
      );
    }
    // 表与表之间唯一的相同之处是字面量偶然相等，不是同一个键。
    assert.equal(WORLD_READ_CAPS.runStdoutMaxBytes, ARTIFACT_CAPS.maxMarkdownBytes);
  });

  it("产物 id 字符集：非空的 [A-Za-z0-9_.-]，且不带 g 标志", () => {
    assert.equal(ARTIFACT_ID_PATTERN.source, "^[A-Za-z0-9_.-]+$");
    assert.equal(ARTIFACT_ID_PATTERN.flags, "");
    for (const id of ["a", "A1", "book.pdf", "out_file-2", "a".repeat(64)]) {
      assert.equal(ARTIFACT_ID_PATTERN.test(id), true, id);
    }
    for (const id of ["", "/", "a b", "a%20b", "a/b", "a\\b", "a:b", "a中b"]) {
      assert.equal(ARTIFACT_ID_PATTERN.test(id), false, JSON.stringify(id));
    }
    // 无 g 标志的实际后果：同一个 id 连测两次答案一致。
    assert.equal(ARTIFACT_ID_PATTERN.test("a"), ARTIFACT_ID_PATTERN.test("a"));
  });

  it("引擎侧的散常数各有其名", () => {
    assert.equal(WORLD_READ_INPUT_MAX_BYTES, 4096);
    assert.equal(INSTRUCTIONS_HEAD_MAX_CHARS, 240);
    assert.equal(LAST_TOOL_NAME_MAX_CHARS, 64);
    assert.equal(LAST_TOOL_TARGET_MAX_CHARS, 120);
    assert.equal(REPAIR_ATTEMPTS, 3);
    assert.equal(NUDGE_ATTEMPTS, 1);
    assert.equal(FANOUT_EXPAND_CAP, 8);
    assert.equal(HOST_BINDING, "__host");
  });

  it("自适应并发的一组常数", () => {
    assert.equal(CONCURRENCY_DECREASE_FACTOR, 0.75);
    assert.equal(CONCURRENCY_INCREASE_STEP, 1);
    assert.equal(CONCURRENCY_INCREASE_AFTER_SUCCESSES, 4);
    assert.equal(CONCURRENCY_FLOOR, 1);
    assert.equal(CONCURRENCY_IDLE_RESET_MS, 300_000);
  });

  it("这些数字在引擎里真的被引用，而不是只躺在这里", async () => {
    // 观察侧证据：node-queued 的 instructionsHead 就是按 INSTRUCTIONS_HEAD_MAX_CHARS 截的。
    const h = makeHarness({ askSpecs: { "ask#1": { typed: false } } });
    const instructions = "开".repeat(INSTRUCTIONS_HEAD_MAX_CHARS + 10);
    const actor = h.engine.createActor("actor#1", "researcher");
    const pending = h.engine.ask("ask#1", actor, instructions);
    await tick();
    const queued = journalEvents(h.journal, "run-1").find((event) => event.type === "node-queued");
    assert.equal(queued.instructionsHead.length, INSTRUCTIONS_HEAD_MAX_CHARS);
    assert.equal(queued.instructionsHead, instructions.slice(0, INSTRUCTIONS_HEAD_MAX_CHARS));
    settleAsk(h.engine, inst("ask#1"), false, "done");
    await pending;
  });
});
