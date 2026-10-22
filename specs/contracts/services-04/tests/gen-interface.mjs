// services-04 interface.md 生成器：从 46 个实现文件抽取顶层导出签名。
// 用法：node --import tsx specs/contracts/services-04/tests/gen-interface.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { contractDir, frozen, repoRoot, scopeRows, srcPrefix } from "./scope.mjs";
import { extractExports } from "./exports-ast.mjs";

const FENCE = "`".repeat(3);
const TS_OPEN = `${FENCE}ts`;
const NL = "\n";

/** 按计划书 L215 的 7 项分组（与 scope 的 group 一致）。 */
const GROUP_TITLES = {
  ".": "## 根目录（`packages/services/src/*.ts`，7 件）",
  subagents: "## `subagents/`（子 Agent，8 件）",
  system: "## `system/`（系统探测与 SSH 别名，12 件）",
  terminal: "## `terminal/`（终端与配置文件解析，12 件）",
  "usage-stats": "## `usage-stats/`（用量统计，2 件）",
  "window-controller": "## `window-controller/`（窗口宿主控制，5 件）",
};

const GROUP_NOTES = {
  ".": "服务注册与访问的基础设施：`ServiceCollection`、`ServiceDescriptor`、`IServiceAccessor`、数据位置与路径解析。\n这些是**所有 service 的共同基座** —— 46 个文件里有 6 个依赖 `descriptors`。",
  subagents:
    "子 Agent 的定义、存储、模型选择与插件装配。\n`subagentMarkdown.ts`（350 行）是本组最大文件，负责解析子 Agent 的 Markdown 定义。",
  system:
    "系统探测（`system-probe/`）与 SSH 别名（`ssh-alias/`）两组子目录，加系统服务本体。\n`system-probe/contracts.ts` 被 4 个层内模块依赖，是本组的契约汇聚点。",
  terminal:
    "终端服务与跨平台配置文件解析（macOS plist / portable 格式）。\n`terminalProfileTypes.ts` 被 7 个层内模块依赖 —— **本层入度最高的模块**。",
  "usage-stats": "用量统计（28 行，本层最小的组）。",
  "window-controller":
    "窗口宿主的 controller service / projection / sessions index observer。\n**注意**：本组对 `services-01`（agent）与 `services-03`（session）有 6 处跨包依赖（见 `known-differences.md` K-w）。",
};

const rows = scopeRows();
const stats = frozen();

const byGroup = new Map();
for (const row of rows) {
  byGroup.set(row.group, [...(byGroup.get(row.group) ?? []), row]);
}

let total = 0;
const sections = [];

for (const [group, title] of Object.entries(GROUP_TITLES)) {
  const groupRows = byGroup.get(group) ?? [];
  if (groupRows.length === 0) continue;
  const body = groupRows
    .slice()
    .sort((a, b) => b.lines - a.lines)
    .map((row) => {
      const exports = extractExports(repoRoot, row.name);
      total += exports.length;
      const runtime = exports.filter((entry) => entry.runtime).length;
      return [
        `### \`${srcPrefix}${row.name}\``,
        "",
        `${row.lines} 行，导出 ${exports.length} 项（运行时 ${runtime} / 纯类型 ${exports.length - runtime}），分类 \`${row.classification}\`。签名逐字取自源码。`,
        "",
        TS_OPEN,
        ...exports.map((entry) => entry.signature),
        FENCE,
      ].join(NL);
    });
  sections.push([title, "", GROUP_NOTES[group] ?? "", "", ...body].join(NL));
}

const header = [
  "# services-04 接口（interface.md）",
  "",
  "本文件只列**兼容所需的模块路径、导出名、参数与返回类型**：实现包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。",
  "",
  "机器生成：`node --import tsx specs/contracts/services-04/tests/gen-interface.mjs`（抽取器 `tests/exports-ast.mjs`，范围真源 `tests/scope.mjs` / `scope-files.json`）。**不要手改**；导出面测试的 oracle 是本文件的导出声明块。",
  "",
  `覆盖范围：**${stats.count} 个实现文件**（计划书 L215 的 7 项，排除 2 个包级聚合桶），按功能组分组。`,
  "",
  "## 本包的定位",
  "",
  "`packages/services/src` 的**编排层**：服务注册基础设施、子 Agent、系统探测、终端、用量统计、窗口控制。",
  "",
  "与 `services-03`（`studio-runtime/domain` 的**纯逻辑层**）不同，本层**允许 I/O** ——",
  `实测 ${stats.count} 个文件里有 45 处 \`node:*\` 内置依赖（\`fs\` / \`child_process\` / \`path\` / \`os\` 等）。`,
  "但按插件化结构要求，**I/O 必须通过注入的依赖获取，不在模块级创建**（见 `behavior.md` B3）。",
  "",
  "**层内耦合比 domain 层紧得多**：",
  `- 层内依赖边 **${stats.internalEdges} 条**（domain 层是 21 条）`,
  "- 汇聚点（入度 ≥2）**19 个**，最多的是 `terminal/terminalProfileTypes`（入度 7）与 `descriptors`（入度 6）",
  "- 叶子（无层内依赖）**16 个**",
  "",
  "## 不在兼容面上",
  "",
  "- `packages/services/src/index.ts`（198 行）与 `node.ts`（1,796 行）：**包级公开面聚合桶**，",
  "  共 144 条 `export { ... } from` 转发，**无实现**。",
  "  它们不属于本包的实现范围（同 `services-03` 的 `contract.ts` 先例），",
  "  改用「转发面完整性断言」保障（见 `behavior.md` B6 与 `known-differences.md` K-z）。",
  "- `packages/services/src/types/yazl.d.ts`：第三方类型声明（`yazl` 是 zip 库），登记但不跑相似度。",
  "- `studio-runtime/`（149 个 `.ts`）：**不在 M6 返工范围**（`pending-rework` 零个），不归本包。",
];

writeFileSync(
  join(contractDir, "interface.md"),
  [...header, ...sections].join(NL + NL) + NL,
  "utf8",
);
console.log(`wrote specs/contracts/services-04/interface.md（${stats.count} 模块，${total} 导出）`);
