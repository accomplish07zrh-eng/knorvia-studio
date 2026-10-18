# kernel-dsh-00 行为合同（B1–B20）

编号发布后不重用。每条按九项写：输入、输出、错误语义、时序与并发、幂等、资源释放、平台差异、状态所有者、日志级别。

术语：

- **旧运行时**：`bootstrap` 现有的 `createKnorviaApp` / `KnorviaProtocolAgentServer` 路径。
- **新运行时**：`@knorvia/bootstrap/kernel` 用 DSH `boot()` 启动的 Cordis 树。
- **数据根**：`resolveKnorviaDataRoot(env)`（`KNORVIA_DATA_BASE_DIR/.knorvia-studio`、`KNORVIA_HOME` 或 `~/.knorvia-studio`）。
- **就绪行**：`knorvia-kernel-ready engine=dsh dsh=0.2.0-rc.2`（UTF-8，单行，`\n` 结尾）。
- **失败行**：`knorvia-kernel-failed engine=dsh reason=<config|boot|dispose>`。

---

## B1 引擎选择

- **输入**：协议命令 `app-server` 或 `agent-server` 的进程环境里的 `KNORVIA_KERNEL_ENGINE`。
- **输出**：值去首尾空白后**恰好**为 `dsh` → 新运行时；缺省、空、其他值（含 `DSH`、`dsh ` 以外的写法、`legacy`）→ 旧运行时。
- **错误语义**：不因取值非法而报错；非法值按旧运行时处理，不产生任何 DSH 副作用。
- **时序与并发**：选择发生在加载 `@knorvia/bootstrap` 之前；旧路径不 import 任何 `@deepseek-ai/*`。
- **幂等**：同一进程内选择结果只计算一次；运行期改环境变量无效。
- **资源释放**：旧路径不创建 DSH 对象，无需释放。
- **平台差异**：无；Windows 环境变量名大小写不敏感由操作系统处理，值的比较仍区分大小写。
- **状态所有者**：CLI 进程入口（`apps/cli/packages/cli/src/kernel-engine.ts`）。
- **日志级别**：`info` 记录 `kernel.engine=legacy|dsh`；不含其他环境变量值。

## B2 默认路径零回归

- **输入**：无 `KNORVIA_KERNEL_ENGINE`（或非 `dsh`）的任意既有命令。
- **输出**：与基线逐字节一致的用户可见行为；`app-server` 仍走旧 v4 服务器，`version`/`help`/`tui`/`prompt` 不变。
- **错误语义**：沿用旧路径。
- **时序与并发**：新代码不得在旧路径增加 await/tick；引擎判断必须是同步纯函数。
- **幂等**：是。
- **资源释放**：旧路径资源释放不变。
- **平台差异**：无。
- **状态所有者**：旧运行时保持原所有者。
- **日志级别**：不新增日志行；不得出现 `knorvia-kernel-*` 标记。

## B3 直接配置启动

- **输入**：新运行时启动请求（`bootKernel({cwd, env})`）。
- **输出**：用生成于 `<DSH_HOME>/knorvia/kernel.cordis.json` 的固定 entry 数组调用 `@deepseek-ai/dsh-app-boot` 的 `boot()`；不调用 `runProfile`、`loadProfileDirectory`、`readProfilePatches`、`loadOptionalPatches`。
- **错误语义**：配置生成失败、`boot()` 抛错 → `kernel-failed reason=boot`；部分树由 `boot()` 自行 dispose。
- **时序与并发**：先生成/覆盖配置文件，再 boot；boot 返回时整棵树已 settle。
- **幂等**：同一进程只允许一次成功 boot（见 B18）；配置文件内容对同一输入确定，重复启动覆盖为相同字节。
- **资源释放**：`KernelHost.dispose()` 调 `ctx.fiber.dispose()`，等待完成。
- **平台差异**：配置文件换行固定 `\n`；路径用平台分隔符但 JSON 转义正确。
- **状态所有者**：组合清单归 `bootstrap`；DSH 树归 Cordis 根 Context。
- **日志级别**：`info` `kernel.dsh.config.materialized`（只记路径）；`debug` 记 row id 列表。

## B4 DSH_HOME 隔离

