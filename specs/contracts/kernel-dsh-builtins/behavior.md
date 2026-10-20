# kernel-dsh-builtins 行为合同

每条写：输入、输出、错误语义、时序与并发、幂等、资源释放、平台差异、状态所有者、日志级别。编号 B1、B2…，发布后编号不重用。

"能力本体归 DSH"是本合同的前提：以下条目描述的是**挂载与配置后的可观察行为**，不是重写 DSH 内部实现。凡"旧内核口径"指 `apps/cli/packages/core/src/**` 当前实现的效果（只作行为依据，不作代码依据）。

---

## B1 组合追加行的集合与顺序固定

- **输入**：`bootKernel({cwd, env, dataRoot})`。
- **输出**：`KERNEL_PLUGIN_ROWS` 在 `kernel-dsh-00` 的 19 行基础之上追加本包的行；物化到 `<DSH_HOME>/knorvia/kernel.cordis.json` 的行序列是**确定**的：同样输入两次物化，行的 id/name/config 逐字段相等。
- **语义**：追加行的 id 与既有 19 行不重名；既有 19 行的 id 与顺序不变（`kernel-dsh-00` B15 的断言对象是那 19 行，本包只在其后追加与替换执行器行）。
- **错误**：任一追加行 id 重复或包名解析不到 → `bootKernel` 抛 `KernelConfigError`（`kernel-dsh-00` B14 的失败路径），stderr 打 `knorvia-kernel-failed engine=dsh reason=config`，退出 1。
- **时序**：追加行在 config 物化前完成组装，不依赖任何服务的就绪。
- **幂等**：重复 `createKernelPluginRows(dshHome)` 不修改蓝图（返回新数组）。
- **资源释放**：行随 `ctx.fiber.dispose()` 一起卸载。
- **平台差异**：无。
- **状态所有者**：`bootstrap` 的 `KERNEL_PLUGIN_ROWS` 是组合的唯一事实源。
- **日志**：`info` `kernel.dsh.config.materialized`（含 path）；`debug` `kernel.dsh.rows`（含 id 列表）。

## B2 shell 执行器按平台二选一

- **输入**：`process.platform`。
- **输出**：`win32` 上组合含 Knorvia 的 pwsh 执行器行、不含 bash 执行器行；非 `win32` 上反之。两平台都恰好一个 `ctx.shell` 实现。
- **语义**：官方 `dsh-bash-local`/`dsh-bash-sandbox`/`dsh-pwsh-local`/`dsh-pwsh-sandbox` 在各自不适用的平台上被官方 `disabled`；本包用自己的执行器子类**顶替**对应平台那一行（同 id），不叠加第二个实现（`ctx.shell` 一个 context 只能有一个，加载第二个会抛）。
- **错误**：若两行同时挂载 → 服务重复注册错误 → 启动失败（B1 的失败路径）。
- **时序**：不适用（组合期决定）。
- **幂等**：不适用。
- **资源释放**：执行器随 fiber 卸载；其托管的子进程在 subprocess 服务释放时终止并等待。
- **平台差异**：本条就是平台差异的载体。macOS 走非 win32 支，如实标注未实机验证。
- **状态所有者**：`bootstrap` 组合。
- **日志**：`info` `kernel.dsh.platform`（platform/arch）。

## B3 不挂 Hook 兼容层、遥测、账号与本地凭据

- **输入**：组合清单。
- **输出**：追加行之后，组合仍**不含** `dsh-hooks-claude-code`、`dsh-hooks-codex`、`dsh-otel`、`session-telemetry-otel`、`dsh-deepseek-account*`、`dsh-credentials-local`。
- **语义**：本包挂的是工具/压缩/目标/计划/子 Agent/MCP/策略/审批，全都不出网、不读本机 DSH 账号。`DSH_TELEMETRY_DISABLED=1` 仍置位。
- **错误**：若出现上述行 → 组合断言失败（测试红）。
- **时序**：不适用。
- **幂等**：不适用。
- **资源释放**：不适用。
- **平台差异**：无。
- **状态所有者**：`bootstrap` 组合。
- **日志**：`info` `telemetry.composition=none`。

## B4 内置工具可用集合

