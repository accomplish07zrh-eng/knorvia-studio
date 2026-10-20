# kernel-dsh-builtins 合同（DSH 现成能力挂载与配置）

**合同版本：v1**（2026-10-20）

本目录是 M2 接入包 `kernel-dsh-builtins` 的合同。它的对象不是"替换旧模块"，而是**把 DSH 已有能力挂进固定组合并按旧内核行为配置**：内置工具、压缩、目标、计划模式、子 Agent、MCP 客户端、沙箱策略与审批，外加审查结论要求的两处修正。能力本体是 DSH 的，本包只决定"挂哪几行、每行配什么、以及两处必须由 Knorvia 侧补齐的语义"。

- 分支：`contract/kernel-dsh-builtins`（基线 `origin/main` `526825db`）；工作树 `wt/exec-kernel`；认领 issue：**#219**
- 前置合同：[`kernel-dsh-00`](../kernel-dsh-00/README.md) v1（新运行时能启动并就绪，19 行固定组合）、[`kernel-bridge-01`](../kernel-bridge-01/README.md) v1（v4 协议桥：准入、序号、快照、双链路）
- 依据：`specs/knorvia-builtin-kernel-dsh.md` 全文（隔离、身份、能力映射、包去向、旧数据、打包、验收）、`specs/knorvia-internal-plugins.md`「内核层（M2）」、计划书「内核方案调整」（含 2026-10-20 kernel-bridge-01 审查结论）、「接入包流程」、「接入门禁」。
- 事实来源：`@deepseek-ai/dsh@0.2.0-rc.2` 各子包发布类型与运行时实测（本机 Node 24.14.0 / Windows，探针记录见 [acceptance.md](acceptance.md) §六）；旧内核行为取自 `apps/cli/packages/core/src/**` 的当前实现（只读对照，不复制）。不读、不改 DSH 源码。

## 一、范围

### 1. 本包做什么

1. 在 `kernel-dsh-00` 的固定组合上**追加**能力行，让新内核具备与旧内核同等的：内置工具（shell、文件读写/编辑、搜索、todo、web、skill、jobs）、压缩（token 计量、自动压缩、工具结果裁剪、`/compact`）、目标模式、计划模式、子 Agent、MCP 客户端、沙箱策略与审批。
2. 按旧内核的既有效果配置这些行的 `config`（阈值、上限、开关），把每个数值的旧实现出处写进 [behavior.md](behavior.md)。
3. **修正一**：启动时保存用户环境快照，shell 工具子进程使用该快照且只去掉 `DSH_*`；凭据清理只约束 DSH 自身与模型适配。
4. **修正二**：系统提示补齐与旧内核同等的运行环境信息（工作目录、平台、shell、OS 版本、当前日期、时区），且不出现 DSH 品牌。
5. 为以上每条写契约测试；测试只走公开入口（`@knorvia/bootstrap/kernel` 子路径与 DSH 公开服务/事件），不 import 桥或 bootstrap 内部实现文件。
6. 新代码登记 `original`；DSH 子包按第三方依赖登记，不跑相似度。

### 2. 本包不做什么

- 不做 v4 命令 → DSH 会话操作的映射与回合执行（`kernel-bridge-02`）、不做其余 v4 命令（`kernel-bridge-03`）、不做旧协议 74 方法（`kernel-bridge-legacy`）。
- 不做模型供应商与凭据（`kernel-plugin-credentials`）、五种权限模式的产品语义（`kernel-plugin-policy`）、7 种 Hook 事件（`kernel-plugin-hooks`）、记忆、文件回退、动态工作流、技能来源。
  - 本包**挂载并配置** `dsh-sandbox-policy` / `dsh-user-approval`（策略执行点），**不实现** Knorvia 的 plan/build/edit/yolo/auto 五种模式到 DSH 策略的映射——那是 `kernel-plugin-policy`。
- 不做缺的 Knorvia 工具实现（`kernel-plugin-tools-*`）：本包只挂 DSH 已有工具。
- 不改 DSH 源码、不 fork、不 vendor；不新增 DSH 组合之外的运行期动态加载。
- 不切换默认引擎（`kernel-switch`）：新内核仍只在 `KNORVIA_KERNEL_ENGINE=dsh` 下运行。
- 不改协议字段、数据格式、`KNORVIA_` 环境变量、`.knorvia-studio` 数据目录。

## 二、DSH 公开接口事实（2026-10-20 实测）

