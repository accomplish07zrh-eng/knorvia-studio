// SPDX-License-Identifier: Apache-2.0
// services-03 interface.md 生成器：从范围文件 AST 抽取顶层导出签名。
// 用法（仓库根目录）：node --import tsx specs/contracts/services-03/tests/gen-interface.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { contractDir, repoRoot, scope, srcPrefix, sourcePathOf } from "./scope.mjs";
import { extractExports } from "./exports-ast.mjs";

const FENCE = "`".repeat(3);
const TS_FENCE_OPEN = `${FENCE}ts`;
const NL = "\n";

/** 按「功能簇」分组，而不是按文件名字母序——审查时能看出模块的职责归属。 */
const CLUSTERS = [
  {
    title: "## 内核策略与能力（kernel*，5 件）",
    files: [
      "kernelPolicy",
      "kernelIdentity",
      "kernelMedia",
      "kernelPresentation",
      "kernelUsage",
    ],
  },
  {
    title: "## 工作流与引用解析（workflow*/reference*，6 件）",
    files: [
      "workflowGraph",
      "workflowParams",
      "reference",
      "referencePath",
      "stepReference",
      "condition",
    ],
  },
  {
    title: "## 输出与产物（output*，2 件）",
    files: ["outputRef", "outputBuild"],
  },
  {
    title: "## 群聊与工具策略（group*/agentTool*，3 件）",
    files: ["groupPolicy", "groupPrompts", "agentToolPolicy"],
  },
  {
    title: "## 工作区运行时与图像（workspace*/image*，5 件）",
    files: [
      "workspaceRuntime",
      "workspaceRuntimeEnvironment",
      "workspaceReviewPolicy",
      "workspaceImage",
      "imageInput",
    ],
  },
  {
    title: "## 校验与规范化（validation / canonicalValue / staticPng，3 件）",
    files: ["validation", "canonicalValue", "staticPng"],
  },
  {
    title: "## 身份与权限（projectIdentity / remoteAgentIdentity / acpPermission / workspaceSecrets / retiredKernels / attentionVersion，6 件）",
    files: [
      "projectIdentity",
      "remoteAgentIdentity",
      "acpPermission",
      "workspaceSecrets",
      "retiredKernels",
      "attentionVersion",
    ],
  },
  {
    title: "## 能力矩阵（capabilityMatrix，1 件）",
    files: ["capabilityMatrix"],
  },
];

const byName = new Map(
  scope.map((row) => [row.modulePath.replace(/^domain\//u, ""), row]),
);

let total = 0;

function sectionOf(row, exports) {
  const runtime = exports.filter((entry) => entry.runtime).length;
  const pure = exports.length - runtime;
  return [
    `### \`${srcPrefix}${sourcePathOf(row)}\``,
    "",
    `导出 ${exports.length} 项（运行时 ${runtime} / 纯类型 ${pure}），分类 \`${row.classification}\`。签名逐字取自源码。`,
    "",
    TS_FENCE_OPEN,
    ...exports.map((entry) => entry.signature),
    FENCE,
  ].join(NL);
}

const sections = [];
const ungrouped = new Set(byName.keys());

for (const cluster of CLUSTERS) {
  const rows = [];
  for (const name of cluster.files) {
    const row = byName.get(name);
    if (row === undefined) throw new Error(`未知模块：${name}`);
    ungrouped.delete(name);
    rows.push(row);
  }
  const body = rows.map((row) => {
    const exports = extractExports(repoRoot, sourcePathOf(row));
    total += exports.length;
    return sectionOf(row, exports);
  });
  sections.push([cluster.title, ...body].join(NL + NL));
}

if (ungrouped.size > 0) {
  throw new Error(`以下模块未分组：${[...ungrouped].join(", ")}`);
}

const headerLines = [
  "# services-03 接口（interface.md）",
  "",
  "本文件只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。",
  "",
  "机器生成：`node --import tsx specs/contracts/services-03/tests/gen-interface.mjs`（抽取器 `tests/exports-ast.mjs`，范围真源 `tests/scope.mjs` / `scope-files.json`）。**不要手改**；导出面测试的 oracle 是本文件的导出声明块。",
  "",
  `覆盖范围：\`packages/services/src/studio-runtime/domain/\` 的 **${scope.length} 个文件**（按功能簇分组，不按字母序）。`,
  "",
  "## 本包的定位",
  "",
  "`studio-runtime/domain/` 是**纯逻辑层**：类型、校验、解析、策略计算，**不含 I/O、不含子进程**。",
  "它被 `app/`（71 处）与 `adapters/`（61 处）向下依赖，自身**只依赖 `services-02` 的契约声明**。",
  "",
  "**层内耦合极低**：31 个文件里只有 10 条层内依赖边（见 `scope.mjs` 的 `INTERNAL_EDGES`），",
  "27 个文件互不引用 —— 说明这是一个「聚合包」而非「强内聚功能包」。",
  "",
  "## 不在兼容面上",
  "",
  "- `contract.ts`（聚合桶）对 `domain/imageInput`、`domain/outputRef`、`domain/reference` 的 `export *`：",
  "  那是 `services-02` 的入口聚合职责，本包只保证这 3 个模块自身的导出面。",
  "- `app/`（45 件）、`adapters/`（60 件）：分属 `services-04`～`services-08`。",
];

writeFileSync(join(contractDir, "interface.md"), [...headerLines, ...sections].join(NL + NL) + NL);
console.log(`wrote specs/contracts/services-03/interface.md (${scope.length} modules, ${total} exports)`);