- **输入**：boot 后的 `ctx.tools`。
- **输出**：以下模型可见工具名注册成功且能被 `ctx.tools.get(name)` 解析：shell 工具（`bash` 非 win32 / `pwsh` win32 的官方名）、`read`、`write`、`edit`、`glob`、`grep`、`todo_write`、`web_search`、`web_fetch`、`skill`、`job_output`（及 jobs 面其余注册项）、`exit_plan_mode`、`subagent`。
- **语义**：工具名与参数以 DSH 官方契约为准；本包不改工具 schema。除 `exit_plan_mode` / `subagent` / todo 外，工具集合由对应 DSH 工具包注册。
- **错误**：缺失任一承诺工具 → 测试红；工具执行失败按 DSH 自身错误语义（非零退出**不**算工具错误，只有基础设施失败才是 `isError`）。
- **时序**：工具注册在服务就绪后由各插件行完成；boot 返回时已注册。
- **幂等**：重复注册同名工具由 DSH 抛重复错误（本包不重复注册）。
- **资源释放**：工具 disposer 随 fiber 卸载。
- **平台差异**：shell 工具名按 B2。
- **状态所有者**：DSH `ToolRuntime`。
- **日志**：不新增；工具调用日志沿用 DSH。

## B5 shell 工具实际可执行

- **输入**：boot 后调用 shell 工具执行一条无副作用命令（如输出版本号/echo）。
- **输出**：工具返回文本包含预期输出；退出码为 0 时不带 `[exit code: N]` 标记。
- **语义**：本包必须**真实执行**，不是只注册。测试断言真实子进程输出。
- **错误**：非零退出按 DSH 语义在结果里报告，不是工具 error；沙箱拒绝带 `[sandbox: file access denied under <mode> mode]` 一类标记。
- **时序**：前台调用等命令结束或超时（`promoteOnTimeout` 默认 true 时超时转后台 job）。
- **幂等**：命令本身决定；工具层无幂等承诺。
- **资源释放**：后台 job 在 subprocess 服务释放时被终止并 join。
- **平台差异**：win32 走 pwsh 语法，POSIX 走 bash 语法；测试按平台选脚本。
- **状态所有者**：DSH `ShellExecutor` + `SubprocessRuntime`。
- **日志**：job 注册失败时 DSH 打 `warn`；本包不新增。

## B6 文件与搜索工具实际可执行

- **输入**：在工作目录写入一个已知内容的文件；调用 `read` 读回；调用 `glob`/`grep` 找它。
- **输出**：`read` 返回文件内容；`glob` 命中该文件；`grep` 命中目标行。
- **语义**：走 DSH 文件工具与沙箱文件系统；本包不改路径解析与输出格式。
- **错误**：文件不存在 → 工具 error（DSH 语义）；沙箱外写入被拒 → 标记。
- **时序**：单次调用内完成。
- **幂等**：读/搜索幂等；写/编辑按 DSH 语义（编辑有"先读后改"约束）。
- **资源释放**：文件句柄由 DSH 管理。
- **平台差异**：路径分隔符与大小写由 DSH 处理；测试用 `path.join`。
- **状态所有者**：DSH 文件系统 provider + `ToolRuntime`。
- **日志**：不新增。

## B7 todo 与技能注册

- **输入**：boot 后的 `ctx.tools`、`ctx.skills`、`ctx.sessionProjections`。
- **输出**：`todo_write` 已注册且其投影单元 `todos` 已注册；`ctx.skills` 服务存在（本包不挂任何技能来源，技能清单为空）。
- **语义**：`allowParallelInProgress` 按旧内核口径配置（旧内核允许并行 in-progress 任务，见 `core/src/tool/handlers/todo.ts` 的多任务语义）→ 配 `true`。技能来源由 `kernel-plugin-skills` 提供，本包只保证注册表在位。
- **错误**：缺 `todo_write` 或 `todos` 投影 → 测试红。
- **时序**：注册在 boot 完成时已生效。
- **幂等**：`todo_write` 自身按 DSH 语义（整表替换）。
- **资源释放**：随 fiber。
- **平台差异**：无。
- **状态所有者**：DSH `ToolRuntime` 与 `SessionProjectionRegistry`。
- **日志**：不新增。

