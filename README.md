# Knorvia Studio

Knorvia Studio 是基于 [ZCode 上游源码](https://github.com/zai-org/ZCode) 于 2026-09-22 重新克隆建立的独立桌面 Agent 工作台，当前版本 `0.8.0-preview.1`（预览版）。沿用原版聊天、项目、设置和 Agent 界面，在同一套 GUI 内补齐多内核单聊、群聊与工作流。2026-09-22 之前的旧仓库实现已作废，现有功能均按 `specs/` 中的规格重新实现。

## 功能

- **身份与隔离**：Knorvia Studio 名称、透明图标和黑白视觉语言；移除上游产品登录、账号、订阅、更新与遥测服务；环境变量、配置、凭据与数据目录独立（`KNORVIA_`、`.knorvia-studio`），不读取 ZCode 的配置或登录。
- **模型**：在原有模型设置中配置自己的服务地址、模型和 API Key，供应商并列展示。
- **内核**：Knorvia 为默认内核；可接入本机已安装的 Codex、Claude Code、Grok Build，以及按 ACP 协议探测通过的其他 CLI Agent，共用同一聊天界面。切换内核会新建独立会话。见 [后端规格](specs/knorvia-backend.md)、[CLI 扩展](specs/knorvia-cli-expansion.md)。
- **群聊**：@ 指定成员或交给主持人；任务模式下主持人规划、派发、复核，持续到完成、真实阻塞或用户停止。成员各用独立会话，默认在隔离目录修改项目，差异可审阅后显式应用。
- **工作流**：节点画布支持串行、并行、条件、汇合、人工确认、有限重试、停止、历史与恢复；可提供模板、对比运行结果，并通过「自动化」定时执行。
- **创作**：图片与视频生成（OpenAI Images 兼容、可配置 JSON API 或 ComfyUI），也可作为工作流节点使用。
- **其他**：SSH 远程工作区 Agent、会话接力与 Markdown 导出、八个内置插件（文档、PDF、演示、表格、浏览器等）、中英文界面。

预览版尚未完成的部分：Computer Use 仅完成方案评估（`@knorvia/cua` 为占位包）；手机远控 Host 只验证了本地协议夹具；首次启动约 6 秒，高于 3 秒目标。详见 [最终交付摘要](docs/knorvia-final-local-delivery-20260925.md)。

## 开发

需要 Node.js 24.14.0 和 pnpm 10.33.2（见 `mise.toml`）。在仓库根目录执行：

| 用途                       | 命令                                            |
| -------------------------- | ----------------------------------------------- |
| 安装依赖                   | `pnpm install --frozen-lockfile`                |
| 桌面开发                   | `pnpm dev:desktop`                              |
| Web 开发                   | `pnpm dev:web`                                  |
| 类型检查（含中英文键校验） | `pnpm typecheck`                                |
| Lint                       | `pnpm lint`                                     |
| 架构检查                   | `pnpm architecture:check --changed`             |
| 离线回归测试               | `pnpm build:cli-packages` 后 `pnpm test:studio` |

GitHub Actions 的 `Studio offline checks` 在每个 PR 上于 Linux 运行以上检查；推送到 `main` 或手动触发时，另在 Windows 上运行一遍平台回归。手动运行 `Release Windows portable` 会在 Windows 上构建便携版，并以 `v<版本号>` 发布到 GitHub Release。

便携版数据保存在可执行程序旁的 `data` 文件夹。完整退出后可复制整个便携文件夹。

## 文档与许可

开发约束见 [AGENTS.md](AGENTS.md)、[DESIGN.md](DESIGN.md)，产品规格在 [specs/](specs/)，验收与审计报告在 [docs/](docs/)。来源与修改说明见 [FORK-NOTES.md](FORK-NOTES.md)。

本项目是独立修改版，不是上游官方发布。保留 [Apache-2.0 许可证](LICENSE)、[NOTICE](NOTICE.md) 和 [第三方声明](THIRD-PARTY-NOTICES.md)。English: [README.en.md](README.en.md)。