> 结论来自 `@deepseek-ai/dsh@0.2.0-rc.2` 各子包的发布类型（`lib/types/*.d.ts`）与运行时探针。只记录接入需要的事实，不复制实现。

### 1. 本包要追加的插件行与关键 config

| 能力                  | 包                                                                                                                                    | 关键 config（实测自 `lib/types`）                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shell 执行（POSIX）   | `dsh-bash-local` / `dsh-bash-sandbox`                                                                                                 | `cwd`、`timeoutMs`(默认 120000)、`maxTimeoutMs`(600000)、`maxOutputBytes`(64000)、`maxSpillBytes`、`graceMs`                                                                                                                    |
| shell 执行（Windows） | `dsh-pwsh-local` / `dsh-pwsh-sandbox`                                                                                                 | 同上（`PwshLocalExecutor.Config`）                                                                                                                                                                                              |
| 沙箱运行器            | `dsh-sandbox-local`                                                                                                                   | `runnerCommand?`、`runnerFailureSignatures?`、`probeTimeoutMs?`                                                                                                                                                                 |
| 沙箱策略              | `dsh-sandbox-policy`                                                                                                                  | `mode`(`read-only`/`workspace-write`/`danger-full-access`，默认 `read-only`)、`workspaceRoot`                                                                                                                                   |
| 审批                  | `dsh-user-approval`                                                                                                                   | `policy`(`ask`/`never`，默认 `ask`，无应答者时 fail closed)                                                                                                                                                                     |
| 托管 shell 环境       | `dsh-shell-env`                                                                                                                       | `dshHome?`                                                                                                                                                                                                                      |
| 工具：shell           | `dsh-tool-bash` / `dsh-tool-pwsh`                                                                                                     | `enableRunInBackground`(默认 true)、`promoteOnTimeout`(默认 true)                                                                                                                                                               |
| 工具：文件            | `dsh-tool-fs`                                                                                                                         | —                                                                                                                                                                                                                               |
| 工具：搜索            | `dsh-tool-fs-search`                                                                                                                  | `sampleOverCapGlobResults`                                                                                                                                                                                                      |
| 工具：todo            | `dsh-tool-todo`                                                                                                                       | `allowParallelInProgress`(必填)                                                                                                                                                                                                 |
| 工具：web             | `dsh-tool-web`                                                                                                                        | `search`、`fetch`、`searchMaxResults`、`searchMaxQueries`、`fetchTimeoutMs`、`searchTimeoutMs`、`fetchMaxOutputChars`                                                                                                           |
| 工具：jobs            | `dsh-tool-jobs`                                                                                                                       | `waitTimeoutMs`、`maxWaitTimeoutMs`、`completionDelivery`、`maxConsecutiveWakes`                                                                                                                                                |
| 工具：skill           | `dsh-tool-skill`                                                                                                                      | —                                                                                                                                                                                                                               |
| 技能注册              | `dsh-skill` / `dsh-skill-filesystem`                                                                                                  | `collectCacheMaxEntries`；`includeDefaultRoots`、`watch`、`customSkillDirs`                                                                                                                                                     |
| 命令面                | `dsh-commands`                                                                                                                        | —                                                                                                                                                                                                                               |
| 压缩：计量            | `dsh-token-meter`                                                                                                                     | —                                                                                                                                                                                                                               |
| 压缩：自动            | `dsh-compaction-basic`                                                                                                                | `thresholdRatio`(0.8)、`headroomTokens`(65536)、`retainRatio`(0.16)/`retainTokens`、`summarizationProvider`/`summarizationModel`、`maxTokens`、`compactionRetries`(1)、`maxOverflowRetries`(1)、`auto`(true)、`modelPolicies[]` |
| 压缩：工具结果裁剪    | `dsh-compaction-tool-result-pruner`                                                                                                   | `thresholdChars`、`headChars`、`tailChars`                                                                                                                                                                                      |
| 命令：`/compact`      | `dsh-command-compact`                                                                                                                 | —                                                                                                                                                                                                                               |
| 目标                  | `dsh-goal` / `dsh-goal-round-driver` / `dsh-command-goal` / `dsh-tool-goal`                                                           | `dsh-goal`：`defaultMaxGoalRounds`                                                                                                                                                                                              |
| 计划模式              | `dsh-plan-mode`                                                                                                                       | `section`（必填，计划模式提示文本）                                                                                                                                                                                             |
| 子 Agent              | `dsh-subagent` + `dsh-subagent-spawn-in-process` / `dsh-subagent-fork-in-process` + `dsh-tool-subagent` / `dsh-tool-subagent-control` | provider 行：`providerName`；工具行：`provider`、`toolName`、`backgroundMode`                                                                                                                                                   |
| MCP 客户端            | `dsh-mcp-client` / `dsh-mcp-resources`                                                                                                | 每行一个服务器：`transport`、`serverName`、`command`/`args`/`env`/`cwd` 或 `url`/`headers`、`toolCallTimeoutSec`、`failOnStartupError`、`reconnect`                                                                             |
| 上下文/日期           | `dsh-system-prompt`（`context()`）+ 可选 `dsh-time-context`                                                                           | `includeRuntimeContext`、`PromptContext{name,order,text}`；`timeZone`、`refreshIntervalMs`                                                                                                                                      |