## B8 沙箱策略与审批服务在位

- **输入**：boot 后的 `ctx.sandboxPolicy`、`ctx.approval`。
- **输出**：`sandboxPolicy.defaultMode` 等于组合配置值；`sandboxPolicy.resolve({session})` 返回会话 cwd 作为 `workspace-write` 边界；`ctx.approval` 在无应答者时对 ask 返回 `unavailable`（fail closed）。
- **语义**：本包只挂载与配置策略执行点，**不实现**Knorvia 五种权限模式到 DSH 策略的映射（`kernel-plugin-policy`）。旧内核的默认模式是 workspace-write（`core/src/permission/` 的既有默认），因此组合默认配 `workspace-write`；审批默认 `ask`。
- **错误**：缺任一服务 → 测试红。
- **时序**：`resolve` 是每次能力调用前求值，读会话日志的 `sandbox/mode` 覆盖。
- **幂等**：`resolve` 纯读。
- **资源释放**：随 fiber。
- **平台差异**：Windows 的沙箱执行器为 pwsh 支（B2）。
- **状态所有者**：`SandboxPolicyService` / `ApprovalService`。
- **日志**：审批的 `approval/asked`/`approval/decided` 审计事件由 DSH 写入会话日志（log-only）。

## B9 修正一（a）：用户普通变量在 shell 子进程可见

- **输入**：进程环境含 `KNORVIA_TEST_PLAIN_MARKER=<value>`；boot 后调用 shell 工具输出该变量的值。
- **输出**：子进程读到的值等于启动时的值。
- **语义**：用户环境快照在进程级清洗**之前**建立，因此普通变量一定在快照里。
- **错误**：为空/未定义 → 测试红（这正是 `kernel-dsh-00` 缺陷的表现）。
- **时序**：快照在 `prepareKernelEnvironment` 之前建立，此后不变（见 B13）。
- **幂等**：读取幂等。
- **资源释放**：不适用。
- **平台差异**：win32 用 `[Environment]::GetEnvironmentVariable`，POSIX 用 `printenv`/`$VAR`；测试两支都写。
- **状态所有者**：宿主 `bootKernel` 持有的快照。
- **日志**：`info` `kernel.env.snapshot`（只报条目数，不报键值）。

## B10 修正一（b）：凭据形用户变量在 shell 子进程可见

- **输入**：进程环境含 `MY_SERVICE_API_KEY=<value>`（用户自己的服务凭据，不是 DSH 或内置供应商名）；boot 后调用 shell 工具输出它。
- **输出**：子进程读到的值等于启动时的值。
- **语义**：这是审查结论点名的修正。`dsh-subprocess` 的 `scrubbedParentEnv()` 会剔除凭据形名，但 `childEnv(extra)` 在 scrub **之后**合并显式 `env`；Knorvia 执行器把快照作为显式 `env`，因此凭据形用户变量存活。凭据清理只约束 DSH 自身与模型适配（进程级仍删 `*_API_KEY`，模型适配读不到）。
- **错误**：读不到 → 测试红。
- **时序**：同 B9。
- **幂等**：读取幂等。
- **资源释放**：不适用。
- **平台差异**：同 B9。变量名在不同平台大小写敏感性不同，测试用大写名并在 win32 允许大小写不敏感匹配。
- **状态所有者**：同 B9。**注意**：快照只在进程内存在，不落盘、不进日志、不进会话记录。
- **日志**：同 B9（只报条目数）。**不得**记录任何快照键值。

## B11 修正一（c）：`DSH_*` 在 shell 子进程不可见

- **输入**：进程环境含宿主继承的 `DSH_*`（如 `DSH_KNORVIA_INHERITED`）；组合同时挂了 `dsh-shell-env`（会托管注入 `DSH_HOME`/`DSH_SHELL`）。boot 后调用 shell 工具输出这些名字。
- **输出**：`DSH_KNORVIA_INHERITED`、`DSH_HOME`、`DSH_SHELL`、`DSH_TELEMETRY_DISABLED` 在子进程里**都为空/未定义**。
- **语义**：两处合力——快照建立时剔除 `DSH_*`；执行器 `resolve()` 丢弃 `spec.dshEnv`（DSH 托管命名空间）。见 [known-differences.md](known-differences.md) D3。
- **错误**：任一 `DSH_*` 泄漏 → 测试红。
- **时序**：每次执行都丢弃，不是一次性。
- **幂等**：读取幂等。
- **资源释放**：不适用。
- **平台差异**：win32 环境名大小写不敏感，测试用大写名并同时检查小写形态不出现。
- **状态所有者**：Knorvia 执行器。
- **日志**：不新增。

