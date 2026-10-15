// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 录制器：在**旧实现**上跑 fixtures/corpus.mjs 的全部样例，
// 把每个样例的静态分析结果（诊断、产物清单、六个规范文本投影）逐字录制进
// fixtures/golden/<family>.json。契约测试回放时逐字节比对——新实现只要产出不同就红。
//
// 只走公开入口（@knorvia/dynamic-workflow 根桶 + /projections 桶），黑盒录制。
// 用法（仓库根目录，Node 24）：
//   node --import tsx specs/contracts/dynamic-workflow-01/tests/record-golden.mjs
// 合同合并后任何语料/录制改动都要重跑旧门并升版本（README 顶部）。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");

const dw = await import(
  new URL("../../../../apps/cli/packages/dynamic-workflow/src/index.ts", import.meta.url)
);
const projections = await import(
  new URL("../../../../apps/cli/packages/dynamic-workflow/src/projections.ts", import.meta.url)
);
const { samples } = await import(new URL("../fixtures/corpus.mjs", import.meta.url));

/**
 * 一个样例的录制载荷：六个投影全部来自公开导出的规范文本序列化器。
 * 图被扣下时（编译期/facade 诊断）对应字段为 null。
 */
function recordSample(sample) {
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

const byFamily = new Map();
for (const sample of samples) {
  const family = sample.id.split("/")[0];
  if (!byFamily.has(family)) byFamily.set(family, []);
  byFamily.get(family).push(recordSample(sample));
}

const goldenDir = join(contractDir, "fixtures", "golden");
mkdirSync(goldenDir, { recursive: true });
let totalBytes = 0;
let totalCount = 0;
for (const [family, payloads] of byFamily) {
  const text = `${JSON.stringify({ family, samples: payloads }, null, 2)}\n`;
  writeFileSync(join(goldenDir, `${family}.json`), text, "utf8");
  totalBytes += Buffer.byteLength(text, "utf8");
  totalCount += payloads.length;
}
console.log(
  `record-golden: ${totalCount} samples / ${byFamily.size} families / ${(totalBytes / 1024).toFixed(0)} KB -> fixtures/golden/`,
);
