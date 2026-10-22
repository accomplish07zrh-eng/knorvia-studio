# kernel-plugin-rewind 行为条目（behavior.md）

**合同版本：v1**（2026-10-22）

每条含：输入 / 输出 / 错误语义 / 时序与并发 / 幂等 / 资源释放 / 平台差异 / 状态所有者 /
日志级别 / 可测断言。

**行为依据**：旧实现（`core/src/runtime/methods/rewind*.ts`、`file-rewind*.ts`、
`workspace-checkpoint*.ts`）**仅作行为取证**，不作为代码来源；
权威规则来自 `specs/knorvia-builtin-kernel-dsh.md` L73/L74/L100。

---

## B1 插件形态与依赖注入

**输入**：`apply(ctx: Context, config: KnorviaRewindConfig)`。
`config` 必需两项：`fileSystem`（`FileSystemPort`）、`eventStore`（`SessionEventStorePort`）。
可选：`logger`、`workspaceRoot`、`now`（时钟注入，便于测试）。

**输出**：`apply` 返回一个 handle（暴露 `previewFileRewind` / `applyFileRewind` /
`createCheckpoint` / `listCheckpoints` / `planConversationRewind` 等公开方法），
并按需在 `ctx` 上注册工具（见 B12）。

**接线约定（照 `kernel-plugin-policy` 的 `assertWired` 精神）**：

- 两个端口任一缺席 → **立即抛错**，消息指出缺哪个；
- **不补默认值** —— 用 `node:fs` 兜底会违反 AGENTS.md 的 I/O 收敛要求（L1）。

**错误语义**：配置错误抛 `Error`；消息含字段名。

**时序**：挂载后即可用；不依赖挂载顺序。

**并发**：handle 无共享可变状态（除幂等记录，见 B10）。

**幂等**：重复 `apply` 会重复注册工具 → 禁止；由组合根保证只挂一次。

**资源释放**：本包不持有定时器/句柄；所有 I/O 走端口（由端口实现管理）。

**平台**：无平台相关行为（路径经端口传递，L10）。

**状态所有者**：`FileSystemPort` 与 `SessionEventStorePort` 的实现方；
本包只持有「进行中的回退计划」这一临时状态（B10）。

**日志**：`info` —— `kernel.rewind.mounted`（含 `workspaceRoot` 与工具注册数）；
`debug` —— 每次 preview/apply 的 `{ checkpointId?, targetMessageId?, fileCount, operationCount }`。

**断言**：

1. 缺 `fileSystem` → 抛错且消息含 `fileSystem`；
2. 缺 `eventStore` → 抛错且消息含 `eventStore`；
3. 源码不含 `node:fs` 的运行时 import（L1）；
4. 源码不含 `KNORVIA_KERNEL_ENGINE`（L9）。

---

## B2 文件回退预览（preview）

**输入**：`{ targetCheckpointId?: string; targetMessageId?: MessageId }` 之一。

**输出**：`WorkspaceFileRewindPreview`：

```ts
{
  scope: "workspace";
  available: boolean;
  checkpointId?: string;
  fileCount?: number;
  operations: Operation[];        // 每个文件一条
  unavailableReason?: string;     // available=false 时给出
}
```

`Operation` 形如 `{ path, action: "write" | "remove" | "create-directory", from?, to?, reason }`。

**语义**：

- 从 `eventStore.getEvents(sessionId)` 读历史，定位目标检查点；
- 逐文件比对「检查点记录的内容 hash」与「当前文件状态」→ 决定 `write` / `remove` / 无操作；
- **不写任何东西**（L2）：只用 `fileSystem.stat` / `readTextFile`。

**错误语义**：目标检查点不存在 → `available: false` + `unavailableReason`（**不抛错**，
因为「找不到检查点」是正常的用户输入结果，不是程序错误）。

**时序**：读取快照 → 计算 → 返回；期间文件可能变化，所以 apply 前要重新校验（B6）。

**并发**：preview 是只读的，可并发。

**幂等**：同输入同输出（除非文件在此期间变化）。

**资源释放**：无。

**平台**：路径全部来自事件与端口，本包不拼接（L10）。

**状态所有者**：检查点内容归 `SessionEventStorePort`；当前文件状态归 `FileSystemPort`。

**日志**：`debug` —— `kernel.rewind.preview`（`{ checkpointId, fileCount, operationCount }`）。

**断言**：

1. 无检查点 → `available: false` 且有 reason；
2. 检查点与当前内容相同 → `operations` 为空；
3. 文件在检查点后被删 → 该文件 `action: "write"`（需恢复）；
4. 文件在检查点后新增（检查点里没有）→ `action: "remove"`（回退 = 删掉新增的）；
5. preview 全程**零写入**（端口替身断言 `writeTextFile`/`removeFile` 调用次数为 0）。

