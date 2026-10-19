// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 interface.md 生成器：从范围文件的 AST 抽取顶层导出签名，
// 产出「模块路径 + 导出名 + 签名」清单（机器生成，不手改）。
// 用法（仓库根目录）：node --import tsx specs/contracts/dynamic-workflow-02/tests/gen-interface.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { contractDir, repoRoot, scope } from "./scope.mjs";
import { extractExports } from "./exports-ast.mjs";

const BUCKET_TITLE = {
  "": "入口桶（包的公开面）",
  engine: "引擎（Boundary A/B/C + journal）",
  facade: "facade 资产与注册表",
  lowering: "lowering（作者面 → host 调用）",
  schema: "schema 合成与校验",
};

// 合同冻结的纯数据常量表：条目与数值取自 B22/B29 的断言（pure.test.mjs 与 facade.test.mjs），
// 不取旧实现。这些文件按声明模式计分，interface.md 必须逐条列出键与值，而不是把初始值截成 …。
const CONTRACT_TABLES = new Map([
  [
    "facade/artifact-caps.ts:ARTIFACT_CAPS",
    `export const ARTIFACT_CAPS = {
  maxArtifactsPerRun: 32,
  maxDescriptionLength: 500,
  maxFileBytes: 20971520,
  maxIdLength: 64,
  maxMarkdownBytes: 262144,
  maxSpecSerializedBytes: 8192,
  maxTitleLength: 120,
  maxVersionsPerArtifact: 16,
} as const`,
  ],
  [
    "facade/world-read-caps.ts:WORLD_READ_CAPS",
    `export const WORLD_READ_CAPS = {
  gitDiffMaxBytes: 524288,
  gitLogDefaultCount: 20,
  gitLogMaxCount: 100,
  globMaxFiles: 2000,
  grepMaxMatches: 2000,
  grepMaxSerializedBytes: 262144,
  runDefaultTimeoutMs: 300000,
  runStderrMaxBytes: 262144,
  runStdoutMaxBytes: 262144,
} as const`,
  ],
  [
    "facade/registry.ts:WORLD_READ_REGISTRY",
    `export const WORLD_READ_REGISTRY = [
  { container: "files", member: "glob", op: "glob" },
  { container: "files", member: "read", op: "read" },
  { container: "files", member: "grep", op: "grep" },
  { container: "git", member: "changedFiles", op: "git-changed-files" },
  { container: "git", member: "diff", op: "git-diff" },
  { container: "git", member: "status", op: "git-status" },
  { container: "git", member: "log", op: "git-log" },
  { container: "world", member: "run", op: "run" },
] as const`,
  ],
  [
    "facade/registry.ts:ARTIFACT_REGISTRY",
    `export const ARTIFACT_REGISTRY = [
  { container: "artifact", member: "file", op: "file", family: "content" },
  { container: "artifact", member: "markdown", op: "markdown", family: "content" },
  { container: "artifact", member: "chart", op: "chart", family: "preset" },
  { container: "artifact", member: "table", op: "table", family: "preset" },
  { container: "artifact", member: "metrics", op: "metrics", family: "preset" },
  { container: "artifact", member: "board", op: "board", family: "preset" },
] as const`,
  ],
]);

const sections = [];
let totalExports = 0;
for (const row of scope) {
  const rows = extractExports(repoRoot, row.modulePath);
  totalExports += rows.length;
  const runtimeCount = rows.filter((entry) => entry.runtime).length;
  const overridden = rows.filter((entry) =>
    CONTRACT_TABLES.has(`${row.modulePath}:${entry.name}`),
  ).length;
  const provenance =
    overridden === 0
      ? "签名逐字取自源码。"
      : "合同冻结的数据表按键值逐条列出（取自 B22/B29 断言），其余签名逐字取自源码。";
  const lines = [
    `### \`apps/cli/packages/dynamic-workflow/src/${row.modulePath}\``,
    "",
    `导出 ${rows.length} 项（运行时 ${runtimeCount} / 纯类型 ${rows.length - runtimeCount}），` +
      `分类 \`${row.classification}\`。${provenance}`,
    "",
    "```ts",
    ...rows.map(
      (entry) => CONTRACT_TABLES.get(`${row.modulePath}:${entry.name}`) ?? entry.signature,
    ),
    "```",
    "",
  ];
  sections.push({ bucket: row.bucket, text: lines.join("\n") });
}

const byBucket = new Map();
for (const section of sections) {
  if (!byBucket.has(section.bucket)) byBucket.set(section.bucket, []);
  byBucket.get(section.bucket).push(section.text);
}

const body = [];
for (const bucket of ["", "engine", "facade", "lowering", "schema"]) {
  const entries = byBucket.get(bucket) ?? [];
  if (entries.length === 0) continue;
  body.push(`## ${BUCKET_TITLE[bucket]}（${entries.length} 个文件）`, "", ...entries);
}

