# CLI 模型配置切换（Claude Code / Codex / Grok Build）

2026-10-06。用户要求 Knorvia Studio 具备类似 CC Switch 的配置切换能力：在未登录官方账号时，也能把 Studio 中已配置的模型接给 Claude Code、Codex 和 Grok Build 使用；与官方登录互不冲突，可随时切回官方订阅。

用户明确授权 Studio 修改这三个 CLI 的**全局**配置。本规格对这三个 CLI 替代 `knorvia-cli-expansion.md` 中"Studio 不写它们的全局认证、模型或插件目录"一句；其他外部 CLI 仍按原规则只读接入。

## 产品规则

- 每个 CLI 独立切换，互不影响。每个 CLI 同一时刻只有一个生效配置：「官方」或 Studio 中的某个模型配置。
- 切换为全局生效：终端里直接运行该 CLI、以及 Studio 中对应的内核，都使用同一配置。界面需说明这一点。
- 「官方」始终存在且可一键切回。切回官方只撤销 Studio 写入的字段，不碰官方登录凭据；不需要重新登录。
- 只列出协议匹配的模型配置，不做协议转换：
  - Claude Code：模型配置须支持 Anthropic Messages 协议。
  - Codex：须支持 OpenAI Responses 协议（Codex 已移除 Chat Completions，`wire_api = "chat"` 会报错）。
  - Grok Build：支持 Chat Completions、Responses、Anthropic Messages 三种。
  - 协议不匹配的模型显示为不可选，并说明原因。
- 切换后已在运行的 CLI 会话可能仍使用旧配置，界面提示"新开的会话生效"。Claude Code 从第三方切回官方时，必须重启已运行会话（删除的环境变量不会在运行中撤销）。
- 不自动回退：未登录时不自动改用 Studio 模型，必须由用户手动选择，避免在不知情时消耗另一家的额度。
- 密钥以明文写入 CLI 配置文件（与 CC Switch 相同），界面在首次切换时说明。

## 各 CLI 写入的字段（只改这些，其余原样保留）

所有文件按保序方式局部修改，保留用户其他键、注释与顺序。文件无法解析时停止并报错，不从空文件重写。

### Claude Code

- 文件：`~/.claude/settings.json`（Windows 为 `%USERPROFILE%\.claude\settings.json`）。尊重用户环境中的 `CLAUDE_CONFIG_DIR`。
- 切到 Studio 模型时写入 `env`（`ANTHROPIC_BASE_URL` 去掉 Knorvia 地址中可能带的 `/v1`，Claude Code 自行追加 `/v1/messages`）：`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL`、`ANTHROPIC_DEFAULT_OPUS_MODEL`、`ANTHROPIC_DEFAULT_HAIKU_MODEL`。使用 `ANTHROPIC_AUTH_TOKEN` 而非 `ANTHROPIC_API_KEY`，避免交互式确认提示。
- 切回官方：删除地址与令牌；四个模型键还原为切走前用户自己的值（原本不存在则删除）。判断"是否在走第三方"只看地址与令牌键，用户自己设置的模型键不算外部配置。
- 永不读取或修改 `.credentials.json`、macOS 钥匙串和 `~/.claude.json`。

### Codex

- 文件：`$CODEX_HOME/config.toml`，默认 `~/.codex/config.toml`。
- 切到 Studio 模型时写入：顶层 `model_provider = "knorvia"`、`model`；表 `[model_providers.knorvia]` 的 `name`、`base_url`、`wire_api = "responses"`、`experimental_bearer_token`、`requires_openai_auth = false`。提供方 ID 使用 `knorvia`，不得使用保留 ID（`openai`、`ollama`、`lmstudio` 等）。
- 切回官方：删除 `[model_providers.knorvia]` 表；顶层 `model_provider`、`model` 还原为切走前用户自己的值（原本不存在则删除）。
- `requires_openai_auth` 固定为 `false`：为 `true` 时 Codex 可能把官方 ChatGPT 登录凭据发往第三方地址。
- 不修改 `auth.json`：官方 ChatGPT 登录保持原样，切回后直接可用。凭据可能存放在系统钥匙串而不存在 `auth.json`，不得假定该文件存在。

### Grok Build

- 文件：`$GROK_HOME/config.toml`，默认 `~/.grok/config.toml`。
- 切到 Studio 模型时写入 `[model.knorvia]`（`model`、`base_url`、`api_key`、`api_backend`）与 `[models] default = "knorvia"`。
- 切回官方：删除 `[model.knorvia]`，`[models].default` 还原为切走前的值（原本不存在则删除）。
- `api_backend` 按协议取 `chat_completions` / `responses` / `messages`；`messages` 模式下 `base_url` 不带 `/v1`，此约定需实机复核。
- 不修改 `~/.grok/auth.json`。

