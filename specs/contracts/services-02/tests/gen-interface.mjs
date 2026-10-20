// SPDX-License-Identifier: Apache-2.0
// services-02 interface.md 生成器：从范围文件 AST 抽取顶层导出签名。
// 用法（仓库根目录）：node --import tsx specs/contracts/services-02/tests/gen-interface.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  contractDir,
  entries,
  examples,
  portFiles,
  repoRoot,
  scope,
  SR_DIR,
  srcPrefix,
} from "./scope.mjs";
import { extractExports } from "./exports-ast.mjs";

const FENCE = "`".repeat(3);
const TS_FENCE_OPEN = `${FENCE}ts`;
const NL = "\n";

/** 端口在基线时的源码位置（下沉前）。用于同时列出「原路径」与「新路径」。 */
const LEGACY_PORT_DIR = "app/";

function sectionOf(row, exports) {
  const runtime = exports.filter((entry) => entry.runtime).length;
  const pure = exports.length - runtime;
  const heading =
    row.role === "port"
      ? `### \`${srcPrefix}${SR_DIR}${row.modulePath}.ts\`（端口，从 \`${srcPrefix}${SR_DIR}${LEGACY_PORT_DIR}${row.modulePath}.ts\` 下沉）`
      : `### \`${srcPrefix}${row.path.slice(srcPrefix.length)}\``;
  return [
    heading,
    "",
    `导出 ${exports.length} 项（运行时 ${runtime} / 纯类型 ${pure}），角色 \`${row.role}\`，分类 \`${row.classification}\`。签名逐字取自源码。`,
    "",
    TS_FENCE_OPEN,
    ...exports.map((entry) => entry.signature),
    FENCE,
  ].join(NL);
}

const groups = [
  ["## 契约声明（10 件）", scope.filter((row) => row.role === "declaration")],
  ["## 端口（4 件，从 app/ 下沉）", portFiles],
  ["## 入口（2 件）", entries],
  ["## 契约用法示例（1 件，非公开 API）", examples],
];

let total = 0;
const sections = [];
/** 端口文件此时仍在 app/ 下（合同阶段不移动源码），其余在 studio-runtime 根级。 */
function sourcePathOf(row) {
  const subdir = row.role === "port" ? "app/" : "";
  return `${SR_DIR}${subdir}${row.modulePath}.ts`;
}
for (const [title, rows] of groups) {
  if (rows.length === 0) continue;
  const body = rows.map((row) => {
    const exports = extractExports(repoRoot, sourcePathOf(row));
    total += exports.length;
    return sectionOf(row, exports);
  });
  sections.push([title, ...body].join(NL + NL));
}

const header = [
  "# services-02 接口（interface.md）",
  "",
  "本文件只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。",
  "",
  "机器生成：`node --import tsx specs/contracts/services-02/tests/gen-interface.mjs`（抽取器 `tests/exports-ast.mjs`，范围真源 `tests/scope.mjs` / `scope-files.json`）。**不要手改**；导出面测试的 oracle 是本文件的导出声明块。",
  "",
  "覆盖范围：`packages/services/src/studio-runtime/` 的 **17 个文件**（10 声明 + 4 端口下沉 + 2 入口 + 1 示例）。",
  "",
  "## 端口下沉说明（本包的结构性决策）",
  "",
  "4 个端口文件从 `studio-runtime/app/` 下沉到契约层根目录：",
  "",
  "| 原路径 | 新路径 |",
  "| --- | --- |",
  "| `studio-runtime/app/ports.ts` | `studio-runtime/ports.ts` |",
  "| `studio-runtime/app/storePort.ts` | `studio-runtime/storePort.ts` |",
  "| `studio-runtime/app/imagePort.ts` | `studio-runtime/imagePort.ts` |",
  "| `studio-runtime/app/workspaceRuntimePort.ts` | `studio-runtime/workspaceRuntimePort.ts` |",
  "",
  "**接口签名不变，只改位置与 import 路径**。下沉后 `adapters → app` 的 7 处依赖归零，依赖方向变为 `contracts ← domain ← app-* ← adapters-*`。",
  "",
  "**引用面**：4 个端口共 94 处引用（全部在 `packages/services/` 内，包外 0 次），其中 `packages/services/test/` 有 5 处 —— **只改 import 路径，测试断言零改动**。",
  "",
  "## 兼容入口面",
  "",
  "- **契约声明**：10 个模块路径必须可用，导出名与签名不变。",
  "- **端口**：下沉到 `studio-runtime/` 根目录后，**新路径**是兼容面；替换阶段还会在旧路径保留一层 re-export 壳（见 design.md），使存量引用不必一次性迁移。",
  "- **入口**：`module.ts`、`node.ts` 的装配函数签名不变。",
  "- **示例**：`contract.example.ts` **不属于公开 API**，仅为契约用法示例与编译期兼容性检查。",
  "",
  "## 不在兼容面上的东西",
  "",
  "- `studio-runtime/app/` 的其余 41 个文件（归 services-04 / 05 / 06）；",
  "- `studio-runtime/adapters/`（归 services-07 / 08）；",
  "- `studio-runtime/domain/`（归 services-03）。",
].join(NL);

writeFileSync(join(contractDir, "interface.md"), [header, ...sections].join(NL + NL) + NL);
console.log(
  `wrote specs/contracts/services-02/interface.md (${scope.length} modules, ${total} exports)`,
);
