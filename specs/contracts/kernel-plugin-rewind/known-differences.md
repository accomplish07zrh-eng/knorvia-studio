# kernel-plugin-rewind 已知差异（known-differences.md）

**合同版本：v1**（2026-10-22）

本文件记录「新实现与旧实现（`core/src/runtime/methods/` 下 9 个文件）」的**有意差异**。
**任何未列在此处的行为差异都视为缺陷。**

---

## K1 文件系统 I/O 从「直连 `fs`」改为「注入 `FileSystemPort`」

**旧实现**（`file-rewind-storage.ts` / `file-rewind.ts` / `rewind.ts`）：
直接 `import` `node:fs` 做 `readFile` / `writeFile` / `unlink` / `mkdir`。

**新实现**：全部经 `FileSystemPort`（`contracts` 已有）。

**理由**：

1. `apps/cli/AGENTS.md` 明确要求「除入口层、基础设施层和 adapter 外，
   业务模块不得直接调用 `fs`」；
2. 复用端口能保证跨平台路径、编码、错误语义与其他模块一致；
3. **测试可用端口替身** → 不碰真实磁盘 → 更快更稳（这是直接收益）。

**⚠️ 这是本包与旧实现最大的结构差异** ——
旧代码的 49 行 `file-rewind-storage.ts` 全部是 fs 操作，新实现变成「端口调用 + hash 计算」。

**差异点（有意）**：

| 旧实现                      | 新实现                                                                |
| --------------------------- | --------------------------------------------------------------------- |
| `readFile(path)` 直接读     | `fileSystem.readTextFile({ path })`                                   |
| 抛原生 `ENOENT`             | 端口返回 `FileSystemPortError`（本包用 `isFileSystemPortError` 判断） |
| 自己处理 Windows/POSIX 差异 | 端口实现处理（本包只组合 `workspaceRoot + relativePath`）             |

---

## K2 `workspaceRoot` 成为必需配置（旧实现隐含依赖 `process.cwd()`）

**旧实现**：相对路径按 `this.workspacePath` 或 `process.cwd()` 解析（散落多处）。

**新实现**：`config.workspaceRoot` **必需**，装配期校验。

**理由**：

1. 本包不读 `process.cwd()`（那是全局状态，违反「业务模块不直接读 `process.env`/全局」）；
2. 显式注入让「回退哪个工作区」在装配期就确定，而不是运行期漂移；
3. **`workspaceRoot` 缺失 → 装配期抛错**（早失败）。

**⚠️ 这带来一个接线要求**：组合根必须为每个 session 提供其 `workspacePath`。
若一个组合根服务多个 session，则要用 `Map<sessionId, workspaceRoot>` 或按 session 建多个插件实例。

---

## K3 `contentHash` 的算法与旧实现必须一致（数据兼容）

**旧实现**（`file-rewind-storage.ts`）：

```ts
export function contentHash(content: string | null): string;
```

**新实现**：**同一算法**（用于 B6 漂移检测，以及旧检查点里的 hash 比对）。

**⚠️ 为什么必须一致**：

```
旧检查点事件里存了每个文件的 hash
→ 新实现若用不同算法 → 「旧检查点的 hash」与「新算出的 hash」永远不等
→ 会被误判为「文件漂移」→ 拒绝回退
→ **所以算法必须逐字节相同**
```

**⚠️ 而这是本包唯一「必须与旧实现逐字节一致」的地方** ——
不是代码照搬，而是**输出格式兼容**（属于「数据契约」而非「实现表达」）。

### K3.1 旧实现的精确语义（逐字节，验收必须照此断言）

```ts
// core/src/runtime/methods/file-rewind-storage.ts（旧实现原文）
import { createHash } from "node:crypto";

export function contentHash(content: string | null): string {
  return content === null ? "missing" : createHash("sha256").update(content).digest("hex");
}
```

**三条必须逐字节一致的语义**：

| 输入             | 输出                                                                                 | 说明                                               |
| ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `null`           | 字面量 `"missing"`                                                                   | **不是**空字符串、不是 `"null"`、不是 `sha256("")` |
| `""`（空字符串） | `sha256("")` = `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`    | **与 `null` 严格区分**                             |
| `"abc"`          | `sha256("abc")` = `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad` | 已知定值，可作固定断言                             |

**⚠️ 三个边界必须都断言**：`null` / `""` / 普通内容。
只测 `"abc"` 会漏掉「`null` 与 `""` 被混淆」这个最危险的情形 ——
若新实现把 `null` 也送去 hash，就会得到 `sha256("")` 而不是 `"missing"`，
于是**所有「文件已删除」的检查点比对都会失败**。

