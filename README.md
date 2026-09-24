# Knorvia Studio

基于重新克隆的开源源码建立的独立底座，沿用原版聊天、项目、设置和 Agent 界面。此前的多内核、群聊和自制工作台改造已作废。

当前改动仅包括 Knorvia Studio 名称和图标、产品登录清理、上游账号服务移除、提示词身份调整及独立运行目录。使用前在原有模型设置中配置自己的服务地址、模型和 API Key。

Node.js 24，pnpm 10.33.2。安装依赖：`pnpm install --frozen-lockfile`。检查：`pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed`。开发启动：`pnpm dev:desktop`。

便携版数据保存在可执行程序旁的 `data` 文件夹。完整退出后可复制整个便携文件夹，不需要沿用原 ZCode 的配置或登录。

开发约束见 [AGENTS.md](AGENTS.md)、[DESIGN.md](DESIGN.md) 和 [当前范围](specs/knorvia-clean-base.md)。来源与修改说明见 [FORK-NOTES.md](FORK-NOTES.md)。项目基于 [ZCode 上游源码](https://github.com/zai-org/ZCode)，保留 [Apache-2.0 许可证](LICENSE)、[NOTICE](NOTICE.md) 和 [第三方声明](THIRD-PARTY-NOTICES.md)。
