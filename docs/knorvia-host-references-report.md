# T07 交付记录：宿主引用解析、参数绑定与节点约束

- 规格：`specs/knorvia-host-references.md`（本任务新增）
- 起始基线：`b6fb13c`（T05）
- 交付时 HEAD：`2a744fc`（Lead 在我工作期间提交的 **纯格式化** 提交，只动了
  `docs/knorvia-t13-batch-acceptance.md` 与 `app/runOutcomeProjection.ts`，与本任务无交集）
- 版本：`0.8.0-preview.2`

## 1. 改动的文件

### 新增

| 文件                                                            | 说明                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `specs/knorvia-host-references.md`                              | 规格：所有权、信任规则、复制来源、参数 schema、冻结、要求 ∩ 授权、验收场景 |
| `packages/services/src/studio-runtime/domain/reference.ts`      | 纯引用判定：来源／归属／身份／路径／版本；执行期 `{{ref.*}}` 解析          |
| `packages/services/src/studio-runtime/domain/workflowParams.ts` | 纯参数 schema、参数解析与节点权限要求判定                                  |
| `packages/ui/src/studio/workflow/WorkflowInspectorOutputs.tsx`  | 输出声明编辑 + 上游输出选择器（为不超过 400 行上限而从检查器拆出）         |
| `packages/services/test/studio-host-references.test.ts`         | 引用拒绝矩阵、参数、冻结、排队前拒绝、跨目录导入                           |
| `packages/ui/test/workflow-references.test.ts`                  | 文件往返保留 `params`/`outputNames`/`permission`；信封版本兼容             |

### 修改

- `packages/services/src/studio-runtime/workflowTypes.ts`：节点新增可选
  `params` / `outputNames` / `permission`，新增 `StudioWorkflowParam`、
  `STUDIO_WORKFLOW_PERMISSION_KEY`、`STUDIO_WORKFLOW_PARAMS_KEY`。
- `packages/services/src/studio-runtime/domain/workflowGraph.ts`：接入节点参数／输出声明／权限结构校验；
  `{{param.x}}`、`{{ref.x}}` 与前缀保留命名空间；重导出参数域 API（文件 438 → 258 行，现 ≤400）。
- `packages/services/src/studio-runtime/contract.ts`：`send` 新增 `params` / `permission`；
  导出 `domain/reference.ts` 与参数域公开符号。
- `packages/services/src/studio-runtime/app/ports.ts`：`StudioWorkspacePort` 新增可选
  `importFile` 与 `referenceVersion`；`StudioExecutionPort` 新增 `reference`；
  新增 `StudioImportReceipt` / `StudioReferenceVersion` / `StudioReferencePort`。
- `packages/services/src/studio-runtime/adapters/workspaceManager.ts`：实现 `importFile`
  （源只读、复制后重哈希、原子写入元数据 `imports` 来源记录）与 `referenceVersion`。
- `packages/services/src/studio-runtime/app/commandAdmission.ts`：受理时解析并冻结参数与运行授权；
  用已发现内核版本核验"要求 ∩ 授权"，不满足时在**写运行记录之前**抛错。
- `packages/services/src/studio-runtime/app/workflowSteps.ts`：`workflowText` 支持
  `{{param.*}}` / `{{ref.*}}`（保留 `{{input}}`/`{{output}}`/`{{nodeId}}`）；执行前解析结构化引用；
  `agentNode` 传递实际权限。
- `packages/services/src/studio-runtime/app/runExecutor.ts`：为执行端口提供 `reference` 证据
  （身份 key 统一为 `workspaceIdentity?.trim() || workspacePath`；Host 无读取能力时不提供 `fileVersion`）。
- `packages/services/src/studio-runtime/app/workflowExecutor.ts`：调用节点时传入前置节点集合。
- `packages/ui/src/studio/workflow/WorkflowRunDialog.tsx`：参数表单（本地状态，提交前不写记录）。
- `packages/ui/src/studio/workflow/WorkflowInspector.tsx`：执行要求选择器；接入上游输出选择器。
- `packages/ui/src/studio/workflow/workflowFiles.ts`：白名单加入新字段；信封版本 2 → 3，
  仍接受 1、2；新增字段形状校验（未知键、非法参数类型、重复名、未知权限一律 `fileInvalid`）。
- `packages/ui/src/i18n/locales/zh-CN.ts`、`en-US.ts`：15 个新键（成对，占位符一致）。

### 越出任务给定写清单的两处（有意为之，均为"拆分/最小集成"）

1. **新增** `packages/services/src/studio-runtime/domain/workflowParams.ts`：
   `workflowGraph.ts` 加入参数与权限判定后达到 438 行，超过架构上限 400。
   按任务要求"拆分文件而不是提高上限"，把参数/权限判定拆成独立纯模块。
2. **修改** `packages/services/src/studio-runtime/app/workflowExecutor.ts`（+1 import，+1 实参）：
   `workflowSteps.ts` 无法自行得知"哪些节点是当前节点的前置"，而不传前置集合就无法在
   执行前拒绝旁支引用。改动仅为把 `workflowAncestors(graph, id)` 传给 `executeWorkflowNode`。

未触碰：内核文件、creation 文件、`kernelTypes.ts`、`runOutcomeProjection`/`workspaceReview`/`runtimeProjections`。

## 2. 实际执行的命令与真实结果

