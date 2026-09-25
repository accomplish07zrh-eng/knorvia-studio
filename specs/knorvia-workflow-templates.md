# 工作流模板的验收场景（T08）

基线 `7011f67`（0.8.0-preview.2）。本规格只定义**内置模板**这一层的场景契约：每个模板要求的最小参数、它产出的产物、证据规则、失败行为、验收项和导入校验。
沿用既有 Studio 工作流画布、`StudioWorkflowParam` 参数机制、`StudioOutputRef` 输出引用与交付投影；不新增第二套模板注册表、参数系统、权限系统或模板市场。
模板、计划触发与运行对比的产品边界仍由 `specs/knorvia-workflow-templates-schedule-comparison.md` 管辖，参数/权限的通用规则由 `specs/knorvia-host-references.md` 第 4、5、6 节管辖，本规格只在模板层收紧它们。

## 1. 所有权（谁说了算）

| 关注点                     | 唯一所有者                                                                             | 说明                                                    |
| -------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 模板清单与场景契约         | `packages/ui/src/studio/workflow/templateScenarioTypes.ts`                             | 类型、`TASK_TEMPLATES`；UI 侧数据，没有服务端模板注册表 |
| 场景数据                   | `templateScenarioChecks.ts`（发版/审查）、`templateScenarioDelivery.ts`（文档/交付包） | 拆文件是为了守住单文件 400 行上限，不是两份模板来源     |
| 场景组装与纯函数           | `templateScenarios.ts`                                                                 | `TEMPLATE_SCENARIOS`、证据规则、参数提示、夹具判定      |
| 图构造                     | `packages/ui/src/studio/workflow/types.ts`                                             | 基线只有这一处定义站点（`types.ts:14-23`、`:144-169`）  |
| 参数 schema 与解析         | `domain/workflowParams.ts`（`workflowParams.ts:45-94`、`:150-184`）                    | 编辑器与执行器共用同一份纯校验，模板不另写一份          |
| 定义校验（含 `{{ref.*}}`） | `domain/workflowGraph.ts:63-239`                                                       | `{{param.*}}` / `{{ref.*}}` 的可用性判定只在服务端      |
| 排队前参数与权限核验       | `app/commandAdmission.ts:288-299`                                                      | 解析失败或能力不满足时**不创建运行记录**                |
| 导入/导出与信封版本        | `workflowFiles.ts:11-13`、`:138-217`                                                   | 本规格不改它的实现，只要求模板数据能无损往返            |
| 交付结论与证据等级         | `app/runOutcomeProjection.ts`（T05）                                                   | 模板不产生第二份交付状态；夹具只用于离线测试            |

规则：模板是**图的起点**，不是运行时特例。模板运行期与用户手搭的图走完全相同的校验、排队、执行与交付投影路径。

## 2. 四场景共用规则

### 2.1 参数

- 参数只使用既有 `StudioWorkflowParam`（`services/src/studio-runtime/workflowTypes.ts:26-34`），提示词用 `{{param.<name>}}` 引用。
- 每个模板只声明**运行必需**的几个参数：其余一律给默认值，普通用户只填必填项就能生成可运行的图（是否真的能排队还取决于第 2.3 节的权限核验）。
- 参数名符合 `^[a-z][a-z0-9_]{0,39}$`，每个节点最多 12 个；同名参数只在该节点内唯一，跨节点可重复声明（`workflowParams.ts:45-94`）。
- 缺必填且无默认值 → `commandAdmission` 在排队前拒绝（`resolveStudioWorkflowParams`，`workflowParams.ts:170-182`）；`number` / `boolean` 类型值必须能解释成对应类型（`workflowParams.ts:187-193`）。

### 2.2 证据规则（模型自述永远不是证据）

每个 Agent 步骤的提示词都必须包含同一条证据规则：

> 证据规则：只把实际执行过的命令或工具调用及其原始输出当作证据；无法执行或无法复现的判断必须标注「未验证」；不得把推测、回忆、计划或模型自述当作已核实的结论。