const header = [
  "# dynamic-workflow-02 接口（interface.md）",
  "",
  "本文件只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。",
  "",
  "机器生成：`node --import tsx specs/contracts/dynamic-workflow-02/tests/gen-interface.mjs`（抽取器 `tests/exports-ast.mjs`，范围真源 `tests/scope.mjs`）。**不要手改**；手改会在下一次生成时被覆盖，而 B20 的 oracle 就是本文件的导出声明块。",
  "",
  `覆盖范围：\`apps/cli/packages/dynamic-workflow/src/\` 下 **analysis/ 与 compiler/ 之外**的全部 ${scope.length} 个 .ts（那是 dynamic-workflow-01 的范围），共 ${totalExports} 项顶层导出。分类构成见 \`README.md\`。`,
  "",
  "## 兼容入口面（重写后必须原样可用）",
  "",
  "- **根桶 `@knorvia/dynamic-workflow`（`src/index.ts` / `dist/index.js`）是本包唯一的运行时公开面**。包外 56 个调用文件全部只经这两个桶取符号（85 个具名导入，见 `callers-raw.txt` 第一段）：`WorkflowEngine`、`InMemoryJournalStore`、`WorkflowError`、`ConcurrencyController` 与五个上限常量、`canonicalJson`/`fnv1a`/`inputHash`/`refToString`、facade 的 `FACADE_DTS`/`SNIPPET_FACADE_DTS`/`FACADE_FILE_NAME`/三族 caps/`ARTIFACT_ID_PATTERN`/`ARTIFACT_REGISTRY`/`artifactFamilyOf`/`isArtifactPresetOp`、lowering 的 `HOST_BINDING`/`lowerWorkflow`/`lowerWorkflowScript`、schema 的 `validate`/`formatViolation`/`formatViolations`/`serializeSchema`/`buildAskSpecs`/`synthesizeAskSchemas`/`synthesizeWorkflowSchemas`/`deriveActorSubmitProfiles`/`deriveActorSubmitProfilesFor`/`GENERIC_SUBMIT_PROFILE`/`MAX_UNION_MEMBERS`/`SCHEMA_DIAGNOSTIC_CODE`，以及全部类型导出。",
  "- **`@knorvia/dynamic-workflow/projections`（`src/projections.ts` / `dist/projections.js`）是浏览器安全子集**：整体只再导出 analysis 投影（dynamic-workflow-01 的范围），**不得**引入 `typescript` 运行时依赖（`core/src/tool/handlers/create-workflow-graph-bounds.ts` 与 `-fold.ts` 走这个子路径正是为了不把编译器拖进浏览器包）。本包对该文件的合同只有这一条不变式 + 导出集合本身。",
  "- **深层模块路径**（包内 import 方按相对路径引用，重写后必须原样存在）：",
  "  - `facade/dts.js`（`FACADE_DTS`、`FACADE_FILE_NAME`）← `compiler/compile.ts`、`analysis/facade-misuse.ts`、`analysis/sites-labels.ts`、`analysis/sites.ts`；",
  "  - `facade/registry.js`（`WorldReadOp`/`ArtifactOp` 类型、`worldReadOpOfSymbol`、`artifactRowOfSymbol`、`siteProducingFunctionOfSymbol`、`markerFunctionOfSymbol`、`isSiteProducing`、`facadeContainerOf`、`SITE_MEMBER_NAMES`、`isArtifactPresetOp`）← `analysis/sites.ts`、`analysis/facade-misuse.ts`、`analysis/artifacts.ts`、`engine/engine-artifacts.ts`；",
  "  - `facade/artifact-caps.js`（`ARTIFACT_CAPS`、`ARTIFACT_ID_PATTERN`）← `analysis/artifacts.ts`；",
  "  - `engine/scheduler.js`（`AskScheduler`、`hashMismatch`）、`engine/scheduler-types.js`（`SchedulerHost`、`defer`）、`engine/journal-memory.js`、`engine/hash.js`、`engine/imported-cache.js`（`ImportedActorState`）、`engine/types.js` ← 本包 `test/ask-scheduler-contract.test.ts` 与 `test/ask-scheduler-fixture.ts`。",
  "- 因此**只有 facade 的三个文件与 engine 的内部模块存在包外/测试侧的深路径依赖**；`engine/engine*.ts`、`lowering/*`、`schema/*` 的对外身份只经根桶。内部怎么拆文件由重写方决定，但 interface.md 列出的模块路径与导出名都要在产物里可用。",
  "",
  "## 不在兼容面上的东西",
  "",
  "- `analysis/*.ts` 与 `compiler/compile.ts` 的导出面、行为、诊断码归 dynamic-workflow-01（已合并），本合同只把它们当**输入**（`createWorkflowProgram`/`collectSites`/`collectDiagnostics` 是合成与 lowering 的前置）。",
  "- `compiler/libs.generated.ts` 与 `facade/*.d.ts` 资产是 `scripts/generate-libs.mjs` 的构建期生成物（不进 git）。",
  "- `AskScheduler`、`ImportedActorState`、`boundWorldReadInput`、`validateArtifactSpec`、`publishReport` 等是**包内接缝**：它们没有独立的兼容承诺，行为由公开面（`WorkflowEngine` 的事件序列与 journal 行）判定，见 `behavior.md` 各条。",
  "",
  `## 逐文件导出（共 ${scope.length} 文件 / ${totalExports} 项）`,
  "",
];

writeFileSync(join(contractDir, "interface.md"), `${[...header, ...body].join("\n")}\n`, "utf8");
console.log(
  `interface.md: ${scope.length} files / ${totalExports} exports -> ${join(contractDir, "interface.md")}`,
);
