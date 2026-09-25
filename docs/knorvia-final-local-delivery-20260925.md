# Knorvia Studio 本地交付摘要（2026-09-25）

本次 Windows 本地规划已完成。私有仓库 `accomplish07zrh-eng/knorvia-studio` 的 `knorvia/clean-base` 分支包含最终源码；便携包来自提交 `5aec8d5`，版本 `0.8.0-preview.1`，以 `KNORVIA_ENV=production` 构建，产品身份为 Knorvia Studio。上游仓库未接收推送。

阶段 0 完成私有远端、分组提交、类型与 lint 清零、内置插件授权处理、离线回归入口和[凭据安全审计](knorvia-security-audit.md)。阶段 1 完成首页侧栏与设置页视觉统一、玻璃背景修复、内置插件替换和便携数据隔离。阶段 2 完成群任务进展、差异审阅、工作流模板与计划、会话接力与 Markdown 导出、创作历史与重试、SSH 本地模拟及[长会话性能基线](perf-baseline.md)。阶段 3 完成 [Computer Use 本地方案评估](knorvia-computer-use-evaluation.md)、[插件开发示例](knorvia-plugin-developer-guide.md)、[中英文文案校验](knorvia-i18n-acceptance.md)及[手机 Host 协议夹具](knorvia-mobile-host-local-validation.md)。评估和协议夹具不代表相应远程产品能力已上线。

最终源码验收使用 Node v24.14.0：`pnpm typecheck` 通过，含桌面主进程与 5,221 个中英键校验；`pnpm lint` 为 0 错误、0 警告；`pnpm architecture:check --changed` 为 0 违规；`pnpm test:studio` 共 120 个离线测试文件、565/565 通过。最终接力任务的定向测试 18/18 通过。Windows 打包命令为 `node packages/desktop/scripts/bundle.mjs --os win --arch x64`，运行依赖检查及体积审计通过，安装包 143.2 MiB，低于 500 MiB 限额。打包曾提示大 chunk、弃用接口和初始缺失 22 个 hoisted 运行模块；打包钩子补入模块后，最终依赖检查通过。

已覆盖 `%USERPROFILE%/Desktop/Knorvia Studio Portable`。覆盖前确认程序未运行，用户要求不新增备份。`data/` 的 360 个文件、52,456,669 字节在覆盖前后逐文件 SHA-256 相同；118 个程序文件与本次构建逐文件 SHA-256 相同。交付目录的 `构建校验.json` 记录了可执行文件 SHA-256 `C389B106919C5F580E6642D43D11AF0CF5015D489A899EA776331AFBFABEC3B3` 和 `app.asar` SHA-256 `AB7B0FDDF8E94AE070DC0B236F626B97C943E3467258328CF1FAA5F6DB338A3B`。未触碰 `data/` 内容。

在独立临时配置下运行新打包程序，首次引导、延后设置、关闭后续显、模型设置入口、检测到的本地 CLI 会话入口与旧配置迁移均通过；只打开界面，没有给 CLI 发消息。真实付费模型、已登录 CLI 对话、远程 SSH/手机 Host、生产服务器和云端 CI 均未运行。用户要求跳过人工目视复核；原生文件选择器的点击级自动化未执行。此前本机性能基线的首次引导启动为 6.133–6.832 秒，仍高于建议的 3 秒目标；复杂 Office 保真与完整 Computer Use 也未验收。