- 结构化产物走既有 `StudioOutputRef`（`domain/outputRef.ts:36-53`），节点用 `outputNames` 声明输出名，下游用 `{{ref.<name>}}` 引用（`specs/knorvia-host-references.md` 第 5 节）。
- 交付结论的证据等级只由 Host/服务端投影给出（`runOutcomeProjection.ts` 注释：证据优先级 host-hash/apply-journal > creation-record > kernel-tool-state > model-claim）。**模板文字不能提升结论**；"未复现"就必须显示为未核验。

### 2.3 权限

- 模板节点可以声明 `permission`（`specs/knorvia-host-references.md` 第 6 节）。声明的是**执行要求**，不是授权；实际要求 = 节点要求 ∩ 运行授权中更严格的一方。
- 需要不写入的模板声明 `read-only`。内核没有真实只读沙箱时，`validateStudioWorkflowPermissions` 在**排队之前**拒绝整次运行（`workflowParams.ts:126-144`，拒绝点 `commandAdmission.ts:294-299`）。
- 只读**不能**由提示词满足。内置 `knorvia` 的 `readOnly` 为假（`capabilityMatrix.ts:83-88`），因此声明只读的模板在内置内核下会被拒绝，而不是派发后降级——这正是"失败关闭"。
- 任何模板都不得默认 `full-access`，也不得在提示词之外自行放宽权限。

### 2.4 排队的失败行为

- 参数缺失/非法、只读要求不满足 → 报出可读原因且**不创建运行记录**。
- 运行中步骤失败 → 运行终态 `failed`，下游节点标记失败，不产生交付结论。
- 产物缺失或无法核验 → 该产物显示为未核验，不得当作已交付。

### 2.5 显式禁止

1. **禁止自动发布类动作**：任何模板都不得执行 `npm publish` / `pnpm publish` / `git tag` / `git push` 或等价动作；发布永远留给人工。
2. **禁止默认写或发布权限**：模板不得声明 `full-access`，不得把"自动应用改动/自动发布"写成模板的默认行为。文档整理只允许在既有差异审阅逐文件接受之后生效。
3. **禁止伪造媒体占位**：媒体产物只能来自创作服务的真实 `creation-output` 引用；不得输出占位图、纯色块、`data:` 内联图片或凭空编造的文件路径来冒充产物。
4. **禁止独立模板市场**：不新增模板商店、远程模板源或第三方模板分发入口（与 `AGENTS.md`「不提供独立插件市场」一致）。模板只有内置这一处来源。

## 3. 四个场景

模板键：`releaseCheck`、`codeReview`、`documentCleanup`、`contentPack`（新增）。四者在 zh/en 下都必须通过 `validateWorkflowGraph` 与 `validateStudioWorkflow`。

### 3.1 发版前检查 `releaseCheck`

- **必需输入（最小参数）**
  | 名称 | 类型 | 必填 | 默认值 | 用途 |
  | ----------------- | ------- | ---- | ---------------------------- | ------------------------ |
  | `version` | text | 是 | — | 目标版本号/发布点 |
  | `scope` | text | 否 | `tests,build,version,changes` | 本次要核对的检查范围 |
  | `project_dir` | text | 否 | `.` | 工作区内的项目目录 |
  | `include_pending` | boolean | 否 | `true` | 是否包含待提交改动 |
- **流程**：开始 → 执行检查（agent）→ 整理风险（agent）→ 人工确认（approval）→ 结束。
- **产出**：`release-evidence`（命令与原始输出）、`release-blockers`（阻断项，可为空）、`release-checklist`（人工发布清单）。
- **证据规则**：每条检查结论必须附实际命令、退出码与原始输出；无法运行的检查标注未验证。
- **失败行为**：检查命令失败或无法运行 → 该项进入 `release-blockers`；参数缺失 → 排队前拒绝。任何情况下模板都不发布、不推送、不打标签。
- **验收项**
  1. 只填 `version` 即可生成可运行图；`scope` / `project_dir` / `include_pending` 使用默认值。
  2. `include_pending` 传入 `yes` 之类非布尔值时在排队前被拒绝。
  3. 提示词包含证据规则与禁止发布/推送/打标签的措辞；`permission` 不是 `full-access`。
  4. 存在人工确认节点，未确认不会进入结束节点。

### 3.2 代码审查 `codeReview`

