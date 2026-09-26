# Host 引用解析、参数绑定与节点约束（T07）

本规格定义工作流在**执行前**如何解析宿主引用、如何绑定参数与权限，以及哪些情况必须在排队前被拒绝。
与之相关但不重叠的规格：`specs/knorvia-output-contract.md`（增量输出引用的数据结构与版本）、
`specs/knorvia-kernel-status.md`（分层探测与版本化能力矩阵）、`specs/knorvia-backend.md`（运行时总边界）。

## 1. 所有权

| 关注点                               | 唯一所有者                                     | 说明                                         |
| ------------------------------------ | ---------------------------------------------- | -------------------------------------------- |
| 引用的形状与版本                     | `domain/outputRef.ts`（T06）                   | 本规格不新增第二种引用格式                   |
| 引用的来源／归属／路径范围／版本判定 | `studio-runtime/domain/reference.ts`（本规格） | 纯函数、浏览器安全                           |
| 引用的存在性与真实哈希               | `adapters/workspaceManager.ts`                 | 只有 Host 能读工作区                         |
| 参数 schema 与默认值解析             | `domain/workflowGraph.ts`                      | 编辑器与执行器共用同一份纯校验               |
| 参数值与权限的冻结                   | `app/commandAdmission.ts`                      | 提交时写入 `run.checkpoint.values`，只写一次 |
| 执行期引用解析与失败                 | `app/workflowSteps.ts`                         | 缺引用必须在调用内核前失败                   |
| 文件导入（跨隔离目录）               | `StudioWorkspacePort.importFile`               | 源文件永不被写回                             |

规则：**客户端提供的绝对路径从来不是授权**。客户端只能提出"我要引用这个"，
是否为该引用背书由 Host 依据运行记录、工作区身份与文件真实版本决定。

## 2. 引用的信任规则

1. 引用一律沿用 `StudioOutputRef`（`text` / `json` / `workspace-file` / `creation-output`）。
   不新增内联大文本或媒体字节的第二格式。
2. `workspace-file` 的 `relativePath` 必须能映射到运行内相对路径：
   - 绝对路径、盘符（`C:`）、UNC、反斜杠一律拒绝（`absolute-path`）；
   - `..`、空段、`.` 段一律拒绝（`traversal`）；
   - Windows ADS（含 `:`）、尾随点／空格、保留设备名一律拒绝（`dangerous-name`）；
   - 目录穿越与符号链接／联接点／重定向目录由适配器在读取时再次拒绝（`readSafeFile` / `safePath`），
     纯函数不能替代这一层。
3. `runId` 必须等于当前运行（`foreign-task`）。
4. `stepId` 必须由当前节点的**前置节点**产出（`foreign-step`）；引用只能看祖先，不能看后继或旁支。
5. 工作区身份 key 统一为 `workspaceIdentity?.trim() || workspacePath`。
   当引用带身份、且与当前运行身份不一致时拒绝（`workspace-mismatch`）。
6. 版本（`sha256`）在引用上给出时，Host 必须重新读取目标并比对：
   不存在 → `missing`；哈希不一致 → `changed`；契约版本高于本进程 → `unsupported-version`。
   任一情况都必须在**调用内核之前**失败，并且错误信息要能说明是哪一类。
7. 无法取证（Host 没有读取能力）时**失败关闭**：不得把"读不到"当成"没变化"。

## 3. 复制并记录来源的规则（`importFile`）

- 只有 `StudioWorkspacePort.importFile` 能把工作区之外的输入复制进本次运行的工作区。
- 复制前：源必须是绝对路径、必须是普通未链接文件、≤16 MiB；源位于 Studio 数据目录内时拒绝。
- 复制使用 `exclusiveWrite`（`wx`）；已存在同名目标时失败，不覆盖。
- 复制后重新读取目标并比对哈希与大小；不一致 → 报错并保持失败。
- 快照元数据记录 `{ sourcePath, hash, size }`，作为来源记录；**源文件永不被写入或删除**。
- 隔离目录内的工作区文件引用以"复制进工作区的那一份"为准；项目目录只在 `shared` 模式下直接被写入。
- 并发沿用 `sourceKey` 锁约定（按项目路径串行）。

