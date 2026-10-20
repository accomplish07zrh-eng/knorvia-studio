# kernel-dsh-builtins 已知差异

本包没有"被替换的实现"，差异分四类：**对既有合同的有意演进**、**本包边界**、**DSH 事实**、**暂缓验证**。每条给出理由与对应测试。

## 一、对既有合同的有意演进（不是放宽断言）

| #   | 差异                                                                                                | 理由                                                                                                                                                                                                                                                 | 对应测试 / 验收                                                                                   |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| D1  | `kernel-dsh-00` 合同测试 `composition.test.mjs` 的"19 行快照"期望值升级为本包的完整行集合           | 本包的**工作方式就是追加组合行**（计划书「内核方案调整」明确 kernel-dsh-builtins 是"挂载并配置 DSH 已有能力"）。行集合变化是设计结果而非实现泄漏。升级只改期望值，**断言强度不变**：仍逐字段比对 id/name/config、仍断言蓝图不被物化修改              | `composition-builtins.test.mjs`（替代 19 行快照）；`kernel-dsh-00` 的该用例按本包 README §四同步  |
| D2  | `kernel-dsh-00` 合同测试 `identity.test.mjs` 的 `includeRuntimeContext:false` 断言升级为 `true`     | 审查结论要求修正该系统提示缺陷（计划书「内核方案调整」2026-10-20 结论第二条）。`includeHarnessIdentity:false` 与"无 Harness 身份句"断言**不变**                                                                                                      | `runtime-context.test.mjs` B14–B16；`kernel-dsh-00` identity 用例保留原断言并追加"含运行环境信息" |
| D3  | shell 工具子进程**看不到** `$DSH_SESSION_ID`/`$DSH_HOME`/`$DSH_SHELL` 等 DSH 托管变量               | 审查结论要求"工具子进程只去掉 `DSH_*`"；`dsh-shell-env` 无条件注入 `DSH_HOME`/`DSH_SHELL`，因此执行器在 `resolve()` 里丢弃 `spec.dshEnv`。这**减少**了能力而不是增加，符合"不改 DSH、按审查结论修正"的口径。旧内核本来就没有这些变量，不构成功能回退 | B11；README G1                                                                                    |
| D4  | 压缩阈值参数用 `thresholdRatio`/`headroomTokens` 推导，不照搬旧内核的 `窗口−预留−缓冲` 字段名       | DSH 的压缩后端只有占比 + 绝对余量两种旋钮，没有"输出预留"概念。本包按"**同值优先**"推导参数，使**有效阈值**等于旧内核的 166000（默认窗口）；两组数值与公式见 [interface.md](interface.md) §六                                                        | B18                                                                                               |
| D5  | todo 工具只有 DSH 的 `todo_write`（单工具整表替换），没有旧内核的 `TodoRead`/`TodoWrite` 两条       | DSH 的 todo 投影随会话提供"读"，不需要单独读工具。旧名映射属 `kernel-plugin-tools-*`，本包不伪造工具名                                                                                                                                               | B7；README G4                                                                                     |
| D6  | 计划模式提示文本由本包提供 Knorvia 口径的单一 section，不是旧内核 `plan-mode-prompts.ts` 的多段组织 | DSH 的 `section` 是单个必填字符串；多段/i18n 由 `kernel-plugin-policy` 与文案包扩展。本包只保证"激活后 prompt 含部署 section"可判定                                                                                                                  | B20；README G5                                                                                    |
| D7  | MCP 服务器在 boot 时生成行，运行期不能按会话增删                                                    | DSH 的 MCP 是启动期组合（`kernel-bridge-01` 合同 G7 已记录同一事实）。本包如实限制，不伪造运行期能力                                                                                                                                                 | B22；README G6                                                                                    |

## 二、本包边界（有意不做）

| #   | 差异                                                                      | 理由                                                                                  |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| D8  | 不实现 Knorvia 五种权限模式（plan/build/edit/yolo/auto）到 DSH 策略的映射 | `kernel-plugin-policy` 的范围；本包只挂 `sandbox-policy` + `user-approval` 两个执行点 |
| D9  | 不实现 Hook 7 事件                                                        | `kernel-plugin-hooks`                                                                 |
| D10 | 不实现缺的 Knorvia 工具（旧名兼容、补缺工具）                             | `kernel-plugin-tools-*`                                                               |
| D11 | 不做模型供应商与凭据注入                                                  | `kernel-plugin-credentials`；本包只保证凭据不落到工具子进程                           |
| D12 | 不切换默认引擎，不删旧运行时                                              | `kernel-switch`                                                                       |
| D13 | 不补旧协议 74 方法                                                        | `kernel-bridge-legacy`（已确认属预期中间态）                                          |
| D14 | 不做回合执行（`sendText` 等）                                             | `kernel-bridge-02`                                                                    |
| D15 | 不新增 `KNORVIA_*` 环境变量                                               | 计划书默认裁决「环境变量一律不变」                                                    |

## 三、DSH 事实（不是缺陷，但影响实现）

| #   | 事实                                                                                                                                   | 处置                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| D16 | `dsh-tool-bash`/`dsh-bash-sandbox` 在 win32 被官方 `disabled`，反之 pwsh 支在非 win32 被 disabled                                      | 两支都实现与配置（B2）；本机只能实测 pwsh 支，Linux CI 覆盖 bash 支（README G7）   |
| D17 | `dsh-subprocess` 的 `scrubbedParentEnv()` 剔除凭据形名与 `DSH_*`，但**显式 `env` 层在 scrub 之后合并**                                 | 这是修正一(a)(b) 可行的依据（实测 E1/E2）；落点见 [interface.md](interface.md) §三 |
| D18 | `dsh-shell-env` 是工具行的 `inject` 硬依赖，且 `collect()` 无条件注入 `DSH_HOME`/`DSH_SHELL`                                           | 执行器丢弃 `spec.dshEnv`（D3）；不摘掉 `shell-env` 行（工具行依赖它）              |
| D19 | `ShellExecutor` 文档明示"子类化 + 作为插件加载"是扩展方式                                                                              | 本包用该公开方式注入快照，不改 DSH 源码                                            |
| D20 | DSH 是预发布 SDK（0.2.0-rc.2），`Config` 形状不承诺兼容                                                                                | 锁定确切版本；升级单独验收（README G8）                                            |
| D21 | `dsh-system-prompt` 关闭 `includeRuntimeContext` 时会 `suppressRuntimeContext()` 抑制**所有** context 贡献                             | 修正二必须同时把该开关打开，否则注册的贡献不生效（B14 前提）                       |
| D22 | DSH 的 `renderContextSnapshot` 自带一行中性前缀 `Current runtime context. This snapshot supersedes earlier runtime-context snapshots.` | 该句不含品牌，保留；本包只增补字段，不改 DSH 输出格式                              |

## 四、暂缓验证（如实标注）

| #   | 项                                  | 原因                        | 归属                                                                   |
| --- | ----------------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| D23 | macOS 上 bash 支的 shell 子进程环境 | 本机无 macOS                | Linux CI 覆盖 POSIX 语义；macOS 标注未实机验证                         |
| D24 | 真实 MCP 服务器连通                 | 离线回归不依赖外部服务器    | 用最小 stdio 夹具断言行生成与字段映射；真机连通归 `kernel-switch` 验收 |
| D25 | 真实模型驱动的压缩触发              | 离线无法产生真实 token 压力 | 断言阈值推导与链路在位；真实压缩归 `kernel-switch` 真实模型冒烟        |
