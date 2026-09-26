# 工作流增量输出契约与业务类型收敛（T06）

2026-09-26。本规格在现有 Studio 工作流运行时之上定义**增量输出引用契约**，并把工作流业务类型收敛到浏览器安全的单一来源。不新增第二套存储、不新增素材库、不改写历史快照、不改写调度器。

## 目标与边界

- 让 step 结果在保留现有 `text` 字段的同时，能够有界地表达结构化输出（内联 JSON）与外部产出（工作区文件、创作任务产物）的**引用**。
- 检查点只保留有界引用与调度必需信息；大文本、大 JSON、媒体字节继续留在原有记录／文件中。
- 旧定义（没有 `outputs`、没有版本字段）按旧语义继续工作；历史快照不被重写。
- 业务类型（节点种类、节点业务字段、step 结果、检查点）只有一个定义处：`packages/services` 的公开入口。UI 只在其上叠加显示类型。

明确的非目标：

- 不新增全局素材库／资产中心；不把媒体字节写入检查点或数据库业务表。
- 不做 T07 的工作：不实现跨 step 的 `{{node.output.<name>}}` 取值语法，也不改 `workflowText` 的占位符语义。本任务只交付契约、校验与有界存储。
- 不把 React Flow 的 `Node`／`Edge`／`position`／`executionState` 类型移入业务核心。
- 不运行仓库级 `pnpm fmt` / `pnpm lint:fix` / `pnpm test:studio`。

## 输出引用联合

`StudioOutputRef` 定义于 `packages/services/src/studio-runtime/domain/outputRef.ts`（纯函数、浏览器安全、不导入 Node 内置模块）。

```ts
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type StudioOutputRef =
  | { kind: "text"; name: string; text: string }
  | { kind: "json"; name: string; schemaId?: string; value: JsonValue }
  | {
      kind: "workspace-file";
      name: string;
      runId: string;
      stepId: string;
      relativePath: string;
      sha256?: string;
    }
  | {
      kind: "creation-output";
      name: string;
      creationJobId: string;
      outputId: string;
      sha256?: string;
    };
```

字段语义：

| 字段                                         | 规则                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `kind`                                       | 判别式，只允许上表四个取值；未知 kind 直接判非法（不是"未知版本"，不能保留）                          |
| `name`                                       | 必填、非空、去空白后 1–64 字符；同一 step 内必须唯一；只用于展示与人工引用，**不是**取值地址          |
| `text.text`                                  | 内联文本，计入内联额度                                                                                |
| `json.schemaId`                              | 可选，`^[\w.:-]{1,100}$`；只做标注，不用于校验 `value`（本轮不引入 schema 仓库）                      |
| `json.value`                                 | 必须是 JSON 值（可 `JSON.stringify`、无循环引用、无 `undefined`／函数／`bigint`／`NaN`／`Infinity`）  |
| `workspace-file.runId` / `stepId`            | 定位该文件属于哪次运行、哪个步骤；`stepId` 允许为空字符串（节点级产物）                               |
| `workspace-file.relativePath`                | 相对运行工作区的**相对路径**，只允许 `/` 分隔；非法集见下                                             |
| `creation-output.creationJobId` / `outputId` | 定位 `ICreationService` 中既有 `CreationJob` 与其 `CreationOutput`；不复制 `path`／`mimeType`／`size` |
| `sha256`                                     | 可选，`^[a-f0-9]{64}$`；只做完整性标注，本轮不在读取时重新计算                                        |

**绝不内联字节**：`workspace-file` 与 `creation-output` 只按 id + 相对路径／作业 id + 输出 id 定位，记录里不出现文件内容、base64 或绝对路径。

`relativePath` 非法集（命中即非法）：

- 空字符串或长度 > 1024；
- 含 `\`（Windows 分隔符统一写成 `/`）；
- 以 `/` 开头（绝对路径）；
- 匹配 `^[A-Za-z]:`（盘符）；
- 含空字符；
- 任一段为 `.` 或 `..`；
- 任一整段等于保留设备名（`con`、`prn`、`aux`、`nul`、`com1`–`com9`、`lpt1`–`lpt9`，不区分大小写，可带扩展名）。

## 版本与状态语义

```ts
export const STUDIO_OUTPUT_REF_VERSION = 1; // 契约当前版本 CURRENT
export const STUDIO_OUTPUT_REF_LEGACY_VERSION = 0;

export type StudioOutputRefStatus = "legacy" | "ok" | "unsupported";