**⚠️ 编码**：`createHash("sha256").update(content)` 对 `string` 默认按 **UTF-8** 编码。
所以新实现读取文件内容时也必须按 UTF-8（`FileSystemPort.readTextFile` 的
`encoding` 字段要显式传 `"utf-8"`，**不依赖端口默认值** —— 否则端口若换成 UTF-16
就会让所有 hash 不匹配）。

**⚠️ 关于 `node:crypto` 的合规性**：`apps/cli/AGENTS.md` 的禁止清单是
`fetch` / `http` / `fs` / `child_process` / `process.env`，**不含 `crypto`**；
且 `crypto` 不参与外部 I/O（只做内存计算）。
→ **所以 `contentHash` 直接 `import { createHash } from "node:crypto"` 是合规的**，
与旧实现一致，不需要抽象成端口。

### K3.2 验收样本来源

**旧实现产出的真实样本**（`core/test/` 下的 6 个夹具，共 **31 个 sha256 样本**）：

| 夹具                                                   |        大小 | sha256 样本数 |
| ------------------------------------------------------ | ----------: | ------------: |
| `runtime-file-rewind-baseline-20261003.json`           | 42,958 字节 |             3 |
| `runtime-file-rewind-boundary-proof-20261003.mjs`      |  7,252 字节 |             5 |
| `runtime-rewind-baseline-20261003.json`                | 80,822 字节 |             6 |
| `runtime-rewind-current-20261003.json`                 |  1,431 字节 |            12 |
| `runtime-rewind-safety-20261003.test.mjs`              |  2,815 字节 |             2 |
| `runtime-workspace-checkpoints-baseline-20261003.json` | 24,873 字节 |             3 |

**⚠️ 这些夹具在 `core/test/` → 会随 `core` 删除**，所以本包必须**复制**副本到
`bootstrap/test/fixtures/`（不是引用），并在副本的 README 里注明来源：

```
样本来源：apps/cli/packages/core/test/<file>（已随 core 删除，本包保留副本）
用途：K3（contentHash 兼容）与 K8（事件 payload 兼容）的验收断言
```

**⚠️ 而「`"missing"` 字面量在夹具里零出现」也是一个发现**：
说明现有夹具**不覆盖「文件不存在」的场景**。
→ 所以 K3 的 `null → "missing"` 断言**不能只靠夹具样本**，还要用
「`contentHash(null)` 的定值断言」（见 K3.1 表格）。

---

## K4 会话回退：`planConversationRewind` 保留，`applyConversationRewind` 不迁移

**旧实现**：

- `planConversationRewind`（算目标）
- `applyConversationRewind`（**执行**会话回退）

**新实现**：

- `planConversationRewind` → **保留**（`conversation-plan.ts`）
- `applyConversationRewind` → **不迁移**

**理由**：

1. 规格 L73 明确：会话回退归 DSH 的 `session.fork(atSeq)`；
2. 「算目标」是本包的独有价值（需理解消息与事件语义），「执行 fork」是 DSH 的能力；
3. 若本包执行 fork，就要引入 DSH 运行时依赖 → 破坏「纯逻辑 + 可离线测试」。

**⚠️ 这是「能力切分」而非「功能缺失」** ——
会话回退仍然可用，只是执行者从本包换成 `kernel-bridge` / `kernel-legacy-sessions`。

---

## K5 `forkWorkspaceFromCheckpoint` / `copySessionMessagesForFork` 不迁移

**旧实现**（`workspace-checkpoints.ts`）：
这两个函数是「从检查点 fork 出新会话」的一部分。

**新实现**：**不迁移**。

**理由**：同 K4 —— 「fork」是会话面操作，归 DSH。
**而 `fork` 前的「准备」（找出目标检查点、算出 seq）已在
`planConversationRewind` 与 `listCheckpoints` 里提供。**

---

## K6 补偿策略：从「尽力继续」改为「失败即停 + 交 journal」

**旧实现**（`file-rewind-storage.ts` 的 `compensate`）：
逐条回滚，遇到失败**继续尝试后续回滚**。

**新实现**：**补偿失败即停**，把 journal 交给调用方并报告 `partial: true`。

**理由**：

1. 补偿本身失败说明「文件系统状态异常」→ 继续尝试可能让状态**更混乱**；
2. 交给调用方（UI 可展示「部分回退，需要人工检查这些文件」）比静默继续更负责；
3. 与规格「不能用超时/兜底掩盖未解决的状态问题」一致。

