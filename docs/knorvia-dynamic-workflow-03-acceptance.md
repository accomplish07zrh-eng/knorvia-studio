# dynamic-workflow-03 验收文档

- 包：`apps/cli/packages/dynamic-workflow` 的 `scratch/` 与 `scripts/`。计划书 `docs/knorvia-independent-replacement-plan.md:179` 原列：里程碑 M0、范围「scratch, scripts」、文件 3、行数 206、要点「scratch 与开发脚本，删除」。
- 认领：issue #208；分支 `replace/dynamic-workflow-03`。基线同步至最新 `origin/main`（`432aa421`，ahead 0 / behind 0，freshness 检查通过）。
- 用户裁决：2026-10-19 用户重要裁决明确指出：`scripts/generate-libs.mjs` 归 dw03（计划书 179 行），但它是 build 生成 `libs.generated.ts` 所需脚本，不得删除；保留或重写须过相似度门禁，并在验收文档写明依据。其余删除对象逐个确认无构建/测试引用后再删。
- 结论：
  1. `scratch/run.mjs` 与 `scripts/generate-mermaid.mjs` 确认已在 M0-5 批次 2（#106，`f47d5717`）删除，经核查全仓零活体构建/测试引用，全包无其他 scratch 目录或孤立脚本残留。
  2. `scripts/generate-libs.mjs` 确为构建与编译承重脚本，按裁决不得删除；原继承代码因相似度超标不合规，由 Knorvia 完成独立清洁重写并通过相似度门禁（containment 0.114 / run 2 / structural 0.000）。
  3. 本包继承文件数 -1（`scripts/generate-libs.mjs` 由 `upstream-modified` 转为 `original`），本验收文档亦登记为 `original`。

## 范围与删除对象核查

| 路径                           | 状态     | 说明与引用核查                                                                                            |
| ------------------------------ | -------- | --------------------------------------------------------------------------------------------------------- |
| `scratch/run.mjs`              | 已删除   | M0-5 批次 2（#106，`f47d5717`）删除；全仓 `rg` 确认无任何构建或测试活体引用（仅存冻结历史快照）           |
| `scripts/generate-mermaid.mjs` | 已删除   | 同上；同提交另移除 `package.json` 中的 `charts` 命令与 `.gitignore` 规则；全仓 `rg` 确认无任何活体引用    |
| `scripts/generate-libs.mjs`    | 保留重写 | 构建期生成器，被本包构建与桌面 CLI 构建承重调用，按裁决不得删除；独立重写并通过相似度门禁，见下文详细证据 |

边界核查：在工作树中执行 `git ls-files apps/cli/packages/dynamic-workflow | grep -icE "scratch|probe|demo|example|playground|generate-mermaid"` 命中 0；工作树内不存在任何 `scratch` 目录及开发脚本残留。

已删除路径的残留记录仅存在于冻结的历史快照文件中（`licensing/upstream-baseline.json:1500,1502` 以及 `licensing/evidence/**/retained-bindings.json`、`docs/evidence/**` 快照），不参与当前活体构建与来源清单。

## 计划书偏差

- **计划原文**：计划书 `docs/knorvia-independent-replacement-plan.md` 第 179 行对 `dynamic-workflow-03` 列出的规划为：范围「scratch, scripts」、文件数 3、行数 206、要点「scratch 与开发脚本，删除」。
- **实际情况**：
  1. `scratch/run.mjs` 与 `scripts/generate-mermaid.mjs` 已在 M0-5 批次 2（#106，`f47d5717`）删除，经核查全仓零活体构建/测试引用；
  2. 但 `scripts/generate-libs.mjs` 是构建链生成 `src/compiler/libs.generated.ts` 所必需的承重工具，并非可丢弃的临时开发脚本。如果直接删除，将破坏虚拟编译器的 ES2022 标准库闭包，导致本包及依赖它的 core / CLI 在打包后或裸 tsc 下无法编译。
- **处理方式**：
  - 遵照用户重要裁决（2026-10-19），`scripts/generate-libs.mjs` 不予删除，必须保留并归属 dw03；
  - 鉴于原继承脚本直接比对上游固定树会严重违规（containment 1.000 / longest run 42 / structural 0.970 均超门限），由 Knorvia 完成全新独立清洁重写并通过相似度门禁（containment 0.114 / run 2 / structural 0.000）；
  - 来源登记由 `upstream-modified` 变为 `original`（Apache-2.0），继承文件数实测 -1。