## 3.5 跨隔离输入（`importReference`）

上游隔离工作区位于 Studio 自己的数据目录里，因此**通用 `importFile` 拒绝导入它**（第 3 节）。但
下游 Agent 有另一个隔离工作区：上游有相对路径不代表下游也有那份文件。第 3 节的限制**不放宽**，
而是另开一个窄范围入口：

- `StudioWorkspacePort.importReference({ runId, stepId, sourceRunId, sourceStepId, relativePath, expectedSha256? })`。
  **不接收绝对路径**：来源完全由运行/步骤身份 + 相对路径经**上游工作区元数据**解析，调用方无法指定任意文件。
- 复制前校验：上游工作区必须存在、相对路径必须是可移植相对路径、文件必须是普通未链接文件；
  `expectedSha256` 给出时（引用记录了哈希）必须一致，否则 `Referenced upstream output changed since it was recorded.`
- 副本放回**同一相对路径**，因此提示词里的 `{{ref.<name>}}`（解析为上游相对路径）在下游依然有效。
- 目标已存在且内容与来源一致（同一来源同一版本）→ 直接返回，**不重复写入**；
  目标存在但内容不同 → `exclusiveWrite` 的 `wx` 语义使其**失败而不是覆盖**。
- 沿用第 3 节的 `sourceKey` 锁、复制后重读比对哈希与大小、以及元数据 `{ sourcePath, hash, size }` 来源记录；
  **源文件始终只读**。
- 接线：`workflowSteps.agentNode` 把已核验的文件引用交给 `StudioAgentStep.inputs`，
  `turnExecutor` 在**目标工作区准备好之后**调用导入，再让内核执行。
  共享项目模式不复制（上下游看同一个项目）；宿主未实现该能力时**失败关闭**，不退化为让下游去读上游路径。

**已接通**：节点用 `outputs: [{ name, from: "file" }]` 声明文件来源，Host 核对文件与哈希后产出
`workspace-file` 引用；下游引用时由本节的 `importReference` 把副本导入目标工作区。
**创作成果也已接通**：`creation-output` 引用携带 `fileName`，绑定文本与真实落点都是
`creation-input/<fileName>`；`importReference` 的 `creation-output` 来源由 Host 经 CreationService 解析出
绝对路径，且**必须**带 `sha256`，导入前核对不符即拒绝。
端到端验收见 `packages/services/test/studio-workflow-file-handoff.test.ts`（上游文件副本 + 创作媒体副本两条）。

**仍未接通**：媒体路径只在服务层跑通，未在打包应用上跑工作流界面。

## 4. 参数 schema 规则

节点可选 `params: StudioWorkflowParam[]`：

```ts
interface StudioWorkflowParam {
  name: string; // ^[a-z][a-z0-9_]{0,39}$
  label?: string; // ≤ 80
  type: "text" | "number" | "boolean";
  default?: string; // ≤ 4000
  required?: boolean;
}
```

- 每个节点最多 12 个参数；同名只允许出现一次。
- 未知 `type`、非法 `name`、超长 `label`/`default` → 定义校验失败。
- `required` 且没有 `default` 的参数在没有提交值时必须被拒绝（提交前，不是运行中）。
- 提交值必须是字符串，≤4000 字符，≤32 项；`number` 必须是可解析的有限数字，`boolean` 只接受
  `true` / `false`。
- 解析结果 = `default` 与提交值的合并；缺 `required` 且无默认值时拒绝排队。
- 提示词用 `{{param.<name>}}` 引用参数；引用未声明的参数在校验期即报错。
- **冻结规则**：解析后的参数值在 `send` 受理时写入 `run.checkpoint.values`（保留键
  `["workflow-params"]`），此后不再变更；`resume` 复用同一份冻结值，不重新读取界面草稿。
- `run.input` 仍然是自由文本输入，语义不变（`{{input}}` / `{{output}}` 保留）。

## 5. 节点输出声明与结构化引用

