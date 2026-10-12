# contracts-03 验收记录（acceptance.md）

> 本合同阶段的验收：范围、旧门两入口与桩替换结果、条目→测试覆盖、调用方与无用代码核对、首次失败与修正、未覆盖项。
> 替换阶段的验收（相似度两道门槛、接入门禁、来源登记）在合同合并后另开分支补记到本文档。

## 1. 范围与来源

`apps/cli/packages/contracts`（`@knorvia/contracts`）的第 6 个包，共 **5 个继承文件**（`lead/scope-report.mjs` 实测）：

| 路径                                        | 全部文件 | 继承  | 分类                 |
| ------------------------------------------- | -------- | ----- | -------------------- |
| `apps/cli/packages/contracts/src/skills`    | 1        | 1     | upstream-modified 1  |
| `apps/cli/packages/contracts/src/telemetry` | 2        | 2     | upstream-unchanged 2 |
| `apps/cli/packages/contracts/src/time`      | 1        | 1     | upstream-unchanged 1 |
| `apps/cli/packages/contracts/src/index.ts`  | 1        | 1     | upstream-modified 1  |
| **合计**                                    | 5        | **5** | ≤60 ✓                |

来源：`contracts-02` 重切（原口径 61 > 60 → 56 + 5，记 issue #108 / #126）。认领 issue：#130。

## 2. 旧门（旧实现上的结论）

`node scripts/contract-gate.mjs --contract specs/contracts/contracts-03 --tests "*.test.mjs" --dist-env KNORVIA_CONTRACTS_ENTRY=dist --stub-root specs/contracts/contracts-03/stubs --stub-map specs/contracts/contracts-03/stubs/targets.txt`

| 入口                                        | 结果                                         |
| ------------------------------------------- | -------------------------------------------- |
| 源码入口                                    | tests=**9** pass=**9** fail=0 skipped=0      |
| dist 入口（`KNORVIA_CONTRACTS_ENTRY=dist`） | tests=**9** pass=**9** fail=0 skipped=0      |
| 桩替换（5 个目标文件）                      | tests=9 pass=**0** fail=**9** `allFail=true` |

- 旧门基线提交：`02f2212ee46b7ee762ce0d8cb5292df17c26be5c`（main，含 `replace: contracts-01 (#129)`）；Node v26.3.0。
- 详细输出：`gate-old.json`（本目录）。
- 预登记差异：**无**（见 `known-differences.md`）。

## 3. 条目 → 测试对照表（无空行）

| 条目                                      | 测试                                                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 公开入口导出面                         | `tests/api-surface.test.mjs`「每个公开子路径都能载入并导出 interface.md 列出的运行时名字」「包根再导出的每个模块路径都能载入」「包根对本包自有导出与 @knorvia/shared 转发都是真实取值」 |
| B2 模型 API 取值表与恒等映射              | `tests/behavior.test.mjs`「B2 模型 API operation / actor / failure 取值表与恒等映射」                                                                                                   |
| B3 querySource 映射与归一                 | `tests/behavior.test.mjs`「B3 querySource 映射表、observation 覆盖与 logicalCallId 兜底」                                                                                               |
| B4 telemetry schema 与 agent operation 表 | `tests/behavior.test.mjs`「B4 telemetry schema 版本与 agent operation 取值表」                                                                                                          |
| B5 本地 ISO 日期                          | `tests/behavior.test.mjs`「B5 本地 ISO 日期：补零、本地时区语义、年不补零」                                                                                                             |
| B6 类型面                                 | `tests/types.test.mjs`「B6 类型面：正向用例通过编译、反向用例必须报错」                                                                                                                 |
| B7 `@knorvia/shared` 取值转发             | `tests/behavior.test.mjs`「B7 包根对 @knorvia/shared 的取值转发」、`tests/api-surface.test.mjs`「包根对本包自有导出与 @knorvia/shared 转发都是真实取值」                                |

## 4. 调用方与无用代码核对

- `callers.md`：`./telemetry` 命中 7 个包外文件；`./skills` 命中 0 处（类型经包根被 15+ 文件使用）；包根命中 961 个源文件。
- `dep:refs` 抽样 6 个符号：3 个报 0 引用（`formatLocalIsoDate`、`TELEMETRY_SCHEMA_VERSION`、`resolveModelApiCallObservation`）。这是**工具假阴性**（不跟随包名入口 + 桶再导出），不是"可以删除"的依据；反证与逐条对照记在 `callers.md` 末节。
- `pnpm knip`：本包 5 个文件**没有**未使用文件或未使用导出（全仓 1791 / 597 为既有基线）。因此本合同 PR 不含"删除无用代码"的提交。

