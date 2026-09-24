# Studio 外部内核适配

公开入口是 `createStudioKernelRegistry({ dataDir, builtin })`。只管理由此注册表启动的进程和 `dataDir/kernels` 内的安装副本。Knorvia 内核由应用层注入，运行状态由 `sink.emit`/`sink.ask` 持久化。切换内核创建新会话；恢复必须显式传递保存过的 `nativeSessionId`，从不取 CLI 最近会话。

`inspect(configs)` 执行无模型的 `--version` 探测。路径优先级是显式配置、Studio 副本、本机 PATH/官方安装目录。`run` 的覆盖路径通过 `turn.executablePath`；Node shim 根据已安装包的 `bin` 元数据解析，不拼接 Shell。没有 `turn.model` 时不指定模型，沿用原 CLI 配置。

新增候选由 `acpCatalog.ts` 的描述符统一登记：OpenCode `opencode acp`、Qoder CLI `qoder --acp`、Qoder CN CLI `qoderclicn --acp`、Gemini CLI `gemini --acp`、goose `goose acp`、Kimi CLI `kimi acp`、GitHub Copilot CLI `copilot --acp --stdio`、Hermes Agent `hermes acp`、Qwen Code `qwen --acp`、Mistral Vibe `vibe-acp`、DeepSeek Harness `dsh --profile acp`。Hermes 的 ACP 是可选安装项，版本与协议握手均成功后才显示可用。预置项只接入电脑上的已有 CLI，不接管其安装、更新、卸载或登录。发现先读版本，再以独立短命进程做 ACP v1 `initialize`；路径存在但协议握手失败显示不可用。有限范围内探测 PATH、用户 npm、uv、Cargo、Bun、常见用户 bin，不递归扫描程序目录或尝试 IDE 私有模块。

Qoder CN 与国际版是不同入口；Windows 优先寻找用户目录 `.qoder-cn/bin/qoderclicn/qoderclicn.exe` 中的原生程序，不运行 `qodercn.cmd` 的 PowerShell 分派器。通过 `npx` 使用的 DeepSeek Harness 可能没有 `dsh` PATH 命令，此时只读取现有 `.dsh/profiles/node_modules/@deepseek-ai/dsh` 的包元数据和入口，不执行 npx 或下载。两者的发现阶段使用各自的临时 HOME/DSH_HOME，版本探测和 ACP 握手不初始化用户正常目录；结束后删除经过路径校验的临时目录。DeepSeek Harness 首次隔离 ACP 握手在此机约需 20 秒，每次完整刷新会重复，后续可对已核验的同版本可执行文件做短时缓存。实际聊天仍使用用户原本的配置目录。

手动扩展入口是 Studio 数据目录的 `kernels/acp/<slug>.json`。例如 `{"displayName":"Local Agent","command":"C:/Tools/local-agent.exe","args":["acp"]}`；slug 由 1–64 位小写字母、数字或连字符组成。必须写绝对程序路径，清单无效时管理页显示文件名与原因。命令不经 shell，也不会读取原 CLI 的认证文件。自定义会话 ID 是 `acp:<slug>`；删除清单不删除已保存的对话。一个自定义内核的配置路径不能覆盖清单中的命令。

通用 ACP 适配仅使用原生报告的模型与思考选项。`kernelOptions(model)` 在无模型推理的临时会话中切换到指定模型并读取该模型的档位；任何显式设置都在 prompt 前核验原生回显。没有原生模型目录时仍能使用 CLI 自身默认模型聊天。共享 MCP 通过会话请求传入；stdio 命令在有限 PATH 范围解析为绝对路径，HTTP/SSE 需要 ACP 初始化能力明确声明。CLI 未声明的权限、客户端文件/终端请求不会被静默放行。OpenClaw 的 `openclaw acp` 依赖另行运行的 Gateway，暂通过显式清单接入，不将只有桌面 GUI 的内部执行模块误识别为 Qoder CLI。

Google Antigravity CLI 使用独立的 `agy` headless NDJSON 协议，不按 ACP 处理。Windows 可在 `%LOCALAPPDATA%/agy/bin/agy.exe` 自动发现；版本探测不推理也不登录。每轮通过 stdin 送入用户输入，不把正文置于进程命令行；读取 `init`、`step_update`、`result`，映射文本、工具、用量和原生 conversation ID。恢复只使用 Studio 保存的明确 ID。模型目录来自只读 `agy models`；未登录时保留安装状态，模型目录显示原 CLI 的登录错误，不替用户登录。询问模式遵守 agy 的 headless 策略：需要审批的工具可能被软拒绝，Studio 没有逐工具审批通道；完全访问只在明确选择时启用 `--dangerously-skip-permissions`，只读仍不宣称可强制。取消只终止 Studio 启动的 agy 进程树，未获原生终态时沿用结果未知语义。Skill 文本目录按原共享流程传递；agy 目前没有安全的每会话 MCP 注入参数，因此 Studio 显示兼容提示，不修改 CLI 全局 `mcp_config.json` 或项目 `.agents` 目录，也不冒充 MCP 已跨核生效。

## 原生协议与交互

- Codex：`app-server --listen stdio://`；`initialize`、`thread/start|resume`、`turn/start`，JSONL 双向 RPC。文本/工具/用量事件分别归一，完整消息与 delta 去重；支持命令、文件、额外文件/网络权限审批及 `requestUserInput`。模型或沙箱回显不符合显式请求时停止。
- Claude Code：`-p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --permission-prompt-tool stdio`，control initialize/can_use_tool/interrupt；`AskUserQuestion` 单独传答案，保留原工具输入。新 UUID/明确 `--resume`，保持 stdin 至该轮 result。
- Grok Build：`agent --no-leader stdio`，ACP initialize、复用已存在认证、session/new/load/prompt/cancel。没有真实实现的客户端 fs/terminal 能力不广告；冷恢复历史事件不重新追加。支持原审批 optionId 和 x.ai 提问/计划审批扩展。不会自动发起网页登录。