- **必需输入（最小参数）**
  | 名称 | 类型 | 必填 | 默认值 | 用途 |
  | -------------- | ---- | ---- | -------- | ---------------------------- |
  | `target_paths` | text | 是 | — | 待审路径（逗号分隔） |
  | `severity` | text | 否 | `medium` | 最低报告严重程度 |
- **流程**：开始 → 审查（agent，`read-only`）→ 汇总（agent，`read-only`）→ 结束。
- **产出**：`review-findings`（含文件:行与复现命令的发现）、`review-gaps`（未复现/未覆盖项）、`review-report`（按严重程度排序的结论）。
- **证据规则**：发现必须给出可复现的命令或工具调用与原始输出；无法复现的猜想标注未验证，不得写成"已复现"。
- **失败行为（排队前）**：节点要求 `read-only`；内核（如内置 `knorvia`）不能保证强制只读时整次运行被拒绝，错误指出节点、内核与缺失能力，且不创建运行记录、不写任何文件。这就是"不许改文件"的代码级保证，替代原来的纯提示词约束。
- **验收项**
  1. 两个 Agent 节点都声明 `read-only`，且模板不声明 `full-access`。
  2. `target_paths` 缺失 → 排队前拒绝；`severity` 默认生效。
  3. 在无只读能力的内核上，`validateStudioWorkflowPermissions` 报出可读原因（失败夹具即此场景）。
  4. 提示词包含证据规则与"不得修改、创建或删除文件"。

### 3.3 文档整理 `documentCleanup`

- **必需输入（最小参数）**
  | 名称 | 类型 | 必填 | 默认值 | 用途 |
  | ------------------ | ------ | ---- | ------ | -------------------------- |
  | `source_dir` | text | 是 | — | 文档来源目录（工作区内） |
  | `target_inventory` | text | 否 | `docs` | 需要盘点的目标清单/目录 |
  | `max_items` | number | 否 | `50` | 单次盘点条目上限 |
- **流程**：开始 → 盘点（agent）→ 人工确认清单（approval）→ 修正（agent）→ 结束。
- **产出**：`docs-inventory`（重复/过期/断链清单）、`docs-deletions`（拟删除或覆盖的文件及依据）、`docs-changes`（修正结果）、`docs-unverified`（无法核实的内容）。
- **证据规则**：每条清单项必须给出具体文件与依据命令；无法核实的条目标注未验证。
- **失败行为**：删除/覆盖不在提示词层自动生效——未通过确认节点与逐文件接受时不得声称已整理；`max_items` 非数字 → 排队前拒绝。
- **差异审阅与显式接受（代码级路径，不是提示词）**
  1. 盘点产出的删除/覆盖清单必须先经 `approval` 节点人工确认；
  2. 修正步骤的改动仍走既有隔离工作区 + 运行历史逐文件差异审阅（`specs/knorvia-workspace-diff-review.md`）；只有用户对单个文件"应用此文件"（`applyWorkspaceChanges`）后才算生效；
  3. 模板不写源项目目录，也不显示"已合并/已接受"；接受记录由服务层的 `apply-acceptance` 记录承载，不是模板文本。
- **验收项**
  1. 图中存在 `approval` 节点且位于盘点之后、修正之前。
  2. `source_dir` 缺失 → 排队前拒绝；`max_items` 传入 `abc` → 排队前拒绝。
  3. 提示词明确指出删除/覆盖必须经逐文件差异审阅接受，不得自行应用。
  4. 产出声明包含 `docs-unverified`，允许把未核实内容单独列出。

### 3.4 内容与插图交付包 `contentPack`（新增）

- **必需输入（最小参数）**
  | 名称 | 类型 | 必填 | 默认值 | 用途 |
  | ---------- | ---- | ---- | --------- | ------------ |
  | `topic` | text | 是 | — | 主题/简报 |
  | `audience` | text | 否 | `general` | 目标读者 |