export interface StudioOutputRefsDecodeResult {
  status: StudioOutputRefStatus;
  version: number;
  refs?: StudioOutputRef[];
  /** 版本高于 CURRENT 时按原始形状保留，供原样回写，绝不降级重写。 */
  raw?: unknown;
}
```

- **无版本字段** = legacy（把它当作 `STUDIO_OUTPUT_REF_LEGACY_VERSION`）。此时不解析引用，`refs` 为 `undefined`，`raw` 为原值；调用方按旧语义继续（`text` 仍然有效）。
- **`version <= CURRENT`** = ok。解析并校验引用；`version` 为实际值（legacy 之外的合法值只有 `1`）。
- **`version > CURRENT`** = unsupported。**拒绝**当前进程使用它，但**完整保留** `raw`，绝不静默丢弃、绝不降级重写成 `{version: CURRENT}`。
- **`version` 存在但不是非负安全整数**（含 `null`、`"1"`、`1.5`、`-1`、`NaN`）→ 非法，抛 `StudioOutputRefError("malformed")`。它既不是 legacy，也不是"未知新版本"。
- 非对象（含数组、`null`、字符串）payload → 非法。

状态只由版本决定；引用内容非法（缺字段、超限等）属于 ok 路径上的**校验失败**，抛错而不是返回状态。

## 大小上限

读取时上限是安全上界，因此必须 **≥** 写入时上限；两边同一实现，避免"能写不能读／能读不能写"。

| 位置                                                 | 上限                   |
| ---------------------------------------------------- | ---------------------- |
| 单条 `text`／单条 `json` 序列化后的内联字节（UTF-8） | 16 384                 |
| 单个 step 的内联字节合计                             | 65 536                 |
| 单个 step 的引用条数                                 | 32                     |
| `name`                                               | 64 字符                |
| `relativePath`                                       | 1024 字符              |
| `schemaId`                                           | 100 字符               |
| `runId`／`stepId`／`creationJobId`／`outputId`       | 200 字符               |
| `sha256`                                             | 恰好 64 位小写十六进制 |

超限一律在写入边界以 `StudioOutputRefError("tooLarge")` 拒绝，**不截断、不静默丢弃**。理由：截断会让"已保存的引用"与"实际产物"不一致，且下游无法区分"输出就是短的"与"输出被截断了"。既有 `text` 字段的大文本仍按现状由 `projectText` 截断并标注，本契约不改变该行为。

## 失败规则

- 写入（`encodeStudioOutputRefs` / `assertStudioOutputRefs`）：内联超限、`name` 为空或重复、路径非法、`sha256` 非法、JSON 值不可序列化或含循环引用 → 抛 `StudioOutputRefError`。
- 读取：`outputs` 存在但校验不通过 → 该 step 结果视为不可读，`workflowCached` 抛 `Invalid workflow checkpoint for <nodeId>.`（与现有非法检查点同一可测路径）。
- 读取：`version > CURRENT` → 该 step 结果不可复用，`workflowCached` 抛 `Unsupported workflow checkpoint version for <nodeId>.`；**磁盘上的原始记录保持原字节不变**。
- 不支持的版本不会被"修复式"重写；只有显式的新 attempt 才会写入新结构。

## 命名输出的生产规则

节点用 `StudioWorkflowNodeData.outputNames` 声明输出名；生产者（真实 Agent 结果）按下面的规则把它们变成
`StudioStepResult.outputs`，**不做猜测，也不把同一段全文复制成多个不同输出**：

| 节点声明      | 生产结果                                                              | 失败条件                                                                  |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 未声明        | 不产出任何引用（保持旧语义）                                          | —                                                                         |
| 恰好 1 个名字 | 该名字接收节点文本，产出 1 条 `text` 引用                             | 文本超过内联上限（16 KiB）                                                |
| ≥2 个名字     | 节点文本必须是 JSON 对象且以这些名字为键，每个键产出 1 条 `json` 引用 | 文本不是合法 JSON、不是对象、缺少某个声明键、某个值不是 JSON 值、总量超限 |

- 构造失败时**该步骤判为 `failed`** 并带上可读错误（`... must be a JSON object keyed by those names.` /
  `Workflow outputs missing from the node result: <names>.`），**不写半成品引用**；下游因此不会拿到缺失或重复的引用。
- 只有 `status === "succeeded"` 且 `resultKnown === true` 的结果才生产引用（与 `assertStudioOutputsForResult` 一致）。
- 接线位置：`workflowSteps.agentNode` 把声明交给 `StudioAgentStep.outputNames`，
  `turnExecutor` 在构造 `StudioStepResult` 时调用 `buildStudioStepOutputs`。
- **`workspace-file` 与 `creation-output` 不在本规则内**：前者需要 Host 核对真实文件与哈希，
  后者来自创作服务记录，两者都还没接通（见「未接通项」）。

### 未接通项（不得当成已完成）

- `workspace-file` 输出：节点声明里没有相对路径来源，Host 也没有按声明核对文件与哈希。
- `creation-output` 输出：`runExecutor.ts` 的创作节点仍只回 `text`，没有从真实 `job.id` 构造引用；
  `reference.ts` 也没有为创作引用向 CreationService 取归属/存在性/版本证据。
- 跨隔离工作区输入：引用解析只交出 `relativePath`，下游隔离工作区里并没有那份文件，
  受控导入入口尚未接线。

## 检查点边界

检查点（`checkpoint.values` / `checkpoint.steps`）只保存：

1. step 状态与有界文本（沿用 `projectText`，1024 字符）；
2. 有界输出引用（本节上限表）；
3. 调度必需信息（重试截止时刻、轮次、计划）。

不保存：完整大文本、完整大 JSON、文件内容、base64、媒体字节、绝对路径。这些仍在原有位置——工作区文件、`CreationJob`／`CreationOutput` 记录、`step-result` 明细记录。

历史快照不被改写：没有 `version`／`outputs` 的旧记录按 legacy 读，`version > CURRENT` 的记录原样留在存储中。

## 业务类型收敛

- 业务定义放 `packages/services/src/studio-runtime/workflowTypes.ts`：`StudioWorkflowNodeKind`、`STUDIO_WORKFLOW_NODE_KINDS`（运行时清单）、`StudioWorkflowNodeData`、`StudioWorkflowDefinition`、`StudioStepResult`、`StudioCheckpoint`。
- 经 `packages/services/src/studio-runtime/contract.ts` → `packages/services/src/index.ts`（浏览器安全公开入口）导出。UI 只从 `@knorvia/services` 导入业务类型。
- UI 的 `packages/ui/src/studio/workflow/types.ts` 只保留显示层：React Flow `Node`／`Edge`、`position`、`executionState`、模板清单与画布尺寸上限。节点 kind 清单与 `WorkflowNodeKind` 从 services 重导出，不再重复定义。
- 收敛顺序：**先改消费者，再删重复定义**，保证每一步都可编译。
- 浏览器安全入口不得导入 `packages/services/src/node.ts` 的节点工厂或任何实现细节。

## 文件格式

工作流导入导出信封（`workflowFiles.ts`）的节点 `data` 键白名单必须允许契约新增键（本轮为 `version`），否则导入导出会静默丢字段。操作规则：

- 信封 `version` 升到 `2`（新增了可携带字段）；解码仍接受 `1`，旧文件继续可导入。
- 不接受的键仍然报 `fileInvalid`（保持闭合白名单，不做任意透传）。
- 节点 `data.version` 与定义 `version` 必须是合法的非负安全整数且不高于 `CURRENT`，否则报 `fileVersion`。
- 导入仍建立新身份（`duplicateWorkflow`），不覆盖本机同名流程。

## 定义版本与存储

`StudioWorkflowDefinition` 的 `version` 与 step 结果的 `version` 遵循同一套语义：

- `validateStudioWorkflow` 在结构检查**之前**判定版本：缺省（legacy）与 `<= CURRENT` 通过；更高版本返回 `Unsupported workflow definition version: <n>.`；非法值返回 `Invalid workflow definition version.`。运行时因此在执行任何节点前就拒绝未知结构。
- UI 侧的 `isStudioWorkflow` 只要求版本是非负安全整数（"未知但合法"的版本仍可被读取和保留，不会被当作损坏记录清除）；真正执行或导入时再由 `validateStudioWorkflow` / `decodeWorkflowFile` 显式拒绝。

## 验收场景

1. 旧定义（无 `outputs`、无 `version`）行为与改动前完全一致。
2. 新 `outputs` 可写可读，`text` 仍为必填。
3. 未知／更高版本被拒绝，且原始数据在磁盘上保留、不被重写。
4. 超限内联载荷在服务边界被拒绝（`tooLarge`）。
5. 检查点只保存有界引用：超限不落盘。
6. 导入导出往返保留新增键。
7. 既有工作流行为回归：outcomes、orchestration workflow、task templates、studio workflow、schedule 测试全部通过。
8. `pnpm typecheck`、`pnpm lint` 通过（scoped `oxfmt` 后）。
9. **生产 → 持久化 → 消费（真实执行入口）**：`studio-workflow-output-production.test.ts` 从
   `StudioRuntimeService` 启动工作流，只替换 kernel adapter，**不预填 `outputs`**：
   单名节点产出 `text` 引用且下游读到该值；多名节点返回按名建键的 JSON 时产出多条 `json` 引用且下游读到值。
10. **生产失败必须显式失败**：多名节点返回纯文本 → 该步骤 `failed`、错误指出「必须是按名建键的 JSON 对象」、
    下游节点不执行、检查点里不留半成品 `outputs`；缺少某个声明键 → 错误点名缺失的输出名。

## 风险与回滚

- 读取路径新增两类抛错（非法 `outputs`、更高版本）。既有测试已覆盖非法检查点抛 `Invalid workflow checkpoint`，新增分支沿用同一路径；风险是历史上存在带 `version > CURRENT` 的记录，此时该 step 不再可复用而报错——这是刻意的（宁可显式失败，也不静默按旧语义使用未知结构）。
- 回滚：`outputs`／`version` 为可选字段，删除新文件与新增分支即可回到旧行为；不需要数据迁移，也不需要改写历史记录。
