# kernel-plugin-rewind 合同（文件回退与工作区检查点）

**合同版本：v1**（2026-10-22）

本目录是 M2 接入包 `kernel-plugin-rewind` 的合同。它冻结三件事：**文件回退的预览与执行语义**、
**工作区检查点的读写与恢复协议**、**与会话回退（归 DSH）的边界**。

- 分支：`contract/kernel-plugin-rewind`（基线 `origin/main` `d6f573c0`，含
  `kernel-dsh-builtins` #228、`kernel-bridge-01/02/03` #218/#236/#249、
  `kernel-bridge-legacy` #230、`kernel-plugin-credentials` #254、
  `kernel-plugin-hooks` #291、`kernel-plugin-policy` #292）
- 认领 issue：**#286** 的同系列（M2 接入包）
- 前置合同：[`kernel-plugin-policy`](../kernel-plugin-policy/README.md) v1（同形态的接入包模板）、
  [`kernel-plugin-credentials`](../kernel-plugin-credentials/README.md) v1（双引擎下的插件形态）
- 依据：`specs/knorvia-builtin-kernel-dsh.md`（能力映射 L73 会话回退 / L74 文件回退 / L100 保留范围）、
  `specs/knorvia-internal-plugins.md` 内核层、计划书「内核方案调整」「接入包流程」
- 事实来源：`@deepseek-ai/dsh@0.2.0-rc.2` 的**公开类型**（`dsh-tools` 的 `defineTool`、
  `dsh-session*` 的 fork 能力）、旧实现
  `core/src/runtime/methods/{rewind,file-rewind*,workspace-checkpoint*}.ts`
  （**仅作行为取证**）、`contracts` 的两个端口（`SessionEventStorePort` / `FileSystemPort`）。
  **不读 DSH 源码仓库、不改 DSH。**

---

## 一、范围

### 1. 本包做什么

1. **文件回退（preview）**：给定一条消息或一个检查点，算出「哪些文件会被改成什么」，
   返回可展示的预览（不触碰磁盘）。
2. **文件回退（apply）**：执行预览描述的操作（写回 / 删除 / 重建目录），
   并在中途失败时**补偿已完成的步骤**，保证要么全成要么可回退到操作前状态。
3. **工作区检查点**：把「当前工作区文件状态」记录为一个检查点事件，支持
   列表、消息预览、从检查点恢复 artifact。
4. **级联回退**：把「文件回退 + 会话状态回退到某条消息」编排成一个动作
   （**会话侧只算目标，不执行 fork**，见 §一 2）。
5. 合同测试全部走**公开插件入口**；文件系统与事件存储都用**端口替身**，
   不碰真实磁盘、不碰真实数据库。

### 2. 本包不做什么

| 不做的事                                                 | 归属                                       | 依据                                                      |
| -------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| **执行会话回退（`session.fork(atSeq)`）**                | `kernel-bridge` / `kernel-legacy-sessions` | 规格 L73：会话回退归 DSH 的 `session.fork(atSeq)`         |
| 实现 `session-fork*.ts`（3 个文件）                      | 同上                                       | 不在本包范围；本包只「算出目标 seq/消息」                 |
| 修改 `contracts` 的两个端口定义                          | 冻结面                                     | 本包只**消费** `SessionEventStorePort` / `FileSystemPort` |
| 实现文件系统的平台差异（Windows/POSIX 路径、编码、权限） | `adapters/fs`（保留）                      | 本包只调 `FileSystemPort`，平台差异由实现方负责           |
| 实现事件存储的持久化（内存 / SQLite / DSH 适配）         | 组合根注入的实现                           | 本包只调 `SessionEventStorePort`                          |
| 读「旧会话库」里已有检查点用于展示                       | `kernel-legacy-sessions`                   | 规格 L100：旧库读取属保留范围                             |
| 改 `bootstrap/src/kernel/**`（组合行、插件组合）         | `kernel-dsh-builtins` / `kernel-switch`    | 冻结面                                                    |
| 改 `core/src/**`（旧实现）                               | 随 `kernel-switch` 删除                    | 规格「现有包的去向」                                      |
| 用户权限判定（回退工具是否需要确认）                     | `kernel-plugin-policy`                     | 权限归 policy；本包只需声明工具的能力（见 §四 B12）       |

### 3. 关键边界：会话回退只「规划」不「执行」

```text
本包：算出「该回退到哪个 sequenceNumber / 哪条 messageId」（planConversationRewind）
      ↓ 通过公开 API 暴露结果
别人：kernel-bridge 或 kernel-legacy-sessions 调 DSH 的 session.fork(atSeq) 执行物理 fork
```

**为什么这样切**（Lead 2026-10-22 裁决）：

