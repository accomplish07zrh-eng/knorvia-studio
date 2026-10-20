# kernel-bridge-02 调用方

## 一、本包的直接调用方

| 调用方        | 位置                                                                                   | 用到什么                                    | 变化                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 桥引擎组合    | `apps/cli/packages/bootstrap/src/kernel-bridge/bridge-engine.ts`                       | `execute()` 的 switch 分派                  | 改：补齐 `sendText` / `stop` / `compact` / `resolveInteraction` / `createSession.firstInput` 五个分支 |
| 物理入口      | `apps/cli/packages/bootstrap/src/kernel-bridge/entry.ts`                               | `route()` 的六个 v4 方法                    | **不改**（`default` 分支归 legacy）                                                                   |
| 组合根        | `apps/cli/packages/bootstrap/src/kernel/`（`kernel-dsh-builtins` 已建的 host 组合）    | 启动期把 legacy 执行端口接上                | 改：调用 `createLegacyTurnPort` + legacy 的 `registerLegacyExecutionPort`                             |
| legacy 路由器 | `apps/cli/packages/bootstrap/src/kernel-bridge/legacy/`（`kernel-bridge-legacy` 实现） | 通过注册的 `LegacyExecutionPort` 调本包实现 | **不改**（它只按端口约定调用）                                                                        |
| 契约测试      | `specs/contracts/kernel-bridge-02/tests/**`、`kernel-bridge-01/tests/**`               | 公开入口 NDJSON                             | 新增                                                                                                  |

## 二、本包依赖的既有模块

| 模块                                             | 用途                                                       | 是否改                   |
| ------------------------------------------------ | ---------------------------------------------------------- | ------------------------ |
| `kernel-bridge/command-inbox.ts`                 | 串行 admission、CAS、幂等桶                                | **不改**（冻结面）       |
| `kernel-bridge/bridge-engine.ts`                 | 命令执行、会话登记                                         | 改（只加分支）           |
| `kernel-bridge/projection-layer.ts`              | 事件 → 投影 → 帧                                           | 改：新增回合事件派生规则 |
| `kernel-bridge/sequence-watermark.ts`            | 序号与水位                                                 | **不改**                 |
| `kernel-bridge/snapshot-materializer.ts`         | 快照物化                                                   | **不改**                 |
| `kernel-bridge/links-registry.ts`                | 两条链路的订阅注册                                         | **不改**                 |
| `kernel-bridge-legacy/interface.md` §四 的注册面 | `LegacyExecutionPort` 类型与 `registerLegacyExecutionPort` | **不改**（只接线）       |
| `@knorvia/shared/protocol-v4`                    | 命令/帧 schema、`V4_METHODS`、`CommandPayloadMap`          | **不改**                 |
| DSH `ctx.agents`、`ctx.sessions`、`ctx.approval` | 回合执行与审批                                             | **不改**（公开 API）     |

## 三、相邻但不在本包范围

| 项                                             | 理由                 | 归属                                                         |
| ---------------------------------------------- | -------------------- | ------------------------------------------------------------ |
| `entry.ts` 的 `route()` default 分支           | legacy 线已裁决归它  | `kernel-bridge-legacy`（#221，已合并）                       |
| `fork`、编辑重发、文件回退入口、目标与计划命令 | 其余 v4 命令         | `kernel-bridge-03`                                           |
| 旧协议 74 方法的完整参数校验与结果校验         | 旧协议执行面         | `kernel-bridge-legacy`（本包只提供回合类方法的**执行实现**） |
| 五种权限模式 → DSH 策略映射                    | 产品策略             | `kernel-plugin-policy`                                       |
| 模型供应商与凭据                               | 凭据注入             | `kernel-plugin-credentials`                                  |
| Hook 7 事件                                    | Hook 插件            | `kernel-plugin-hooks`                                        |
| 会话级 MCP 运行期增删                          | DSH MCP 是启动期组合 | `kernel-dsh-builtins`（已知缺口 G6）                         |

## 四、依赖方向

```text
kernel-bridge-02
   ├─→ kernel-bridge-01        （冻结骨架：CommandInbox / Engine / Projection / Watermark）
   ├─→ kernel-bridge-legacy    （只 import 类型 + registerLegacyExecutionPort）
   ├─→ @knorvia/shared         （protocol-v4 冻结 schema）
   └─→ DSH 公开 API            （ctx.agents / ctx.sessions / ctx.approval）

kernel-bridge-legacy  ─╳→  kernel-bridge-02    （禁止反向 import）
```

反向约束的来源：`specs/contracts/kernel-bridge-legacy/interface.md` 开头明写「依赖方向固定：`kernel-bridge-02/03` → 本包，本包不得 import 它们」。

## 五、`dep:refs` 核对项（实现阶段填）

| 目标                                            | 命令                                  | 结果         |
| ----------------------------------------------- | ------------------------------------- | ------------ |
| `kernel-bridge/bridge-engine.ts` 导出           | `pnpm dep:refs --list-exports <file>` | 待实现阶段填 |
| `kernel-bridge/entry.ts` 导出                   | 同上                                  | 待实现阶段填 |
| `kernel-bridge-legacy` 的 `index.ts` 注册面导出 | 同上                                  | 待实现阶段填 |
| `@knorvia/shared/protocol-v4` 的命令类型常量    | 同上                                  | 待实现阶段填 |