**⚠️ 这是安全相关的有意差异** —— 宁可「明确报告部分失败」，也不「假装补偿成功」。

---

## K7 回退前校验文件未被改动（安全收紧，**产品行为变化**）

**旧行为**：preview 之后用户编辑了文件 → apply 时**静默覆盖**（用户的编辑丢失，无任何提示）。

**新行为**：apply 时比对 `expectedHash` → **不一致则拒绝回退**，返回
「文件已改动，请重新预览」（`available: false` + 明确 reason）。

**影响（必须写进用户可见的变更说明）**：

| 场景                     | 旧行为                 | 新行为                              |
| ------------------------ | ---------------------- | ----------------------------------- |
| preview 后未改动         | 正常回退               | 正常回退（无差异）                  |
| preview 后用户编辑了文件 | **静默覆盖，编辑丢失** | **拒绝回退**，提示重新预览          |
| preview 后文件被删除     | （视实现）报错或覆盖   | 视作「需恢复」，照常执行（B6 明确） |

**⚠️ 这是「多一步操作」换「不丢数据」的取舍**：
用户若确认要覆盖 → 重新 preview（新 `expectedHash` 是最新的）再 apply 即可。
**多一步，但不会丢失编辑。**

**理由**：

1. 回退是**破坏性操作**，「拒绝」比「静默覆盖」安全；
2. 旧行为的「静默覆盖」在用户视角是「我的编辑莫名消失了」—— 属于数据丢失类缺陷；
3. 与规格「不能用兜底掩盖未解决的状态问题」一致：宁可让用户重新确认，也不猜。

**⚠️ 这是本包唯一「用户可感知的行为收紧」** ——
所以 `acceptance.md` §7 的风险表把它列为 R5（原先编号）并要求在
`known-differences` 与 PR 描述里都写明。

**等价替代路径（给用户/文档用）**：

```
旧：preview → 编辑文件 → apply（覆盖）
新：preview → 编辑文件 → apply（拒绝，提示已改动）→ 重新 preview → apply
```

---

## K8 事件类型与 payload 必须与旧实现兼容（数据契约）

**旧实现**写入的事件：

```ts
SessionEventType.CheckpointCreated    payload: CheckpointCreatedPayload
SessionEventType.RewindTriggered      payload: RewindTriggeredPayload
SESSION_ENTRY_WORKSPACE_CHECKPOINT
SESSION_ENTRY_WORKSPACE_FILE_REWIND
```

**新实现**：**同一事件类型与 payload 形状**（不新增事件类型、不改字段）。

**理由**：

```
旧会话的 session event store 里已有这些事件
→ 新实现若用新事件类型 → 旧检查点读不到
→ 而规格 L100 说「读取工作区检查点以供展示」属保留范围
→ **所以事件格式必须兼容**
```

**⚠️ 与 K3 同理**：这是**数据契约**兼容，不是代码照搬。

### K8.1 验收样本与断言方式

**必须兼容的四类标识**（新实现解析旧事件时逐字匹配）：

```ts
SessionEventType.CheckpointCreated; // 检查点创建
SessionEventType.RewindTriggered; // 回退动作
SESSION_ENTRY_WORKSPACE_CHECKPOINT; // 检查点条目（session entry 类型）
SESSION_ENTRY_WORKSPACE_FILE_REWIND; // 文件回退条目
```

**payload 解析器**（新实现要用与旧实现相同的校验强度）：

```ts
// 旧实现（workspace-checkpoint-persistence.ts）的校验形状
interface PersistedWorkspaceEventData {
  eventId: string;
  payload: unknown;
  sequenceNumber: number;
  traceId: string;
  turnId?: string;
}
// 校验规则：六项类型检查，任一不符返回 null（不抛错、不猜）
```

**⚠️ 新实现必须保留这个「不合格返回 null」的语义** ——
若改成抛错，那么「读到一条不合规的历史事件」会让整个检查点列表失败，
而旧实现是「跳过该条」。**这是可观测行为差异，必须一致。**

**样本来源**：同 K3.2 的 6 个夹具（`runtime-workspace-checkpoints-baseline-20261003.json`
含检查点事件的基线形状；`runtime-rewind-baseline-20261003.json` 含回退事件的）。
**同样要复制副本到 `bootstrap/test/fixtures/` 并注明来源。**

---

## K9 工具声明成为必需（旧实现无「工具」概念）

**旧实现**：`/rewind` 是 CLI 命令，**没有「工具能力声明」**。