运行没有固定轮数或总时长限制。握手 RPC 有 25 秒响应期限；Grok `session/prompt` 明确不设固定期限。用户取消先发原生 interrupt/cancel，再等原生终态；10 秒仍无确认才终止所属进程树并记为 `interrupted/resultKnown:false`，不冒充已取消或自动重试。退出发生在提交之后也标未知结果。确定的原生 RPC 错误（例如 402）为已知失败。流事件按顺序 await sink，提问前先等待已有事件落盘，回答 await sink 后才发回内核。

权限采用 CLI 自身能力：Codex 可请求强制只读；Claude/Grok 在此 Windows 接入中无法保证 OS 只读，明确拒绝 read-only，不静默改为 ask。Knorvia 的只读能力也标为 false。ask 不写入 CLI 的永久授权规则；已有 CLI 原生规则仍可能允许部分工具直接运行，不能宣传成所有工具都经 Studio 审批。full-access 仅对应用户明确选择的模式。

## 安装来源与边界

- Codex 官方 npm 元数据/平台包：<https://registry.npmjs.org/@openai%2Fcodex/latest>；核对 `dist.integrity` SHA-512，解包拒绝越界、链接与未知扩展条目，验证实际 `--version`。
- Claude 官方安装器来源：<https://claude.ai/install.ps1>；其发布源 <https://downloads.claude.ai/claude-code-releases/latest>、版本 `manifest.json` 提供平台 SHA-256。直接取得并校验原生二进制，不运行会修改用户目录的安装脚本。
- Grok 官方安装器来源：<https://x.ai/cli/install.ps1>；其 GCS 官方回源 <https://storage.googleapis.com/grok-build-public-artifacts/cli/stable>。该源没有核实到 SHA-256 sidecar，采用官方 HTTPS 对象 `x-goog-hash` MD5 校验传输，再保存本地 SHA-256。此步骤不是发行者数字签名；缺少完整性元数据就拒绝安装。

安装先写独立 staging，校验后提交独立版本目录与原子清单指针；失败不改变旧版本。运行租约与管理锁均在磁盘，避免不同窗口同时卸载/更新正在执行的内核。只清理带 Knorvia 所有权清单的副本，不运行全局卸载命令，不删除 `.codex`/`.claude`/`.grok` 的登录或会话。遇到异常所有权记录、目录重定向或存活管理锁时拒绝处理；死进程锁可恢复，恢复令牌保留小墓碑以防并发误删新锁。

## 协议依据与验证

- Codex：<https://learn.chatgpt.com/docs/app-server>；本机 0.151.0 `app-server generate-json-schema --experimental` 的 schema。
- Claude：<https://code.claude.com/docs/en/agent-sdk/user-input>、<https://code.claude.com/docs/en/agent-sdk/permissions>；官方 SDK <https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/query.py> 与 `transport/subprocess_cli.py`。
- Grok：<https://docs.x.ai/build/cli/headless-scripting>、<https://agentclientprotocol.com/protocol/v1/prompt-turn>；公开 <https://github.com/xai-org/grok-build> 的 AskUserQuestion/ACP 实现。未使用旧 Knorvia 废弃实现。
- OpenCode：<https://opencode.ai/v2/docs/cli/acp/>；Qoder：<https://docs.qoder.com/cli/acp>；Qoder CN：<https://docs.qoder.cn/en/cli/acp>；Gemini CLI：<https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md>。
- goose：<https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/goose-cli-commands.md>；Kimi CLI：<https://github.com/MoonshotAI/kimi-cli/blob/main/docs/en/reference/kimi-command.md>；GitHub Copilot CLI：<https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server>。
- Hermes Agent：<https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md>；Qwen Code：<https://github.com/QwenLM/qwen-code/blob/main/docs/users/configuration/settings.md>；Mistral Vibe：<https://github.com/mistralai/mistral-vibe/blob/main/docs/acp-setup.md>。
- DeepSeek Harness ACP：<https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/acp/acp/README.md>。其 `--profile acp` 仅提供标准自动化协议，不提供原应用的专用界面。
- Google Antigravity CLI：<https://antigravity.google/docs/cli/headless/>、<https://antigravity.google/docs/cli/modes/>；本机 `agy --help` / `--version` 为 1.2.2。它的原生流输入与 ACP 不同，不能仅靠 CLI 路径存在就走 ACP 握手。
- 通用 ACP 模型配置与 MCP 会话传递：<https://agentclientprotocol.com/protocol/v1/session-config-options>、<https://agentclientprotocol.com/protocol/v1/session-setup>。OpenClaw Gateway 桥接边界：<https://docs.openclaw.ai/cli/acp>。

离线 fixtures 覆盖三 CLI 双轮恢复、审批/提问、取消、断线、402、版本安装原子性、跨实例租约、下载完整性和安全解包；不发模型请求、不替用户登录、不实际安装用户 CLI。2026-09-22 真实版本探测为 Codex 0.151.0、Claude 2.1.220、Grok 1.0.3。Claude 登录验收与 Grok 余额不足的联网验收例外仍保留；fixtures 不冒充这些在线调用已通过。
