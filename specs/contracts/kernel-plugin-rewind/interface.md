# kernel-plugin-rewind 接口（interface.md）

**合同版本：v1**（2026-10-22）

本包导出面：**DSH 插件模块入口** + 装配期配置 + 计划/结果类型。
**两个依赖端口**都来自 `contracts`（已存在，本包不新建）。

**⚠️ 计分模式**：本包全部文件都有可执行实现 → **统一走普通模式**，
不使用 `--declaration`、不使用 `--contract-lines`。

---

## 一、插件模块导出面（`bootstrap/src/kernel-plugin-rewind/`）

| 模块                                                           | 导出名                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `bootstrap/src/kernel-plugin-rewind/index.ts`                  | `apply` `assertWired` `KnorviaRewindConfig` `RewindPluginHandle` `DEFAULT_REWIND_ROW_ID` |
| `bootstrap/src/kernel-plugin-rewind/file-rewind-plan.ts`       | `planFileRewind` `RewindOperation` `RewindPlan` `planFromPreview`                        |
| `bootstrap/src/kernel-plugin-rewind/file-rewind-apply.ts`      | `applyFileRewind` `RewindJournalEntry` `RewindApplyResult`                               |
| `bootstrap/src/kernel-plugin-rewind/file-rewind-compensate.ts` | `compensateRewind` `CompensationResult`                                                  |
| `bootstrap/src/kernel-plugin-rewind/file-state.ts`             | `readFileState` `contentHash` `FileState` `FileReadFailure`                              |
| `bootstrap/src/kernel-plugin-rewind/checkpoint-events.ts`      | `appendCheckpointEvent` `appendRewindEvent` `parseCheckpointEvent` `CheckpointSummary`   |
| `bootstrap/src/kernel-plugin-rewind/checkpoint-list.ts`        | `listCheckpoints` `loadCheckpointPreviews` `restoreCheckpointArtifact`                   |
| `bootstrap/src/kernel-plugin-rewind/conversation-plan.ts`      | `planConversationRewind` `ConversationPlan` `RewindTargetEvaluation`                     |
| `bootstrap/src/kernel-plugin-rewind/rewind-router.ts`          | `executeRewind` `RewindScope` `RewindStrategy`                                           |
| `bootstrap/src/kernel-plugin-rewind/tool-declarations.ts`      | `REWIND_TOOL_DECLARATIONS` `describeRewindTools`                                         |
| `bootstrap/src/kernel-plugin-rewind/logger.ts`                 | `KnorviaLogger` `NOOP_LOGGER`                                                            |

**⚠️ 文件数与旧实现对应关系**（旧 9 个 → 新 11 个）：旧实现的 `rewind.ts`（359 行）
同时含「命令入口 + 状态文案 + 编排」，新实现拆成 `rewind-router.ts` + `tool-declarations.ts`；
`file-rewind.ts`（164）拆成 `file-rewind-plan.ts` + `file-rewind-apply.ts` +
`file-rewind-compensate.ts` + `file-state.ts`。**拆分理由见 §六。**

### 1.1 组合行 id

```ts
export const DEFAULT_REWIND_ROW_ID = "knorvia-rewind";
```

由 `kernel-switch` 写入 `composition.ts`（与 `knorvia-policy` 同批），**本包不改冻结面**。

### 1.2 装配期配置

```ts
export interface KnorviaRewindConfig {
  /** 文件系统端口。**必需**。缺失 → apply 抛错。 */
  readonly fileSystem: FileSystemPort;
  /** 会话事件存储端口。**必需**。缺失 → apply 抛错。 */
  readonly eventStore: SessionEventStorePort;
  /** 工作区根目录（绝对路径）。回退目标是相对它的路径。**必需**。 */
  readonly workspaceRoot: string;
  /** 注入 path 实现（测试用；生产用 `node:path`）。 */
  readonly pathModule?: PathModule;
  /** 注入时钟（测试用；生产用 `Date.now`）。 */
  readonly now?: () => number;
  readonly logger?: KnorviaLogger;
}
```

**接线约定（照 `kernel-plugin-policy` 的 `assertWired` 精神）**：

- `fileSystem` / `eventStore` / `workspaceRoot` 三者缺席 → **立即抛错**；
- **不用 `node:fs` 兜底** —— 那会违反 AGENTS.md 的 I/O 收敛要求（L1）。

### 1.3 `apply` 签名与 handle

