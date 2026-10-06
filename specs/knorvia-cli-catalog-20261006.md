# 预置 CLI 目录核对（2026-10-06）

延续 `knorvia-cli-expansion.md`。2026-10-06 联网核对全部 15 个预置外部内核，依据 npm / PyPI 注册表、各项目官方源码文件与 ACP 官方目录。只记录需要变更的项；其余（Codex、Claude Code、Grok Build、Copilot、Qwen Code、Mistral Vibe、Hermes、goose、DeepSeek Harness、Antigravity）命令与参数不变。

## 变更

- **Kimi CLI → Kimi Code**：原 Kimi CLI 官方已归档，旧安装将停止工作，由 Kimi Code CLI 取代（npm `@moonshot-ai/kimi-code`）。命令仍为 `kimi`，接入参数仍为 `kimi acp`。内核 ID `kimi-cli` 保持不变以兼容已保存的会话、群聊和工作流；显示名改为 "Kimi Code"，安装与更新来源改为新包。
- **Gemini CLI**：继续保留，参数使用 `--acp`。2026-06-18 起谷歌个人免费、AI Pro、AI Ultra 账号不能再使用（由 Antigravity CLI 接替），仅付费 API Key 与企业账号可用。Agent 管理页对该内核显示此说明。
- **Qoder CLI**：同时检测 `qoder` 与 `qodercli` 两个命令名。
- **Qoder CN CLI**：同时检测 `qoderclicn` 与 `qodercn` 两个命令名。
- **OpenCode**：`opencode-ai`（1.x）与 `@opencode/cli`（2.x，另装 `opencode2`）是两个大版本，均为官方发布；继续两者都识别，版本探测结果如实显示。
- **Grok Build**：检测时区分官方包 `@xai-official/grok` 与社区包 `@vibe-kit/grok-cli`（同样提供 `grok` 命令）；社区包不作为 Grok Build 接入。
- **DeepSeek Harness**：仍为预发布版本（0.2.0-rc），界面标注"预览"。

## 待用户决定

ACP 官方目录中尚未收录的流行 CLI：Cursor Agent、Factory Droid、Cline、Augment Auggie、JetBrains Junie。是否新增由用户决定，确定后另行补充本规格。

## 验收

- 已保存的 `kimi-cli` 会话、群聊成员和工作流步骤继续可用；新安装的 Kimi Code 可被发现并握手成功。
- Qoder / Qoder CN 仅安装其中一个命令名时也能被发现。
- 社区版 `grok` 不被识别为 Grok Build。
- 离线协议夹具与探测测试覆盖以上变更；实机复核需在本机安装对应 CLI。
