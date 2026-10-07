# Knorvia Studio

Knorvia Studio 是把多个 Agent 内核放进同一工作空间的桌面工作台。单聊、多 Agent 协作、工作流与图片视频创作共用一套黑白界面，让任务、工具、项目和执行结果保持连贯。

本源码版本：**0.10.0**，变更见 [CHANGELOG.md](CHANGELOG.md)。已发布的 Windows x64 和 Linux x64 安装版、便携版及 SHA-256 校验文件见 [GitHub Releases](https://github.com/accomplish07zrh-eng/knorvia-studio/releases/latest)。项目 [官网](https://knorvia.xyz) 另有介绍。English: [README.en.md](README.en.md)。

安装包目前未签名，请按 [下载校验说明](CODE_SIGNING.md) 用 SHA-256 校验后再运行。

## 功能

- **工作空间**：窄工具栏、内核切换区与共享圆角工作面；黑白主题、可选玻璃材质、细线图标和开场动效。中英文界面，保留键盘操作与独立草稿。
- **模型与数据**：配置自己的模型服务地址、模型和 API Key，供应商并列展示。应用无需产品账号；使用独立的 `KNORVIA_` 配置和 `.knorvia-studio` 数据目录。
- **内核**：Knorvia 为默认内核；可接入本机已安装的 Codex、Claude Code、Grok Build，以及按 ACP 协议探测通过的其他 CLI Agent，共用同一聊天界面。切换内核会新建独立会话。见 [后端规格](specs/knorvia-backend.md)、[CLI 扩展](specs/knorvia-cli-expansion.md)。
- **群聊**：@ 指定成员或交给主持人；任务模式下主持人规划、派发、复核，持续到完成、真实阻塞或用户停止。成员各用独立会话，默认在隔离目录修改项目，差异可审阅后显式应用。
- **工作流**：节点画布支持串行、并行、条件、汇合、人工确认、有限重试、停止、历史与恢复；可提供模板、对比运行结果，并通过「自动化」定时执行。
- **创作**：图片与视频生成（OpenAI Images 兼容、可配置 JSON API 或 ComfyUI），也可作为工作流节点使用。
- **插件与电脑控制**：内置文档、PDF、演示、表格、浏览器、技能及插件创建工具。Windows Computer Use 插件默认关闭，启用后经目标窗口授权执行截图、鼠标和键盘操作；可随时停止。它使用本地 Knorvia 内核与支持图像的模型，当前不支持远程工作区或其他系统。
- **项目与接力**：SSH 远程工作区 Agent、文件差异审阅、跨内核能力共享、会话接力与 Markdown 导出。

Computer Use 可能改变前台焦点或鼠标，不支持 UAC、安全桌面或任意桌面范围控制。手机远控仍只完成本地协议验收；启动性能仍在优化。真实模型能力与费用取决于用户配置的服务，离线测试通过不代表每个外部内核和模型都经过实测。详见 [本版交付记录](docs/knorvia-release-preview3-20260927.md)、[电脑控制记录](docs/knorvia-windows-computer-use-20260927.md) 和 [启动性能记录](docs/knorvia-startup-performance-20260927.md)。

## 安装与数据

Windows 安装版提供桌面及开始菜单快捷方式，程序与用户数据分开保存。Windows 便携 ZIP 解压后运行 `Knorvia Studio.exe`，数据保存在程序旁的 `data` 文件夹；完整退出后可复制整个便携文件夹。Linux 包格式、便携程序与升级步骤见 [安装与数据说明](docs/desktop-release-installation.md)。所有包附带校验文件，当前包未签名。

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

GitHub Actions 的 `Studio offline checks` 在 PR、推送到 `main` 和手动触发时都运行 Linux 与 Windows 检查。`Release desktop installers and portable` 先验证同一完整提交 SHA，再构建并验收 Windows/Linux 安装版和便携版；全部门禁通过后发布，同版本附件不会被覆盖。生产构建须设置 `KNORVIA_ENV=production`，Windows 打包入口为 `node packages/desktop/scripts/bundle.mjs --os win --arch x64`，Linux 使用 `--os linux`。

## 文档与许可

开发约束见 [AGENTS.md](AGENTS.md)、[DESIGN.md](DESIGN.md)，产品规格在 [specs/](specs/)，验收与审计报告在 [docs/](docs/)。来源与修改说明见 [FORK-NOTES.md](FORK-NOTES.md)。

Knorvia Studio 继续使用根 [Apache-2.0 许可证](LICENSE)，由本项目持续维护。2026-10-03 起取消全项目 MIT 迁移目标，继续替换原项目继承实现，保留常用第三方依赖及其真实声明；当前尚未宣称完成全部独立替换。已有文件、目录和第三方组件明确声明的许可及署名继续保留，详见 [NOTICE](NOTICE.md) 和 [第三方声明](THIRD-PARTY-NOTICES.md)。真实来源和当前许可范围见 [文件来源与许可](licensing/README.md) 及 [源码维护规格](specs/knorvia-independent-implementation.md)。旧版本的发布和许可记录保留。