---

## B3 文件回退执行（apply）

**输入**：`WorkspaceFileRewindPreview`（或 `{ targetCheckpointId }` 由本包内部先 preview）。

**输出**：

```ts
{
  scope: "workspace";
  applied: number; // 成功执行的步骤数
  skipped: number; // 因已是目标状态而跳过的
  failures: {
    (path, reason);
  }
  []; // 失败的步骤
  partial: boolean; // 是否部分完成（有失败）
  rewindId: string; // 本次回退的标识（写进事件）
}
```

**语义**：

1. **apply 前重新校验 hash**（L4/B6）：若漂移 → **拒绝执行**并返回 `unavailable`；
2. 记录 `JournalRecord[]`（每步操作前的文件状态）；
3. 按计划执行 `writeTextFile` / `removeFile` / `createDirectory`；
4. 全部成功 → 写 `RewindTriggered` 事件（经 `eventStore.append`）；
5. 中途失败 → 走 B4 补偿。

**错误语义**：端口抛错 → 视作该步失败并进入补偿；
**不吞掉**、不只打日志继续。

**时序**：校验 → journal → 执行 → 写事件；四步严格顺序。

**并发**：**同一检查点的并发 apply 必须互斥**（L8/B10）——
用 `rewindId` 的「进行中」登记实现；第二个进入者返回 `already-in-progress` 失败。

**幂等**：重复 apply 同一检查点 → 检测到「已处于目标状态」→ `skipped` 全量，`applied: 0`。

**资源释放**：无（journal 在内存，成功后随结果返回或丢弃）。

**平台**：路径经端口（L10）。

**状态所有者**：journal 归本次 apply 的栈帧；回退事件归 `SessionEventStorePort`。

**日志**：`info` —— `kernel.rewind.applied`（`{ rewindId, applied, skipped, partial }`）；
`warn` —— 部分回退（附失败路径数，不含路径全文）；
`error` —— 补偿失败。

**断言**：

1. 正常回退 → `applied > 0`、`partial: false`，且 port 上 `writeTextFile` 被调用；
2. 漂移 → 拒绝执行（`available: false` 或有明确 reason），**零写入**；
3. 端口在某步抛错 → 已执行的步骤被补偿（B4）；
4. 重复 apply → 第二次 `applied: 0`；
5. 并发 apply 同一检查点 → 第二个失败且消息含 `in progress`。

---

## B4 失败补偿

**输入**：执行中的失败步骤 + 已记录的 `JournalRecord[]`。

**输出**：补偿结果（成功/失败），并入 B3 的 `failures` / `partial`。

**语义**：

```
按 journal 的**逆序**回滚已完成的步骤：
  · 原本 write 的文件 → 写回 journal 记录的原内容
  · 原本 remove 的文件 → 用 journal 记录的原内容重建
  · 原本 create-directory → 尽力删除（失败可容忍，不算补偿失败）
→ 补偿全部成功 → 返回「完整回滚」，报告 partial: false（但 failures 非空）
→ 补偿中途失败 → 报告 partial: true + 保留 journal，明确要求人工处理
```

**⚠️ 不尝试「部分补偿后继续」**：补偿失败即停止，把 journal 交给调用方 ——
继续尝试可能让状态更混乱。

**错误语义**：补偿失败**不抛错**（否则原始失败信息丢失），而是并入结果并记 `error` 日志。

**时序**：严格逆序。

**并发**：补偿在本次 apply 的栈内执行，无跨请求并发。

**幂等**：补偿本身可能不幂等（如 remove 后又 write）→ 所以**只补偿一次**。

**资源释放**：journal 随结果交给调用方（便于人工处理），本包不缓存。

**平台**：同 B3。

**状态所有者**：journal 归本次 apply。

**日志**：`error` —— `kernel.rewind.compensation.failed`（`{ rewindId, failedSteps }`）。

**断言**：

1. 第 2 步失败 → 第 1 步被回滚（端口替身断言写入内容 = 原内容）；
2. 补偿也失败 → `partial: true` 且结果里带 journal；
3. 补偿只覆盖「本次已执行」的步骤（未执行的步骤不补偿）。

---

## B5 补偿的边界

**语义**：补偿**只针对本次 apply 已执行的步骤**。

```text
计划里有 5 步，执行到第 2 步失败
→ journal 只有 2 条（第 1 步完成、第 2 步失败）
→ 补偿回滚第 1 步（第 2 步若已部分写入也要回滚）
→ 第 3-5 步**从未执行** → 不补偿
```