### 2. 子进程环境的实际清洗语义（修正一的落点依据）

三层事实（均实测）：

1. `dsh-subprocess` 导出 `scrubbedParentEnv()`：剔除**凭据形名**（`SENSITIVE_ENV_PATTERN = /KEY|PASSWORD|SECRET|TOKEN/i`）与全部 `DSH_*`（大小写不敏感），保留 `PATH`/`HOME`/locale/proxy。注释明确写：**显式 `env` 层在 scrub 之后合并，故意转发的凭据或 `DSH_*` 会存活**。
2. `dsh-subprocess-local` 的 `childEnv(extra)` = `scrubbedParentEnv()` 再叠加 `extra`（Windows 下按大写名去重后追加）。→ **显式 `env` 能拿回凭据形用户变量**。
3. `dsh-shell-env` 的 `ShellEnvRegistry.collect(exec)` 无条件产出 `{DSH_HOME, DSH_SHELL}`（有 `profileContext` 时再加 `DSH_PROFILE`/`DSH_PROFILE_DIR`），工具行把它作为 `spec.dshEnv` 传入；`LocalBashExecutor.spawnSpec` 的合并顺序是 `{...ENV_OVERRIDES, ...spec.env, ...spec.dshEnv}`。

→ 因此"只去掉 `DSH_*`"要成立，必须在执行器这一层同时做两件事：**注入用户快照**、**不把 `dshEnv` 继续往下传**。两者都通过子类化 DSH 公开基类实现（`ShellExecutor` 的文档明示 "Subclass, implement the abstract methods, and load the subclass as a plugin"），不改 DSH 源码。

### 3. 系统提示运行环境信息的落点

`dsh-system-prompt` 的 `SystemPrompt` 服务导出 `context(contribution)`：`PromptContext{name,order,text}`，`text` 可以是每次装配求值的函数；关闭 `includeRuntimeContext` 时这些贡献被 `suppressRuntimeContext()` 抑制。→ 打开 `includeRuntimeContext:true` 并注册一个 Knorvia 的 context 贡献即可补齐；`AssembleContext` 还带 `agent`，必要时可读会话 cwd。

### 4. 工具管线与事件

`dsh-tools` 的 `ToolRuntime` 暴露 `register(definition)`、`restrict(filter)`、`guard(check)`（单调否决，注册在 `tools/pre-execute` waterfall 之后）与事件 `tools/pre-execute` / `tools/execute` / `tools/post-execute` / `tools/result`。工具定义有 `execute`、可选 `projectContent`/`finalizeContent`。→ Knorvia 侧若要否决/改写工具调用，用 `guard` 或事件，不改 DSH。

### 5. 平台事实

- `dsh-tool-bash` 与 `dsh-bash-sandbox` 在 `win32` 被官方 `disabled`，改由 `dsh-tool-pwsh` / `dsh-pwsh-sandbox` 承担；反之在非 win32 上 pwsh 行被 disabled。两支必须都配置，本包修正一也必须同时覆盖两支。
- 本机（Windows，无 WSL）实测 bash 行启动后执行失败；pwsh 行正常。Linux CI 覆盖 bash 支。

## 三、修正一与修正二（审查结论，不是可选项）

### 1. 工具子进程环境快照

**现状（缺陷）**：`kernel-dsh-00` 的 `prepareKernelEnvironment()` 在进程级删除 `DSH_*`、`*_API_KEY` 与 21 个供应商 key 名。旧内核的 shell 工具子进程继承用户环境；进程级删除让用户项目脚本丢掉自己的环境变量——审查结论点名的 bug。

**本包做法**：

