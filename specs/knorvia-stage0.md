# Knorvia Studio 最新预览版快照

2026-09-24，用户确认：仅提交当前最新预览版快照。使用单个无父提交的根提交，不上传历史提交；提交说明只描述当前 Knorvia Studio 状态。

## 保护与发布边界

- 当前工作区文件与全部已完成成果保留；原提交另存本地备份引用，完整文件备份保留在仓库外。
- 不改变现有黑白视觉语言，不修改桌面便携版或 data。
- 只向用户指定且已验证为私有的 accomplish07zrh-eng/knorvia-studio 推送，不推送其它远端或备份引用。
- 作者：Knorvia <accomplish07zrh@gmail.com>，仅本仓库配置。
- 现有 LICENSE、NOTICE 与第三方合法署名保持完整。
- data、便携包、测试缓存与凭据不纳入快照；已跟踪环境模板必须逐份核查。
- 提交前重新扫描完整候选文件。密钥扫描误报必须逐项核实并保留具体指纹依据，不能排除整个文件或目录。

## 验收

根 typecheck、lint、architecture:check --changed、身份隔离测试和桌面生产构建均实际执行。既有诊断如实记录，不将未纳入根命令的 main 类型检查视为通过。确认密钥扫描剩余发现为 0 后提交，远端确认 private、单个根提交与快照 tag。

用户于 2026-09-24 收窄本轮：插件替换、快照提交和规划待办清理后停止；追加首页侧栏与玻璃修复、便携包覆盖交付。凭据安全审计留在后续规划，本轮不继续展开。

## 当前版本许可说明

NOTICE.md 的产品功能说明应描述当前 Knorvia Studio：独立数据目录、无产品账号登录、用户配置模型、内置与外部内核、群聊/工作流/创作及其权限边界。不把旧版本已移除的服务说明当作当前行为。更新产品说明时保留 LICENSE 原文、THIRD-PARTY-NOTICES.md 及源码/资产中的第三方权利声明，不为未完成审核的插件宣称新的再分发授权。

## T0.3 常规检查覆盖

- 根 typecheck 必须检查 desktop main，包含其引用的 scheduler 协议与浏览器注入函数的 DOM 类型；类型产物写入独立的 out/typecheck-main，避免覆盖实际 main bundle。
- 修复实际可空值、判别联合和公开入口类型，不使用 any、ts-ignore 或关闭严格检查规避诊断。
- BrowserGuestManager 仍拥有 tab 生命周期：异步恢复后重查当前 guest 与关闭状态；对外 summary 不暴露已关闭 tab 的 lifecycle 值。
- 文件保存维持 DNS 固定、私网拒绝与大小校验；内存数据用稳定局部变量收窄，PDF 导出使用独立 ArrayBuffer。
- 删除未接入的旧自动更新适配器，不重新安装缺失更新依赖或恢复自动更新行为。
- lint 清理保留广播遍历快照和故障优先级等行为；确需快照的数组应显式命名并说明原因，不能直接删掉复制改变重入语义。
- Main 实时总线以已验证的线协议类型转发事件，不把透传载荷断言成业务事件；仅对明确为字符串的文本块执行合并和切片，未知事件仍透明转发。Host 继续拥有业务事件解释与 desktop/mobile 的投递语义。
- 用对应离线测试验证保存、浏览器恢复、广播、启动清理等受影响行为；根 typecheck/lint/architecture 均要求 0 错误，lint 要求 0 警告。
- 实时线协议回归需验证 owner 与 observer 同步收到连续 seq、普通文本块合并、未知合法事件原样转发，以及过期 owner 无法发布。

## T0.5 离线回归与 CI

- 根命令 `pnpm test:studio` 收集仓库现有的服务、UI、共享协议、RPC、桌面主进程与 CLI 协议/插件离线测试。清单按已审核的测试目录确定，入口在子进程使用 Node 24 的测试运行器和 tsx；测试数据由各测试自建临时目录，外部端点仅使用模拟响应或本机回环服务，不调用付费模型。
- 每个测试目录至少找到一项，否则入口失败；这防止重命名后安静地少跑一整类。结果保留原测试运行器的退出码和失败详情。
- Windows Actions 固定 Node 24.14.0 与 pnpm 10.33.2，冻结 lockfile 安装，随后运行 typecheck、lint、architecture:check --changed 与 test:studio；不注入模型凭据，也不构建或上传发行包。本轮只做本地配置和语法验证，云端状态记为未运行。
- 将 pnpm 的 overrides 和 patchedDependencies 从不再读取的 package.json 字段移到根 workspace 配置，保持现有补丁路径与 lockfile 解析一致；冻结 lockfile 在本机验证后再用于 CI。
- 文档插件的标准库预检纳入离线入口，Windows CI 显式配置 Python 3.13。测试子进程同时设置现有的 KNORVIA_DATA_BASE_DIR 与 KNORVIA_STORAGE_DIR，分别隔离桌面共享配置和 CLI 插件存储；UI 别名复用其 tsconfig，通过 TSX_TSCONFIG_PATH 指定。
