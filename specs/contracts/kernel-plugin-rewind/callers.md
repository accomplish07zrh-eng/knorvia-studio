# kernel-plugin-rewind 调用方（callers.md）

**合同版本：v1**（2026-10-22）

本文件列出旧实现（`core/src/runtime/methods/` 下 9 个 rewind 相关文件）的调用点，
并说明它们在新运行时下的归宿。

**迁移性质**：这些调用点**不直接迁移**（`core` 随 `kernel-switch` 删除）。
它们的**行为**由本包的 B 条目承接；**装配**由组合根接管。

---

## 一、旧实现的调用点

```bash
# 检索命令（仓库根）
git grep -ln 'listWorkspaceCheckpoints\|forkWorkspaceFromCheckpoint\|rewindWorkspaceToCheckpoint\|executeRewindCommand\|planConversationRewind' \
  -- apps packages
```

### 1.1 门面层委托（`bootstrap/src/app/session-facade.ts`）

```ts
// L384-392
listCheckpoints: async (options) => {
  return deps.runtime.listWorkspaceCheckpoints(options);       // ← 纯委托
},
forkFromCheckpoint: async (options) => {
  return deps.runtime.forkWorkspaceFromCheckpoint({            // ← 纯委托
    targetCheckpointId: options?.targetCheckpointId,
    ...
  });
},
```

**⚠️ 结论：门面层没有自己的展示逻辑，只做委托。**
所以「读旧检查点用于展示」**不存在「独立于 core 的展示实现」** ——
展示能力就在本包要重写的 `listCheckpoints` / `loadCheckpointPreviews` 里。

### 1.2 方法注册（`core/src/runtime/methods/index.ts`）

```ts
// L143-152 导入
import { restoreWorkspaceCheckpointArtifact } from "./workspace-checkpoints.js";
import { listWorkspaceCheckpoints } from "./workspace-checkpoints.js";
import { loadCheckpointMessagePreviews } from "./workspace-checkpoints.js";

// L345-352 挂到原型
proto.restoreWorkspaceCheckpointArtifact = restoreWorkspaceCheckpointArtifact;
proto.listWorkspaceCheckpoints = listWorkspaceCheckpoints;
proto.loadCheckpointMessagePreviews = loadCheckpointMessagePreviews;
```

**归宿**：`proto.*` 挂载方式随 `core` 删除；新实现由 `apply()` 返回的
`RewindPluginHandle` 暴露同名能力（`interface.md` §1.3）。

### 1.3 运行时 API 声明（`core/src/runtime/agent-runtime-api.ts` / `internal-turn-methods.ts`）

这两个文件**声明**了 `listWorkspaceCheckpoints` / `restoreWorkspaceCheckpointArtifact` /
`loadCheckpointMessagePreviews` 的签名（接口层）。
**随 `core` 删除**；新签名见 `interface.md` §1.3。

### 1.4 v4 协议命令面（`bootstrap/src/protocol-v4/` 、`kernel-bridge/`）

旧实现通过 `executeRewindCommand` 处理 `/rewind` 命令。
**新运行时下**：v4 命令面归 `kernel-bridge`（#249 已交付 34 条命令）；
它调本包 `handle.previewFileRewind` / `applyFileRewind` / `planConversationRewind`。

**⚠️ 这是本包最重要的接缝**：v4 的 `/rewind` 命令 → 本包 → 返回结果或 plan。
**而「执行会话 fork」由 `kernel-bridge` 自己做**（拿本包的 `targetSequenceNumber`）。

### 1.5 TUI / 客户端（`tui`、`ui` 的 `/rewind` 展示）

只消费 v4 响应（检查点列表、回退结果），**不直接 import core**。
**所以不受本包影响**；只要 v4 响应字段保持，客户端无需改动。

---

## 二、按「新运行时的生效路径」重新归类

旧实现的调用链是**直接方法调用**：

```text
session-facade.ts ──> deps.runtime.listWorkspaceCheckpoints() ──> core 的实现
```

新运行时是**插件 handle + 端口**：

```text
v4 命令面（kernel-bridge） ──> handle.previewFileRewind / applyFileRewind
                                └─> FileSystemPort（读/写文件）
                                └─> SessionEventStorePort（读/写事件）
                                  ──> 返回结果给 v4 帧
```

**所以「调用方」在新运行时下是**：

1. **`kernel-bridge`**（v4 命令面）—— 调本包 handle，拿结果或 plan；
2. **组合根** —— 装配本包、注入两个端口；
3. **测试** —— 直接调 handle 或纯函数。

**⚠️ 本包没有被「包外 import」的调用方**（除测试与组合根） ——
与 `kernel-plugin-policy` 相同，这是接入包与普通库包的区别。

---

## 三、旧实现的包外引用密度（`git grep` 计数）

| 旧导出                                               | 包外引用 | 说明                                                                  |
| ---------------------------------------------------- | -------: | --------------------------------------------------------------------- |
| `listWorkspaceCheckpoints`                           |        3 | `session-facade.ts` / `internal-turn-methods.ts` / `methods/index.ts` |
| `loadCheckpointMessagePreviews`                      |        3 | 同上                                                                  |
| `restoreWorkspaceCheckpointArtifact`                 |        3 | 同上                                                                  |
| `forkWorkspaceFromCheckpoint`                        |        2 | `session-facade.ts` / `methods/index.ts`                              |
| `rewindWorkspaceToCheckpoint`                        |        1 | `methods/index.ts`（内部编排）                                        |
| `executeRewindCommand`                               |        1 | `methods/index.ts`                                                    |
| `planConversationRewind` / `applyConversationRewind` |        1 | `rewind-message.ts`（内部）                                           |

**⚠️ 工具假阴性说明**：`git grep` 基于文本，**不覆盖**动态 `import()` 与
「通过 `proto.*` 反射调用」。上述数字已与 `methods/index.ts` 的原型挂载交叉核对。

---

## 四、与相邻包的实际接缝（不是 import，而是运行时协作）

| 接缝对象                     | 协作方式                                                                | 方向                  |
| ---------------------------- | ----------------------------------------------------------------------- | --------------------- |
| `kernel-bridge`（v4 命令面） | 调本包 handle；拿 `ConversationPlan.targetSequenceNumber` 自己执行 fork | 双向                  |
| `kernel-plugin-policy`       | 本包产出「工具能力声明」；policy 读它判定 allow/ask/deny                | 本包 → policy（数据） |
| `kernel-legacy-sessions`     | 读旧会话库里的检查点用于展示（规格 L100）                               | 独立（不互相调）      |
| 组合根                       | 注入 `FileSystemPort` + `SessionEventStorePort` + `workspaceRoot`       | 组合根 → 本包         |

**⚠️ 本包不被任何包 `import`**（除测试与组合根）。