| 命令                                                                                                                                                                                                                                                         | 结果                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `node --test`（tsx）新增 `packages/services/test/studio-host-references.test.ts`                                                                                                                                                                             | 15 tests，15 pass（最终）                                                                  |
| 同上新增 `packages/ui/test/workflow-references.test.ts`                                                                                                                                                                                                      | 4 tests，4 pass                                                                            |
| 上述两文件 + `studio-orchestration-workflow` + `studio-workflow-outcomes` + `studio-workflow-schedule` + `workflow-task-templates` + `studio-workflow` + `studio-orchestration-polish` + `studio-run-history-actions` + `workflow-run-comparison` 一次性运行 | **86 tests，86 pass，0 fail**                                                              |
| `pnpm i18n:check`                                                                                                                                                                                                                                            | `[i18n] en-US and zh-CN: 5249 matching keys, validated values and placeholders`            |
| `pnpm exec tsc -b packages/services packages/ui`                                                                                                                                                                                                             | 无输出（成功）                                                                             |
| `pnpm typecheck`                                                                                                                                                                                                                                             | 通过（i18n 通过；tsc 无错误；仅 Node 版本 engine 警告 `wanted 24.14.0 / current v26.3.0`） |
| `pnpm lint`                                                                                                                                                                                                                                                  | `Found 0 warnings and 0 errors`                                                            |
| `node scripts/architecture/architecture-check.mjs check`                                                                                                                                                                                                     | `architecture: OK / violations: 0 / baseline: 0 / new: 0`                                  |
| `pnpm exec oxfmt <改动文件>`，随后 `--check`                                                                                                                                                                                                                 | 全部符合格式（含 `specs/knorvia-host-references.md`）                                      |

架构检查最初失败过一次：`WorkflowInspector.tsx` 达到 469 行（上限 400），
按拆分处理（新增 `WorkflowInspectorOutputs.tsx`）后复检 OK；未提高任何上限、未改 baseline。

## 3. 未执行的项目

- **未运行完整 `pnpm test:studio`**：环境提示仓库全量检查可能并发运行，为避免 CPU 争用与
  干扰他人结果，只按任务清单运行了指定测试文件及其相关文件（86/86）。
  因此本包其余测试文件的回归状态未在本任务中验证。
- **未运行 E2E / 桌面实机验证**：参数表单与输出选择器只有单元级验证，没有实机点击验证。
- **未提交**：按要求不做任何状态变更的 git 操作，改动留在工作区由 Lead 提交。

## 4. 已知缺口与剩余风险

1. **参数尚未真正送达服务端（重要）**。
   `WorkflowRunDialog` 已把参数值作为 `onRun(input, params)` 的第二个实参传出，但
   `packages/ui/src/studio/workflow/useWorkflowExecution.ts`（`run(text)` 只发送 `text`）与
   `WorkflowEditor.tsx` 均不在本次写清单内，因此 UI 目前**无法**把 `params`/`permission`
   放进 `send` 命令。结论：
   - 服务端冻结、校验、排队前拒绝等能力已实现并有测试；
   - 界面收集的参数值目前只停留在本地编辑态，**不会被提交**。
     需要一处最小改动（超出本次写清单，故未做）：
     `useWorkflowExecution.run(text, params?)` 把 `params` 与 `permission` 透传进
     `runtime.command({ type: "send", kind: "workflow", ... })`，并在
     `WorkflowEditor.tsx` 的 `onRun` 中透传第二实参。
2. **运行级授权没有 UI 入口**。`send.permission` 只有服务端契约，节点级
   `permission` 可在检查器设置；运行级授权只能由调用方传入。
3. **`kernel-status` 目前没有本地写入方**。`commandAdmission` 从 `kernel-status`
   读取已发现版本（并按版本收紧能力判定）。当前仓库只有 `remote-kernel-status` 会被写入，
   `inspectStudioKernels`（`app/kernelOperations.ts`，不在写清单内）尚未持久化本机状态。
   现状是安全的（版本缺失时回退到矩阵的既有声明，只会更宽松地沿用今天的行为，
   不会凭空升级能力），但"传入已发现版本"这条链路只完成了一半：测试通过直接注入
   `kernel-status` 记录/显式参数验证了收紧行为。
4. **创建类输出引用（`creation-output`）在执行期一律失败关闭**：执行端口没有该类型的
   证据来源，因此引用会被判为"无法取证"而拒绝，而不是猜测。这是刻意的保守选择，
   但意味着跨步骤创作产物交接目前不可用。
5. **工作区文件引用交出的是经过校验的相对路径**，不是可直接读取的绝对路径：
   每个工作流节点使用各自的隔离工作区，跨步骤文件交接仍未实现。
6. **同名输出歧义**：若两个分支都声明同名输出，`{{ref.<name>}}` 取结果映射中先出现者。
   定义校验只保证该名字来自某个前置节点，未强制全局唯一。
7. **`isStudioWorkflow`（UI `graph.ts`，不在写清单）未校验新字段**：
   从 localStorage 恢复的草稿若含非法 `params`，会通过恢复检查、但在保存／运行前被
   服务端定义校验拒绝。文件导入路径已在 `workflowFiles.ts` 内显式校验。
8. **信封版本已升到 3**：旧版（≤2 的读取方）会拒绝含新字段的文件；本仓库读取方接受 1、2、3。

## 5. 回滚

改动全部在工作区、未提交，且不与他人文件交叉（除上面两处有意越界）。回滚方式：

1. 直接丢弃工作区改动：`git restore -- <上面"修改"列出的文件>` 并删除"新增"列出的 6 个文件；
   不需要任何数据迁移。
2. 若已提交：`git revert <commit>` 即可；没有持久化格式迁移，旧工作流定义与旧检查点仍然可读
   （参数与权限字段全部可选、缺省即旧语义）。
3. 运行期副作用仅限 Studio 数据目录：`importFile` 只在对应运行的工作区目录内写入文件，
   并在 `metadata.json` 的 `imports` 中记录来源；回滚代码不会影响已存在的运行记录。
4. 没有任何跨工作区的可写路径被引入，也没有修改用户项目文件的行为。
