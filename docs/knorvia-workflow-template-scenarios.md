# 工作流模板验收场景（T08）执行记录

日期：2026-09-25（本地时区）。基线：`7011f67`（版本 `0.8.0-preview.2`，`feat: Host 引用解析、参数绑定与节点约束（T07）`）。
本记录只写实际执行过的命令与真实输出；未执行的项目在「未验证 / 未执行」中列明。

## 1. 交付范围

| 文件                                                          | 变更                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `specs/knorvia-workflow-templates.md`                         | 新增：四场景的输入、产物、证据规则、失败行为、验收项、导入校验与禁止项                      |
| `packages/ui/src/studio/workflow/templateScenarioTypes.ts`    | 新增：场景数据契约、`TASK_TEMPLATES`、参数/夹具类型                                         |
| `packages/ui/src/studio/workflow/templateScenarioChecks.ts`   | 新增：发版前检查、代码审查场景数据（参数、提示词、夹具）                                    |
| `packages/ui/src/studio/workflow/templateScenarioDelivery.ts` | 新增：文档整理、内容与插图交付包场景数据                                                    |
| `packages/ui/src/studio/workflow/templateScenarios.ts`        | 改写：组装四个场景、证据规则、参数提示、夹具判定纯函数                                      |
| `packages/ui/src/studio/workflow/types.ts`                    | 改写：模板图由场景数据构造（含 `contentPack` 与 `creation` 节点），移除内联 `taskTemplates` |
| `packages/ui/src/studio/workflow/WorkflowLibrary.tsx`         | 模板卡片显示声明的参数个数（悬停显示证据规则）                                              |
| `packages/ui/src/studio/workflow/WorkflowRunDialog.tsx`       | 参数表单下显示模板参数说明（沿用 T07 的参数机制与表单）                                     |
| `packages/ui/src/i18n/locales/zh-CN.ts` / `en-US.ts`          | 新增 4 个键：模板名、描述、参数个数、证据规则                                               |
| `packages/ui/test/workflow-task-templates.test.ts`            | 扩展：证据规则、参数、不得 `full-access`、审批闸门、禁止发布措辞                            |
| `packages/ui/test/workflow-template-scenarios.test.ts`        | 新增：图校验、参数解析、导入往返与拒绝、只读失败关闭、夹具核对                              |

未改动（按要求）：任何 services 文件、kernel/creation 文件、`workflowFiles.ts`、`graph.ts`、其他工作流的
`examples/plugins/**` 与插件相关 spec/docs。`git status` 中出现的插件、示例与 `docs/knorvia-plugin-*.md`
属于并行工作流，本任务未触碰。

拆文件原因：`pnpm lint` 的 `max-lines` 上限是 400（非空非注释行）。第一版把四个场景写在一个文件里得到
`File has too many lines (613)`；`messages.ts` 加 4 个键后也变成 `(406)`。因此按「契约 / 检查类场景 /
交付类场景 / 组装与纯函数」拆成四个文件，并把新增 i18n 键放到 locale 目录（该目录已由 `.oxlintrc.json`
豁免行数上限，与 T07 的参数键同一做法）。未提高任何上限、未改基线。

## 2. 四个场景的落地

| 场景              | 最小参数（必填加粗）                                                                      | 产物（`outputNames`）                                                     | 结构化引用串联                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `releaseCheck`    | **version**；scope=`tests,build,version,changes`；project_dir=`.`；include_pending=`true` | release-evidence、release-blockers、release-checklist                     | `risks` 读 `{{ref.release-evidence}}`/`{{ref.release-blockers}}`                                      |
| `codeReview`      | **target_paths**；severity=`medium`                                                       | review-findings、review-gaps、review-report                               | `summary` 读 `{{ref.review-findings}}`/`{{ref.review-gaps}}`                                          |
| `documentCleanup` | **source_dir**；target_inventory=`docs`；max_items=`50`                                   | docs-inventory、docs-deletions、docs-changes、docs-unverified             | `cleanup` 读 `{{ref.docs-inventory}}`/`{{ref.docs-deletions}}`                                        |
| `contentPack`     | **topic**；audience=`general`                                                             | copy-draft、reference-list、illustration-output、delivery-pack、pack-gaps | 创作节点读 `{{ref.reference-list}}`；`assembly` 读 `{{ref.copy-draft}}`/`{{ref.illustration-output}}` |

- 图的节点种类：`releaseCheck` = start/agent/agent/approval/end；`codeReview` = start/agent/agent/end；
  `documentCleanup` = start/agent/approval/agent/end；`contentPack` = start/agent/creation/agent/end。
