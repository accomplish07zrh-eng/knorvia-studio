// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 契约测试：golden 回放。
//
// 对 fixtures/corpus.mjs 的每个样例重跑一次公开入口的输出，与 fixtures/golden/<族>.json 里
// **旧实现录制**的结果逐字节比对：
//   lowering.json   350 条（dw01 复用的 324 + 本包自有的 26）：lowerWorkflowScript 的诊断、
//                   站点表、降级后的代码文本——本包对外唯一的生产物就是这段代码。
//   engine-run.json 26 条：整轮 run 的结局（RunRecord）、事件轨（Boundary C）、journal 行
//                   （dwf_run/dwf_node/dwf_actor）、driver 收到的每一次效应（Boundary B）。
// 任何一个样例与录制不一致即失败。这是本包的核心门槛（计划书选择 10：输入脚本 → lowering 与
// 整轮运行的 golden 样例）。
//
// 录制载荷的构造函数与录制器共用同一份（tests/harness.mjs），所以「回放断言的形状」与
// 「当初录下的形状」不可能分叉；dw01 是把那段逻辑复制了两遍，这里不跟。
// 只走公开入口（@knorvia/dynamic-workflow 根桶），黑盒断言；源码/dist 双入口由 entry.mjs 的
// KNORVIA_DW02_ENTRY 决定——dist 模式红一次就说明编译产物与源码行为不一致。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { corpusSamples, entryLabel, runSamples } from "./entry.mjs";
import { loweringRecord, runEngineSample } from "./harness.mjs";

const goldenDir = fileURLToPath(new URL("../fixtures/golden/", import.meta.url));
const goldenFiles = readdirSync(goldenDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

/** 每个 golden 文件对应一族：样例来源、回放函数、以及「不许悄悄缩水」的下限。 */
const families = new Map([
  [
    "engine-run",
    {
      min: 25,
      replay: (sample) => runEngineSample(sample),
      samples: runSamples,
    },
  ],
  [
    "lowering",
    {
      min: 300,
      replay: (sample) => loweringRecord(sample),
      samples: corpusSamples,
    },
  ],
]);

function readPayload(file) {
  const payload = JSON.parse(readFileSync(`${goldenDir}${file}`, "utf8"));
  const family = families.get(payload.family);
  if (family === undefined) {
    throw new Error(`golden 文件 ${file} 的族 ${payload.family} 没有登记回放方式`);
  }
  return { family, payload };
}

test(`golden 回放（${entryLabel} 入口）：语料与录制清单一一对应`, () => {
  assert.deepEqual(goldenFiles, ["engine-run.json", "lowering.json"]);
  const recordedByFamily = new Map();
  for (const file of goldenFiles) {
    const { family, payload } = readPayload(file);
    recordedByFamily.set(payload.family, new Set(payload.samples.map((sample) => sample.id)));
    assert.ok(
      payload.samples.length >= family.min,
      `${payload.family} 族录制不少于 ${family.min} 例，实际 ${payload.samples.length}`,
    );
  }
  for (const [name, family] of families) {
    const recorded = recordedByFamily.get(name);
    const expected = family.samples.map((sample) => sample.id);
    assert.deepEqual(
      expected.filter((id) => !recorded.has(id)).sort(),
      [],
      `${name}：语料里有样例没有录制 golden`,
    );
    assert.deepEqual(
      [...recorded].filter((id) => !expected.includes(id)).sort(),
      [],
      `${name}：golden 里有样例已从语料删除`,
    );
    assert.equal(expected.length, recorded.size, `${name}：样例数与录制数不等`);
  }
  // engine-run 是 corpus 的子集：同一批输入在两份录制里各管一半，不该出现第三份清单。
  for (const sample of runSamples) {
    assert.ok(
      corpusSamples.includes(sample),
      `${sample.id} 没进 lowering 族的语料（runSamples 必须是 samples 的子集）`,
    );
  }
});

for (const file of goldenFiles) {
  const { family, payload } = readPayload(file);

  test(`golden 回放（${entryLabel} 入口）：${payload.family} 族 ${payload.samples.length} 例`, async () => {
    const byId = new Map(payload.samples.map((sample) => [sample.id, sample]));
    let replayed = 0;
    for (const sample of family.samples) {
      const recorded = byId.get(sample.id);
      assert.ok(recorded, `缺少录制：${sample.id}`);
      // 语料的 expect 分类与录制值一致（防语料静默跑偏）。
      assert.equal(sample.expect, recorded.expect, `${sample.id} 语料 expect 与录制不符`);
      assert.deepEqual(
        await family.replay(sample),
        recorded,
        `${sample.id} 输出与旧实现录制不一致（${entryLabel} 入口）`,
      );
      replayed += 1;
    }
    assert.equal(replayed, payload.samples.length);
  });
}
