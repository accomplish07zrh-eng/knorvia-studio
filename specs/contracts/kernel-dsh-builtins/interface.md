# kernel-dsh-builtins 接口合同

本包**不新增公开模块路径**（除 `@knorvia/bootstrap/kernel` 子路径上的少量原名新增导出）。接口 = 新内核对"已挂载的 DSH 能力"的公开可观察面，以及两处修正对外可判定的行为。实现可以重组内部代码，但下列签名、行 id 与配置推导不得改变。

## 一、进程与组合契约

| 项         | 契约                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 引擎门     | 仅 `KNORVIA_KERNEL_ENGINE` 去空白后严格等于 `dsh` 挂载本包能力；缺省/其他值不加载任何 `@deepseek-ai/*`（B23）                                                      |
| 组合事实源 | `bootstrap` 的 `KERNEL_PLUGIN_ROWS` 是唯一来源；本包在其后**追加**行，并**替换**平台对应的 shell 执行器行（同 id）                                                 |
| 既有行不变 | `kernel-dsh-00` 的 19 行 id 与顺序不变；`system-prompt` 行只改 `includeRuntimeContext`（`false` → `true`），`includeHarnessIdentity:false` 与 `personaPrefix` 不变 |
| 行 id 唯一 | 追加行 id 不得与既有 19 行重名；重名 → 启动失败                                                                                                                    |
| 单实例     | 每进程只一个 DSH host；`ctx.shell` 只有本包一个实现                                                                                                                |
| 默认路径   | 无 `dsh` 开关时不建 `<DSH_HOME>`、不加载 `@deepseek-ai/*`、输出与基线逐字节一致                                                                                    |

## 二、新增公开导出（`@knorvia/bootstrap/kernel`）

实现 PR 落地；合同阶段只约定**形状与语义**，不约定内部文件名。

```ts
/** 启动时的用户环境快照：启动前 process.env 去掉 DSH_* 后的浅拷贝；只读、不落盘。 */
export interface KernelUserEnvironmentSnapshot {
  /** 读取一个变量的启动时值；快照里没有则为 undefined。 */
  get(name: string): string | undefined;
  /** 快照覆盖的变量名（诊断用；不得用于输出键值）。 */
  names(): readonly string[];
  /** 快照条目数（用于日志与测试断言，不暴露键名）。 */
  readonly size: number;
}

/** 生成快照的纯函数：入参是启动时环境，出参是只读快照。 */
export function createUserEnvironmentSnapshot(
  source: Readonly<Record<string, string | undefined>>,
): KernelUserEnvironmentSnapshot;
```

- `bootKernel` 的 `BootKernelOptions` **新增可选字段** `userEnvironment?: KernelUserEnvironmentSnapshot`（不传则内部按 `process.env` 在清洗前建立快照）。
- `KernelHost` **新增只读字段** `userEnvironment: KernelUserEnvironmentSnapshot`（便于实现层与测试读取，不暴露键值给协议面）。
- 快照**不得**出现在任何日志键值、会话记录或协议帧里；`names()`/`size` 只用于诊断与断言。

## 三、工具子进程环境契约（修正一）

对每一次 shell 工具子进程（win32 的 pwsh 支、POSIX 的 bash 支）：

| 规则 | 契约                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | 子进程环境 = 用户环境快照（启动时点、已剔除 `DSH_*`）∪ 调用方显式 `env`（后者优先）                                                   |
| R2   | 子进程里**不得**出现任何 `DSH_*` 名（含宿主继承的与 `dsh-shell-env` 托管注入的 `DSH_HOME`/`DSH_SHELL`）                               |
| R3   | 启动后新增到 `process.env` 的变量**不**进入子进程（快照不是活视图）                                                                   |
| R4   | 进程级仍删除 `DSH_*`、`*_API_KEY` 与供应商 key 名（`kernel-dsh-00` B6 不变）；这些名字只在**子进程**里按快照存活                      |
| R5   | 平台内建覆盖（`NO_COLOR=1`、`TERM=dumb`、`PAGER=cat`、`GIT_PAGER=cat`，以及 pwsh 的 UTF-8 前导）保持 DSH 原样，可被快照/显式 env 覆盖 |
| R6   | 快照只在进程内存在：不写盘、不进日志、不进会话、不进帧                                                                                |

## 四、系统提示运行环境契约（修正二）

`system-prompt` 行 config 由

```jsonc
{
  "includeHarnessIdentity": false,
  "includeRuntimeContext": false,
  "personaPrefix": "<Knorvia 开场>",
}
```

改为

```jsonc
{
  "includeHarnessIdentity": false,
  "includeRuntimeContext": true,
  "personaPrefix": "<Knorvia 开场>",
}
```

