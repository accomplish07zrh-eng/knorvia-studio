# kernel-bridge-02 验收

## 一、范围

| 项         | 内容                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 包         | `kernel-bridge-02`（M2 接入包）                                                                                                        |
| 认领 issue | #222（沿用，不新开）                                                                                                                   |
| 合同分支   | `contract/kernel-bridge-02`（基线 `origin/main` `23cd766e`）                                                                           |
| 实现分支   | `replace/kernel-bridge-02`（合同合并后从最新 main 开）                                                                                 |
| 依据       | 计划书「内核方案调整」（含 2026-10-20 kernel-bridge-01 审查结论）、「接入包流程」、「接入门禁」；`specs/knorvia-builtin-kernel-dsh.md` |
| 前置       | `kernel-bridge-01` v1（#218）、`kernel-dsh-builtins`（#219）、`kernel-bridge-legacy` v1（#226）已合并                                  |

**继承文件数**：`-0`（接入包，不替换既有实现）。

## 二、合同阶段（本 PR）验收

| 项           | 判据                                                                                                | 结果   |
| ------------ | --------------------------------------------------------------------------------------------------- | ------ |
| 合同文件齐全 | README / behavior(B1–B16) / interface / callers / known-differences / acceptance / tests / fixtures | 见 §五 |
| 合同测试     | 本阶段能立即通过的用例                                                                              | 见 §五 |
| 门禁         | `pnpm typecheck`、`pnpm lint`、`pnpm fmt:check`、`pnpm architecture:check`、`pnpm test:studio`      | 见 §五 |
| CI           | Linux 与 Windows 全绿                                                                               | 见 PR  |

接入包例外：本包无「旧实现」可录 `gate-old.json`；行为依据是 v4 冻结 schema + `kernel-bridge-01` 骨架 + DSH 公开事件面。新增路径的测试随实现 PR 落地。

## 三、实现阶段验收（替换 PR 填写）

| 项                | 判据                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 契约测试          | 两个入口（源码 + dist）100% 通过、0 跳过                                                                                                     |
| 上游回归          | `kernel-bridge-01/tests/**` **20/20 仍全过**；`kernel-dsh-00` 25/25；`kernel-dsh-builtins` 51/51                                             |
| legacy 接缝（C2） | 旧协议回合类方法与 v4 命令**走同一实现**；legacy 端口的 `execute()` 被真实调用                                                               |
| 单一 admission    | 全部输入经 `CommandInbox`；DSH 收件箱无第二条写入路径                                                                                        |
| 相似度            | 对旧回合执行路径与上游 `872ad960`：行包含率 < 0.20 且最长段 < 8（<10 行必须 0）、结构 < 0.40；normal 与 declaration 两门都跑，未过计数取并集 |
| 来源登记          | 新文件登记 `original`；DSH 子包按第三方依赖登记，不跑相似度                                                                                  |
| SPDX              | 每个新文件首行 `// SPDX-License-Identifier: Apache-2.0`                                                                                      |
| 无回退路径        | 全仓搜 `not implemented: kernel-bridge-02` 为零                                                                                              |

## 四、必须证明的可判定行为

> 实现 PR 必须把**真实命令与真实输出**贴进来，不接受「已实现」式的表述。

### 4.1 回合真实执行（B2/B3）

| #   | 断言                            | 判定方式                                                                                                                        |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| (a) | `sendText` 真的驱动了一个回合   | 投递后收到 assistant 行帧与 `TurnComplete` 帧，`fromSeq` 连续                                                                   |
| (b) | `createSession.firstInput` 原子 | 同一 ACK 同时含 `sessionId` 与 `turnId`；首帧序号无空洞                                                                         |
| (c) | 回合类命令不再回 `unsupported`  | 5 个命令（`createSession`/`sendText`/`stop`/`compact`/`resolveInteraction`）的 ACK 都是 accepted，且 `status !== "unsupported"` |

### 4.2 排队、steer 与取消（B4–B7）

| #    | 断言                                  | 判定方式                                                                                              |
| ---- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| (d)  | `sendText.queue` 入队不丢输入         | 运行中投递 → `delivery.admitted === "queue"` 且 `order.queuePosition > 0`；当前回合结束后该输入被执行 |
| (e)  | `sendText.guide`（steer）并入当前回合 | 运行中 guide → 不新起回合，下一步边界消费；`steer.state` 走 `steering → guided`                       |
| (f)  | `stop` 停止当前回合                   | 停止后该回合不再产出新的 assistant 行；`expectedForegroundExecutionId` 不匹配时为过期 noop            |
| (g)  | `heldQueueDisposition` 两种语义       | `clearQueueAndSend` 清空队列后发送、`keepQueueAndSend` 保留队列立即发送；用同一 held 场景两分支对照   |
| (g2) | `compact` 排队                        | idle 立即执行；busy 进 FIFO 且不插队                                                                  |