1. DSH 的 `session.fork(atSeq)` 是**物理分支**操作，属协议面/会话面，不属「文件回退」；
2. 本包只依赖两个端口，**不 import 任何 DSH 运行时** —— 保持 engine-agnostic 与可离线测试；
3. 若本包直接调 fork，就要引入 DSH 依赖，把「纯逻辑包」变成「运行时耦合包」。

---

## 二、现状与缺口（实测）

### 1. 旧实现的文件构成（`core/src/runtime/methods/`，9 个文件 1998 行）

| 文件                                  | 行数 | 职责                                                 | 分类                |
| ------------------------------------- | ---: | ---------------------------------------------------- | ------------------- |
| `rewind.ts`                           |  359 | `/rewind` 命令入口 + 状态文案 + 工作区回退编排       | `upstream-modified` |
| `workspace-checkpoints.ts`            |  302 | 检查点列表 / 消息预览 / artifact 恢复 / fork 前置    | `upstream-modified` |
| `file-rewind-planning.ts`             |  292 | 回退计划（哪些文件、什么操作）                       | `unreviewed`        |
| `rewind-conversation-state.ts`        |  272 | 会话状态回退的**规划**（算目标 seq/消息）            | `unreviewed`        |
| `workspace-checkpoint-persistence.ts` |  235 | 检查点/文件回退事件的 persist / restore              | `upstream-modified` |
| `rewind-workspace-cascade.ts`         |  211 | 工作区级联回退到某条消息                             | `unreviewed`        |
| `file-rewind.ts`                      |  164 | preview / apply 文件回退                             | `upstream-modified` |
| `rewind-message.ts`                   |  114 | **路由器**（按 scope 分派 workspace / conversation） | `upstream-modified` |
| `file-rewind-storage.ts`              |   49 | 文件状态读取 / hash / 补偿                           | `unreviewed`        |

**⚠️ 分类来源**：`licensing/current-files.json` 的 `classification` 字段。
**5 个 `upstream-modified` + 4 个 `unreviewed`，且 `review` 全为 `null`** ——
即「有 inventory 记录与分类，但从未在 `reviews.json` 建立 review 条目」。

**⚠️ 这决定处理方式**：

- `upstream-modified` = **继承自 ZCode 的代码且已有本地改动** → 必须替换；
- `unreviewed` = 未审查 → 按「可能继承」处理；
- **两者都不是 `original`** → 所以本包是**返工**，不是新写。

**基线**：`--old <同路径> --old-rev beff12b5`（当前 main 上的版本就是「重写前」状态）。

### 2. DSH 侧的关键事实

**a) DSH 有会话 fork，没有文件/工作区回退**

规格 L73 明确：`fork、编辑重发（会话回退）→ DSH 进程内 session.fork(atSeq)`。
规格 L74 明确：`文件回退、工作区检查点 → Knorvia 文件回退插件（DSH 无对应能力时）`。

**所以本包是「DSH 无对应能力」的那一类** —— 需自己实现回退逻辑，
而**会话那一侧由 DSH 提供**。

**b) 本包不直接依赖 DSH，只依赖两个 contracts 端口**

| 端口                    | 定义位置                                           | 本包用途                                                                                        |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `SessionEventStorePort` | `contracts/src/interfaces/session.port.ts:278`     | `append` 写检查点/回退事件；`getEvents` / `getEventsAfter` 读历史                               |
| `FileSystemPort`        | `contracts/src/interfaces/file-system.port.ts:338` | `readTextFile` / `stat` 读当前状态；`writeTextFile` / `removeFile` / `createDirectory` 执行回退 |

**两个端口都已存在于 `contracts`（已重写并保留），本包不新建端口。**

**⚠️ 这带来一个架构级的好处**：

```text
本包与「数据存哪」解耦：
  · SessionEventStorePort 背后可以是内存 / SQLite / DSH 适配 → 由组合根注入
  · FileSystemPort 背后是 adapters/fs 的 node 实现 → 由组合根注入
→ 所以「旧格式兼容」不是本包的问题（端口实现负责）
→ 而本包可以用端口替身做纯离线测试（不碰真实磁盘与数据库）
```

**c) DSH 的 `defineTool` 用于注册回退工具**

`@deepseek-ai/dsh-tools` 导出 `defineTool`，本包可用它把「文件回退预览 / 执行」
注册为模型可调用工具。**但本包的判定与执行逻辑全部在端口之上，不依赖 DSH 运行时。**

**d) 引擎分流已在进程级入口接好（同 `kernel-plugin-policy`）**

`apps/cli/packages/cli/src/run.ts:255` 的 `resolveKernelEngine(env) === "dsh"` 决定是否
动态 import `@knorvia/bootstrap/kernel`。**本包不读 `KNORVIA_KERNEL_ENGINE`**（engine-agnostic）。

### 3. 本包要补的缺口

