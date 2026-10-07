# Studio Agent tools：功能通道 3 交接

基线：`be610f46a7c34a500ec443cb6e335a531f12937b`，v0.8.8。分支：`feat/studio-agent-tools-lane3`。实现独立编写，复用当前 Studio admission / executor / kernel / workspace；未复制 Paseo 实现，未改移动端、账号、签名、发布或版本。

## 交付与所有者

`knorvia_studio_agents` 通过现有 per-turn MCP 投影进入本机 Studio 回合。九个工具提供配置目录、选定内核派发、已拥有任务复用、状态、完整结果/分段结果、人工权限请求、取消、事件接收和 ACK。Host 从持久化 turn 绑定 caller，逐次检查租约、run/turn/attempt、成员/会话、项目与权限。用户批准继续及同一会话的后续回合可以复用原任务；同一群任务中的其他成员不能借用它。没有 approve/answer/configure 工具。

执行所有者仍为 `commandAdmission`、leased run/turn executor 与现有 workspace manager。`agent-task` / `agent-run-link` / `agent-operation` 仅记录派发归属与幂等回执。`agent-event` / `agent-result` / `agent-result-step` 为事务内生成的不可变派生证据；完整文本、所有文件引用、工作区物理身份与原有 output refs 可单独读取，不依赖 checkpoint 截断。旧 attempt 晚到帧不能覆盖新结果。

Host 可配置默认的并发、总子任务、深度、消息轮次、attempt、运行时间、通知投递次数和退避。未知外部结果不自动重跑；取消受理不冒充原生停止确认。所有派发使用已有隔离工作区，同一子任务复用真实会话和目录。

## 验证

- Node 24.14.0 / pnpm 10.33.2，固定 lockfile。
- `pnpm build:cli-packages`：17/17 成功；保留既有 dynamic-import / Turbo 输出声明警告。
- `pnpm typecheck`：通过；5497 对中英文键一致。
- `pnpm lint`：0 error；仅保留 `scripts/packaged-runtime-evidence.mjs:121` 既有 control-regex warning。
- 新增文件 `oxlint --deny-warnings`：通过。
- `pnpm architecture:check --changed`：0 violation / 0 baseline / 0 new；状态所有者未迁移。
- 最终定向测试：47/47，通过真实 SQLite、fake kernels 与真实 stdio MCP 子进程。覆盖并发/重复命令、不同 payload、重复事件、丢 ACK、重新开库、旧 attempt、成员归属、跨回合复用、权限、模型能力、busy 复用、取消不确定性、资源上限、1205 个文件引用和完整/分段结果。
- `studio-agent-provider.test.ts` 使用生产 shared-capability wrapper / `startCodex`，断言线程级 MCP 配置启动真实 stdio 工具进程，完成目录查询、派发、结果/文件引用读取、ACK，回合返回后凭据失效；仅替换原生协议响应，不调用模型。Antigravity / SSH 测试验证原生 warning 保留、无 workspace 的选项也显示限制、群聊运行显示 progress、未创建 grant，SSH 未收到本机 MCP 路径或配置。
- `pnpm test:studio`：810 个测试文件，8321 pass、8 skip、0 fail。广泛回归完成后，后续归属细化由上述最终定向测试再次验证。
- 生成并检查 provenance inventory、`pnpm fmt:check`：提交前执行，结果以 PR / final 报告为准。现有 26 项第三方材料义务保留，无全项目原创/许可完成声明。

## 集成接口与边界

工作区通道 PR #42 / `c6a8165529fa3ead5b559ab3a245cb2554c2a1df` 提供 `workspaceRuntime({runId, stepId, control?})`；本通道不重复 prepare/start/stop/recover/status 进程生命周期。仍使用 `StudioWorkspacePort.prepare`。潜在共同文件为 `app/turnExecutor.ts` 和 `node.ts`；由 integrator 协调接入，未 pull/cherry-pick 其他通道。

`turnExecutor` 增加 attempt fence 及持久化 caller 字段 `kernel` / `permission` / `workspacePath` / `conversationId`；为子任务使用 workspace manager 的物理 run/step 身份。`node.ts` 注入桥接，新增受信任 Host 参数 `agentPolicy` / `agentToolExecutablePath`，后者供打包环境提供能运行 Node `-e` 的执行程序。其他共同修改为 admission receipt helper、interaction/outcome outbox hook 与 shared MCP projection。未改 repository schema、`ports.ts`、renderer 或 runtime process controls。合并时重新生成合并后的 provenance 清单。

Portable MCP 没有通用的主动模型消息接口：模型调用 `get_events` 接收并 ACK 持久通知，原有 Studio timeline 同时显示去重消息；通知不会启动新 native run。SSH 工具派发暂不支持，等待环境通道归属桥接；Antigravity 没有每回合 MCP 入口。已配置 Agent bridge 时，两者在已有模型选项的共享资源兼容提示和会话 timeline progress 明示原因；普通内核回合继续执行。Knorvia 原生 registry 尚不提供模型目录，因此不能验证显式模型覆盖时会失败关闭。未调用真实付费 provider、账号登录或凭据配置；Windows/macOS 打包及原生 provider 验收留给集成环境。移动端明确排除。Integrator 拥有合并、版本与发布。

安装环境中的 `codex-cli 0.159.0-alpha.3` 原生探测在 initialize 前失败：既有 Codex home 位于只读文件系统，app-server 不能初始化 SQLite state runtime。已停止探测，未改 HOME / CODEX_HOME、权限或凭据；未调用 `turn/start`。生产适配器路径有上述可重放离线证据，真实原生二进制接受注入仍需要可写的正常集成环境。