### 4.3 审批闭环（B9/B10）

| #    | 断言                          | 判定方式                                                                                         |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| (h)  | 审批请求桥成 v4 交互并可回填  | `approval/asked` 与 `approval/decided` 成对出现在同一回合内；`resolveInteraction` 应答后工具执行 |
| (i)  | 无应答者 fail closed          | 通道关闭/超时 → 结果 `unavailable`，工具不执行                                                   |
| (i2) | `resolveInteraction` 先到先得 | 同一 `interactionId` 重复应答，晚到为 noop（`proto.alreadyResolved`），不改已有决定              |

### 4.4 帧与链路（B11–B13）

| #   | 断言           | 判定方式                                                                  |
| --- | -------------- | ------------------------------------------------------------------------- |
| (j) | 帧形状逐字段   | assistant 行、tool 行、`TurnComplete` 与冻结 schema 一致                  |
| (k) | 序号单调不回退 | 含取消与失败的连续回合，`fromSeq` 严格单调                                |
| (l) | 两条链路语义   | `desktop-continuous` 断言增量；`web-remote-replayable` 断言从水位重放等价 |

### 4.5 接缝与准入（B14/B15）

| #   | 断言                  | 判定方式                                                                                          |
| --- | --------------------- | ------------------------------------------------------------------------------------------------- |
| (m) | C2：两条路径同一实现  | 旧协议 `session/send` 与 v4 `sendText` 走同一 `KernelTurnExecutor.sendText`；端口注册后被真实调用 |
| (n) | 单一 admission 所有者 | 全部输入经 `CommandInbox`；DSH 收件箱只收已 admission 的输入                                      |

### 4.6 C2 的完成度：本包**部分满足 4/11**

C2 准入项要求「11 个回合类旧协议方法全部实到 legacy 执行端口并转绿」。按计划书原文划界（Lead 2026-10-20 裁决）：

| 归属               | 数量  | 方法                                                                                                                                    | 本包交付                                                |
| ------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **本包（02）**     | **4** | `session/send`、`session/stop`、`session/cancelBackgroundTask`、`session/compact`                                                       | ✅ 实现并注册到 legacy 端口                             |
| `kernel-bridge-03` | 7     | `session/fork`、`session/goal`、`session/setModel`、`session/setThoughtLevel`、`session/setMode`、`session/resume`、`session/subscribe` | ❌ 不实现；按 capability 缺席（`-32031`）返回并逐条登记 |

**结论：C2 在本包合并后是「部分满足（4/11）」，完整满足待 `kernel-bridge-03`。** 该结论已同步到 issue #222 与 #124 的 switch 准入清单。

**禁止的走捷径**：不得为了让 legacy 侧看起来「全通」而对未交付的 7 个方法伪造成功（例如返回空结果或假 ACK）。capability 缺席是 `kernel-bridge-legacy` behavior B10 明文允许的临时态。

### 4.7 `session/compact` 与 DSH `/compact` 是两条路径（不得混）

| 入口                            | 性质               | 路径                                                                |
| ------------------------------- | ------------------ | ------------------------------------------------------------------- |
| `session/compact`（旧协议方法） | Host 调用          | legacy 端口 → `KernelTurnExecutor.compact` → DSH 压缩服务           |
| `v4/command type=compact`       | v4 命令            | 命令分派 → `KernelTurnExecutor.compact` → DSH 压缩服务              |
| `/compact`（斜杠命令）          | **模型可见命令面** | DSH `dsh-command-compact` 命令注册表 → DSH 压缩服务，**不经过本包** |

**审查要点**：本包实现里不得出现「把 `session/compact` 转成一条 `/compact` 斜杠命令文本投递给会话」的路径——那会让 Host 调用变成模型可见输入，改变语义。两条入口共用同一个下游执行器，但入口层不得互相转换。

**复现命令（实现 PR 填写实测输出）**：

```powershell
# 仓库根目录；先 pnpm build:cli-packages
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" exec node --test --test-concurrency=2 specs/contracts/kernel-bridge-02/tests/turn-dispatch.test.mjs
```

## 五、门禁（合同 PR 实测）

```powershell
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" fmt
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" fmt:check
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" typecheck
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" lint
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" architecture:check
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" test:studio
```

