// SPDX-License-Identifier: Apache-2.0

# kernel-plugin-hooks 合同（v1）

**合同版本：v1**（2026-10-22）。条目编号发布后不重用；改动合同必须重跑验收并升版本。

- 包范围：在 DSH 运行时上挂载 **7 种 Hook 事件**（SessionStart、UserPromptSubmit、PreToolUse、PermissionRequest、PostToolUse、PostToolUseFailure、Stop），并保留**工作区 Hook 信任规则**。
- 分支：`contract/kernel-plugin-hooks`（基线 `origin/main` `ac151e0a`）；工作树 `wt/contract-hooks-m2`；issue **#287**。
- 依据：`specs/knorvia-builtin-kernel-dsh.md` 能力映射「Hook 7 种事件」行与「Hook 兼容层」行、包去向表、旧数据节「工作区 Hook 信任存储随 Knorvia Hook 插件保留」；`specs/knorvia-internal-plugins.md`「内核层（M2）」；计划书「内核方案调整」「接入包流程」「接入包门禁」。
- 事实来源：`@deepseek-ai/dsh@0.2.0-rc.2` 各子包的**发布类型**（`lib/types/*.d.ts`）与 JSDoc；旧内核行为取自 `apps/cli/packages/core/src/hooks/**` 的**只读对照**与 [`core-hooks` 合同](../core-hooks/README.md)（v1.1，33 个契约测试）。不读、不改 DSH 源码，不 fork、不 vendor。

## 一、本包做什么

1. **挂载 7 种 Hook 事件**到 DSH 的 cordis 事件扩展点，挂载点选择与实测依据见 [`behavior.md`](behavior.md) §二。
2. **实现 Hook 执行器**：按 `HooksRuntimeConfig` 读取用户配置的 Hook（`process` 与 `command` 两种形态），生成 Claude Code 兼容的 stdin JSON、执行、解析 stdout 为 `HookJSONOutput`，并产出对 DSH 的决策。
3. **保留工作区 Hook 信任规则**：策略存储、协调者、记录、求值、运行时准入、telemetry、审核流程（旧 `core/src/hooks/workspace-hook-*.ts` 的语义）。
4. **保留 session mailbox 登记**（三个事件）。
5. 为以上每一条写契约测试；测试只走**公开入口**（`@knorvia/bootstrap/kernel-plugin-hooks` 子路径与 DSH 公开服务/事件），不 import 桥或 bootstrap 内部实现文件。
6. 新代码登记 `original`；DSH 子包按第三方依赖登记，不跑相似度。

## 二、本包不做什么

- **不处理权限模式的产品语义**（plan/build/edit/yolo/auto → DSH 策略），那是 `kernel-plugin-policy`。
  **`tools/pre-execute` 是共用挂载点**：`kernel-plugin-policy` 先判产品级硬约束，本包后判用户配置的 Hook 脚本（对齐见 `behavior.md` §六）。
- **不实现 v4 命令映射**（`kernel-bridge-02`）、其余 v4 命令（`kernel-bridge-03`）、旧协议 74 方法（`kernel-bridge-legacy`）。
- **不做模型供应商与凭据**（`kernel-plugin-credentials`）。
- **不重写 `core/src/hooks/**`**：该目录随 `kernel-switch` 整体删除（包去向表：`core` 整包删除）。本包只**复用它的行为合同**，不返工其代码。
- **不改 DSH 源码**，不 fork、不 vendor；不新增 DSH 组合之外的运行期动态加载。
- **不切换默认引擎**（`kernel-switch`）：新内核仍只在 `KNORVIA_KERNEL_ENGINE=dsh` 下运行。
- 不改协议字段、数据格式、`KNORVIA_` 环境变量、`.knorvia-studio` 数据目录。
- **不挂载 `dsh-hooks-claude-code` / `dsh-hooks-codex`**（规格「Hook 兼容层」行明确要求）。

## 三、7 种事件 → DSH 挂载点（实测结论）

|  #  | Hook 事件            | DSH 挂载点                                |           `@mode`            | 阻断/改写能力                                                | 判定 |
| :-: | -------------------- | ----------------------------------------- | :--------------------------: | ------------------------------------------------------------ | :--: |
|  1  | `SessionStart`       | `session/created`（`dsh-session`）        | `emit` + **同步抛错可 veto** | 同步 throw → 否决 + 回滚（配对的 disposal）                  |  ✅  |
|  2  | `UserPromptSubmit`   | `agent/pre-step`（`dsh-agent`）           |         `waterfall`          | 拒绝该步骤 / **替换进入步骤的消息**                          |  ✅  |
|  3  | `PreToolUse`         | `tools/pre-execute`（`dsh-tools`）        |         `waterfall`          | `allow` / `deny` / `cancel` / `ask`                          |  ✅  |
|  4  | `PermissionRequest`  | `approval/request`（`dsh-user-approval`） |         `waterfall`          | 返回 outcome 即认领，或 `next()` 委托                        |  ✅  |
|  5  | `PostToolUse`        | **`tools/post-execute`**（`dsh-tools`）   |         `waterfall`          | 接受 / 替换 / 增强 / 阻断                                    |  ✅  |
|  6  | `PostToolUseFailure` | **`tools/post-execute`**（错误分支）      |         `waterfall`          | 同上（thrown tool 也到达此 waterfall）                       |  ✅  |
|  7  | `Stop`               | `agent/turn-stopping`（`dsh-agent`）      |           `serial`           | `agent.steer(...)` 让回合继续；`serial` 遇首个 bail 值即短路 |  ✅  |