## B12 快照早于进程级清洗

- **输入**：进程环境含一个既是用户变量、又会被 `kernel-dsh-00` 进程级清洗删除的名字（如 `ANTHROPIC_API_KEY`，它在 21 个供应商 key 清单里）。
- **输出**：boot 后 `process.env.ANTHROPIC_API_KEY` 已不存在（`kernel-dsh-00` B6 不变），但 shell 工具子进程里**存在**且值等于启动时。
- **语义**：这是"凭据清理只约束 DSH 自身与模型适配"的可判定形式：进程内清掉、子进程保留。
- **错误**：若子进程读不到或进程内还留着 → 测试红。
- **时序**：快照建立严格早于 `sanitizeProcessEnvironment()`。
- **幂等**：不适用。
- **资源释放**：不适用。
- **平台差异**：无。
- **状态所有者**：`bootKernel`。
- **日志**：`info` `kernel.env.sanitized`（只报删除数量，不报键名——沿用 `kernel-dsh-00`）。

## B13 快照不吸收启动后新增的变量

- **输入**：boot 完成后，在宿主进程里新增 `KNORVIA_TEST_AFTER_BOOT=<value>`；再调用 shell 工具输出它。
- **输出**：子进程里该变量**不存在**。
- **语义**：快照是启动时点的事实，不是活视图。避免"运行期任意写 process.env 就能注入工具子进程"的第二条写入路径。
- **错误**：若子进程能读到 → 测试红。
- **时序**：快照只在 boot 时建立一次。
- **幂等**：不适用。
- **资源释放**：不适用。
- **平台差异**：无。
- **状态所有者**：`bootKernel`。
- **日志**：不新增。

## B14 修正二：运行环境信息字段齐全

- **输入**：boot 后 `ctx.systemPrompt.assemble()`，再渲染运行上下文快照。
- **输出**：渲染文本包含以下六项，且取值来自真实宿主：
  1. 主工作目录 = 会话/宿主 cwd；
  2. 平台 = `process.platform`；
  3. shell = 当前平台的 shell 名（win32 `pwsh`，POSIX `bash`）；
  4. OS 版本 = `os.release()`（或等价的宿主读数）；
  5. 当前日期 = 装配时刻的本地日期（`YYYY-MM-DD`）；
  6. 时区 = 解析出的 IANA 时区。
- **语义**：与旧内核 `buildEnvInfoSection` + `buildCurrentDateSection` 的信息量对齐（见 README §三.2 对照表）。`includeRuntimeContext:true` 是本条的前提，否则贡献被抑制。
- **错误**：缺任一字段 → 测试红。
- **时序**：每次装配求值（不是一次性快照）。
- **幂等**：同一时刻两次装配文本相同（日期粒度到日、时区不变）。
- **资源释放**：无。
- **平台差异**：shell 与 OS 版本按平台；时区在无系统时区时回落到进程时区，测试允许该回落但要求非空。
- **状态所有者**：Knorvia 运行上下文插件行。
- **日志**：不新增（避免每次装配打日志）。

## B15 修正二：运行环境信息是动态的

- **输入**：以可注入的时钟与 cwd 构造两次装配（不同 `now`、不同会话 cwd）。
- **输出**：两次渲染的日期字段不同、工作目录字段不同；其余字段不变。
- **语义**：证明信息来自每次装配的求值，而不是启动时的字符串常量。
- **错误**：两次相同 → 测试红。
- **时序**：装配期求值。
- **幂等**：同参两次相同。
- **资源释放**：无。
- **平台差异**：日期按本地时区，测试用注入时钟避免跨日抖动。
- **状态所有者**：同 B14。
- **日志**：不新增。