并由本包的一个 Knorvia 插件行注册 `systemPrompt.context()` 贡献，`text` 每次装配求值，内容至少包含：

| 字段       | 取值来源                              |
| ---------- | ------------------------------------- |
| 主工作目录 | 会话 cwd（有 `agent` 时）否则宿主 cwd |
| 平台       | `process.platform`                    |
| shell      | win32 → `pwsh`；POSIX → `bash`        |
| OS 版本    | `os.release()`                        |
| 当前日期   | 装配时刻的本地日期 `YYYY-MM-DD`       |
| 时区       | 解析出的 IANA 时区                    |

- 贡献名必须是一个不与 DSH 内建贡献冲突的稳定名（DSH 已占用 `sandbox:policy`、`approval:policy`、`subagent:delegation` 等；本包用 `knorvia:runtime-context`）。
- 装配结果不得含 `DeepSeek Harness` 品牌句、`@deepseek-ai/` 包名、`harness:identity` 段（B16）。

## 五、能力挂载契约（每项一行，可观察面）

| 能力            | 契约（服务/命令/工具的公开名）                             | 关键配置                                                                |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| shell 执行      | `ctx.shell`（本包子类，唯一实现）                          | `timeoutMs` 与 `maxTimeoutMs`、`maxOutputBytes`、`graceMs` 按旧内核口径 |
| 沙箱            | `ctx.sandbox`（`dsh-sandbox-local`）、`ctx.sandboxPolicy`  | `mode: "workspace-write"`、`workspaceRoot` = 启动 cwd                   |
| 审批            | `ctx.approval`                                             | `policy: "ask"`（无应答者 fail closed）                                 |
| 托管 shell 环境 | `ctx.shellEnv`                                             | `dshHome` = `<DSH_HOME>`                                                |
| 工具            | `ctx.tools`                                                | 见 B4 的承诺工具名集合                                                  |
| 技能            | `ctx.skills`                                               | 本包不挂来源                                                            |
| 命令            | `ctx.commands`                                             | 含 `/compact`、`/goal`、`/plan`                                         |
| 压缩            | `ctx.tokenMeter`、`ctx.compaction`、`ctx.toolResultPruner` | 见 §六                                                                  |
| 目标            | `ctx.goals`                                                | `defaultMaxGoalRounds`                                                  |
| 计划模式        | `ctx.planMode`                                             | `section` = Knorvia 口径文本                                            |
| 子 Agent        | `ctx.subagents`（`spawn`、`fork`）                         | provider 名与工具名见 B21                                               |
| MCP             | `ctx.mcp`（每服务器一行）                                  | 由 Knorvia MCP 配置生成                                                 |
| 上下文          | `ctx.systemPrompt`                                         | 见 §四                                                                  |

- 以上服务名、工具名、命令名是 DSH 公开契约；本包不改名、不包装第二套。
- 能力缺席时（例如行被 `disabled`）按 DSH 语义表现为服务不存在；本包不得伪造空实现。

## 六、压缩配置推导契约（B18）

旧内核口径（`core/src/compact/policy.ts` + `policy-internal.ts` 实测值）：

```text
窗口            windowSize = 200000
输出预留上限     reserveCeiling = 21000
输出预留请求     maxOutputReserve = 32000
有效窗口        effective = windowSize − min(输出预留请求, reserveCeiling)
                = 200000 − 21000 = 179000
缓冲            buffer = 13000
自动压缩阈值     threshold = effective − buffer = 166000
```

DSH 口径（`dsh-compaction-basic`）：压力阈值由 `thresholdRatio`（窗口占比）与 `headroomTokens`（绝对余量）表达。

本包的约束（测试断言的对象）：

1. 由组合 config 推导的有效压力阈值必须等于 166000（默认 200000 窗口）。
2. `modelPolicies[]` 必须存在，且为"小窗口模型单独配置"保留位置（旧内核 `core/src/compact/policy.ts` 允许按模型覆盖 `contextWindow`）。
3. 推导公式与两组数值写进 [known-differences.md](known-differences.md) D4。

## 七、兼容面

- 不新增/删除 `@knorvia/shared/protocol-v4` 的导出；不改任何 v4 字段、ACK 形状、帧结构。
- 不新增 `KNORVIA_*` 环境变量；不改 `.knorvia-studio` 数据目录布局。
- 不修改旧协议方法、旧会话库、旧用户数据格式。
- `KERNEL_PLUGIN_ROWS` 的行 id 集合变化属于本包合同演进：`kernel-dsh-00` 的 `composition.test.mjs` 行快照按本包 README §四 升级（登记 [known-differences.md](known-differences.md) D1）。
- 实现内部模块路径由实现决定；若新增包内导出，只供内核与测试使用，并在实现 PR 的 `interface` 变更说明中列出。