- **流程**：开始 → 文案与参考素材（agent）→ 插图（creation）→ 交付清单（agent）→ 结束。
- **产出**：`copy-draft`（文案草稿）、`reference-list`（参考素材清单，含真实路径/URL 与取证命令）、`illustration-output`（真实 `creation-output` 引用）、`delivery-pack`（最终文件清单）、`pack-gaps`（未产出/未核验项）。
- **结构化引用串联**：创作节点用 `{{ref.reference-list}}` 读取参考清单，汇总节点用 `{{ref.copy-draft}}` 与 `{{ref.illustration-output}}` 读取前序产物——全部走既有 `{{ref.*}}` + `outputNames`，不新增引用格式。
- **证据规则**：参考素材要么给出可核对的真实来源，要么标注未验证；交付清单只登记能给出路径/哈希的产物。
- **失败行为（失败关闭，绝无占位）**
  1. 模板的创作节点出厂为未选择的模型（`creationModelId: "select-a-model"`）。模型未配置或已停用时，`createMedia` 在调用供应商之前失败并返回可读原因（`runExecutor.ts:71-73`），创作节点失败、运行失败。
  2. 插图缺失时，汇总节点必须把 `illustration-output` 标为「未验证（未产出）」，并**不得**用占位图、纯色块、`data:` 内联图片或编造路径代替。
  3. 因此该场景在媒体无法真实产出时不会报告为完成的交付；这是"宁可声明未产出，也不交付假产物"。
- **验收项**
  1. 图包含 `creation` 节点，且提示词/产出声明把它与 `copy-draft`、`reference-list` 串起来。
  2. 正常夹具的 `illustration-output` 必须是带 `creationJobId` / `outputId` 的 `creation-output` 引用，不得是文本或内联图片。
  3. 失败夹具中没有任何步骤声称产出了 `illustration-output`，且运行终态不是 `succeeded`。
  4. 使用 `{{param.topic}}`、`{{param.audience}}`；缺 `topic` → 排队前拒绝。

## 4. 导入校验规则

沿用 `workflowFiles.ts` 的既有实现，模板数据必须满足（并在测试中逐条核对）：

1. **信封版本**：`format` 必须是 `knorvia-workflow`；`version` 只接受 1、2、3（`WORKFLOW_FILE_VERSION`，`workflowFiles.ts:11-13`）；更高版本按 `fileVersion` 拒绝整个文件，当前工作流不被修改（`workflowFiles.ts:149-150`）。
2. **参数**：节点 `data.params` 只能是 ≤12 项、键为 `name/label/type/default/required`、`type ∈ {text,number,boolean}`、名字唯一且符合 `^[a-z][a-z0-9_]{0,39}$` 的数组；否则 `fileInvalid`（`workflowFiles.ts:49-64`）。未知键（含任何 UI 侧提示字段）一律拒绝——所以模板提示文案不能写进 `params`。
3. **输出声明与权限**：`outputNames` ≤32 且不重复、`permission ∈ {read-only,ask,full-access}`；否则 `fileInvalid`（`workflowFiles.ts:65-78`）。
4. **往返无损**：导出再导入必须保留每个节点的 `params`、`outputNames`、`permission`、`creationModelId`；导入一律重铸新身份（`workflowFiles.ts:209-215`），`{{param.*}}` / `{{ref.*}}` 引用不因节点 id 重写而悬空。
5. **模板级**：模板图自身必须通过 `validateWorkflowGraph` 与 `validateStudioWorkflow`；不过模板数据落盘前不得出现只有模板才认识的字段。

## 5. 夹具与测试

- 每个场景在 `templateScenarioChecks.ts` / `templateScenarioDelivery.ts` 带：**示例输入**、**正常输出夹具**、**失败夹具**。夹具是数据，只被离线测试读取，不进入运行时判定路径；运行期结论仍由 `runOutcomeProjection` 从既有记录推导。
- 夹具的产物只允许使用 `StudioOutputRef` 形状，并在测试里用 `decodeStepOutputs` 校验（拒绝非法/超限/更高版本的引用）。
- 测试入口：`packages/ui/test/workflow-template-scenarios.test.ts`（新增），`packages/ui/test/workflow-task-templates.test.ts`（扩展）。既有断言（zh/en 下三个模板零问题、2 个 Agent 节点、节点 id 唯一）必须保持通过。

## 6. 边界

- 不做真实模型运行：本规格的验收全部是离线静态校验与夹具核对；没有桌面交互/E2E 复核。
- 不新增模板市场、远程模板源、模板版本发布流程。
- 不改 `workflowFiles.ts`、服务执行器与内核能力矩阵；只使用它们已有的公开入口。