```ts
export function apply(ctx: Context, config: KnorviaRewindConfig): RewindPluginHandle;

export interface RewindPluginHandle {
  readonly rowId: string;
  /** 预览文件回退（只读，B2）。 */
  previewFileRewind(options: {
    targetCheckpointId?: string;
    targetMessageId?: MessageId;
  }): Promise<RewindPreview>;
  /** 执行文件回退（写盘 + 补偿，B3/B4）。 */
  applyFileRewind(options: { targetCheckpointId: string }): Promise<RewindApplyResult>;
  /** 创建当前工作区检查点（B8）。 */
  createCheckpoint(options: {
    messageId: MessageId;
    paths: readonly string[];
  }): Promise<CheckpointSummary>;
  /** 列出检查点（从事件重算，B8）。 */
  listCheckpoints(options?: { limit?: number }): Promise<readonly CheckpointSummary[]>;
  /** 规划会话回退（只算目标，不 fork，B7）。 */
  planConversationRewind(options: {
    targetMessageId: MessageId;
    scope?: RewindScope;
  }): Promise<ConversationPlan>;
}
```

---

## 二、依赖的端口（都是 `contracts` 已有的，本包不新建）

### 2.1 `FileSystemPort`

**定义**：`apps/cli/packages/contracts/src/interfaces/file-system.port.ts:338`

```ts
export interface FileSystemPort {
  createDirectory(
    request: FileSystemCreateDirectoryRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemCreateDirectoryResult>;
  stat(
    request: FileSystemStatRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemStatResult>;
  readTextFile(
    request: FileSystemReadTextRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemReadTextResult>;
  readBinaryFile(
    request: FileSystemReadBytesRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemReadBytesResult>;
  readTextFileRange(
    request: FileSystemReadTextRangeRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemReadTextRangeResult>;
  writeTextFile(
    request: FileSystemWriteTextRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemWriteTextResult>;
  removeFile(
    request: FileSystemRemoveFileRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemRemoveFileResult>;
  listDirectory(
    request: FileSystemListDirectoryRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemListDirectoryResult>;
  searchFiles(
    request: FileSystemSearchFilesRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemSearchFilesResult>;
  searchText(
    request: FileSystemSearchTextRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemSearchTextResult>;
}
```

**本包用到的子集**：`stat` / `readTextFile` / `writeTextFile` / `removeFile` / `createDirectory`。

**⚠️ 端口契约（本包依赖的部分）**：

- 实现负责平台差异（盘符、分隔符、大小写、路径长度、软链）；
- 错误以 `FileSystemPortError` 形式返回/抛出（`createFileSystemError` / `isFileSystemPortError`）；
- 本包**不**假设错误的 `code` 值，只用 `isFileSystemPortError` 判断「这是端口错误」。

### 2.2 `SessionEventStorePort`

**定义**：`apps/cli/packages/contracts/src/interfaces/session.port.ts:278`

```ts
export interface SessionEventStorePort {
  append(event: SessionEvent): Promise<SessionEvent>;
  getEvents(sessionId: SessionId): Promise<SessionEvent[]>;
  getEventsAfter(sessionId: SessionId, sequenceNumber: number): Promise<SessionEvent[]>;
  getLatestSequenceNumber(sessionId: SessionId): Promise<number>;
  deleteSession(sessionId: SessionId): Promise<void>;
  getStats?(): SessionEventStoreStats;
  pruneTransientEvents?(nowMs?: number): number;
}
```

**端口契约（本包依赖的部分）**：

- 「实现方保证按会话追加的顺序可回放」→ 本包依赖这个顺序做检查点定位；
- `getLatestSequenceNumber` 用于 B7 算「当前最新 seq」。

**⚠️ 本包不关心实现**：背后可以是内存（`contracts/src/events/in-memory-session-event-store-core.ts`）、
SQLite、或适配 DSH session log 的实现 —— **由组合根注入**。
**所以「旧格式兼容」不是本包的问题**（端口实现负责）。

---

## 三、计划与结果类型

### 3.1 计划（preview 的输出）

```ts
export type RewindAction = "write" | "remove" | "create-directory";

export interface RewindOperation {
  /** 相对 `workspaceRoot` 的路径（POSIX 风格分隔符，跨平台一致）。 */
  readonly path: string;
  readonly action: RewindAction;
  /** action=write 时的目标内容（UTF-8 文本）。 */
  readonly content?: string;
  /** 计算该操作时看到的内容 hash（B6 漂移检测用）。 */
  readonly expectedHash?: string;
  /** 为什么要做这一步（日志/UI 展示；不含文件内容）。 */
  readonly reason: string;
}

export interface RewindPreview {
  readonly scope: "workspace";
  readonly available: boolean;
  readonly checkpointId?: string;
  readonly operations: readonly RewindOperation[];
  readonly unavailableReason?: string;
}
```

### 3.2 结果（apply 的输出）