## 安全与一致性

- 首次修改某个配置文件前，在 Studio 数据目录 `cli-switch/backups/` 留一份原文件字节副本。
- 写入流程：读取并记录哈希 → 局部修改 → 写临时文件 → 重新读取比较哈希 → 未变化才原子替换；发现被外部改动则基于新内容重新计算，不覆盖他人修改。
- Studio 记录自己写入的字段与值。读取当前状态时：若文件中的值与记录不一致（被用户手动或 CC Switch 等工具修改），显示为"外部配置"，不擅自覆盖，由用户确认后再接管。
- 同一 Host 内的读取与切换串行执行。每个窗口有自己的 Local Host，多个 Host 同时切换时依靠替换前的内容复核（被改动则基于新内容重算，最多三次）与切换记录文件的文件锁避免互相覆盖。

## 状态所有者与事件顺序

- `CliProviderSwitchService`（services 层）唯一负责读写三个 CLI 的配置文件和切换记录；UI 只通过 hooks 调用，不直接读写文件。
- 模型配置仍由现有模型供应商服务拥有；切换服务只读取所选配置的地址、密钥、模型和协议，在切换时取快照。之后用户修改该模型配置，界面提示"已切换的 CLI 使用旧配置，可重新应用"，不自动静默改写 CLI 文件。

```text
用户选择 CLI + 目标（官方 / 某模型配置）
  → 服务校验协议匹配 → 读取目标文件并记录哈希
  → 首次写入前备份 → 局部修改 → 临时文件 → 哈希复核 → 原子替换
  → 更新切换记录 → 返回新状态（含"新会话生效/需重启"提示）
任一步失败 → 文件保持原样 → 返回失败原因
```

## 实现位置

- 共享契约：`packages/shared/src/cli-provider-switch.ts`，频道 `cli-provider-switch`。
- 服务：`packages/services/src/cli-provider-switch/`（`cliTargets.ts` 各 CLI 字段规则，`tomlPatch.ts` 保留注释的局部修改并以重新解析逐项核对，`cliProviderSwitchService.ts` 状态与写入）。只在本机 Host 的 `node.ts` 注册；`IServiceAccessor.cliProviderSwitchService` 为可选，缺失时界面不显示该卡片。
- 切换记录 `<数据目录>/cli-switch/state.json` 只存哈希与还原用的模型名，不存密钥；首次改写前的原文件备份在 `cli-switch/backups/`。
- 配置目录取 Host 进程的 `CLAUDE_CONFIG_DIR` / `CODEX_HOME` / `GROK_HOME`，未设置时用用户主目录下的默认目录；若用户只在终端 shell 中设置了这些变量，Studio 看不到。
- 界面：`packages/ui/src/studio/agents/CliProviderSwitchCard.tsx`，位于设置 → Agent 管理顶部；首次写入明文密钥前提示一次，接管外部配置需确认。

## 界面

- 位于设置中的 Agent 管理相关页面，沿用现有设置分组卡片与黑白视觉语言，不另起页面框架。
- 每个 CLI 一行：图标、名称、当前状态（官方 / 模型名 / 外部配置 / 未安装）、选择控件、"切回官方"。
- 中英文文案同步。

## 验收

- 离线测试用临时目录模拟三种 CLI 的配置文件：切换后只改指定字段，其他键与注释保留；切回官方后文件与原文件在语义上一致；`auth.json`、`.credentials.json` 从未被读写。
- 协议不匹配的模型不可选；Codex 不写 `wire_api = "chat"`，不使用保留提供方 ID。
- 外部改动检测：切换前文件被修改时不覆盖并提示；无法解析的文件不被重写。
- 三个 CLI 互不影响：切换一个不改动另外两个的文件。
- Windows 与 POSIX 路径、`CLAUDE_CONFIG_DIR`、`CODEX_HOME`、`GROK_HOME` 均覆盖。
- typecheck、lint、fmt、架构检查与离线测试按实际结果报告；真实 CLI 联调需在本机安装各 CLI 后复核。

## 依据（2026-10-06 核对）

- Claude Code 认证与环境变量：https://code.claude.com/docs/en/authentication 、https://code.claude.com/docs/en/env-vars 、https://code.claude.com/docs/en/settings
- Codex 配置与认证源码：https://github.com/openai/codex （`codex-rs/config/src/config_toml.rs`、`codex-rs/model-provider-info/src/lib.rs`、`codex-rs/login/src/auth/storage.rs`）；Chat Completions 移除：https://github.com/openai/codex/discussions/7782
- Grok Build 文档：https://github.com/xai-org/grok-build （`docs/user-guide/02-authentication.md`、`11-custom-models.md`、`26-config-reference.md`）
- 参考实现思路：https://github.com/farion1231/cc-switch （仅参考行为，不复制代码）
