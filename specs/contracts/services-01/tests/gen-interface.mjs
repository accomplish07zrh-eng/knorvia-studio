// SPDX-License-Identifier: Apache-2.0
// services-01 interface.md 生成器：从范围文件 AST 抽取顶层导出签名。
// 用法（仓库根目录）：node --import tsx specs/contracts/services-01/tests/gen-interface.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { contractDir, documents, repoRoot, scope } from "./scope.mjs";
import { extractExports } from "./exports-ast.mjs";

const TITLES = {
  agent: "agent（协议、进程与会话运行时）",
  broadcast: "broadcast（跨窗口广播）",
  commands: "commands（用户命令发现与持久化）",
  "conversation-telemetry": "conversation-telemetry（Workspace 级埋点）",
  credential: "credential（凭据存储与密文）",
  "cua-permission-broker": "cua-permission-broker（Computer Use 权限与 Helper）",
  file: "file（工作区文件服务与搜索索引）",
};

// 围栏与空行都从常量/模板拼出，避免生成器自身变成一份被反复抄写的 Markdown 骨架。
const FENCE = "`".repeat(3);
const TS_FENCE_OPEN = `${FENCE}ts`;
const NL = "\n";

const rows = [];
let total = 0;
for (const row of scope) {
  if (row.path.endsWith(".md")) continue;
  const exports = extractExports(repoRoot, row.modulePath);
  total += exports.length;
  const runtime = exports.filter((entry) => entry.runtime).length;
  rows.push({
    dir: row.dir,
    modulePath: row.modulePath,
    classification: row.classification,
    exports,
    runtime,
  });
}

/** 一个模块小节：标题、导出计数行、签名代码块。 */
function moduleSection(row) {
  const pure = row.exports.length - row.runtime;
  const signatures = row.exports.map((entry) => entry.signature);
  return [
    `### \`packages/services/src/${row.modulePath}\``,
    "",
    `导出 ${row.exports.length} 项（运行时 ${row.runtime} / 纯类型 ${pure}），分类 \`${row.classification}\`。签名逐字取自源码。`,
    "",
    TS_FENCE_OPEN,
    ...signatures,
    FENCE,
  ].join(NL);
}

/** 一个目录小节：标题 + 该目录所有模块小节。 */
function directorySection(dir) {
  const entries = rows.filter((row) => row.dir === dir);
  if (entries.length === 0) return null;
  return [`## ${TITLES[dir]}（${entries.length} 个文件）`, ...entries.map(moduleSection)].join(
    NL + NL,
  );
}

const sections = Object.keys(TITLES)
  .map(directorySection)
  .filter((section) => section !== null);

const header = `# services-01 接口（interface.md）

本文件只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 \`behavior.md\`，调用方见 \`callers.md\`。

机器生成：\`node --import tsx specs/contracts/services-01/tests/gen-interface.mjs\`（抽取器 \`tests/exports-ast.mjs\`，范围真源 \`tests/scope.mjs\` / \`scope-files.json\`）。**不要手改**；B2 的 oracle 是本文件的导出声明块。

覆盖范围：\`packages/services/src/\` 下 7 个目录的 **${rows.length} 个 .ts 文件 / ${total} 项顶层导出**（另有 ${documents.length} 份继承文档，见 README）。

## 兼容入口面（重写后必须原样可用）

- **根桶 \`@knorvia/services\`（\`src/index.ts\` / \`dist/index.js\`）**：浏览器安全的类型与 descriptor 面。
- **Node 组合入口 \`@knorvia/services/node\`（\`src/node.ts\` / \`dist/node.js\`）**：Host/Server/CLI 的装配面。
- **子路径**：\`@knorvia/services/cua-permission-broker\`（\`src/cua-permission-broker/index.ts\`）、\`@knorvia/services/storage-startup\`、\`@knorvia/services/process/processTreeTerminator\`、\`@knorvia/services/window-controller\`。
- **包内深层路径**：本文件逐节列出。包内调用方（\`node.ts\`、\`taskServiceAdapter.ts\`、\`taskIndexSyncer.ts\` 等）按相对路径或 \`#src/*\` 引用；重写时模块路径与导出名必须保持可用，内部拆文件可以，但不得让调用方改导入。
- \`cua-permission-broker/index.ts\` 的 \`export * from "@knorvia/cua/broker/server"\` 是**委托面**：名字归属生产包 \`@knorvia/cua\`，本包只冻结再导出关系，不复制实现。

## 不在兼容面上的东西

- \`packages/services/src/index.ts\`、\`node.ts\` 与 6 个子路径入口桶不在本包 60 文件范围内（它们是 original）；本合同把它们当**调用方与装配面**读取。
- \`git/\`、\`session/\`、\`plugins/\`、\`process/\`、\`runtime-tools/\` 等目录不在本次 60 文件范围；替换阶段不得顺手改动。`;

writeFileSync(join(contractDir, "interface.md"), [header, ...sections].join(NL + NL) + NL);
console.log(
  `wrote specs/contracts/services-01/interface.md (${rows.length} modules, ${total} exports)`,
);
