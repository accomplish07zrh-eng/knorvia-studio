// SPDX-License-Identifier: Apache-2.0
// 生成 dynamic-workflow-02 的合同桩：每个**重写目标**文件一份，镜像仓库相对路径。
//
// 桩面 = tests/exports-ast.mjs 抽出的**运行时**顶层导出（与 interface.md 同一份抽取结果，
// 所以桩面与接口面不可能分叉）。纯类型导出不进运行时，省略；纯类型文件的桩没有任何导出。
//
// 用法（仓库根目录）：
//   node --import tsx specs/contracts/dynamic-workflow-02/stubs/build-stubs.mjs
// 幂等：重复运行覆盖写出，targets.txt 同步重生成。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { contractDir, repoRoot, rewriteTargets } from "../tests/scope.mjs";
import { extractExports } from "../tests/exports-ast.mjs";

const STUB_MARKER = "not implemented: dynamic-workflow-02";
const RUNTIME_KINDS = new Set(["function", "class", "const", "re-export"]);

/** 一个导出声明的桩文本；未知运行时种类直接炸，不静默漏面。 */
function declaration(row) {
  if (row.kind === "function") {
    return `export function ${row.name}(..._args: unknown[]): unknown {\n  throw new Error("${STUB_MARKER}");\n}`;
  }
  if (row.kind === "class") {
    return `export class ${row.name} {\n  constructor(..._args: unknown[]) {\n    throw new Error("${STUB_MARKER}");\n  }\n}`;
  }
  if (row.kind === "const") return `export const ${row.name}: unknown = undefined;`;
  if (row.kind === "re-export") return `export { ${row.name} } from ${JSON.stringify(row.source)};`;
  throw new Error(`stubs: 运行时导出了意外的种类 ${row.kind} (${row.name})`);
}

const lines = [];
for (const target of rewriteTargets) {
  const rows = extractExports(repoRoot, target.modulePath).filter((row) => row.runtime);
  for (const row of rows) {
    if (!RUNTIME_KINDS.has(row.kind)) {
      throw new Error(`stubs: ${target.modulePath} 有未覆盖的运行时种类 ${row.kind}`);
    }
  }
  const body = rows.map(declaration);
  const header = [
    "// SPDX-License-Identifier: Apache-2.0",
    `// dynamic-workflow-02 合同桩：${target.path}`,
    `// 分类 \`${target.classification}\`。只列 interface.md 的**运行时**导出名（纯类型不进运行时，省略）；`,
    "// 末行的 throw 让任何经由这些模块的 import 立刻失败——桩用于「桩替换后契约测试必须全部失败」",
    "// 的验证与替换阶段的起始状态，进入实现后随 stubs/ 一起退役。",
    "// 机器生成：node --import tsx specs/contracts/dynamic-workflow-02/stubs/build-stubs.mjs（勿手改）",
    "",
  ];
  const out =
    body.length === 0
      ? [
          ...header,
          "// 本文件没有运行时导出（纯类型面），桩因此只留一个空导出标记。",
          "export {};",
        ].join("\n")
      : [...header, ...body, "", `throw new Error("${STUB_MARKER}");`].join("\n");
  const stubPath = join(contractDir, "stubs", target.path);
  mkdirSync(dirname(stubPath), { recursive: true });
  writeFileSync(stubPath, `${out}\n`);
  lines.push(target.path);
}

// 桶名按字典序写 targets.txt：contract-gate 用它把桩内相对路径解析成仓库相对路径。
writeFileSync(join(contractDir, "stubs", "targets.txt"), `${lines.sort().join("\n")}\n`);
console.log(`stubs: ${lines.length} 个桩文件 -> specs/contracts/dynamic-workflow-02/stubs/`);