1. 在进程级清洗**之前**抓一份用户环境快照（`process.env` 的浅拷贝，剔除 `DSH_*`，其余原样保留，包含凭据形名）。快照由 `bootKernel` 在 `prepareKernelEnvironment` 之前建立并向下传递。
2. shell 执行器改为 Knorvia 子类（`SnapshotBashExecutor` / `SnapshotPwshExecutor`），在 `resolve()` 里把快照合并进 `spec.env`（快照为底、调用方显式 `env` 优先），并丢弃 `spec.dshEnv`（DSH 托管命名空间不进入用户项目脚本）。
3. `*_API_KEY` 的进程级清理**保留**（它保护 DSH 自身与模型适配不从环境读凭据），但它不再影响工具子进程——子进程拿的是快照。

**验收断言（测试须逐条断言，见 [behavior.md](behavior.md) B9–B11）**：

- (a) 用户普通变量（如 `KNORVIA_TEST_PLAIN_MARKER`）在 shell 工具子进程里**可见**；
- (b) 凭据形命名的**用户**变量（如 `MY_SERVICE_API_KEY`，非 DSH/供应商 key）在 shell 工具子进程里**可见**；
- (c) `DSH_*`（含宿主继承的与 `dsh-shell-env` 托管注入的）在 shell 工具子进程里**不可见**。

### 2. 系统提示运行环境信息

**现状（缺陷）**：`kernel-dsh-00` 设 `includeRuntimeContext:false`，模型看不到工作目录、平台、日期等。

**本包做法**：改为 `includeRuntimeContext:true`，并由一个 Knorvia 插件行注册 `systemPrompt.context()` 贡献，内容与旧内核对齐：

| 旧内核来源                                                    | 字段                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `core/src/context/sections/env-info.ts` `buildEnvInfoSection` | `Primary working directory`、`Is a git repository`、`Platform`、`Shell`、`OS Version` |
| 同上 `buildGitSystemContextSection`                           | `Current branch`、`Main branch`、`Git user`、`Status`、`Recent commits`               |
| `core/src/context/sections/current-date.ts`                   | `Today's date is <date>`                                                              |
| `core/src/context/sections/identity.ts`                       | 安全提示行与 `# Harness` 块（Knorvia 口径）                                           |

`includeHarnessIdentity:false` 与 `personaPrefix`（Knorvia 开场）保持不变；装配结果不得出现 `powered by DeepSeek Harness` 或 DSH 包名。

## 四、已有契约测试的复用

计划书「接入包流程」第 2 条要求列出"走公开协议入口、对新运行时同样适用"的已有契约测试。

