// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 契约测试：golden 回放。
//
// 对 fixtures/corpus.mjs 的每个样例重跑一次公开入口的 analyzeWorkflowScript + 六个
// 规范文本投影，与 fixtures/golden/<family>.json 里**旧实现录制**的输出逐字节比对。
// 任何一个样例的诊断、产物清单或投影文本与录制不一致即失败——这是本包的核心门槛
// （计划书选择 10：输入脚本 → 静态分析结果的 golden 样例）。
//
// 只走公开入口（@knorvia/dynamic-workflow 根桶 + /projections 桶），黑盒断言；
// 源码/dist 双入口由 entry.mjs 的 KNORVIA_DW01_ENTRY 决定。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { corpusSamples, dw, entryLabel, projections } from "./entry.mjs";

const goldenDir = fileURLToPath(new URL("../fixtures/golden/", import.meta.url));
const goldenFiles = readdirSync(goldenDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

/** 复刻录制器的载荷构造——同一段逻辑，断言侧与录制侧必须同形。 */
function runSample(sample) {
  const result = dw.analyzeWorkflowScript(sample.script);
  const hasGraphs = result.core !== undefined;
  return {
    id: sample.id,
    expect: sample.expect,
    ok: result.ok,
    diagnostics: result.diagnostics.map((entry) => ({
      code: entry.code,
      column: entry.column,
      line: entry.line,
      message: entry.message,
    })),
    declaredArtifacts: result.declaredArtifacts.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
    })),
    core: hasGraphs ? dw.serializeCore(result.core) : null,
    causality: hasGraphs ? dw.serializeCausalityGraph(result.causality) : null,
    flow: hasGraphs ? dw.serializeControlFlow(result.flow) : null,
    handoff: hasGraphs ? dw.serializeHandoffGraph(result.handoff, result.causality.lanes) : null,
    site: hasGraphs ? projections.serializeGraph(result.graph) : null,
    actor: hasGraphs
      ? projections.serializeActorGraph(projections.toActorGraph(result.graph))
      : null,
  };
}

test(`golden 回放（${entryLabel} 入口）：语料与录制清单一一对应`, () => {
  const goldenIds = new Set();
  for (const file of goldenFiles) {
    const payload = JSON.parse(readFileSync(goldenDir + file, "utf8"));
    for (const sample of payload.samples) goldenIds.add(sample.id);
  }
  const corpusIds = new Set(corpusSamples.map((sample) => sample.id));
  assert.deepEqual(
    [...corpusIds].filter((id) => !goldenIds.has(id)).sort(),
    [],
    "语料里有样例没有录制 golden",
  );
  assert.deepEqual(
    [...goldenIds].filter((id) => !corpusIds.has(id)).sort(),
    [],
    "golden 里有样例已从语料删除",
  );
  assert.ok(corpusIds.size >= 300, `golden 样例必须不少于 300 个，实际 ${corpusIds.size}`);
});

for (const file of goldenFiles) {
  const payload = JSON.parse(readFileSync(goldenDir + file, "utf8"));
  test(`golden 回放（${entryLabel} 入口）：${payload.family} 族 ${payload.samples.length} 例`, () => {
    const byId = new Map(payload.samples.map((sample) => [sample.id, sample]));
    let replayed = 0;
    for (const sample of corpusSamples) {
      if (sample.id.split("/")[0] !== payload.family) continue;
      const recorded = byId.get(sample.id);
      assert.ok(recorded, `缺少录制：${sample.id}`);
      const actual = runSample(sample);
      // 语料的 expect 分类断言与录制值一致（防语料静默跑偏）。
      assert.equal(sample.expect, recorded.expect, `${sample.id} 语料 expect 与录制不符`);
      assert.deepEqual(
        actual,
        recorded,
        `${sample.id} 分析输出与旧实现录制不一致（${entryLabel} 入口）`,
      );
      replayed += 1;
    }
    assert.equal(replayed, payload.samples.length);
  });
}
