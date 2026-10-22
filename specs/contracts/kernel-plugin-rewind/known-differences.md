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
合同验收要求：用旧实现产出的 hash 样本 + 新实现，断言两者相等。

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

## K7 回退计划显式记录 `expectedHash`（旧实现隐式）

**旧实现**：先 preview，再 apply 时**重新算**一次计划（没有跨阶段的 hash 记录）。

**新实现**：preview 的每个操作带 `expectedHash`，apply 前比对（B6 漂移检测）。

**理由**：

```
旧实现：preview 与 apply 之间用户可能编辑了文件 → apply 会静默覆盖
新实现：发现 hash 不一致 → 拒绝执行 → **不丢失用户的编辑**
```

**⚠️ 这改变了一个可观测行为**：
旧实现「preview 后编辑文件仍能 apply」，新实现「拒绝」。
**这是刻意的安全收紧**（用户可重新 preview 再 apply）。

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