- **输入**：数据根（B 术语）与继承环境。
- **输出**：新运行时把 `DSH_HOME` 设为 `<数据根>/dsh`（绝对路径），创建目录；`resolveDshHome()` 返回该路径。`~/.dsh` 不读不写。
- **错误语义**：目录创建失败 → `kernel-failed reason=boot`，错误信息只含路径，不含用户文件内容。
- **时序与并发**：在 boot 之前设置；boot 期间不变。
- **幂等**：重复启动解析同一路径；`mkdir` 幂等。
- **资源释放**：不删除 `DSH_HOME`（用户数据）。
- **平台差异**：Windows 用 `\`，POSIX 用 `/`；大小写按平台；不把 `~` 展开成非数据根。
- **状态所有者**：`bootstrap` 的 `prepareKernelEnvironment`。
- **日志级别**：`info` 记录 `dshHome`（路径可记，凭据不可记）。

## B5 不加载 `.env`

- **输入**：cwd 或 `DSH_HOME` 下存在 `.env`（含 `DSH_*`、供应商 key、任意哨兵变量）。
- **输出**：boot 前后 `process.env` 不因 `.env` 新增/覆盖任何键；不调用 `loadEnv` / `loadLayeredEnv`；不挂载 `dsh-credentials-local`、`dsh-shell-env`。
- **错误语义**：`.env` 不可读也不影响启动（根本不读）。
- **时序与并发**：boot 前完成，之后不再读取。
- **幂等**：是。
- **资源释放**：无文件句柄。
- **平台差异**：无。
- **状态所有者**：`bootstrap` 的环境准备。
- **日志级别**：不记录 `.env` 路径或内容；`debug` 可记“dotenv skipped”。

## B6 环境变量清洗

- **输入**：继承的 `process.env`，可能含 `DSH_*` 与供应商 key。
- **输出**：删除所有以 `DSH_` 开头的键；删除供应商 key 变量（至少 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`、`GOOGLE_API_KEY`、`GEMINI_API_KEY`、`MISTRAL_API_KEY`、`XAI_API_KEY`、`GROQ_API_KEY`、`OPENROUTER_API_KEY`、`AZURE_OPENAI_API_KEY`、`DASHSCOPE_API_KEY`、`MOONSHOT_API_KEY`、`ZHIPUAI_API_KEY`、`ZAI_API_KEY`、`BIGMODEL_API_KEY`、`SILICONFLOW_API_KEY`、`TOGETHER_API_KEY`、`FIREWORKS_API_KEY`、`COHERE_API_KEY`、`PERPLEXITY_API_KEY`，以及任意以 `_API_KEY` 结尾的键）；保留 `KNORVIA_*`、PATH、HOME 等非供应商变量。随后设置 `DSH_HOME` 与 `DSH_TELEMETRY_DISABLED=1`。
- **错误语义**：无；清洗是确定性的。
- **时序与并发**：在任何 DSH 插件求值之前原地修改 `process.env`；本次进程生命周期内不恢复。
- **幂等**：是。
- **资源释放**：无。
- **平台差异**：Windows 环境变量名大小写不敏感，删除时同时按原样与大写匹配。
- **状态所有者**：`bootstrap` 的环境准备。
- **日志级别**：`info` 记录删除的键数量，**不记录键名或值**；`debug` 也不记录值。

## B7 不加载 `.dsh/skills`

- **输入**：工作区存在 `.dsh/skills/<name>/SKILL.md`；`DSH_HOME` 存在 `skills/`。
- **输出**：两者都不进入 `ctx.skills`；本包不挂载任何技能来源（`skill-filesystem` 的 `includeDefaultRoots:false`，无 `customSkillDirs`）。
- **错误语义**：技能目录不可读也不影响启动。
- **时序与并发**：boot 后查询技能列表为空。
- **幂等**：是。
- **资源释放**：无 watcher（`watch:false`）。
- **平台差异**：路径不参与判断，因为根本不扫描。
- **状态所有者**：技能注册表归 DSH；Knorvia 技能来源后续由 `kernel-plugin-skills` 提供。
- **日志级别**：`debug` 记录 `skills.providers=0`。

## B8 不挂 Hook 兼容层

- **输入**：新运行时启动。
- **输出**：组合中没有任何 `@deepseek-ai/dsh-hooks-claude-code` / `dsh-hooks-codex` 行；`ctx` 上不出现它们的服务。
- **错误语义**：若未来有人加入该行，组合快照测试失败。
- **时序与并发**：不适用。
- **幂等**：是。
- **资源释放**：不适用。
- **平台差异**：无。
- **状态所有者**：Hook 能力后续归 Knorvia `kernel-plugin-hooks`（现有 7 事件）。
- **日志级别**：`debug` 记录 `hooks.compat=disabled`。

## B9 不挂遥测