- **依据**：
  1. **dw01 合同记载**：
     - `specs/contracts/dynamic-workflow-01/interface.md:5` 明确记载：「`compiler/libs.generated.ts` 是 `scripts/generate-libs.mjs` 的构建期生成物（不进 git），不属合同范围」。
     - `specs/contracts/dynamic-workflow-01/known-differences.md:13` 明确记载：「`compiler/libs.generated.ts` | 构建期生成物（`scripts/generate-libs.mjs`） | 不进 git、不在 `licensing/current-files.json`；重写 `compile.ts` 时它照常生成，无需合同覆盖」。
  2. **dw02 合同记载**：
     - `specs/contracts/dynamic-workflow-02/interface.md:23` 明确记载：「`compiler/libs.generated.ts` 与 `facade/*.d.ts` 资产是 `scripts/generate-libs.mjs` 的构建期生成物（不进 git）」。
     - `specs/contracts/dynamic-workflow-02/known-differences.md:10` 记载排除 `compiler/libs.generated.ts`（构建期生成物）。
     - `specs/contracts/dynamic-workflow-02/acceptance.md:88` 构建门禁明确记载：「构建 `pnpm --dir apps/cli/packages/dynamic-workflow build` | 退出码 0（`generate-libs.mjs && tsc`）」。
  3. **build 承重引用**：
     - `apps/cli/packages/dynamic-workflow/package.json:19,21`：`build` 与 `typecheck` 脚本前置链入 `node scripts/generate-libs.mjs`。
     - `scripts/build-desktop-agent-cli.mjs:43`：显式登记 `prepareScript: "scripts/generate-libs.mjs"`，作为 bare-tsc 预构建路径的必需前置。
     - 编译器运行时依赖：`src/compiler/compile.ts:5` 导入生成物 `TS_LIBS` 注入 `InMemoryVirtualHost`，在无磁盘 node_modules 的 CLI / SEA 运行时中支持 ES2022 编译检查。

## scripts/generate-libs.mjs 承重依据、独立重写与相似度门禁

### 1. 承重调用证据

- 构建链直接调用：
  - `apps/cli/packages/dynamic-workflow/package.json:19`（`build`）与 `:21`（`typecheck`）均显式前置执行 `node scripts/generate-libs.mjs`。
  - `scripts/build-desktop-agent-cli.mjs:43` 登记 `prepareScript: "scripts/generate-libs.mjs"`，在 bare-tsc 路径（`runBootstrapWithRemoteBuild` 不走 package build script）里由构建系统显式预先执行。
- 核心编译器依赖：
  - 产物 `src/compiler/libs.generated.ts` 导出 `TS_LIBS`（内嵌 57 个 TypeScript stdlib `.d.ts` 文件文本）。
  - 打包后的 CLI 与 SEA 运行时在磁盘上没有 `node_modules`，`src/compiler/compile.ts:5` 直接导入 `TS_LIBS` 注入 `InMemoryVirtualHost`，使工作流编译器无需磁盘访问即可提供完整的 ES2022 标准库类型检查。删掉生成器后该生成物无法再生产或随 TypeScript 升级。

### 2. 独立清洁重写设计

上游继承实现（与上游 `apps/zcode-cli/packages/dynamic-workflow/scripts/generate-libs.mjs` 仅差一处折行）在相似度门禁下 3 项全部违规（line containment 1.000 >= 0.2, longest run 42 >= 8, structural 0.970 >= 0.4）。

为严格落实合规红线与自主实现要求，按清洁重写原则对该脚本进行全新实现：

- 使用现代原生 ESM 与 `node:fs/promises` 异步 API；
- 通过 `import.meta.resolve("typescript/package.json")` 动态获取已安装 TypeScript 版本与 lib 目录，不依赖 legacy `createRequire`；
- 设计清晰的功能函数：`discoverTypeScriptEnvironment`（环境发现）、`isOutputCurrent`（幂等判定）、`extractDirectives`（`/// <reference lib="..." />` 语法指令抽取）、`collectStandardLibraryClosure`（BFS 传递闭包收集）与 `synthesizeSourceFile`（确定性字典序序列化）；
- 保持幂等短路能力：当目标产物中的 `TS_LIB_VERSION` 与当前 TypeScript 版本一致时直接退出，确保 watch 与 test 回归不产生无谓写盘；
- 遵循红线要求：不压行、不凑注释、不复制上游代码。

### 3. 相似度门禁实测结果

- 检查命令：`node scripts/provenance/similarity.mjs --candidate apps/cli/packages/dynamic-workflow/scripts/generate-libs.mjs --upstream-dir ~/.cache/zcode-upstream`
- 上游比对基准：固定提交 `zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521`（7,060 文件）。
- 实测指标：
  - 行数：70 行（无压行、无无谓填充注释）
  - 最大行包含度（containment）：**0.114** < 0.200（阈值 0.200；最接近文件 `packages/desktop/scripts/bundle.mjs`）
  - 最长连续相同行数（longest run）：**2** < 8（阈值 8；最接近文件 `.vscode/vite-dev.mjs`）
  - 结构相似度（structural）：**0.000** < 0.400（阈值 0.400；无命中）
