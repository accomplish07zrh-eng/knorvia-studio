# core-hooks 替换验收记录（继承 -16）

- 合同：`specs/contracts/core-hooks`（**v1.1**，v1.1 仅补充两个兼容面导出类型名）
- 替换分支：`replace/core-hooks`（基于合同分支；合同 PR #112 已合并进 main）
- 旧门证据：`specs/contracts/core-hooks/gate-old.json`
- 相似度工具：`scripts/provenance/similarity.mjs`（门槛：包含率 < 0.20、最长相同段 < 8、结构相似度 < 0.40；工具版本见对应 PR）

## 一、相似度结果（16/16 全部达标）

### 普通模式（运行时/实现文件）

| 文件                                                     | 模式 | 总行数 | 包含率 | 最长段 | 结构  | 结论 |
| -------------------------------------------------------- | ---- | ------ | ------ | ------ | ----- | ---- |
| `workspace-hook-policy.ts`                               | 普通 | 48     | 0.063  | 2      | 0.093 | PASS |
| `session-mailbox.ts`                                     | 普通 | 85     | 0.082  | 3      | 0.048 | PASS |
| `workspace-hook-trust-evaluation.ts`                     | 普通 | 99     | 0.091  | 3      | 0.016 | PASS |
| `display-metadata.ts`                                    | 普通 | 70     | 0.114  | 3      | 0.017 | PASS |
| `workspace-hook-telemetry.ts`                            | 普通 | 50     | 0.140  | 1      | 0.000 | PASS |
| `configured-runner-input.ts`                             | 普通 | 147    | 0.143  | 6      | 0.000 | PASS |
| `configured-runner.ts`                                   | 普通 | 195    | 0.154  | 6      | 0.111 | PASS |
| `workspace-hook-trust-records.ts`                        | 普通 | 45     | 0.156  | 6      | 0.050 | PASS |
| `workspace-hook-trust-coordinator.ts`                    | 普通 | 130    | 0.177  | 3      | 0.037 | PASS |
| `configured-runner-callback.ts`                          | 普通 | 189    | 0.180  | 4      | 0.000 | PASS |
| `workspace-hook-runtime-admission.ts`                    | 普通 | 197    | 0.198  | 5      | 0.101 | PASS |
| `workspace-hook-review-flow.ts`（薄壳）                  | 普通 | 1      | 0.000  | 0      | 0.000 | PASS |
| `workspace-hook-review-flow-internal.ts`（新增实现模块） | 普通 | 197    | 0.178  | 3      | 0.102 | PASS |

### 声明模式（`--declaration --interface specs/contracts/core-hooks/interface.md`）

| 文件                             | 模式 | 总行数 | 剔除行数 | 剔除块 | 残留行数 | 两道值 | 结论 |
| -------------------------------- | ---- | ------ | -------- | ------ | -------- | ------ | ---- |
| `index.ts`（桶文件）             | 声明 | 0      | 1        | 0      | 0        | 0 / 0  | PASS |
| `types.ts`                       | 声明 | 8      | 152      | 27     | 8        | 0 / 0  | PASS |
| `workspace-hook-trust-types.ts`  | 声明 | 2      | 21       | 5      | 2        | 0 / 0  | PASS |
| `workspace-hook-trust-domain.ts` | 声明 | 1      | 0        | 0      | 1        | 0 / 0  | PASS |

**按声明文件处理的理由**：这四个文件以导出类型/桶导出为主体（`index.ts` 仅剩 0 行归一化内容；`types.ts`/`trust-types.ts`/`trust-domain.ts` 的成员行全部是被 `interface.md` 列为兼容面的声明块），因此按计划书「纯声明文件先剔除兼容行再按门槛」处理；残留行数为**本文件自己的实现级注释**（已压成单行便于审阅），不含实现。

### 计分模式选择说明

- 运行时/实现文件一律用**普通模式**——包含率与最长段会真实计入其兼容声明与语句行，不做剔除。
- 只有「导出声明占主体」的文件用声明模式；两者不混用同一文件。

## 二、旧门（moved to `apps/cli/packages/core/test`）

- 复跑命令：`node specs/contracts/core-hooks/tests/run-old-gate.mjs`（已指向迁移后的测试目录）
- 结果：**源码入口 33/33、dist 入口 33/33、fail 0**
- 记录字段：`commit`、`node v24.14.0`、`source`、`dist`、`stubReplacement`
- 桩替换证据：**0/33 通过**（即 16 个目标文件全部被替换为桩时，33 个契约用例全部失败——严格证明测试确实覆盖实现）；该次运行记录保留在 `gate-old.json`（桩与生成脚本已在收尾阶段删除）
- 合同 v1.1 的旧门复跑记录见 `specs/contracts/core-hooks/acceptance.md`

## 三、收尾阶段的发现与修复

1. **导出集合回退（第 9 例）**：方案 A 把 `workspace-hook-review-flow.ts` 改为薄壳 `export * from "./…-internal.js"` 时，丢掉了原先从 `./types.js` 再导出的 4 个类型名（`WorkspaceHookReviewFlow` / `Outcome` / `ResolveResult` / `Target`），导致 `@knorvia/bootstrap` 报 `TS2305: Module "@knorvia/core" has no exported member …`。**只在全量 `build:cli-packages` 暴露**。修复：薄壳文件补回 `export type { … } from "./types.js"`，`build:cli-packages` 恢复 exit=0（提交 `352a3bed`）。
   **教训**：把模块改成转发薄壳时必须核对**原模块的完整导出集合**（含类型再导出），不能只保证运行时导出一致。
2. **knip entry 路径规则**：迁移后的测试入口与夹具需在**所属 workspace** 下声明 entry，且路径相对该 workspace（`apps/cli/packages/core` → `test/core-hooks-entry.mjs` 等）；写成仓库相对路径不生效。`run-old-gate.mjs` 属根工作区。修正后 knip 未使用文件从 1791 降到 1788，**无 core-hooks 项被标记**（提交 `3c011d89`）。
3. **删除桩后的登记表维护**：删除 21 个已登记桩文件后 provenance 一度报 `reviewProblems: 21`，需同时从 `licensing/reviews.json` 去条目（参照该做法处理其余删除项）。

## 四、门禁记录（收尾批次）

| 门禁                                     | 结果                                                             |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `typecheck`                              | exit=0                                                           |
| `lint`                                   | exit=0                                                           |
| `fmt:check`                              | exit=0                                                           |
| `architecture:check`                     | exit=0                                                           |
| `build:cli-packages`                     | exit=0（导出集合修复后）                                         |
| `knip`                                   | 基线非零（1788 / 592，仓库既有基线）；**无 core-hooks 新引入项** |
| `provenance:report` / `provenance:check` | 均 exit=0、`reviewProblems: 0`、`missingReviews: []`             |
| 契约测试（迁移后）                       | 源码入口 33/33、dist 入口 33/33                                  |
| 旧门（两入口）                           | 33/33、33/33                                                     |

## 五、未被覆盖 / 存疑项

- `build:cli-packages` 全量在 `@knorvia/cua-plugin` 的 `stage-windows-driver` 步骤依赖**网络下载**，在部分批次会因网络失败（已知环境依赖，与本次替换无关；后续批次已能通过）。
- `test:studio` 全量未在本批次运行（迁移后的 6 个契约测试文件已单独验证两入口 33/33）；计划由替换 PR 的 CI 在 Linux/Windows 覆盖。
- `workspace-hook-review-flow.ts` 的声明模式残留为 0 行（薄壳仅 1 行归一化内容），其真实实现全部在内部模块，内部模块按普通模式计分（0.178 / run 3）。