节点可选 `outputNames: string[]`（≤32，`^[a-z][a-z0-9-]{0,63}$`，不重复）声明它会产出的输出名；
产出的实际引用由 T06 的 `StudioStepResult.outputs` 承载。

提示词用 `{{ref.<name>}}` 读取上游结构化输出：

- 校验期：`<name>` 必须出现在**某个祖先节点**的 `outputNames` 中，否则拒绝；
- 执行期：从祖先结果里找到同名 `StudioOutputRef`，先按第 2 节的规则校验来源，
  再解析为文本（`text` 原样、`json` 序列化、`workspace-file` / `creation-output` 取哈希校验后的路径）；
- 缺失、超出范围、哈希变化 → 该节点在执行前失败，错误信息指出引用名与原因；
- 旧的 `{{<nodeId>}}` 文本展开继续按原语义工作，不得改变。

## 6. 要求 ∩ 授权 = 更严格的一方

- 节点可选 `permission: "read-only" | "ask" | "full-access"` 表示该节点的**执行要求**。
- `send` 命令可选 `permission` 表示用户本次运行的**授权上限**。
- 实际要求 = 两者中更严格的一方（`read-only` 最严格，`full-access` 最宽松）。
- 在 `send` 受理时（排队之前）用内核的**真实能力**核验：
  - `read-only` 要求 → 内核 `readOnly` 能力必须为真；
  - `full-access` 要求 → 内核 `fullAccess` 能力必须为真；
  - 核验时传入已发现的内核版本（`kernelCapabilities(id, version)`），版本未知时按矩阵的声明值判定。
- 不能被满足 → **拒绝排队**，并说明是哪个节点、哪个内核、缺哪一项能力。
- 只读要求**永远不能**由提示词文本满足；内置 `knorvia`、`grok-build`、`claude-code` 等
  没有真实只读沙箱的路径必须在运行开始前就被拒绝，而不是派发之后降级。
- 不新增第二套授权系统：判定全部走 `domain/kernelPolicy.ts` → `domain/capabilityMatrix.ts`。
- 冻结：运行级授权写入 `run.checkpoint.values`（保留键 `["workflow-permission"]`），
  执行器按节点计算实际要求并传给 `port.agent({ permission })`。

## 7. UI 边界

- 运行对话框渲染参数表单：输入值只保存在本地 store 的草稿里（`inputDrafts` 之外新增
  `paramDrafts`），提交时随 `send` 命令发出；
- UI 不得把本地编辑状态当成服务端事实，也不得直接调用 Repo／文件系统／`window`；
- 检查器的"上游输出"选择器只能列出**祖先节点声明的** `outputNames`，插入的是
  `{{ref.<name>}}` 文本，不保存节点 id 引用（因此复制／导入重写节点 id 时不会留下悬空引用）；
- 文件导入／导出必须让 `params`、`outputNames`、`permission` 往返保留；未声明时不得写入字段。

## 8. 验收场景

1. **拒绝矩阵**：`../x`、`/abs/x`、`C:/x`、`a\b`、`x:ads`、`con`、空段、超长路径分别给出
   可区分的理由；错误运行 id、错误步骤、错误工作区身份同样被拒绝。
2. **存在性与版本**：目标缺失 → `missing`；重新读取哈希不同 → `changed`；引用契约版本更高 →
   `unsupported-version`；宿主无读取能力 → 失败关闭。
3. **跨目录导入**：源文件被复制进工作区，元数据记录 `sourcePath/hash/size`，复制后重新哈希一致，
   源文件的哈希与修改时间在导入前后不变。
4. **参数校验**：错误类型、缺少必填且无默认值、重复参数名一律在提交时拒绝；
   默认值被应用；提交值被冻结，`resume` 后仍是同一份。
5. **只读要求**：`read-only` 节点 + `readOnly=false` 的内核在**排队之前**被拒绝，
   且没有任何 step 记录被创建。
6. **旧流程不变**：不含新字段的 `{{<nodeId>}}` 文本工作流校验、执行、保存、重开结果与之前一致。
7. **往返**：导出再导入后 `params`、`outputNames`、`permission` 保留，仍能通过定义校验。