## 5. 首次失败与修正（本阶段实测）

1. **桶测试假设"每个再导出模块都有运行时导出"**：`interfaces/*.port.ts` 与 `skills/index.ts` 是纯类型模块，载入后命名空间为空 → 断言失败 15 项。修正为"载入不抛错是硬条件 + 有运行时导出的模块 ≥30 + 空命名空间 ≤20"，并点名要求包根必须再导出 `./telemetry/index.js`、`./skills/index.js`、`./time/local-date.js`。
2. **类型用例三处编译失败**：① source 模式用 `.ts` 说明符触发 `TS5097`（改为统一 `.js` 说明符，由 nodenext 解析到 `src/*.ts` 或 `dist/*.d.ts`）；② 把 `resolved.operation` 标注成字面量 `"agent_step"` 而返回类型是联合（改为标注 `ModelApiOperation`/`ModelApiActorKind`）；③ `--target es2022` 让包内既有的 `findLastIndex` 报 `TS2551`（改为 `--target esnext`，与包自身可编译口径一致）。
3. **运行时断言数量下限写错**：沿用模板的 `checked >= 40`，本包实际只有 8 个运行时导出 → 改为 `checked >= 8` 并注明原因。
4. **桩替换下有 2 个测试通过**（`allFail=false`）：纯名字存在性与桶结构断言在桩（`Proxy` + `export *`）下仍成立。修正为①表面测试增加**形态断言**（number/object/function 与 interface.md 的种类一致）；②桶测试增加"再导出路径下的取值必须是真实取值"（`ModelApiOperation.WebSearch === "web_search"`、`TELEMETRY_SCHEMA_VERSION === 6`）。修正后桩替换 9/9 全失败。

## 6. 未覆盖项（如实列出）

1. **类型面只覆盖"名字、字段、可选性、联合取值、签名可用/不可用"**，不做逐字段的 API 抽取对比；泛型内部结构（如 `SkillPort` 方法的实现细节）由 `pnpm typecheck` 与 bar 导出面共同保证。
2. **`resolveModelApiCallObservation` 目前包外没有调用方**（`telemetry/index.ts` 自身的 `ModelApiCallObservation` 类型被 `model/invocation-context.ts` 使用）：行为由本包契约测试覆盖，端到端接线在替换阶段与 telemetry 包一起验证。
3. **`./skills` 子路径无包外调用方**：保留但不投入额外断言（类型经包根覆盖）。
4. **`telemetry` 的端口类型（`AgentExecutionTelemetryPort` 等）的运行时实现**由 `apps/cli/packages/telemetry` 与其测试覆盖，本包只冻结类型与取值表。
5. **平台差异**：本包为纯逻辑与类型（唯一平台相关点是本地时区语义），本机在 Windows 上执行；POSIX 由 CI Linux 覆盖同一测试文件。
6. **全量 `pnpm test:studio` 未在本机跑**（多 Agent 并发会互相污染），结果以 PR 的 CI 双平台为准。

## 7. 替换阶段验收（`replace/contracts-03`）

### 7.1 桩替换（先跑，必须全失败）

`node apps/cli/packages/contracts/.localtools/stub-check.mjs <worktree>`：把 `stubs/` 覆盖到 5 个目标文件后重跑**契约测试**（源码入口）——`tests=9 pass=0 fail=9 allFail=true`，随后原样还原。
内部单元测试测的是新实现的内部模块，桩替换不覆盖它们，因此不参与这条口径；契约阶段 `gate-old.json` 记录的同一检查同样是 9/9 全失败。

### 7.2 相似度（两道门槛，常量未改；对旧文件与上游固定提交取最大值）

| 文件                                          | 计分模式 | 包含率 | 最长同段 | 结构  | 判定                                      |
| --------------------------------------------- | -------- | ------ | -------- | ----- | ----------------------------------------- |
| `src/index.ts`                                | 声明模式 | 0.000  | 0        | 0.000 | PASS（剔除 2 行；兼容面 100%）            |
| `src/skills/index.ts`                         | 声明模式 | 0.000  | 0        | 0.000 | PASS（剔除 89 行 / 16 块；兼容面 100%）   |
| `src/telemetry/agent-execution.ts`            | 声明模式 | 0.000  | 0        | 0.000 | PASS（剔除 226 行 / 38 块；兼容面 100%）  |
| `src/telemetry/index.ts`                      | 声明模式 | 0.000  | 0        | 0.000 | PASS（剔除 216 行 / 33 块；兼容面 100%）  |
| `src/time/local-date.ts`                      | 声明模式 | 0.000  | 0        | 0.000 | PASS（残留 2 行；兼容面 1/4 = 25% ≥ 20%） |
| `src/telemetry/agent-execution_core.ts`       | 普通模式 | 0.040  | 1        | 0.143 | PASS                                      |
| `src/telemetry/model-api-tables_core.ts`      | 普通模式 | 0.094  | 2        | 0.071 | PASS                                      |
| `src/telemetry/model-api-observation_core.ts` | 普通模式 | 0.184  | 3        | 0.095 | PASS                                      |
| `src/time/local-date_core.ts`                 | 普通模式 | 0.000  | 0        | 0.000 | PASS                                      |