**DSH 不提供 Hook 机制**：我扫描了全部 51 个 cordis 事件扩展点（18 个包），**没有 `dsh-hooks-*` 包**。7 种事件全部由本插件用上述扩展点实现 —— 与规格「Hook 由 Knorvia 插件按现有 7 种事件实现」一致。

### 与规格的一处偏差（已核实并采用）

| 规格原文                                               | 实测                                                                                                                           | 本包采用                 | 理由                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------ |
| `PostToolUse` / `PostToolUseFailure`（`tools/result`） | `tools/result` 是 `@mode emit` + `deep-frozen` 结果 → **只能观察，不能阻断/改写**；`tools/post-execute` 才是 `@mode waterfall` | **`tools/post-execute`** | 本包需要「接受/替换/增强/阻断」能力。`tools/result` 保留用于**纯观测与审计**（不承担决策） |

## 四、文件

| 文件                                           | 内容                                                                                                                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`behavior.md`](behavior.md)                   | §一 范围与口径；§二 **DSH 侧的关键事实**（7 个扩展点实测 + serial/waterfall 语义）；§三 本包行为条目 H1..Hn；§四 复用 `core-hooks` 合同的映射表；§五 known-differences；§六 与 policy 的挂载点分工 |
| [`interface.md`](interface.md)                 | 插件入口（`apply(ctx, config)`）、配置面、复用 `@knorvia/contracts` 的 hooks 公开类型、导出清单                                                                                                    |
| [`callers.md`](callers.md)                     | 生产与测试调用方；组合根接线点                                                                                                                                                                     |
| `tests/`                                       | 契约测试（node:test，只走公开入口）+ 夹具                                                                                                                                                          |
| [`known-differences.md`](known-differences.md) | 与旧行为的差异（当前 2 条：Stop 执行次数、SessionStart 异步不能阻断；D1 经复核已撤销）                                                                                                             |
| [`acceptance.md`](acceptance.md)               | 验收记录（待替换步骤填写）                                                                                                                                                                         |

## 五、复用的既有规格（不重写）

计划书：「合同与契约测试保留，作为新内核的行为依据」。

| 来源                                                          | 复用内容                                                                                                                                           | 复用方式                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`specs/contracts/core-hooks/`](../core-hooks/README.md) v1.1 | 行为 B1..B19 + **33 个契约测试**                                                                                                                   | 行为规格直接沿用；契约测试**迁入本包 `tests/`** 并改走本包公开入口，全部在新运行时上通过 |
| `@knorvia/contracts/src/hooks/`                               | 7 种 `*HookInput`、`HookJSONOutput`、`HookSpecificOutputSchema`、`HookPermissionDecision`、`HookOutcome`、`HookEventName`、`HooksRuntimeConfig` 等 | **直接引用**，不重新定义                                                                 |
| `adapters/src/storage/workspace-hook-trust-*.ts`（6 个）      | 信任存储（file / lock / path / process / store / types）                                                                                           | **保留并复用**（规格「工作区 Hook 信任存储随 Knorvia Hook 插件保留」）；本包只做策略层   |

### 只测旧内部端口、不进入本包验收的测试

`core-hooks/tests/` 中依赖旧 `core` 内部实现文件路径的用例（如直接 import
`core/src/hooks/workspace-hook-trust-coordinator.ts`）**不迁移**；
它们的等价断言以「走本包公开入口」的形式重写。逐条清单见
[`acceptance.md`](acceptance.md)「未覆盖内容」节（替换步骤填写）。

## 六、怎么跑

```sh
# 前置：构建 CLI 包
pnpm build:cli-packages

# 本包契约测试
node --import tsx --test --test-concurrency=1 specs/contracts/kernel-plugin-hooks/tests/*.test.ts

# 相似度门禁（新代码 < 0.20 / < 8 / < 0.40，不调门槛）
node scripts/provenance/similarity.mjs --repo . \
  --candidate apps/cli/packages/bootstrap/src/kernel-plugin-hooks/<file>.ts \
  --old <同路径> --old-rev beff12b5 \
  --upstream-dir <上游树> --upstream-rev 872ad960de7ec172591f7e1952f7849229f94521 \
  --gates all
```

## 七、条目 → 测试对照表（替换步骤填写）

| 条目            | 测试                                                   |
| --------------- | ------------------------------------------------------ |
| H1..Hn          | _本包契约测试，替换步骤填写_                           |
| B1..B19（复用） | 迁入 `tests/` 的 core-hooks 契约测试，改走本包公开入口 |