**新实现**：注册两个 DSH 工具（`PreviewWorkspaceRewind` / `RewindWorkspaceFiles`），
并**声明能力**供 `kernel-plugin-policy` 判定（B12）。

**理由**：

1. 新内核的模型通过「工具」调用能力，而不是 CLI 命令；
2. 而工具必须声明 `readOnly` / `destructive` / `sideEffectScope` / `riskLevel`，
   否则 policy 会落到 UNKNOWN 档（`riskLevel: "medium"`）导致高风险场景不弹窗。

**⚠️ 这是「形态变化」而非「行为变化」** —— 回退能力对用户仍可用；
但「通过什么入口触发」从「CLI 命令」变成「工具 + v4 命令」两条路。

---

## K10 检查点的文件清单来自 artifactStore，**不在事件 payload 里**

### 旧实现

`CheckpointCreatedPayload` 只带 **`snapshotRef`（一个 URI 引用）**，文件内容通过
**第三个端口**读取：

```ts
// core/src/runtime/methods/file-rewind-planning.ts:167-170
let artifact: WorkspaceCheckpointArtifact;
const result = await runtime.artifactStore.readToolResultArtifact(
  { uri: checkpoint.snapshotRef, trace },
  ...
);
```

**而 `artifactStore` 在旧实现里是可选端口**：

```ts
// core/src/runtime/internal.ts:108
artifactStore?: ToolArtifactStorePort;
```

缺失时旧实现返回：

```ts
unavailableFile("workspace", "checkpoint_unreadable", "ArtifactStore is not configured.");
```

### 新实现

同一机制（第三个端口 `ToolArtifactStorePort`，**可选**，见 interface.md §2.3）。

**按能力分级依赖**：

| 能力                     | 需要 artifactStore | 缺失时                               |
| ------------------------ | :----------------: | ------------------------------------ |
| `listCheckpoints`        |         ❌         | 正常返回（只读事件）                 |
| `planConversationRewind` |         ❌         | 正常返回（只读事件）                 |
| `previewFileRewind`      |         ✅         | `available: false` + 明确原因（B9）  |
| `applyFileRewind`        |         ✅         | `unavailableReason` 同上，**零写入** |

### ⚠️ 这是「实现阶段发现的合同遗漏」

**我最初的合同（v1 初稿）误以为「artifact 内联在事件 payload 的 `artifact` 字段里」**，
并据此写了实现。而写测试时被 **schema 自校验**立刻拦住：

```
ZodError: unrecognized_keys: ["artifact"]
message: "Unrecognized key(s) in object: 'artifact'"
```

因为 `checkpointCreatedPayloadSchema` 是 **`.strict()`** 的 —— **内联在 schema 层就被拒绝**。

**所以**：

1. 合同补了 interface.md §2.3（第三个端口）；
2. 实现改为「从 artifactStore 按 `snapshotRef` 读」；
3. **测试夹具保留 schema 自校验** —— 它正是发现这个遗漏的工具。

**⚠️ 判据（供方法论记录）**：**测试夹具必须过生产 schema**（`Schema.parse(fixture)`），
不要手写 JSON。因为「假绿」比「红」更危险 —— 它让人以为已经验证过。

---

## 汇总表

|  #  | 差异                             | 性质         | 风险                                   |
| :-: | -------------------------------- | ------------ | -------------------------------------- |
| K1  | fs I/O → `FileSystemPort`        | 结构差异     | **中**（测试需端口替身）               |
| K2  | `workspaceRoot` 必需             | 接线要求     | 低（早失败）                           |
| K3  | `contentHash` 算法必须一致       | **数据契约** | **高**（不一致会导致旧检查点误判漂移） |
| K4  | `applyConversationRewind` 不迁移 | 能力切分     | 低（DSH 提供）                         |
| K5  | fork 相关导出不迁移              | 能力切分     | 低（同上）                             |
| K6  | 补偿失败即停                     | **安全差异** | 低（更负责）                           |
| K7  | 显式 `expectedHash` + 漂移拒绝   | **安全收紧** | 低（可观测行为变化）                   |
| K8  | 事件类型与 payload 兼容          | **数据契约** | **高**（不一致会读不到旧检查点）       |
| K9  | 工具声明必需                     | 形态变化     | 低                                     |

**⚠️ 两个高危项（K3 / K8）都是「数据契约兼容」** ——
它们不是「实现选择」，而是「既有数据能不能被新代码读」的问题。
**合同验收要求：用旧实现产出的 hash 样本与事件样本，断言新实现能正确读取。**
