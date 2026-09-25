# Knorvia Studio 阶段 1 本地验收

2026-09-25。所有测试仅使用本地夹具和虚构数据；未登录账号、未运行已登录 CLI、未调用真实模型或更新服务。

## T1.2 只读更新检查

实现：设置页可填写无需认证的发布信息 JSON 地址、关闭检查和手动检查。默认地址为空，检查结果明确为“尚未配置更新源”，不产生请求。Desktop Main 在启动 30 秒后及每 24 小时读取设置并检查；发现可用版本时在本机提醒。请求仅为无凭据 GET，限制响应大小和超时，按 semver 比较。正式版不提示预发布版。没有下载或安装动作。

离线验证：`packages/desktop/test/release-update-check.test.ts` 与 `packages/services/test/release-update-settings.test.ts` 共 7 项通过。夹具覆盖未配置、关闭、URL 安全限制、持久化、更新/无更新、正式版与预发布版、30 秒和 24 小时调度、404、429、畸形响应、离线和超时。真实发布服务未访问，也未验证 Windows 原生通知在所有系统配置上的呈现。

仓库检查：`pnpm typecheck` 通过；`pnpm lint` 0 警告、0 错误；`pnpm architecture:check --changed` 0 违规。

## 当前便携版交付与界面修正

首页左侧栏的单聊/群聊切换和内核选择改为与设置侧栏一致的平面层级；外部 CLI 对话区移除多余的不透明底色，由统一的阅读层负责玻璃材质。保持 Knorvia 黑白视觉 token 与原有操作钩子。

以 `KNORVIA_ENV=production` 打包 Windows x64 便携目录，覆盖桌面 `Knorvia Studio Portable`。覆盖前确认应用未运行；目标 `data` 的 360 个文件、167 个目录在覆盖前后完全一致，文件 SHA-256 逐个相同。静态检查确认生产身份、应用归档、8 个内置插件及其 59 个文件与源码一致。未另做整份备份。

本次代码验证：`pnpm typecheck` 通过；`pnpm lint` 为 0 警告、0 错误；`pnpm architecture:check --changed` 为 0 违规；`pnpm test:studio` 为 498 项通过、0 失败。由于真实已登录 CLI 禁用，未启动应用做外部 CLI 对话页的实机视觉复核；玻璃效果仍需在用户本机打开后观察。当前包版本为 `0.1.0`，不是 T1.1 计划中的最终 `0.8.0-preview.1` 发行包。

## T1.3 首次启动引导（实现与离线检查）

全新本机设置先显示现有偏好引导，再显示模型供应商、本机已探测 CLI、稍后再说三条路径。供应商进入原模型设置；CLI 只进入已探测的本机对话，不自动运行或声称已登录。老设置迁移为 `legacy`，不会补弹。跳过持久化为 `deferred`；供应商/CLI 跳转或关闭只隐藏本次，引导下次可恢复。内置单聊、CLI 单聊或群聊的首条消息获接受回执后才标记完成。

Node v24.14.0 下，设置持久化/旧配置迁移及导航事件的 3 项离线测试通过。以未带便携标记的 `0.8.0-preview.1` Windows 程序及独立数据根运行 `scripts/stage1-first-run-smoke.mjs`：全新配置、明确跳过后重启、中途关闭后重启、已有配置迁移、供应商入口，以及已探测本机 CLI 的入口均通过。`scripts/stage1-provider-loopback-smoke.mjs` 经界面保存虚构供应商和模型，首条消息仅请求本机回环模拟服务；收到回复后引导状态确认为 `complete`。CLI 检测和入口导航没有发送消息；真实模型发送未验证。

## T1.4 本地诊断包

设置页手动生成预览：Main 将最近三天的脱敏文本日志、本机内核探测概况及无主机名的系统版本摘要冻结到私有临时目录。日志以来源和编号命名，不暴露原文件名；内核字符串再次脱敏。预览显示文件名、大小、SHA-256、正文开头和截断提示。用户再次确认后才将同一快照打包为 ZIP 并打开所在目录；未实现自动上传。

离线测试向日志内容、日志文件名和内核元数据注入虚构密钥与 token；预览和 ZIP 均为 0 命中。创作、Studio SQLite、凭据等非允许文件未进入 ZIP。原日志在预览后轮转，ZIP 仍与预览中每个文件的 SHA-256 一致。未知或已消费的预览 ID 无法导出。Node v24.14.0 下，`pnpm typecheck` 通过，`pnpm lint` 0 警告、0 错误，`pnpm architecture:check --changed` 0 违规；整套 103 个离线测试文件、502 项测试通过，0 失败。真实用户日志的所有自定义秘密格式无法仅凭模式识别保证完全覆盖；发送诊断包前仍应审阅预览。

## T1.1 Windows x64 本地预览交付

根版本为 `0.8.0-preview.1`。以 Node v24.14.0 运行 `KNORVIA_ENV=production node packages/desktop/scripts/bundle.mjs --os win --arch x64`，Windows NSIS 安装包、未带便携标记的 `win-unpacked` 和运行时依赖检查全部完成；安装包 143.2 MiB，低于 500 MiB 审计上限。安装包与应用签名状态均为 `NotSigned`，发行说明明确提示 SmartScreen。未登录签名平台，未上传公开发行。

桌面 `Knorvia Studio 0.8.0 Preview` 内有安装包、便携 ZIP、`SHA256SUMS` 与发行说明。安装包 SHA-256 为 `da9f9d25152237d6e0fbaadc1bbed4c62deef9a493e6f10b6435b01e50957de0`；便携 ZIP SHA-256 为 `8042a1d3fed7a4029017160d561c6bc23d2dacf1bbdcff31a3741e2863ca2f7b`。ZIP 解压后 119 个文件逐项与已验证的便携构建散列一致，包含便携标记、不含 `data`；8 个内置插件的 59 个文件与源码一致。

安装包直接静默执行到隔离目录成功，安装日志记录各阶段完成。安装后的程序无便携标记，在独立数据根的首用引导自动化检查全部通过。随后直接静默卸载，安装程序文件和卸载注册项消失，独立数据根中的设置文件保留。通过 `Start-Process -WindowStyle Hidden` 强制隐藏 NSIS 安装器时出现 `System.dll` 访问冲突；同机上一版安装包也复现，直接静默执行正常。未做安装向导的人工目视检查，自动化结果以直接静默执行为准。

便携 ZIP 解压副本启动成功，首用设置写在程序旁的 `data`。确认桌面现有便携程序未运行后，将 0.8.0 预览版覆盖到 `%USERPROFILE%\Desktop\Knorvia Studio Portable`，排除 `data`；覆盖前后 360 个文件、167 个目录逐项散列一致。目标程序、归档、内置插件及版本再次核对通过。没有创建整份工作区备份。

离线回归：Node v24.14.0 下 `pnpm test:studio` 502 项通过、0 失败；`pnpm typecheck` 通过，`pnpm lint` 0 警告、0 错误，`pnpm architecture:check --changed` 0 违规。已安装程序和未带便携标记的构建运行首用路径；本机回环服务完成一次模拟对话。真实模型、真实 SSH、已登录 CLI 消息发送、真实更新服务和跨设备 Host 均未验证。