- 判定：**PASS（全部通过）**。

### 4. 生成与构建验证

- 生成验证：在产物缺失时执行 `node apps/cli/packages/dynamic-workflow/scripts/generate-libs.mjs`，准确输出 `generate-libs: wrote 57 lib files for typescript@5.9.3`，生成物 57 个 lib 文件与 `typescript@5.9.3` 匹配；再次执行立即静默退出（退出码 0，幂等生效）。
- 包级构建：`pnpm --dir apps/cli/packages/dynamic-workflow build` 退出码 0。
- 全量 CLI 构建：`pnpm build:cli-packages` 退出码 0，15/15 包全部成功。

## 门禁（本机 Linux，Node v24.14.0，与 `mise.toml` 一致）

| 检查          | 命令                                                  | 实测结果                                                                                                                            |
| ------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 相似度检查    | `node scripts/provenance/similarity.mjs`              | 退出码 0：PASS，containment 0.114 / longest run 2 / structural 0.000                                                                |
| 来源报告/检查 | `pnpm provenance:report` → `pnpm provenance:check`    | 登记后 total 17,438 / original 9,523 / upstream-modified 2,334；`reviewProblems 0`、`missingReviews []`；未解决第三方材料项 26      |
| 格式          | `pnpm fmt:check`                                      | 退出码 0：8,606 文件全部符合格式，冻结证据完整性 6,031 文件 / 69,654,143 字节                                                       |
| Lint          | `pnpm lint`                                           | 退出码 0：0 errors，217 warnings（既有），3,952 文件                                                                                |
| 类型检查      | `pnpm typecheck`                                      | 退出码 0；i18n en-US/zh-CN 5,573 键一致                                                                                             |
| CLI 构建      | `pnpm build:cli-packages`                             | 退出码 0：15/15 成功                                                                                                                |
| 本包构建      | `pnpm --dir apps/cli/packages/dynamic-workflow build` | 退出码 0                                                                                                                            |
| 未使用代码    | `pnpm knip`                                           | 退出码 1（仓库既有基线）：330 unused files / 683 unused exports / 68 unused dependencies / 26 unused devDependencies；本包零新增    |
| 架构检查      | `pnpm architecture:check --changed`                   | 退出码 0：`architecture: OK`，violations 0 / baseline 0 / new 0                                                                     |
| 契约测试      | `node --import tsx --test <contract-tests>`           | `ask-scheduler-contract.test.ts` 14/14 pass；dynamic-workflow-01 39/39 pass；dynamic-workflow-02 420/420 pass                       |
| 离线回归      | `pnpm test:studio`                                    | **退出码 1**：10,296 tests / 10,285 pass / 2 fail / 9 skipped，828.5s；一项为本机环境确定性失败（~/.grok/bin/grok），一项为负载波动 |

格式检查的前置条件：`.qoder/sessions/**`（Agent 会话产物）只在仓库外 `.git/info/exclude` 排除，`oxfmt` 会扫到工作区内的会话文件；测试读数是将 `.qoder` 临时移开后复跑得到。

### test:studio 唯一失败项定性说明

`packages/services/test/studio-cli-catalog-20261006.test.ts:161` 报 `AssertionError [ERR_ASSERTION]: Missing expected rejection.`（期望 `/未安装/`）。原因为本机装有真实 Grok Build（`~/.grok/bin/grok`），而 runner 未覆盖 `HOME` 导致命中真实可执行文件；在临时干净 HOME 下该用例 4/4 全过。该项为环境确定性失败，非本包改动引入，遵守红线未放宽测试。

## 来源登记

- 登记 `apps/cli/packages/dynamic-workflow/scripts/generate-libs.mjs` 为 `original`（Apache-2.0），basis 详述独立重写背景、承重原因与相似度门禁实测数据。分类由 `upstream-modified` 转为 `original`，**继承文件数 -1**。
- 登记本文档 `docs/knorvia-dynamic-workflow-03-acceptance.md` 为 `original`（Apache-2.0），以 CRLF 归一摘要登记。
- 追加采用定点插入，保持既有行内数组布局不变。
- 登记前基线（同步到 `432aa421` 后实测）：
  - `licensing/reviews.json`：12,565 条
  - `licensing/current-files.json`：total 17,437，original 9,521，upstream-modified 2,335
- 登记后实测：
  - `licensing/reviews.json`：12,567 条（+2）
  - `licensing/current-files.json`：total 17,438（+1），original 9,523（+2），upstream-modified 2,334（-1）
  - `reviewProblems`: 0
  - `missingReviews`: []
