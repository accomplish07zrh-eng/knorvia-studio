# kernel-dsh-builtins 调用方

本包不新增公开模块路径（除 `@knorvia/bootstrap/kernel` 上的原名新增导出），不删除/改名既有导出。下面是本包的调用方、被测模块与相邻边界。

## 一、直接调用方

| 调用方                   | 位置                                                             | 用途                                                                    | 本包改动                                               |
| ------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| CLI 协议命令             | `apps/cli/packages/cli/src/run.ts` · `runKnorviaProtocolCommand` | `KNORVIA_KERNEL_ENGINE=dsh` 时动态加载 kernel 入口并 `runKernelProcess` | 不改；本包只扩展被加载的宿主内部                       |
| 内核宿主                 | `apps/cli/packages/bootstrap/src/kernel/host.ts`                 | `bootKernel` 建立快照、物化组合、调 `boot()`                            | 改：快照建立 + 追加行                                  |
| 内核组合                 | `apps/cli/packages/bootstrap/src/kernel/composition.ts`          | `KERNEL_PLUGIN_ROWS` / `createKernelPluginRows`                         | 改：追加行、替换执行器行、改 `system-prompt` 行 config |
| 内核进程                 | `apps/cli/packages/bootstrap/src/kernel/process.ts`              | boot → 就绪行 → 桥 → 关停                                               | 不改（`kernel-dsh-00` 行为不变）                       |
| 协议桥                   | `apps/cli/packages/bootstrap/src/kernel-bridge/**`               | 消费 `KernelHost.context`；`env.sessions`/`env.agents`                  | 不改（`kernel-bridge-01` 行为不变）                    |
| 合同测试                 | `specs/contracts/kernel-dsh-builtins/tests/**`                   | 只走 `@knorvia/bootstrap/kernel` 与 DSH 公开服务/事件                   | 新增                                                   |
| `kernel-dsh-00` 合同测试 | `specs/contracts/kernel-dsh-00/tests/**`                         | 行快照与身份断言                                                        | 期望值按本包升级（D1/D2）                              |

## 二、本包新增/替换的组合行（调用关系）

```text
KERNEL_PLUGIN_ROWS
  ├─ 既有 19 行（kernel-dsh-00，id 与顺序不变；system-prompt 只改 includeRuntimeContext）
  ├─ 替换：shell 执行器行（同 id，按平台二选一，由 Knorvia 子类实现）
  │    ├─ win32  → dsh-pwsh-sandbox 的子类（注入快照、丢弃 dshEnv）
  │    └─ 其他   → dsh-bash-sandbox 的子类（同上）
  ├─ 追加：沙箱/审批/托管环境（dsh-sandbox-local、dsh-sandbox-policy、dsh-user-approval、dsh-shell-env）
  ├─ 追加：工具（dsh-tool-pwsh/bash、tool-fs、tool-fs-search、tool-todo、tool-web、tool-jobs、tool-skill、tool-goal、tool-subagent*）
  ├─ 追加：命令面（dsh-commands、dsh-command-compact、dsh-command-goal）与 dsh-plan-mode
  ├─ 追加：压缩（dsh-token-meter、dsh-compaction-basic、dsh-compaction-tool-result-pruner）
  ├─ 追加：目标（dsh-goal、dsh-goal-round-driver）与子 Agent（dsh-subagent + spawn/fork provider）
  ├─ 追加：MCP（dsh-mcp-client × N，按 Knorvia 配置生成）
  └─ 追加：Knorvia 上下文行（systemPrompt.context 贡献运行环境信息）
```

## 三、被复用/依赖的既有模块

| 模块                                          | 复用方式                                  | 约束                                     |
| --------------------------------------------- | ----------------------------------------- | ---------------------------------------- |
| `bootstrap/src/kernel/environment.ts`         | `prepareKernelEnvironment` 的清洗仍然执行 | 本包在其**之前**取快照；不改清洗规则本身 |
| `bootstrap/src/kernel/composition.ts`         | 行蓝图与物化                              | 追加行必须走同一事实源，不就地散写       |
| `bootstrap/src/kernel/constants.ts`           | `KERNEL_PERSONA_PREFIX`、就绪/失败标记    | 不改字面值                               |
| `bootstrap/src/mcp-config.ts`                 | `McpServerConfig` 形态与 `McpPort` 端口   | **只读**；本包只消费配置形态，不改其导出 |
| `@knorvia/shared`（`resolveKnorviaDataRoot`） | 数据根解析                                | 不改                                     |
| `@deepseek-ai/*` 公开 API                     | 服务、事件、插件基类                      | 不改源码、不 patch、不 vendor            |

## 四、相邻但不在本包范围

| 模块                                             | 为什么不改                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/cli/packages/core/**`                      | 旧运行时；`kernel-switch` 才删除。本包只把它当行为依据                                                                        |
| `bootstrap/src/protocol-v4/**` / `protocol/**`   | 旧协议实现；桥复用既有模块，本包不碰                                                                                          |
| `apps/cli/packages/kernel-plugins/**`            | 后续包的插件目录；本包只建立本包所需的上下文行（放在 `bootstrap/src/kernel/**` 内，随 `kernel-plugins` 目录约定在后续包迁移） |
| 模型供应商与凭据插件                             | `kernel-plugin-credentials`                                                                                                   |
| 五种权限模式的产品语义                           | `kernel-plugin-policy`（本包只挂策略执行点）                                                                                  |
| Hook 7 事件                                      | `kernel-plugin-hooks`                                                                                                         |
| 缺的 Knorvia 工具                                | `kernel-plugin-tools-*`                                                                                                       |
| 记忆、文件回退、动态工作流、技能来源、旧会话导入 | 各自包                                                                                                                        |

## 五、依赖方向

```text
cli (run.ts)
  └─ @knorvia/bootstrap/kernel（仅 dsh 分支动态加载）
       ├─ kernel/composition.ts  ← 行蓝图（含本包追加行）
       ├─ kernel/host.ts         ← 快照 + boot()
       └─ @deepseek-ai/*          ← 第三方依赖，只走公开 API

specs/contracts/kernel-dsh-builtins/tests
  └─ @knorvia/bootstrap/kernel（公开子路径）+ 纯 DSH 公开服务/事件
```

禁止反向：本包不得 import `kernel-bridge/**`、`protocol-v4/**`、`protocol/**` 或任何 `core/**` 实现。