命令：5 个公开文件用 `--declaration --interface specs/contracts/contracts-03/interface.md`，4 个内部模块用同命令但不带 `--declaration`；比较对象是 `--old-rev origin/main` 与 `--upstream-dir cache/zcode-872ad960`，取两侧最大值。

**第三步计分依据（逐文件算式）**：5 个公开文件都是"兼容面占比 ≥ 20% 且普通模式数学上不可达"的形态——`src/index.ts` 与 `skills/index.ts` 是纯再导出/纯声明（100%），`telemetry/agent-execution.ts` 剔除 226 行后只剩 3 行非兼容（>98%），`telemetry/index.ts` 剔除 216 行后剩 9 行（>96%），`time/local-date.ts` 全文 4 行里兼容面 1 行（25%）。门槛常量 0.2 / 8 / 0.4 未调整。

### 7.3 契约测试与内部单测

- 契约测试移入 `apps/cli/packages/contracts/test/`：`contracts-03-api-surface.test.mjs`、`contracts-03-behavior.test.mjs`、`contracts-03-types.test.mjs`（与 contracts-01 的同名文件按包名前缀区分，共用 `test/entry.mjs` 加载器，已为其扩展 `entryFacts`）。
- 内部单测：`contracts-03-internals.test.mjs`（取值表、查表与归一、日期分段）。
- 实测：源码入口 **13/13**、dist 入口 **13/13**（dist 由 `tsc -p apps/cli/packages/contracts/tsconfig.json` 构建）。
- `scripts/test-studio.mjs` 收录 `apps/cli/packages/contracts/test` → 这 13 个用例随 CI 双平台常驻。

### 7.4 core 固定产物 receipt 的再次重固定

`src/index.ts` 是包根桶，本阶段按合同重写（保持 54 个相对再导出与 5 个 `@knorvia/shared` 名字不变，但字节变化），因此 `current-message-buffer-artifact-receipt-20261003.json` 中该文件的源字节与两个构建产物摘要必然变化：

| 固定项                                        | 变化                |
| --------------------------------------------- | ------------------- |
| `apps/cli/packages/contracts/src/index.ts`    | 重写后的源字节      |
| `apps/cli/packages/contracts/dist/index.js`   | 真实 `tsc` 构建产物 |
| `apps/cli/packages/contracts/dist/index.d.ts` | 真实 `tsc` 构建产物 |

处置与 PR #129 相同（先例 commit `4bf32a33`）：用真实构建摘要重固定这 3 条并同步 `current-artifact-receipt-20261003.ts` 的 JSON 自校验摘要，其余 217 条与 `formatVersion`/`sourceCheckpoint`/`previousReceipt` 链不动；重固定后 **220/220** 全匹配，固定这 3 条路径的 5 个 selector 对应测试（`workflow-collection-planner` / `workflow-graph-artifacts` / `workflow-planner-expansion` / `workflow-ready-order` / `workflow-scheduler-state`）**28/28 通过**。留痕位置：本节、`known-differences.md`、PR 正文、`licensing/reviews.json` 的 basis/evidence。

### 7.5 接入门禁（本机实测）

| 检查                               | 结果                                 |
| ---------------------------------- | ------------------------------------ |
| `pnpm fmt:check`                   | 0                                    |
| `pnpm typecheck`                   | exit 0                               |
| `pnpm lint`                        | 0 error（既有 warnings，未改配置）   |
| `pnpm architecture:check`          | violations 0 / baseline 0 / new 0    |
| `pnpm provenance:report` / `check` | reviewProblems 0 / missingReviews [] |
| 契约测试两入口                     | 13/13、13/13（0 跳过）               |
| 桩替换                             | 契约测试 9/9 全失败                  |
| 全量 `pnpm test:studio`            | 交 PR 的 CI（Linux + Windows）       |