- **输入**：新运行时启动；`DSH_TELEMETRY_DISABLED` 继承值任意。
- **输出**：组合中没有 `@deepseek-ai/dsh-otel`、`@deepseek-ai/dsh-session-telemetry-otel` 行；进程环境最终为 `DSH_TELEMETRY_DISABLED=1`；启动与空闲期间不发起遥测网络请求。
- **错误语义**：不适用。
- **时序与并发**：环境变量在 boot 前设置；组合在 boot 前固定。
- **幂等**：是。
- **资源释放**：无遥测 exporter 可释放。
- **平台差异**：无。
- **状态所有者**：组合归 `bootstrap`；遥测关闭是组合属性，不依赖运行期开关。
- **日志级别**：`info` 记录 `telemetry.composition=none`。

## B10 只用包内版本

- **输入**：PATH 中存在任意 `dsh` 可执行文件（可能是用户安装的不同版本）。
- **输出**：新运行时只从 `apps/cli` 依赖树解析 `@deepseek-ai/*`；不 spawn `dsh`，不读 PATH 中的 DSH，不读 `~/.dsh` 的程序文件。
- **错误语义**：包内依赖缺失 → `kernel-failed reason=boot`，错误列出缺失包名。
- **时序与并发**：模块解析发生在 boot 前/中；不缓存跨进程。
- **幂等**：是。
- **资源释放**：无子进程。
- **平台差异**：Windows 不做 `.cmd`/`.exe` 查找；POSIX 不做 `which`。
- **状态所有者**：`apps/cli` 的依赖声明。
- **日志级别**：`info` 记录 `dsh.version=0.2.0-rc.2`；`debug` 记录解析到的包根路径。

## B11 身份

- **输入**：新运行时装配系统提示。
- **输出**：`includeHarnessIdentity:false`、`includeRuntimeContext:false`；persona 前缀逐字为：

  ```text
  你是 Knorvia，Knorvia Studio 的内置助手。被问到实现时，如实说明基于开源的 DeepSeek Harness；被问到模型时，如实说明是用户配置的模型，不冒充其他模型。
  ```

  装配后的 prompt 含 `Knorvia`，不含 `You are an AI agent powered by DeepSeek Harness.`。

- **错误语义**：若 DSH 改变身份段实现，合同测试失败并要求升级合同。
- **时序与并发**：提示在每次模型请求前装配；persona 是静态文本。
- **幂等**：是。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：`dsh-system-prompt` 的 config 归组合清单。
- **日志级别**：不记录完整 prompt；`debug` 记录 section 名。

## B12 就绪标记

- **输入**：新运行时 boot 成功。
- **输出**：向 stderr 写**恰好一行** `knorvia-kernel-ready engine=dsh dsh=0.2.0-rc.2\n`；stdout 不写任何字节。
- **错误语义**：boot 失败不写就绪行，写 `knorvia-kernel-failed engine=dsh reason=<code>\n`。
- **时序与并发**：在整棵树 settle 之后、开始等待 stdin 之前写；只写一次。
- **幂等**：多次 `runKernelProcess` 调用各自独立进程；同进程重复就绪不重复写。
- **资源释放**：无。
- **平台差异**：换行固定 `\n`（测试按字节断言）。
- **状态所有者**：`runKernelProcess`。
- **日志级别**：标记行本身是 `info` 级诊断，不写日志框架前缀。

## B13 生命周期

- **输入**：boot 成功后 stdin EOF/close、`SIGTERM`、`SIGINT` 之一。
- **输出**：调用 `KernelHost.dispose()`；正常关闭退出码 0；SIGINT 可按 CLI 既有约定退出 130（本包只要求非挂起）。
- **错误语义**：dispose 失败 → `kernel-failed reason=dispose`，退出码 1。
- **时序与并发**：第一个关闭信号获胜；后续信号忽略；dispose 最多等待 5000ms，超时后仍退出并记录 `error`。
- **幂等**：dispose 只执行一次；重复调用返回同一 promise。
- **资源释放**：Cordis 根 fiber、文件锁、子进程由 DSH 的 disposal 负责；不得遗留事件循环句柄。
- **平台差异**：Windows 无 `SIGTERM` 语义时以 stdin close 与 `SIGINT` 为主；测试覆盖两者。
- **状态所有者**：`runKernelProcess`。
- **日志级别**：`info` `kernel.dsh.stopping/stopped`；dispose 超时 `error`。

## B14 失败语义

- **输入**：配置生成失败、依赖缺失、DSH entry 激活失败、审计失败。
- **输出**：stderr 写 `knorvia-kernel-failed engine=dsh reason=<config|boot>\n`，随后写一行 `Error: <message>\n`；`runKernelProcess` 返回退出码 1。已创建的部分 Context 由 `boot()` dispose。
- **错误语义**：错误信息不得包含凭据、`.env` 值、用户文件内容；可以包含包名、entry id、路径。
- **时序与并发**：失败即返回，不进入等待循环。
- **幂等**：是。
- **资源释放**：`boot()` 内部 catch 已 dispose 部分树；宿主不再二次 dispose。
- **平台差异**：无。
- **状态所有者**：`bootKernel` / `runKernelProcess`。
- **日志级别**：`error`，只记一次。

