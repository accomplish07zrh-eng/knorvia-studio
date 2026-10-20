# kernel-bridge-03 调用方

> 「谁依赖本包」与「本包依赖谁」。本包**不新增对外导出**，所以调用方只有既有那些。

## 一、调用本包的人

| 调用方                   | 位置                             | 调用什么                         | 备注                                                             |
| ------------------------ | -------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| `BridgeEngine.execute()` | `kernel-bridge/bridge-engine.ts` | 本包补齐的命令分派               | 引擎是唯一的命令分派点                                           |
| `BridgeEngine.start()`   | 同上                             | `registerTurnExecutionPort(...)` | 02 已建立；本包只扩端口表                                        |
| legacy 路由              | `kernel-bridge/legacy/router.ts` | `port.execute(request)`          | 经 `currentLegacyExecutionPort()` 取端口；**本包不改它**         |
| `entry.ts`               | `kernel-bridge/entry.ts`         | 构造 `BridgeEngine`              | **本包不改它**（`route()` 与 `RunBridgeOptions` 归 legacy 边界） |

## 二、本包依赖谁

| 依赖                          | 用途                                                                                                                                              | 依赖方向                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `kernel-bridge-01`            | 骨架：`CommandInbox`（admission 与队列身份）、`ProjectionLayer`（帧与序号）、`SequenceWatermark`、`SnapshotMaterializer`                          | `03 → 01`                |
| `kernel-bridge-02`            | `KernelTurnExecutor` 的既有方法（`sendText`/`stop`/`compact`/`createSession`）、`dispatchTurnCommand` 的统一失败翻译、`TurnApprovalRegistry`      | `03 → 02`                |
| `kernel-bridge-legacy`        | `registerLegacyExecutionPort`（端口注册面，冻结）、`routeLegacyMethod`（本包不调）                                                                | `03 → legacy`            |
| `@knorvia/shared/protocol-v4` | 34 个命令的 payload/result schema（**唯一事实源**）                                                                                               | 只读                     |
| DSH 公开 API                  | `agent.inbox`（`append`/`prepend`/`replace`/`remove`/`splice`/`clear`）、`agent.cancel`、`ctx.goals`、`ctx.compaction`、`ctx.sessions`、fork 能力 | 只读，**不 fork 不修改** |

## 三、不依赖本包的人（本包不改它们）

| 方                        | 为什么不受影响                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `kernel-bridge-01` 的测试 | 本包不改 01 的骨架不变量；01 的 20 个用例继续全过                                                  |
| `kernel-bridge-02` 的测试 | 本包只扩表与分派，不改 02 的 5 条命令语义；02 的 50 个用例继续全过                                 |
| 客户端（桌面 / 手机 Web） | 命令字面量与 ACK 形状完全不变；本包只让「原本回 `unsupported` 的命令」变为可用或回专门的能力缺席码 |

## 四、跨线协作点

| 协作方                              | 接缝                                                                                         | 状态                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| `kernel-plugin-workflow`            | 工作流 3 条的后端（`resumeWorkflowRun` / `startSavedWorkflow` / `amendWorkflowRunSettings`） | **包未建**；本包先回能力缺席          |
| `kernel-plugin-hooks`               | 工作区钩子 5 条的后端                                                                        | **包未建**；本包先回能力缺席          |
| `kernel-plugin-rewind`              | `applyFileRewind` 的文件回退机制                                                             | **包未建**；本包先回能力缺席          |
| `kernel-plugin-credentials`（#235） | 与本包**无交集**（那是凭据，不是命令面）                                                     | 已由 `kernel-dsh-builtins` 提供行位置 |

> 上面三个包的存在性直接决定 `kernel-switch` 是否会造成「产品功能降级」。
> 详见 `known-differences.md` D4–D7、D9。

## 五、本包不改的文件

| 文件                                                       | 归属                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `kernel-bridge/entry.ts`                                   | legacy 边界（`route()` 六个已接方法与 `default` 分支） |
| `kernel-bridge/legacy/**`                                  | `kernel-bridge-legacy` 包                              |
| `packages/shared/src/protocol-v4/**`                       | 协议冻结面，只读                                       |
| `apps/cli/packages/cli/**`                                 | cli 线                                                 |
| `packages/desktop/**`、`packages/web/**`、`packages/ui/**` | 前端线                                                 |