- 证据规则固定追加到每个 Agent 步骤提示词；`codeReview` 两个节点声明 `permission: "read-only"`，
  其余节点显式声明 `"ask"`，任何模板都不声明 `full-access`。
- 文档整理的删除/覆盖：盘点 → `approval` 人工确认 → 修正，提示词明确要求最终在运行历史的逐文件差异审阅里
  「应用此文件」后才生效；模板不写源项目目录、不显示已接受。
- 交付包：创作节点出厂 `creationModelId: "select-a-model"`（不是真实模型）。模型未配置/停用时
  `runExecutor.ts:71-73` 在调用供应商前失败并返回「创作模型未配置或已停用」，运行失败；汇总节点必须把插图
  标为「未验证（未产出）」，不得用占位图/纯色块/`data:` 内联图片或编造路径代替。

## 3. 真实命令与结果

全部在 `D:\tools\knorvia-studio` 执行（Windows，并发桌面构建进行中，只跑 scoped 命令，未跑仓库级 `pnpm fmt`）。

| 命令                                                                                                                                                                                                                                                                                                             | 真实结果                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --experimental-test-module-mocks --import tsx --test packages/ui/test/workflow-template-scenarios.test.ts packages/ui/test/workflow-task-templates.test.ts packages/ui/test/studio-workflow.test.ts packages/ui/test/workflow-run-comparison.test.ts packages/ui/test/studio-orchestration-polish.test.ts` | `tests 40 / pass 40 / fail 0`（约 2.3s）                                                                                                                    |
| `node --experimental-test-module-mocks --import tsx --test packages/services/test/studio-workflow-outcomes.test.ts`                                                                                                                                                                                              | `tests 12 / pass 12 / fail 0`（约 1.8s）                                                                                                                    |
| `pnpm i18n:check`                                                                                                                                                                                                                                                                                                | `[i18n] en-US and zh-CN: 5253 matching keys, validated values and placeholders`                                                                             |
| `pnpm exec tsc -b packages/ui packages/services`                                                                                                                                                                                                                                                                 | 退出码 0，无输出                                                                                                                                            |
| `pnpm typecheck`（含 `i18n:check` + 全包 `tsc -b`）                                                                                                                                                                                                                                                              | 退出码 0；i18n 行同上                                                                                                                                       |
| `pnpm lint`（oxlint，2668 个文件）                                                                                                                                                                                                                                                                               | `Found 0 warnings and 0 errors.`                                                                                                                            |
| `node scripts/architecture/architecture-check.mjs check`                                                                                                                                                                                                                                                         | `architecture: OK` / `violations: 0` / `baseline: 0` / `new: 0`                                                                                             |
| `pnpm exec oxfmt <13 个变更文件>` 然后 `pnpm exec oxfmt --check <同样 13 个文件>`                                                                                                                                                                                                                                | 首次 `--check` 报 6 个文件格式问题（两个场景数据文件、`types.ts`、两个测试、spec）；执行格式化后 `--check` 输出 `All matched files use the correct format.` |

过程记录（真实发生过，不是假设）：第一次 `pnpm lint` 失败，报 `templateScenarios.ts` 613 行、
`messages.ts` 406 行超过 400 行上限；按上文拆文件并把 4×2 个 i18n 键移入 locale 目录后再次执行即
`0 warnings and 0 errors`。测试与 `tsc` 在拆文件后重跑，结果即表中值。

环境噪声：`pnpm` 报 `Unsupported engine: wanted {"node":"24.14.0"} (current v26.3.0)`；
Node 报 `DEP0205 module.register() is deprecated`。两者在基线状态下同样出现，不影响退出码。

## 4. 覆盖到的验收点

1. zh/en 下四个模板图都通过 `validateWorkflowGraph` 与 `validateStudioWorkflow`（0 issue），节点 id 唯一，各含 2 个 Agent 节点。
2. 参数：缺必填且无默认值 → 排队前拒绝并指名参数；只填必填项 → 默认值补齐且不报错；
   `number`/`boolean` 收到无法解释的值（`abc`/`yes`）→ 拒绝。
3. 导入/导出：四个模板 zh/en 往返后 `params`、`outputNames`、`permission`、`creationModelId`、提示词逐节点一致，
   信封版本为 `WORKFLOW_FILE_VERSION`（3）；版本 1 与 2 仍可导入；信封版本 4 → `fileVersion`；
   参数未知 `type`、参数未知键、未知 `permission` → `fileInvalid`。
4. 只读执行要求：`codeReview` 在 `knorvia` 内核上 `validateStudioWorkflowPermissions` 报出
   `requires read-only, but knorvia cannot guarantee it; the run was not queued.`，与失败夹具的
   `errorPattern` 一致，且失败夹具没有任何步骤记录（不产生运行记录、不写文件）；
   换成 `codex` + `0.151.0` 则通过，`codex` + `0.100.0` 再次失败关闭。
5. 交付包：正常夹具的 `illustration-output` 是带 `creationJobId`/`outputId`/`sha256` 的 `creation-output`；
   失败夹具没有该引用、`delivery-pack` 未交付、插图进入未验证清单，运行终态为 `failed`；夹具产物不含
   `data:image`/`placeholder`/「占位」字样。
6. 夹具的每个 `outputs` 都带输出契约版本并通过 `decodeStepOutputs` 校验（合法且与夹具引用逐一相等）。

## 5. 未验证 / 未执行

- **没有真实模型运行**：全部验收都是离线静态校验与夹具核对，没有调用任何内核、创作模型或供应商。
- **没有桌面交互测试**：`WorkflowLibrary` 的参数个数行与 `WorkflowRunDialog` 的参数说明没有做目视或 E2E 复核，
  只通过 `tsc`/`lint`/单元测试保证类型与文案键存在。
- **`contentPack` 失败夹具的错误文案是转写的**：`创作模型未配置或已停用` 取自 `runExecutor.ts:71-73`，
  离线测试没有执行 `runExecutor.createMedia` 路径，测试只断言「插图步骤失败、错误非空、匹配该模式、无产物」。
- **`codeReview` 失败夹具之外的内核矩阵未逐项枚举**：只验证了 `knorvia`（拒绝）、`codex@0.151.0`（通过）、
  `codex@0.100.0`（拒绝）三点。
- 未运行 `pnpm test:studio`、`pnpm build:cli-packages`、`pnpm knip`、`pnpm perf:baseline`、`pnpm fmt:check`
  （仓库级格式化）与任何桌面/Web 构建。

## 6. 剩余风险

1. **`codeReview` 在内置 `knorvia` 内核下无法排队**（这是刻意的失败关闭：只读要求不能由提示词满足，
   `capabilityMatrix.ts:83-88` 中 `knorvia` 的 `readOnly=false`）。用户必须把节点内核换成具备真实只读沙箱的
   内核（如 `codex ≥ 0.151.0`）。若产品希望模板开箱即跑，需要把该声明改为 `"ask"`——那会放弃代码级只读保证，
   属于产品取舍，建议由 Lead/负责人确认后再定。
2. **`contentPack` 出厂未选模型**：不选真实模型时插图步骤必然失败（这是「绝不发假图」的代价）。
   模板只保证失败可解释、媒体标为未产出；正常路径需要用户在节点设置里选择真实图片模型。
3. 夹具里的 `workspace-file` 引用使用占位 `runId`/`stepId`（`fixture-run`/`fixture-step`），
   `decodeStepOutputs` 只校验形状，不校验归属；真实运行期归属由 Host 判定。
4. 参数 `label` 在新建工作流时按当时语言写死，之后切换界面语言不会跟随（沿用 T07 参数 schema 的既有行为）。
5. `messages.ts` 已到 400 行上限附近（398 行），后续新增 workflow 文案必须继续放到 locale 目录；
   这是既有约束，本任务没有放宽。
6. i18n 只验证了中英键集合与占位符一致，新增 4 个键的英文文案未经母语复核。

## 7. 回滚

- 变更全部集中在 UI 模板数据、参数展示、i18n 键、测试与两份文档；没有触碰 services、内核/创作、
  `workflowFiles.ts`、`graph.ts` 或 `examples/plugins/**`，因此回滚不影响运行时与并行工作流。
- 回滚方式（由 Lead 执行，本任务不做任何状态变更的 git 操作）：
  `git checkout 7011f67 -- packages/ui/src/studio/workflow/types.ts packages/ui/src/studio/workflow/WorkflowLibrary.tsx packages/ui/src/studio/workflow/WorkflowRunDialog.tsx packages/ui/src/i18n/locales/zh-CN.ts packages/ui/src/i18n/locales/en-US.ts packages/ui/test/workflow-task-templates.test.ts`
  并删除新增文件：`packages/ui/src/studio/workflow/templateScenario*.ts`、
  `packages/ui/test/workflow-template-scenarios.test.ts`、`specs/knorvia-workflow-templates.md`、
  `docs/knorvia-workflow-template-scenarios.md`。
- 回滚后需要重跑：两条测试命令、`pnpm i18n:check`、`pnpm typecheck`、`pnpm lint`、
  `node scripts/architecture/architecture-check.mjs check`。