结果：见本 PR 描述（贴结尾输出）。**失败如实写。**

## 六、离线回合驱动：采用的方案与覆盖边界

**采用方案：假 provider（DSH 公开 seam），已实测注册成功。**

| 项                      | 内容                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| seam                    | `@deepseek-ai/dsh-llm` 的抽象类 `LlmAdapter` + `ctx.llm.registerAdapter(providers: string[], adapter)`                                                                                     |
| 实测结果                | `registerOk: true`；`listProviders()` → `[{id:"knorvia-fake", name:"Knorvia Fake Provider"}]`；返回 handle 只有 `replace`                                                                  |
| `LlmAdapter` 最小实现面 | `providerInfo(provider)` → `{id, name}`（`id` 必须等于 provider 名、`name` 非空，否则抛 `LlmError`）；`providerRetryPolicy()` / `imageRequestPricing()` → `undefined`；`stream` 产出固定帧 |
| 测试位置                | `specs/contracts/kernel-bridge-02/tests/fake-provider-seam.test.mjs`（仅测试；**不进入产品打包产物**，见下方测试专用声明）                                                                 |
| 合规性                  | 用公开 API，**不 fork、不改 DSH 源码**                                                                                                                                                     |

**离线确定性覆盖的帧**：assistant 行、tool 行、`TurnComplete` 的**形状**与**序号单调性**；以及不依赖模型的 `stop` / `compact` 回合。

**测试专用声明（M6 产物来源核对口径）**：假 provider 是**测试专用**构件，**不进入任何产品打包产物**——

- 只存在于 `specs/contracts/kernel-bridge-02/tests/**`（契约测试目录），**不在** `apps/cli/packages/**` 的任何 `src/` 或 `dist/` 里；
- 不进入组合行（`KERNEL_PLUGIN_ROWS` / `createKernelPluginRows` 里没有任何 `knorvia-fake` 行）；
- 不进入 `knorvia.cjs` 单文件产物，也不进入安装版/便携版运行时树；
- M6 核对产物来源时，`knorvia-fake` 在打包产物中**应为零命中**；若出现即为缺陷。

### 反向断言：自造命令名不得进入协议面

合同阶段测试 `command-surface.test.mjs` 除断言五个正确字面量存在外，还**反向断言** `cancelTurn` 与 `steer` **不得出现**在 `commandPayloadSchemas` 里。

这条的价值不在「现在用对了名字」，而在**防止将来有人把自造名加进协议表**：一旦有人以「方便」为由往 `commandPayloadSchemas` 里加 `cancelTurn`，这条用例立刻红。协议表是冻结面，加名字属于破坏性变更，必须有这条护栏。

同样的反向断言也覆盖 `V4_METHODS`：`v4/turn/send`、`v4/conversation/sendText` 一类「回合专用方法名」不得出现——回合能力只能经 `v4/command` 的 `type` 分派。

**留给 kernel-switch 的真实冒烟**：真实模型 token 流、真实工具调用的完整回合、真实 Host 审批应答与 UI 交互、手机 `web-remote-replayable` 真实断线重连。

> 若升级 DSH 导致 `LlmAdapter` 形状变化，假 provider 探针会先失败——这是本包对「SDK 预发布形状不承诺兼容」（README G6）的预警方式，不静默降级。

## 七、未覆盖的内容

| #   | 项                                                | 归属                                |
| --- | ------------------------------------------------- | ----------------------------------- |
| 1   | 真实模型驱动的回合（真实 token 流与真实工具调用） | `kernel-switch` 真实模型冒烟（D17） |
| 2   | 真实 Host 审批应答（含 UI 交互）                  | `kernel-switch` 工作台冒烟（D18）   |
| 3   | 手机 `web-remote-replayable` 真实断线重连         | `kernel-switch`（D19）              |
| 4   | macOS 实机                                        | 无实机；Linux CI 覆盖 POSIX（D20）  |

## 八、安全约定（全队口径，本包自查）

- **无任何进程级清理**：测试与探针只用自己 `spawn` 的句柄收尾；禁止 `taskkill /IM`、`pkill -f`、按可执行名批量杀进程。取消语义走 DSH 的 `agent.cancel()`，不杀进程。
- **不碰真实用户目录**：全部测试用 `mkdtemp` 造临时根，`HOME`/`USERPROFILE` 重定向；不读写真实 `~/.dsh`。
- 隔离断言沿用 `kernel-dsh-builtins` 的诱饵主目录口径（内容 + mtime 不变）。
