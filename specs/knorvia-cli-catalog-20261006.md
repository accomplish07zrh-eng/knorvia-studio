# 预置 CLI 目录核对（2026-10-06）

延续 `knorvia-cli-expansion.md`。2026-10-06 联网核对全部 15 个预置外部内核，依据 npm / PyPI 注册表、各项目官方源码文件与 ACP 官方目录。只记录需要变更的项；其余（Codex、Claude Code、Grok Build、Copilot、Qwen Code、Mistral Vibe、Hermes、goose、DeepSeek Harness、Antigravity）命令与参数不变。

## 变更

- **Kimi CLI → Kimi Code**：原 Kimi CLI 官方已归档，旧安装将停止工作，由 Kimi Code CLI 取代（npm `@moonshot-ai/kimi-code`）。命令仍为 `kimi`，接入参数仍为 `kimi acp`。内核 ID `kimi-cli` 保持不变以兼容已保存的会话、群聊和工作流；显示名改为 "Kimi Code"，安装与更新来源改为新包。
- **删除 Gemini CLI**（用户 2026-10-06 决定）：谷歌已将其过渡到 Antigravity CLI，2026-06-18 起个人免费、AI Pro、AI Ultra 账号不能再用。从预置目录、检测、安装更新、图标映射、中英文文案和测试中移除。已保存的会话、群聊成员和工作流步骤若引用 `gemini-cli`，按"已移除内核"处理：历史可查看，不能再发送或运行，界面提示改选其他内核；不删除用户数据。
- **Qoder CLI**：同时检测 `qoder` 与 `qodercli` 两个命令名。
- **Qoder CN CLI**：同时检测 `qoderclicn` 与 `qodercn` 两个命令名。
- **OpenCode**：`opencode-ai`（1.x）与 `@opencode/cli`（2.x，另装 `opencode2`）是两个大版本，均为官方发布；继续两者都识别，版本探测结果如实显示。
- **Grok Build**：检测时区分官方包 `@xai-official/grok` 与社区包 `@vibe-kit/grok-cli`（同样提供 `grok` 命令）；社区包不作为 Grok Build 接入。
- **DeepSeek Harness**：仍为预发布版本（0.2.0-rc），界面标注"预览"。

## 新增（用户 2026-10-06 确认）

均依据 ACP 官方目录 `agentclientprotocol/registry` 中的 `agent.json` 与 npm 注册表核对；均为外部管理（只接入已有安装，界面说明官方安装方式），图标使用 ACP 官方目录中各项目的单色 `icon.svg`（`fill="currentColor"`，适配黑白主题），保留来源清单。

| 内核 ID         | 显示名          | 可执行文件                   | 检测用 npm 包           | ACP 启动参数               | 进程环境                        |
| --------------- | --------------- | ---------------------------- | ----------------------- | -------------------------- | ------------------------------- |
| `devin`         | Devin CLI       | `devin`                      | 无（官方脚本安装）      | `acp`                      | —                               |
| `cursor`        | Cursor Agent    | `cursor-agent`，其次 `agent` | 无（官方脚本安装）      | `acp`                      | —                               |
| `factory-droid` | Factory Droid   | `droid`                      | `droid`、`@factory/cli` | `exec --output-format acp` | —                               |
| `cline`         | Cline           | `cline`                      | `cline`                 | `--acp`                    | —                               |
| `auggie`        | Augment Auggie  | `auggie`                     | `@augmentcode/auggie`   | `--acp`                    | `AUGMENT_DISABLE_AUTO_UPDATE=1` |
| `junie`         | JetBrains Junie | `junie`                      | `@jetbrains/junie`      | `--acp=true`               | —                               |

- Cursor 的 `agent` 命令名过于通用，仅在 `cursor-agent` 不存在且版本探测确认是 Cursor 时才接受。
- Factory Droid 采用官方文档与 Zed 使用的 `acp` 输出格式；目录中的 `acp-daemon` 有第三方报告称与 stdio MCP 不兼容，不采用。
- 认证一律沿用各 CLI 自身登录（如 `devin auth login`、`agent login`、`cline auth`、`auggie login`），Studio 不代管凭据；未登录时按 ACP 握手结果如实显示。

## 验收

- 已保存的 `kimi-cli` 会话、群聊成员和工作流步骤继续可用；新安装的 Kimi Code 可被发现并握手成功。
- 引用 `gemini-cli` 的已保存记录可查看、不可运行，不崩溃、不丢数据。
- 六个新增内核均有离线协议夹具与探测测试，图标在亮暗主题下可辨识。
- Qoder / Qoder CN 仅安装其中一个命令名时也能被发现。
- 社区版 `grok` 不被识别为 Grok Build。
- 离线协议夹具与探测测试覆盖以上变更；实机复核需在本机安装对应 CLI。
