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

## 尚未完成

T1.1 最终本地安装包与便携版、T1.3 首次启动引导、T1.4 诊断预览仍待后续实施与验收。