## B16 修正二：装配结果不出现 DSH 品牌

- **输入**：同上装配 + `renderPrompt()`。
- **输出**：prompt 不含 `powered by DeepSeek Harness`、不含 `You are an AI agent powered by DeepSeek Harness.`、不含任何 `@deepseek-ai/` 包名；`sections` 不含 `harness:identity`；prompt 以 Knorvia persona 开头。
- **语义**：`includeHarnessIdentity:false` 保持（`kernel-dsh-00` B11 不变），本包只补运行环境信息，不打开品牌段。
- **错误**：出现任一品牌串 → 测试红。
- **时序**：不适用。
- **幂等**：不适用。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：`system-prompt` 行 config + Knorvia 上下文插件行。
- **日志**：不新增。

## B17 压缩链在位

- **输入**：boot 后的 `ctx.tokenMeter`、`ctx.compaction`、`ctx.toolResultPruner`、`ctx.commands`。
- **输出**：token 计量服务存在；自动压缩后端存在；工具结果裁剪服务存在；`/compact` 命令已注册（`ctx.commands` 可解析到它）。
- **语义**：四条能力由四个 DSH 包提供，缺一条则压缩链不完整（旧内核有自动压缩 + microcompact + 手动 `/compact`，见 `core/src/compact/`）。
- **错误**：缺任一 → 测试红。
- **时序**：自动压缩在步边界触发（DSH 语义）。
- **幂等**：压缩本身按 DSH 语义（检查点事件）。
- **资源释放**：随 fiber。
- **平台差异**：无。
- **状态所有者**：DSH 压缩服务与会话日志。
- **日志**：压缩事件写入会话日志（DSH 语义），本包不新增。

## B18 压缩阈值符合旧内核口径

- **输入**：组合里的压缩 `config`。
- **输出**：由该 config 推导出的有效压力阈值与旧内核公式 `有效窗口 − 缓冲` 的值一致（旧内核：`窗口 200000`、输出预留上限 21000、缓冲 13000 → 阈值 166000）；小窗口模型可由 `modelPolicies` 单独覆盖。
- **语义**：DSH 用 `thresholdRatio`（窗口占比）与 `headroomTokens`（绝对余量）表达压力，旧内核用 `窗口 − 预留 − 缓冲`。本包按"同值优先"推导参数而不是照抄字段名；推导过程与两组数值写进 [known-differences.md](known-differences.md) D4。
- **错误**：推导值与旧口径不符且未登记 → 测试红。
- **时序**：策略在每次模型请求前解析。
- **幂等**：纯读。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：`dsh-compaction-basic`。
- **日志**：DSH 打 `warn`（阈值配置不可用时）；本包不新增。

## B19 目标模式在位

- **输入**：boot 后的 `ctx.goals`、`ctx.commands`、`ctx.tools`。
- **输出**：`ctx.goals` 存在；`/goal` 命令与 goal 工具已注册；`defaultMaxGoalRounds` 等于组合配置值（旧内核的轮次上限语义见 `core/src/runtime/methods/target*`）。
- **语义**：目标由 DSH 目标服务以会话日志为存储；本包只配轮次上限与挂载。
- **错误**：缺服务/命令/工具 → 测试红。
- **时序**：轮次推进由 DSH `goal-round-driver` 驱动。
- **幂等**：目标创建按 DSH 语义。
- **资源释放**：随 fiber。
- **平台差异**：无。
- **状态所有者**：DSH `GoalService`（会话日志）。
- **日志**：不新增。

## B20 计划模式在位

- **输入**：boot 后的 `ctx.planMode`、`ctx.tools`、`ctx.systemPrompt`。
- **输出**：`ctx.planMode` 存在；`exit_plan_mode` 工具已注册（未激活时也在，保证请求工具目录稳定）；激活后装配的 prompt 含部署 section 文本；`plan` 投影单元已注册。
- **语义**：部署 section 由本包提供 Knorvia 口径文本（DSH 无内建文案）。
- **错误**：缺服务/工具/投影 → 测试红。
- **时序**：`set(agent, active)` 在回合边界提交，返回 `committed`/`queued`/`cancelled`/`noop` 之一（DSH 语义）。
- **幂等**：重复设为同值是 `noop`。
- **资源释放**：随 fiber。
- **平台差异**：无。
- **状态所有者**：`PlanModeController`（会话日志的 `plan/mode` 事件）。
- **日志**：不新增。