| #   | 缺口                                              | 本包做法                                                    |
| --- | ------------------------------------------------- | ----------------------------------------------------------- |
| G1  | DSH 没有文件回退能力                              | 用 `FileSystemPort` 实现 preview / apply / 补偿             |
| G2  | 旧实现直接调 `fs`，违反 AGENTS.md 的 I/O 收敛要求 | 改为注入 `FileSystemPort`（可测试、跨平台一致）             |
| G3  | 检查点事件与回退事件需要持久化                    | 通过 `SessionEventStorePort.append` 写事件                  |
| G4  | 会话回退的目标序需要「算」出来                    | `planConversationRewind` 产出目标 seq/消息，**不执行 fork** |
| G5  | 回退必须「要么全成要么可回退」                    | 操作前记录 `JournalRecord`，失败时按逆序 `compensate`       |
| G6  | 工作区文件可能在回退期间被外部修改                | 用 `contentHash` 检测漂移，漂移则拒绝执行并明确报错         |

**红线**：以上全部在本包内适配，**不改 DSH**、**不改 contracts 的两个端口**、**不改 core**（随删除）。

---

## 三、锁定的不变量

| #   | 不变量               | 内容                                                                                                 | 断言  |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------- | ----- |
| L1  | **只依赖两个端口**   | 本包源码不得 import `node:fs` / `node:child_process` / `@deepseek-ai/dsh-*` 的运行时（类型除外）     | A1/B1 |
| L2  | **preview 不碰磁盘** | preview 只读（`stat` / `readTextFile`），**不写**任何东西；apply 才写                                | B2/B3 |
| L3  | **原子性**           | apply 中途失败时按逆序补偿已完成的步骤；补偿失败则报告「部分回退」并保留 journal 供人工处理          | B4/B5 |
| L4  | **漂移拒绝**         | 应用回退前比对当前内容 hash 与计划时记录的 hash；不一致 → 拒绝并明确报错（**不强行覆盖**）           | B6    |
| L5  | **会话回退只规划**   | `planConversationRewind` 返回目标 seq/消息，**不调用** `session.fork`                                | B7    |
| L6  | **事件即事实**       | 检查点与回退动作都写 `SessionEventStorePort`；不引入第二份状态副本                                   | B8    |
| L7  | **fail closed**      | 端口缺失 / 端口抛错 / 计划为空 → 明确失败（返回 unavailable 结果或抛错），**不静默当成「无需回退」** | B9    |
| L8  | **幂等**             | 同一回退动作重复 apply → 第二次检测到「已处于目标状态」并返回 no-op，不重复写                        | B10   |
| L9  | **engine-agnostic**  | 不读 `KNORVIA_KERNEL_ENGINE`；只在被组合根挂载时工作                                                 | A1    |
| L10 | **无路径直拼**       | 所有路径经 `FileSystemPort` 的请求对象传递；本包不手写分隔符、不做 `path.join` 之外的拼接            | B11   |

---

## 四、行为条目（摘要；完整版见 behavior.md）

| 编号 | 主题               | 一句话                                                                      |
| ---- | ------------------ | --------------------------------------------------------------------------- |
| B1   | 插件形态与依赖注入 | `apply(ctx, config)` 接收两个端口；缺任一 → 装配期抛错                      |
| B2   | 文件回退预览       | 算出「哪些文件、什么操作」，不写盘，返回可展示的计划                        |
| B3   | 文件回退执行       | 按计划 write / remove / createDirectory，记录 journal                       |
| B4   | 失败补偿           | 中途失败按逆序补偿；补偿失败 → 报告部分回退 + 保留 journal                  |
| B5   | 补偿的边界         | 只补偿「本次已执行」的步骤；不碰计划外的文件                                |
| B6   | 漂移检测           | apply 前比对 hash；不一致拒绝执行                                           |
| B7   | 会话回退规划       | 算出目标 seq / messageId；不调 fork                                         |
| B8   | 检查点事件         | 检查点/回退动作写 session event；列表与预览从事件读                         |
| B9   | 失败语义           | 端口缺失/抛错/空计划 → 明确失败；不静默成功                                 |
| B10  | 幂等与重入         | 重复 apply → no-op；并发 apply 同一检查点 → 后者失败                        |
| B11  | 跨平台             | 路径经端口传递；不假设分隔符；不 `realpath`（端口实现负责平台差异）         |
| B12  | 工具能力声明       | 回退工具声明 `readOnly` / `destructive` / `sideEffectScope`，供 policy 判定 |

---

## 五、接口

见 [interface.md](interface.md)：插件模块导出面、`apply(ctx, config)` 的接线约定、
两个端口的注入形状、计划与结果类型、以及与会话回退的接缝。

**依赖方向（冻结）**：

