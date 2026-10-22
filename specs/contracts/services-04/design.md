# services-04 设计（替换阶段分工）

## 一、为什么按「层内依赖拓扑」排顺序

本层有 **64 条层内依赖边**、**16 个叶子**、**18 个汇聚点**。
叶子可以并行改，汇聚点必须最后改（因为它们的签名被多个模块依赖）。

**与 `services-03` 的对比**：

| 层                              | 层内边 | 汇聚点 |   叶子 | 替换难度                 |
| :------------------------------ | -----: | -----: | -----: | :----------------------- |
| `services-03`（domain，纯逻辑） |     21 |      6 | **17** | 松耦合、可并行           |
| **`services-04`（app，编排）**  | **64** | **18** |     16 | **紧耦合、依赖顺序敏感** |

---

## 二、四批替换顺序

### 第 1 批：16 个叶子（可完全并行）

```
dataLocationOwner               （真 I/O，3 处 env 债见 K-v-4）
descriptors                     （入度 6 —— 它是叶子，但被 6 个模块依赖！）
memoryDiagnostics               （20 行，最小）
storage-startup                 （5 行）
subagents/subagentMarkdown      （350 行，Markdown 解析）
subagents/subagentModelSelection
subagents/subagentStorage       （真 I/O）
system/integratedTerminalShells （真 I/O，111 行）
system/ssh-alias/query          （真 I/O，child_process）
system/ssh-alias/tokens
system/system-probe/contracts   （入度 3）
terminal/terminalProfileMacOsPlist   （24 行，plist 解析）
terminal/terminalProfileTypes   （入度 6）
terminal/terminalServiceInstanceOwner
window-controller/windowHostControllerProjection       （556 行）
window-controller/windowHostSessionsIndexObserver      （362 行）
```

**⚠️ `descriptors` 与 `terminal/terminalProfileTypes` 虽是叶子，但入度 6（被 6 个模块依赖）** ——
**它们的签名若变，会同时打断 6 个模块**。所以改它们要格外小心，见第 3 批。

### 第 2 批：真 I/O 且入度低的文件（6 个）

```
subagents/subagentServiceFiles.ts     105 行
subagents/subagentServicePlugins.ts   227 行
subagents/subagentServiceState.ts      79 行
subagents/subagentsService.ts         251 行
system/ssh-alias/configuration.ts     108 行
system/sshConfigAlias.ts               38 行
```

**理由**：它们都碰文件系统，但依赖面窄（入度 ≤2）。

### 第 3 批：汇聚点（18 个里剩下的 12 个）

按入度降序（**先改入度低的，后改入度高的**）：

| 入度  | 模块                                                                                                                                                                                                                                                                                                                                                                                                                    |
| :---: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6** | `descriptors` · `terminal/terminalProfileTypes` ← **最后两个**                                                                                                                                                                                                                                                                                                                                                          |
|   3   | `subagents/subagentStorage` · `system/system-probe/contracts` · `terminal/terminal` · `terminal/terminalProfilePortablePlan`                                                                                                                                                                                                                                                                                            |
|   2   | `subagents/subagentMarkdown` · `subagents/subagentModelSelection` · `subagents/subagentServiceFiles` · `subagents/subagents` · `system/ssh-alias/configuration` · `system/ssh-alias/tokens` · `system/system` · `terminal/terminalProfile` · `usage-stats/usageStats` · `window-controller/windowController` · `window-controller/windowHostControllerProjection` · `window-controller/windowHostSessionsIndexObserver` |

**⚠️ 注意重叠**：有些模块既是叶子又是汇聚点（如 `descriptors`、`terminal/terminalProfileTypes`）——
**它们是「被依赖但不依赖别人」的纯接口型模块**，可以第 1 批改，但要保证签名不变。

### 第 4 批：最大的三个（1,000+ 行）

```
window-controller/windowHostControllerService.ts   805 行（单文件最大）
window-controller/windowHostControllerProjection.ts 556 行
window-controller/windowHostSessionsIndexObserver.ts 362 行
```

**理由**：`window-controller/` 组共 1,805 行（占本层 32%），且**对 `services-01`(agent)
与 `services-03`(session) 有 6 处跨包依赖**（见 B8）—— 改动风险最高，放最后。

---

## 三、替换时必须保住的三类隐式契约

### 3.1 I/O 的分类不能变（B4）

- **真 I/O 只能出现在 4 个组**：`system/` / `subagents/` / `terminal/` / `.`；
- **纯工具模块**（`node:path` / `os` / `util` / `crypto`）不受限；
- **`usage-stats/` 必须零 I/O**。

**若替换时把某个纯工具模块改成用 `node:fs`** → B4a 会失败。

### 3.2 模块级副作用不能新增（B5）

- **顶层 `await` 必须 0**；
- **模块级 `const X = <调用>()` 冻结 6 处**；
- **`process.env` 冻结 8 个文件**。

**特别提醒**：`dataLocationOwner.ts` 的 3 处 env 快照是**技术债**（K-v-4）——
**替换时应改为注入式**，但**必须同步更新 B5b / B5c 的冻结清单**，否则测试会红。

### 3.3 层内依赖拓扑不能变（B7）

**64 条边逐条冻结** —— 新增或减少任何一条都会失败。
（重构时可以调整模块内部结构，但**不能改变「谁依赖谁」**。）

---

## 四、允许的实现层差异（见 `known-differences.md` §1）

| 面       | 允许差异                                   |
| :------- | :----------------------------------------- |
| 文件组织 | 可按功能组重组内部结构，但**模块路径不变** |
| 内部实现 | 全量自写，与旧代码完全不同                 |
| 辅助函数 | 集中在功能组内组织                         |

---

## 五、验收

见 `acceptance.md`。**核心判据**：

```
源码 35/35 + dist 35/35 + 桩替换 35/35 全部失败（allFail=true）
```

**⚠️ 替换完成后，需要重新审的两处**：

1. **`window-controller/node.ts`**（K-w）：它转发的 3 个实现文件必须继续存在；
   若替换时决定「接线」它，需更新 `dependencies.test.mjs` 的 B10 断言（未证明者从 1 个变 0 个）。
2. **`failureKinds`**：替换后若某些用例从「加载失败」变成「断言失败」，
   说明 `ensureLoadable()` 的覆盖变了 → 需重跑 `classify-failures.mjs`。

---

## 六、与相邻包的边界

| 范围                                       | 归属                                 |
| :----------------------------------------- | :----------------------------------- |
| `studio-runtime/domain/`（31 文件）        | `services-03`（已合并 #267）         |
| `studio-runtime/` 根级 13 文件 + 4 端口    | `services-02`（已合并 #265）         |
| `studio-runtime/app/`（45 文件）           | `services-05`～`services-06`（待定） |
| `studio-runtime/adapters/`（60 文件）      | `services-07` / `08`（待定）         |
| **本包（`src` 根 + 5 个子目录，46 文件）** | **`services-04`**                    |
| 两个聚合桶 `index.ts` / `node.ts`          | **不属任何实现包**（K-z）            |