## B21 子 Agent 在位

- **输入**：boot 后的 `ctx.subagents`、`ctx.tools`。
- **输出**：`ctx.subagents` 有 `spawn` 与 `fork` 两个 provider；`subagent`（spawn，continuable）与 `subagent_fork`（fork，one-shot）工具已注册；子 Agent 控制工具与 `list_agents` 已注册。
- **语义**：provider 名与后台模式按 DSH 官方推荐组合；本包不新增子 Agent 实现。
- **错误**：缺 provider 或工具 → 测试红。
- **时序**：子 Agent 生命周期由 DSH 管理。
- **幂等**：按 DSH 语义。
- **资源释放**：子 Agent 随父会话/宿主释放。
- **平台差异**：无。
- **状态所有者**：DSH `SubagentRegistry`。
- **日志**：不新增。

## B22 MCP 客户端按 Knorvia 配置生成行

- **输入**：Knorvia 的 MCP 服务器配置（`bootstrap` 侧的 `McpServerConfig` 形态）作为 `bootKernel` 的可选入参。
- **输出**：每个启用的服务器生成一行 `dsh-mcp-client`，`serverName` 等于 Knorvia 侧服务器名，`transport` 与 `command`/`args`/`env`/`cwd` 或 `url`/`headers` 按配置映射；`ctx.mcp` 可见。禁用的服务器不生成行。
- **语义**：DSH 的 MCP 是启动期组合，不是会话级动态挂载；本包在 boot 时按配置生成，运行期变更需重启（缺口 G6）。不含真实服务器的测试用最小 stdio 服务器夹具或只断言行生成与字段映射。
- **错误**：配置缺必填字段 → `KernelConfigError`（启动失败路径）；服务器启动失败按 DSH 的 `failOnStartupError` 语义。
- **时序**：行在 boot 时物化，连接在服务激活时建立。
- **幂等**：同一配置两次 boot 生成同样的行。
- **资源释放**：连接随 fiber 关闭。
- **平台差异**：`command` 在 Windows 上可能需要 `.cmd` 后缀，映射时原样传递（由 DSH `resolveExecutable` 处理）。
- **状态所有者**：Knorvia MCP 配置（唯一所有者是 `bootstrap` 的 MCP 配置源）+ DSH MCP 客户端。
- **日志**：`info` `kernel.mcp.rows`（只报服务器名与数量，不报 headers/env 值——可能含凭据）。

## B23 默认引擎不受影响

- **输入**：不带 `KNORVIA_KERNEL_ENGINE=dsh`（缺省/空/其他值）。
- **输出**：进程不加载任何 `@deepseek-ai/*` 模块，不创建 DSH 对象，不建 `<DSH_HOME>`；`version`/`help` 输出与基线逐字节一致。
- **语义**：沿用 `kernel-dsh-00` B1/B2；本包新增的工具/压缩行只在 dsh 分支生效。
- **错误**：默认路径出现 DSH 模块加载记录 → 测试红。
- **时序**：模块加载记录在进程启动早期采集。
- **幂等**：不适用。
- **资源释放**：不适用。
- **平台差异**：测试在 Windows 与 Linux 都跑。
- **状态所有者**：`cli` 的引擎选择（`resolveKernelEngine`）。
- **日志**：不新增。

## B24 合同阶段可直接通过项

- **输入**：`knorvia version` / `knorvia help`，带与不带 `KNORVIA_KERNEL_ENGINE=dsh`。
- **输出**：两者输出一致，不出现就绪标记，不创建 `<DSH_HOME>`。
- **语义**：这是 `kernel-dsh-00` T1/T2 的延续，合同 PR 阶段即可通过、实现后必须继续通过。本包在此基础上断言"追加的组合行没有污染默认路径"。
- **错误**：任一不一致 → 测试红。
- **时序**：不适用。
- **幂等**：不适用。
- **资源释放**：不适用。
- **平台差异**：无。
- **状态所有者**：`cli` 入口。
- **日志**：不新增。