```ts
export interface RewindJournalEntry {
  readonly path: string;
  /** 执行该步**之前**的原始状态（补偿用）。 */
  readonly before: FileState;
  readonly action: RewindAction;
}

export interface RewindApplyResult {
  readonly scope: "workspace";
  readonly rewindId: string;
  readonly applied: number;
  readonly skipped: number;
  readonly failures: readonly { readonly path: string; readonly reason: string }[];
  /** 是否部分完成（有失败但已补偿，或补偿也失败）。 */
  readonly partial: boolean;
  /** partial 为真时给出 journal，供人工处理。 */
  readonly journal?: readonly RewindJournalEntry[];
  readonly unavailableReason?: string;
}
```

### 3.3 文件状态（补偿的最小单位）

```ts
export interface FileState {
  /** 文件内容；`null` 表示「不存在」。 */
  readonly content: string | null;
  readonly exists: boolean;
  /** `contentHash(content)` 的结果；不存在时为固定哨兵。 */
  readonly hash: string;
}

export const ABSENT_HASH = "absent" as const;
export function contentHash(content: string | null): string;
```

### 3.4 会话回退规划（B7）

```ts
export interface ConversationPlan {
  readonly scope: "conversation";
  readonly available: boolean;
  /** 交给 DSH `session.fork(atSeq)` 用的目标序号。**本包不执行 fork。** */
  readonly targetSequenceNumber?: number;
  readonly targetMessageId?: MessageId;
  readonly affectedMessageIds?: readonly MessageId[];
  readonly unavailableReason?: string;
}
```

**⚠️ `targetSequenceNumber` 是本包与 `kernel-bridge` / `kernel-legacy-sessions` 的唯一接缝** ——
它们拿这个值去调 DSH 的 fork。

### 3.5 检查点摘要

```ts
export interface CheckpointSummary {
  readonly checkpointId: string;
  readonly messageId: MessageId;
  readonly fileCount: number;
  readonly createdAt: number;
  /** 检查点覆盖的文件路径（相对 workspaceRoot）。 */
  readonly paths: readonly string[];
}
```

---

## 四、工具声明（B12）

```ts
export interface RewindToolDeclaration {
  readonly name: string;
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly sideEffectScope: "workspace";
  readonly riskLevel: "low" | "medium" | "high" | "critical";
  readonly needsApproval: boolean;
  readonly description: string;
}

/** 供 kernel-plugin-policy 的 B3 读取。 */
export const REWIND_TOOL_DECLARATIONS: readonly RewindToolDeclaration[];
```

**声明内容**（B12）：

```ts
[
  { name: "PreviewWorkspaceRewind", readOnly: true,  destructive: false,
    sideEffectScope: "workspace", riskLevel: "low",    needsApproval: false, ... },
  { name: "RewindWorkspaceFiles",   readOnly: false, destructive: true,
    sideEffectScope: "workspace", riskLevel: "high",   needsApproval: true,  ... },
]
```

**⚠️ 为什么要显式声明**：`kernel-plugin-policy` 的 B3 若读不到声明会落到 UNKNOWN 档
（`riskLevel: "medium"`），导致「high 风险才弹窗」的场景不弹。**所以必须声明 `high`。**

---

## 五、`defineTool` 的最小类型形状

本包**不 import DSH 运行时**（L1），只用一个最小类型表达 `defineTool` 的签名形状：

```ts
/** DSH `defineTool` 的签名形状（仅类型；本包不 import DSH 运行时）。 */
export interface ToolDefinitionLike {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly execute: (input: unknown) => Promise<unknown>;
}
```

**⚠️ 为什么不用 DSH 的类型**：本包要在**纯离线测试**里验证「工具声明与 execute 行为」，
引入 DSH 运行时会让测试需要装配 DSH。用最小形状即可断言「声明了什么」与
「execute 是否正确调用 handle」。

---

## 六、为什么 11 个文件（旧 9 个）—— 拆分理由

| 新文件                      | 来自旧文件的哪部分                                                 | 拆分理由                                                   |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| `file-rewind-plan.ts`       | `file-rewind.ts` 的计划部分 + `file-rewind-planning.ts`            | 与「执行」分离：plan 是纯函数（可单测），apply 有副作用    |
| `file-rewind-apply.ts`      | `file-rewind.ts` 的执行部分                                        | 同上                                                       |
| `file-rewind-compensate.ts` | `file-rewind.ts` 的补偿 + `file-rewind-storage.ts` 的 `compensate` | 补偿是**独立的错误路径**，单独成文件便于覆盖与审查         |
| `file-state.ts`             | `file-rewind-storage.ts` 的 `readCurrentState` / `contentHash`     | 状态读取与 hash 是两个工序共用的基础（plan 与 apply 都用） |
| `checkpoint-events.ts`      | `workspace-checkpoint-persistence.ts`                              | 事件读写与「列表/预览」分离（后者从事件重算）              |
| `checkpoint-list.ts`        | `workspace-checkpoints.ts` 的列表/预览/artifact                    | 只读路径独立，便于保证「不写」                             |
| `conversation-plan.ts`      | `rewind-conversation-state.ts`                                     | 会话回退**只规划**，与文件回退分离                         |
| `rewind-router.ts`          | `rewind-message.ts` + `rewind.ts` 的编排                           | 路由（按 scope 分派）与工具声明分离                        |
| `tool-declarations.ts`      | `rewind.ts` 的命令入口部分                                         | 声明是**给 policy 读的数据**，与逻辑分离                   |