**⚠️ 不碰计划外的文件**：补偿不得读取或修改计划里没有的路径
（否则可能覆盖用户的并发编辑）。

**断言**：

1. 计划 5 步、第 2 步失败 → 只有 2 个路径被补偿操作触及；
2. 计划外的路径零触碰（端口替身断言路径集合）。

---

## B6 漂移检测

**输入**：preview 时记录的 `contentHash`；apply 前重新计算。

**输出**：一致则继续；不一致则拒绝。

**语义**：

```text
preview 记录每个目标文件的 hash（用 file-rewind-storage 的 contentHash）
apply 前再次 stat/readTextFile 计算 hash
→ 不一致（文件被外部改过）→ **拒绝执行**，返回明确的 unavailable 原因
→ 不一致（文件不存在）→ 视作「需要恢复」而不是漂移（因为回退要做的正是恢复）
```

**⚠️ 这是安全相关的**：若用户在 preview 之后编辑了文件，
静默覆盖会**丢失用户的编辑**。所以宁可拒绝。

**错误语义**：返回 `available: false` + `unavailableReason: "files changed since preview"`。

**时序**：apply 的第一步（早于任何写入）。

**幂等**：同输入同输出。

**资源释放**：无。

**平台**：hash 是内容级，与平台无关。

**状态所有者**：hash 归预览结果（由调用方传递或本包内部连调 preview+apply）。

**日志**：`warn` —— `kernel.rewind.drift`（`{ rewindId, changedCount }`，不含路径全文）。

**断言**：

1. 内容不变 → 正常执行；
2. 内容变了 → 拒绝且零写入；
3. 文件被删除 → 不当作漂移（照常恢复）。

---

## B7 会话回退只规划

**输入**：`{ targetMessageId: MessageId; scope?: RewindScope }`。

**输出**：

```ts
{
  scope: "conversation";
  available: boolean;
  targetSequenceNumber?: number;   // ← 交给 DSH 的 session.fork(atSeq) 用
  targetMessageId?: MessageId;
  affectedMessageIds?: MessageId[];  // 会被截断的消息
  unavailableReason?: string;
}
```

**语义**：

- 从事件历史评估目标消息是否可回退（`evaluateRewindTarget` 的语义）；
- 算出「应回退到哪个 sequenceNumber」；
- **不调用 `session.fork`**（L5）—— 本包不 import 任何 DSH 运行时。

**⚠️ 为什么只规划**：

1. fork 是物理分支操作，属会话/协议面；
2. 调它要引入 DSH 运行时依赖，破坏本包的「可离线测试」与 engine-agnostic；
3. 而「算出目标」是本包的独有价值（需要理解消息与事件语义）。

**错误语义**：目标不可回退（如已被压缩覆盖、消息不存在）→ `available: false` + reason。

**时序**：只读事件历史。

**并发**：只读，可并发。

**幂等**：同输入同输出（除非期间有新事件）。

**资源释放**：无。

**平台**：无。

**状态所有者**：事件历史归 `SessionEventStorePort`。

**日志**：`debug` —— `kernel.rewind.planConversation`（`{ targetMessageId, targetSequenceNumber, affected }`）。

**断言**：

1. 可回退的消息 → 返回 `targetSequenceNumber`（数字）；
2. 不可回退 → `available: false` + reason；
3. **源码不出现 `session.fork` / `fork(` 调用**（L5）；
4. 返回值形状**不含**「已执行 fork」的标识（本包不执行）。

---

## B8 检查点事件

**输入**：`createCheckpoint({ messageId, files })` 或回退动作。

**输出**：通过 `eventStore.append` 写入的事件。

**语义**：

```
检查点创建 → append { type: CheckpointCreated, payload: { checkpointId, messageId, fileCount, ... } }
回退动作   → append { type: RewindTriggered, payload: { rewindId, scope, targetCheckpointId?, ... } }
列表/预览  → getEvents / getEventsAfter → 过滤事件类型 → 解析 payload
```

**⚠️ 事件即事实**（L6）：不在本包内维护「第二份检查点列表」——
每次列表都从事件重算。这样避免「事件与缓存不一致」。

**错误语义**：`append` 抛错 → 该操作失败并向上传播（**不静默**）；
读事件抛错 → 明确失败（不返回空列表冒充「没有检查点」）。

**时序**：append 完成即视为「已持久化」；不在内存里先记后写。

**并发**：append 由端口保证顺序（`SessionEventStorePort` 的契约：
「实现方保证按会话追加的顺序可回放」）。

**幂等**：同一 `rewindId` 重复 append → 本包用「进行中登记」挡住（B10）。

**资源释放**：无。