```text
contracts (SessionEventStorePort + FileSystemPort)  ──(定义)──>  kernel-plugin-rewind
kernel-plugin-policy  ──(判定回退工具是否需确认，通过工具声明)──>  kernel-plugin-rewind
kernel-bridge / kernel-legacy-sessions  ──(消费 planConversationRewind 的结果，执行 fork)──>  （反方向）
```

本包**不** import 任何 DSH 运行时；对 `dsh-tools` 只有类型级引用（`defineTool` 的签名形状
用本包自己的最小类型表达，见 interface.md §五）。

---

## 六、调用方

见 [callers.md](callers.md)：旧实现的调用点（`bootstrap/src/app/session-facade.ts` 的门面委托、
v4 命令面、TUI 的 `/rewind` 命令）按「新实现由组合根装配、经公开 API 暴露」重新归类。

---

## 七、复用清单（接入包流程第 2 条）

**已有契约测试中，走公开入口、对新运行时同样适用的**：

| 套件                                     | 入口              | 对新运行时的要求          |
| ---------------------------------------- | ----------------- | ------------------------- |
| `kernel-plugin-policy` 的测试            | 公开插件入口      | 继续全过；本包不改 policy |
| `kernel-plugin-credentials` 的测试       | 公开插件入口      | 继续全过；本包不改凭据链  |
| `kernel-dsh-builtins`、`kernel-bridge-*` | 公开组合/协议入口 | 继续全过；本包不改其面    |

**⚠️ 现状**：`core/src/runtime/methods/` 下这 9 个文件的既有测试**直接 import 内部模块**
（`core/test/**`），随 `core` 删除。**所以「走公开入口的既有测试」在本层是 0 个**；
本包的 B 条目测试**全部新写**并走公开插件入口（`apply(ctx)` + 端口替身）。

---

## 八、门禁

```bash
# 仓库根目录；先 pnpm build:cli-packages
node specs/contracts/kernel-plugin-rewind/tests/run-gate.mjs              # 旧门（默认引擎）
node specs/contracts/kernel-plugin-rewind/tests/run-gate.mjs --engine dsh # 新运行时门
```

| 门         | 入口                                   | 判据         | 产物               |
| ---------- | -------------------------------------- | ------------ | ------------------ |
| 旧门       | 旧实现 + 默认引擎                      | 全部用例通过 | `gate-legacy.json` |
| 新运行时门 | 同套用例 + `KNORVIA_KERNEL_ENGINE=dsh` | 全部用例通过 | `gate-dsh.json`    |

- 接入包**无 stubs**。
- **离线可测**：文件回退计划与执行（端口替身）、补偿、漂移检测、
  检查点事件读写、会话回退目标计算。
- **未覆盖**：真实文件系统上的跨平台路径行为、真实事件存储的持久化、
  真实 `session.fork` 端到端 —— 归 `kernel-switch` 实机冒烟。

---

## 九、与相邻包的接缝

1. **`kernel-plugin-policy`（已合并 #292）**：本包的回退工具**声明能力**
   （`readOnly: false` / `destructive: true` / `sideEffectScope: "workspace"`），
   由 policy 判定是否需要用户确认。**本包不做权限判定。**
2. **`kernel-bridge` / `kernel-legacy-sessions`**：
   消费本包 `planConversationRewind()` 的结果，调 DSH 的 `session.fork(atSeq)`。
   **本包不执行 fork。**
3. **`kernel-legacy-sessions`**：读旧会话库里的检查点用于展示，归它（规格 L100）。
   **本包只处理「新检查点」的创建与回退。**
4. **组合根的注入责任（必须）**：

```text
SessionEventStorePort 与 FileSystemPort 的持久化实现由组合根注入 ——
本包不关心「数据存哪」，但组合根必须注入。
→ 若 kernel-switch 时组合根忘记注入 → 本包会**启动失败**（早失败，不是静默降级）
```

**⚠️ 这与 `kernel-plugin-policy` 的「组合根必须初始化 mode」是同一类约束** ——
**接线遗漏的后果是「启动失败」，而不是「静默按默认值工作」。**

---

## 十、双 PR 交付计划（Lead 2026-10-22 建议）

工作量预计是 `kernel-plugin-policy` 的 **1.5–2 倍**（9 文件 1998 行 + 两个端口注入 +
端口替身测试基础设施），所以分两个 PR：

| PR       | 内容                            | 前置                        |
| -------- | ------------------------------- | --------------------------- |
| **PR-1** | **合同 7 份**（本目录）         | 无                          |
| PR-2     | 实现 9 文件 + 契约测试 + 双门禁 | PR-1 合并（或至少评审通过） |

**⚠️ PR-1 先合的好处**：合同冻结后，实现阶段的每次改动都有依据；
而合同本身不改代码，不会阻塞任何人。