**⚠️ 拆分原则**：`src/AGENTS.md` 要求「单个源文件默认不超过 400 行」，
而旧 `rewind.ts` 是 359 行且混合了三种职责 → 新实现拆分后每个文件都在 300 行以内。

---

## 七、依赖方向（冻结）

```text
contracts (FileSystemPort + SessionEventStorePort)  ──(定义)──>  kernel-plugin-rewind
kernel-plugin-rewind  ──(工具能力声明)──>  kernel-plugin-policy（只读消费，policy 读声明）
kernel-plugin-rewind  ──(ConversationPlan.targetSequenceNumber)──>  kernel-bridge / kernel-legacy-sessions
```

**本包不 import**：

- `node:fs` / `node:child_process`（L1，I/O 走端口）
- `@deepseek-ai/dsh-*` 的**运行时**（只有类型级最小形状，见 §五）
- `core/src/**`（随删除）
- `kernel-plugin-policy` 的实现（只产出「工具声明」这个数据，不 import 它）

---

## 八、与旧实现的导出面映射（行为对照，不迁移代码）

| 旧实现（`core/src/runtime/methods/`）                              | 本包对应                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `rewind.ts` 的 `executeRewindCommand`                              | `rewind-router.ts` 的 `executeRewind`                          |
| `rewind.ts` 的 `formatRewindStatus`                                | `checkpoint-list.ts` 的 `listCheckpoints` + 调用方格式化       |
| `rewind.ts` 的 `rewindWorkspaceToCheckpoint`                       | `file-rewind-apply.ts` 的 `applyFileRewind`                    |
| `rewind.ts` 的 `finishUnavailableRewind`                           | 各 handler 的 `unavailableReason` 返回路径                     |
| `file-rewind.ts` 的 `previewWorkspaceFileRewind`                   | `file-rewind-plan.ts` 的 `planFileRewind`                      |
| `file-rewind.ts` 的 `applyWorkspaceFileRewind`                     | `file-rewind-apply.ts` 的 `applyFileRewind`                    |
| `file-rewind-planning.ts` 的 `planWorkspaceFileRewind`             | 同上（合并进 `planFileRewind`）                                |
| `file-rewind-storage.ts` 的 `readCurrentState` / `contentHash`     | `file-state.ts`                                                |
| `file-rewind-storage.ts` 的 `compensate`                           | `file-rewind-compensate.ts`                                    |
| `workspace-checkpoints.ts` 的 `listWorkspaceCheckpoints`           | `checkpoint-list.ts`                                           |
| `workspace-checkpoints.ts` 的 `loadCheckpointMessagePreviews`      | `checkpoint-list.ts`                                           |
| `workspace-checkpoints.ts` 的 `restoreWorkspaceCheckpointArtifact` | `checkpoint-list.ts`                                           |
| `workspace-checkpoints.ts` 的 `forkWorkspaceFromCheckpoint`        | **不迁移**：fork 归 DSH（§一 3）                               |
| `workspace-checkpoints.ts` 的 `copySessionMessagesForFork`         | **不迁移**：同上                                               |
| `workspace-checkpoint-persistence.ts` 的 `persist*` / `restore*`   | `checkpoint-events.ts`                                         |
| `rewind-conversation-state.ts` 的 `planConversationRewind`         | `conversation-plan.ts`                                         |
| `rewind-conversation-state.ts` 的 `applyConversationRewind`        | **不迁移**：执行 fork 归 DSH                                   |
| `rewind-message.ts` 的 4 个路由器                                  | `rewind-router.ts`                                             |
| `rewind-workspace-cascade.ts`                                      | `rewind-router.ts`（级联 = 先 workspace 再 conversation 规划） |

**⚠️ 两个 `fork` 相关导出不迁移**：`forkWorkspaceFromCheckpoint` 与 `copySessionMessagesForFork`
是「执行 fork」的一部分，归 `kernel-bridge` / `kernel-legacy-sessions`。
**本包只提供 `planConversationRewind` 的 `targetSequenceNumber`。**