**平台**：无。

**状态所有者**：`SessionEventStorePort`（唯一事实源）。

**日志**：`info` —— `kernel.rewind.checkpoint.created`（`{ checkpointId, fileCount }`）；
`info` —— `kernel.rewind.event.appended`（`{ rewindId, scope }`）。

**断言**：

1. 创建检查点 → `append` 被调用一次且 `type === CheckpointCreated`；
2. 列表 → 从事件读，`append` 零调用；
3. `append` 抛错 → 操作失败（不返回成功结果）；
4. 无本包内部缓存（连续两次 list 都调端口）。

---

## B9 失败语义（fail closed）

**必须明确失败的全部情形**：

1. 端口缺失（`apply` 装配期已抛，见 B1）；
2. 端口方法抛错；
3. 计划为空且**不是**「已处于目标状态」（即无法判定）→ 明确失败；
4. 目标检查点/消息不存在 → `available: false` + reason（**这不是「失败」而是「不可用」**）；
5. 补偿失败 → `partial: true` + 保留 journal。

**⚠️ 区分「不可用」与「失败」**：

```text
available: false  → 用户输入导致的结果（找不到检查点、目标不可回退）
抛错 / failures[] → 程序或 I/O 问题
```

**⚠️ 绝不静默成功**：不得在「没做成」时返回 `applied: 0` 而不带任何 reason。

**日志**：`warn` —— fail closed 触发（附 reasonKind）；`error` —— 端口异常。

**断言**：

1. 端口抛错 → 失败且消息含原因；
2. 目标不存在 → `available: false` 且有 reason（非抛错）；
3. 不存在「`applied: 0` 且无 reason 且 `available: true`」的组合。

---

## B10 幂等与重入

**语义**：

- **重复 apply 同一检查点** → 检测「已处于目标状态」→ `applied: 0`、`skipped` 全量（不重复写）；
- **并发 apply 同一检查点** → 第二个返回 `already-in-progress` 失败；
- **重入 preview** → 无状态，安全。

**实现**：

```ts
const inFlight = new Set<string>();   // rewindId 或 checkpointId
apply 进入 → 若 inFlight.has(key) → 立即失败
           → 否则 add(key)，try/finally 里 delete
```

**⚠️ 不缓存「已完成的回退」**（避免内存增长）；幂等靠「检测当前状态」而非「记住做过」。

**断言**：

1. 重复 apply → 第二次 `applied: 0`；
2. 并发 apply（不 await 第一个就调第二个）→ 第二个失败且消息含 `in progress`；
3. `inFlight` 在失败后也被清理（finally）。

---

## B11 跨平台

**规则**：

- 所有路径**经端口请求对象**传递（`FileSystemPort` 的 `FileSystemReadTextRequest` 等）；
- 本包**只做**「把 `workspaceRoot` 与相对路径组合成绝对路径」这一件事，
  且用注入的 `pathModule`（测试可传 `path.win32` / `path.posix`）；
- **不 `realpath`、不 `stat` 判软链**（端口实现负责平台差异）；
- 不假设 SEP 是 `/` 或 `\`。

**平台差异（由端口实现承担）**：

- Windows 盘符、反斜杠、大小写不敏感、路径长度限制；
- POSIX 正斜杠、大小写敏感、软链。

**断言**：

1. `path.win32` 下组合出的路径与 `path.posix` 不同但都正确；
2. 本包源码不含 `node:path` 的直接使用（除注入的 `pathModule` 类型）；
3. 不出现硬编码的 `/` 或 `\\` 拼接。

---

## B12 工具能力声明

**语义**：本包注册的「文件回退」工具必须声明能力，供 `kernel-plugin-policy` 判定：

```ts
{
  name: "RewindWorkspaceFiles",
  readOnly: false,
  destructive: true,               // 会改/删文件
  sideEffectScope: "workspace",    // 只影响工作区
  riskLevel: "high",               // 破坏性写 → 高风险
  needsApproval: true,             // 默认需要确认
}
```

**⚠️ 为什么本包要声明**：`kernel-plugin-policy` 的 B3 读「工具能力声明」来决定
allow/ask/deny。若本包不声明 → 落到 UNKNOWN 档（非只读 / workspace / 需批准 / medium）——
**语义上仍然安全（需批准），但 `riskLevel` 会偏低（medium 而非 high）**，
可能导致「high 风险才弹窗」的场景不弹。**所以必须显式声明。**

**断言**：

1. 工具声明的 `destructive === true`；
2. `sideEffectScope === "workspace"`；
3. `needsApproval === true`；
4. preview 工具（只读）声明 `readOnly: true` / `destructive: false` / `needsApproval: false`。