| 套件                                                         | 入口                          | 走公开协议入口？  | 对新运行时的要求                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ----------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specs/contracts/shared-01`（v4 schema/帧）                  | `@knorvia/shared/protocol-v4` | 否（纯编解码）    | **继续全过**。本包不改这些模块。                                                                                                                                                                                                                                           |
| `specs/contracts/kernel-dsh-00/tests/**`                     | `@knorvia/bootstrap/kernel`   | 否（宿主级）      | **继续全过**。本包会改 `KERNEL_PLUGIN_ROWS`（追加行）与 `system-prompt` 行 config，因此该套件的 `composition.test.mjs`（B15 行快照）与 `identity.test.mjs` 的期望值**按本包合同升级**——见 [known-differences.md](known-differences.md) D1/D2，属于合同演进，不是放宽断言。 |
| `specs/contracts/kernel-bridge-01/tests/**`                  | `app-server --stdio` NDJSON   | 是（v4 运行时级） | **必须继续全过**。本包不碰桥；桥的 20 个用例是"挂载没有破坏协议面"的回归证据。                                                                                                                                                                                             |
| `apps/cli/packages/bootstrap/test/*contract*.test.ts`        | bootstrap 模块级              | 否                | **继续全过**。本包不动 `protocol-v4/**`。                                                                                                                                                                                                                                  |
| `specs/contracts/core-tool-01`、`core-tool-handlers-bash-01` | 旧内部工具端口                | 否                | **不迁移**。只测旧 `core` 工具实现，随旧包删除；本包把其中"工具行为"条目按 DSH 工具语义在 [behavior.md](behavior.md) 重新列出。                                                                                                                                            |

- 本包自己的测试同时以源码入口（`KNORVIA_KERNEL_ENTRY=source`）与 dist 入口跑，见 [acceptance.md](acceptance.md)。

## 五、条目 → 测试对照表

> 接入包例外：无"旧实现"可录旧门；新增路径的测试随实现 PR 落地。合同 PR 只带能立即通过的两条（T1/T2），CI 必须绿。

| 条目                               | 测试文件 · 用例                                                                               | 覆盖     |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | -------- |
| B1 组合追加行固定                  | `composition-builtins.test.mjs` · 行 id/顺序/包名快照                                         | 组合     |
| B2 平台二选一                      | `composition-builtins.test.mjs` · win32 只挂 pwsh 支、非 win32 只挂 bash 支                   | 平台     |
| B3 无 Hook/遥测/账号/凭据行        | `composition-builtins.test.mjs` · 仍是零 Hook 兼容层、零遥测                                  | 隔离     |
| B4 工具可用集合                    | `tools-mount.test.mjs` · `ctx.tools.get()` 列出本包承诺的工具名                               | 工具     |
| B5 工具实际可执行（shell）         | `tools-mount.test.mjs` · 真实跑一条命令并断言输出                                             | 工具     |
| B6 工具实际可执行（文件与搜索）    | `tools-mount.test.mjs` · 写读回、glob/grep 命中                                               | 工具     |
| B7 todo 与 skill                   | `tools-mount.test.mjs` · `todo_write` 注册、`ctx.skills` 存在                                 | 工具     |
| B8 沙箱与审批服务在位              | `policy-approval.test.mjs` · `ctx.sandboxPolicy`/`ctx.approval` 解析与 fail-closed            | 策略     |
| B9 用户普通变量可见（修正一 a）    | `child-env.test.mjs` · shell 子进程读到 `KNORVIA_TEST_PLAIN_MARKER`                           | 修正一   |
| B10 凭据形用户变量可见（修正一 b） | `child-env.test.mjs` · shell 子进程读到 `MY_SERVICE_API_KEY`                                  | 修正一   |
| B11 `DSH_*` 不可见（修正一 c）     | `child-env.test.mjs` · 宿主继承与 `dshEnv` 托管两支都不可见                                   | 修正一   |
| B12 快照早于清洗                   | `child-env.test.mjs` · 进程级已删的 key 仍在子进程可见                                        | 修正一   |
| B13 快照不含启动后新增变量         | `child-env.test.mjs` · boot 后设置的新变量不进子进程                                          | 修正一   |
| B14 运行环境信息齐全（修正二）     | `runtime-context.test.mjs` · 六个字段逐条断言                                                 | 修正二   |
| B15 运行环境信息动态               | `runtime-context.test.mjs` · 日期随装配时刻变化、cwd 随会话变化                               | 修正二   |
| B16 无 DSH 品牌（修正二）          | `runtime-context.test.mjs` · 装配结果无 Harness 身份句与 DSH 包名                             | 修正二   |
| B17 压缩链在位                     | `compaction-mount.test.mjs` · token 计量/自动压缩/结果裁剪/`/compact` 服务与命令在位          | 压缩     |
| B18 压缩阈值符合旧内核口径         | `compaction-mount.test.mjs` · 由 config 推导的阈值与旧内核公式一致                            | 压缩     |
| B19 目标模式在位                   | `goal-plan.test.mjs` · `ctx.goals` 存在、`defaultMaxGoalRounds` 生效                          | 目标     |
| B20 计划模式在位                   | `goal-plan.test.mjs` · `ctx.planMode` 存在、`exit_plan_mode` 已注册、激活后提示含部署 section | 计划     |
| B21 子 Agent 在位                  | `subagent-mcp.test.mjs` · `ctx.subagents` 有 spawn/fork 两个 provider、`subagent` 工具已注册  | 子 Agent |
| B22 MCP 客户端配置                 | `subagent-mcp.test.mjs` · 由 Knorvia MCP 配置生成的行、`ctx.mcp` 可见                         | MCP      |
| B23 默认引擎不受影响               | `default-engine.test.mjs` · 无 `KNORVIA_KERNEL_ENGINE=dsh` 时不加载任何 `@deepseek-ai/*`      | 隔离     |
| B24 合同阶段可直接通过项           | `default-engine.test.mjs` · `version`/`help` 与基线一致                                       | 合同 PR  |

## 六、计分模式

- 本包新增文件全部登记 `original`、`Apache-2.0`（每文件首行 SPDX）。仍按计划书对旧 `core` 对应文件与上游固定提交跑两道门槛，证明没有照搬：
  - 行相似度：规范化包含率 < 0.20，最长相同段 < 8 行（<10 行文件必须 0）。
  - 结构相似度：< 0.40。
- 比较对象（实现 PR 的 `--old-list`）：`core/src/context/**`（系统提示与运行环境信息）、`core/src/compact/**`（压缩配置口径）、`core/src/tool/**`（工具挂载与 shell 环境）、`core/src/permission/**`（策略配置），以及上游 `872ad960` 对应路径。
- DSH 子包按第三方依赖登记，**不跑相似度**、不登记 `original`。
- 声明模式：若实现中出现只含签名的转发模块，按 `--declaration` 补测并在 PR 说明。

## 七、完成度

| 步骤                                     | 状态                                           |
| ---------------------------------------- | ---------------------------------------------- |
| DSH 能力与 config 侦察（§二）            | ✅                                             |
| 修正一可行性实测（三条断言）             | ✅（[acceptance.md](acceptance.md) §六 E1–E7） |
| 修正二可行性实测（字段清单）             | ✅（同 §六 E5）                                |
| `behavior.md` B1–B24                     | ✅                                             |
| `interface.md` / `callers.md`            | ✅                                             |
| `tests/`（合同阶段 B23/B24）             | ✅                                             |
| `fixtures/`                              | ✅                                             |
| `known-differences.md` / `acceptance.md` | ✅                                             |
| 实现 PR                                  | ⬜                                             |

## 八、缺口清单（DSH 做不到或语义不符）

| #   | 缺口                                                                                                                    | 影响                             | 处置                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | `dsh-shell-env` 无条件注入 `DSH_HOME`/`DSH_SHELL`（工具行硬依赖它）                                                     | 与"工具子进程只去掉 `DSH_*`"冲突 | 执行器子类丢弃 `spec.dshEnv`；代价是模型看不到 `$DSH_SESSION_ID` 一类新引入的便利变量（旧内核没有），记入 [known-differences.md](known-differences.md) D3 |
| G2  | 工具行与执行器是两行；`shell` 服务一个 context 只能有一个实现                                                           | 要用子类就顶替官方执行器行       | 组合里用子类行替换官方 `dsh-bash-local`/`dsh-pwsh-local` 行（同 id），不新增第二个 `ctx.shell`                                                            |
| G3  | `dsh-compaction-basic` 的自动压缩用 `thresholdRatio`/`headroomTokens`，与旧内核 `窗口−输出预留−缓冲` 公式的参数形状不同 | 阈值不能逐字等同                 | 用 `modelPolicies` + 顶层字段推导出与旧内核同值的有效阈值，进 `known-differences.md` D4 并带测试                                                          |
| G4  | DSH 的 todo 工具是 `todo_write`（单个），旧内核有 `TodoRead`/`TodoWrite`                                                | 工具名不一一对应                 | 本包只挂 DSH 的 `todo_write`；`TodoRead` 等旧名映射由 `kernel-plugin-tools-*` 处理，本包在 [known-differences.md](known-differences.md) D5 列明           |
| G5  | `dsh-plan-mode` 的 `section` 是必填纯文本，无内建 i18n                                                                  | 计划模式提示语需要自己写         | 组合里写 Knorvia 口径的 section（中英按界面语言由 `kernel-plugin-policy`/文案插件处理，本包先给单一文案）                                                 |
| G6  | DSH 的 MCP 是启动期组合行，不是 per-session 动态挂载                                                                    | 会话级 `mcpServers` 不能运行期加 | 本包按 Knorvia MCP 配置在 boot 时生成行；运行期变更由 `kernel-bridge-02/03` 按既有 ACK 语义表达（重启生效），缺口记录在此                                 |
| G7  | Windows 上 bash 支被官方 disabled，无 WSL 时不可用                                                                      | 本机只能实测 pwsh 支             | 两支都实现与配置；Linux CI 覆盖 bash 支；macOS 如实标注未实测                                                                                             |
| G8  | DSH 是预发布 SDK（0.2.0-rc.2）                                                                                          | 升级可能改 config 形状           | 锁定确切版本；升级单独验收                                                                                                                                |

**红线**：以上缺口一律在 Knorvia 侧适配或不实现，**不改 DSH 源码**，不放宽断言。

## 九、接口与调用方

见 [interface.md](interface.md) 与 [callers.md](callers.md)。本包对外的变化只有：

- `@knorvia/bootstrap/kernel` 子路径新增本包的公开导出（供 CLI 与测试使用，见 interface.md）；
- `KERNEL_PLUGIN_ROWS` 的行集合扩展（行 id 追加，既有行 id 不变）；
- `system-prompt` 行的 `includeRuntimeContext` 由 `false` 改为 `true`。

不改任何 v4 协议字段、旧协议方法、用户数据格式、`KNORVIA_` 环境变量或数据目录。