## B15 组合固定

- **输入**：新运行时启动。
- **输出**：entry 数组与 README §三 的 19 行完全一致（id、顺序、包名、config 关键值）；未知包/拼写错误会让 boot 失败而不是静默跳过。
- **错误语义**：组合常量被修改但 README/测试未同步 → 组合快照测试失败。
- **时序与并发**：boot 前生成一次。
- **幂等**：是。
- **资源释放**：无。
- **平台差异**：`platform` 相关行本包没有；后续包如有，按平台过滤并写测试。
- **状态所有者**：`bootstrap` 的 `KERNEL_PLUGIN_ROWS`。
- **日志级别**：`debug` 记录 row id 列表。

## B16 会话存储所有权

- **输入**：新运行时的会话持久化配置。
- **输出**：`session-persistence` 的 `root` 为 `<DSH_HOME>/sessions`；会话日志只写该目录；不写 Knorvia 旧库 `<数据根>/cli/db/db.sqlite`，不改其格式。
- **错误语义**：root 不可写 → boot 失败或首次写入失败，按 DSH 语义上报。
- **时序与并发**：写入由 DSH 的持久化后端串行化；本包不另开写入路径。
- **幂等**：同一会话 id 不重复创建（DSH 语义）。
- **资源释放**：dispose 时关闭写句柄、释放跨进程锁。
- **平台差异**：Windows 用 koffi 锁，Linux/macOS 用 node-addon-system flock；macOS 未实机验证。
- **状态所有者**：对话正文归 DSH 会话日志；Knorvia 元数据仍归 Host（后续 bridge）。
- **日志级别**：DSH 内部 `warn`/`error` 走 stderr；本包不重复记录正文。

## B17 平台差异

- **输入**：Windows 10/11、Linux；macOS 只做静态审查。
- **输出**：路径构造用 `node:path`；`DSH_HOME` 绝对化；大小写按平台；JSON 配置换行固定 `\n`；不使用 shell 拼接。
- **错误语义**：非绝对/非法路径 → `kernel-failed reason=config`。
- **时序与并发**：无平台特有计时。
- **幂等**：是。
- **资源释放**：原生锁按平台释放。
- **平台差异**：Windows 不使用 POSIX flock；Linux 不使用 koffi 的 Windows 分支；macOS 标注未实测。
- **状态所有者**：`bootstrap` 的路径工具。
- **日志级别**：`info` 记录 `platform`/`arch`。

## B18 单次启动

- **输入**：同一进程内第二次 `bootKernel()`。
- **输出**：第二次调用抛 `KernelAlreadyBootedError`（code `KERNEL_ALREADY_BOOTED`），不创建第二棵树。
- **错误语义**：错误信息只说明已启动，不泄露配置。
- **时序与并发**：并发两次调用时，先到者胜；后到者立即拒绝（不排队）。
- **幂等**：dispose 后可再次 boot（测试用）；生产进程只 boot 一次。
- **资源释放**：失败调用不持有资源。
- **平台差异**：无。
- **状态所有者**：`bootstrap/kernel` 的模块级状态；测试之间需 dispose。
- **日志级别**：`warn`。

## B19 日志

- **输入**：可选的宿主 logger（`debug/info/warn/error`）；缺省写 stderr。
- **输出**：生命周期用 `info`；可恢复异常用 `warn`；boot/dispose 失败用 `error`；组合与路径细节用 `debug`。不记录环境变量值、凭据、prompt 全文、会话正文。
- **错误语义**：logger 抛错不得中断启动；宿主边界吞掉并继续。
- **时序与并发**：日志同步写；不因日志阻塞 boot。
- **幂等**：同一次启动每条生命周期日志最多一次。
- **资源释放**：不持有 logger 资源。
- **平台差异**：无。
- **状态所有者**：`runKernelProcess` 的 logger 适配。
- **日志级别**：如上。

## B20 数据与协议不变

- **输入**：默认路径与开关路径。
- **输出**：默认路径的版本、帮助、v4 帧、环境变量与数据目录不变；开关路径不新增/修改 `KNORVIA_*` 变量、不写 `.knorvia-studio` 之外的用户数据、不改旧库、不改 localStorage/设置格式。
- **错误语义**：不适用。
- **时序与并发**：不适用。
- **幂等**：是。
- **资源释放**：不适用。
- **平台差异**：无。
- **状态所有者**：既有所有者不变；新运行时只新增 `$DSH_HOME`。
- **日志级别**：不新增默认路径日志。
