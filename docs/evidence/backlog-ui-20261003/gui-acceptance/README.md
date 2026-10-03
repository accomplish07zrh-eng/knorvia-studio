# 本路实际 Web GUI 与旧数据检查

基于确切 main `59517d9699519b0a7a44980da27df29d45f0e91e`，继续原分支
`rewrite/ui-20261003`。本轮按用户最新的最终 GUI/安装包/兼容验收授权执行，
不是旧实现阶段“未验证”的追溯通过。全部数据为 `/tmp` 下合成数据；未接触用户
电脑、真实数据或凭据，也未发送模型任务。完整事实和范围见 [receipt.json](receipt.json)。

实际运行 Debian 13、Node 24.14.0、Chromium 151 headless 与源码 WebRoot；Host 使用
实际 `createLocalServices` / `createHttpServer` 和显式隔离的公开 builtin 配置。
WebSocket、RPC、SQLite、文件预览及文件 watch 均为生产实现，没有替换组件或服务
响应。隔离配置只用于避免外部凭据/模型访问，不是发布配置验收。

## 已接受的有界流程

| 流程 | 实际结果与边界 |
| --- | --- |
| 导航/资源 | 工具栏实际宽度 56px、PNG 加载且无滤镜；仅显示实际安装内核 |
| 文件树 | 深层搜索与正文预览通过，alpha/beta 内容各自隔离，实际目录浏览器添加 beta |
| 实时搜索修复 | 搜索开启时 create/preview/rename/delete 全部通过，不点击手工 refresh |
| 外部内核草稿 | Codex 未发送草稿经工作流、设置、浏览器及 Host 进程重开恢复 |
| 群聊 | 实际创建定义、共享目标、中文草稿，导航及重启后恢复 |
| 分屏 | 任务右键菜单打开两 pane；仅布局/菜单接受，真实历史会话不可用 |
| 旧布局 | localStorage v1 以原 0.62 比例迁移；真实分隔条 pointer 提交 v2，renderer reload 恢复 |
| 旧群聊 | v1 经实际 Host ACK 导入后移除旧记录；原草稿、目标、成员、共享摘要保留 |
| SQLite | 冻结 v1 DDL 的未版本化合成库经实际 5 个迁移，原业务字段和坏 JSON 保留；WAL 快照一致、重开幂等、坏 checksum/未来版本无改行拒绝 |
| 普通工作区草稿 | 等待目标标题和 editor commit 后，alpha/beta 文本与各自 storage 均独立恢复 |

[实时文件预览](file-tree-live-search-created.png)、[菜单分屏](web-task-split.png)、
[旧群聊导入](web-legacy-group-imported.png)、[重启后外部草稿](web-host-restart-draft-recovery.png)
均来自实际 Chromium。对应 JSON 保存实际断言结果及 console/request 观测；不把
历史失败或脚本 selector/timing 修正当作产品修复。`web-restart-results.json` 中
原生草稿原检查失败，后续 `web-native-draft-bounded-recheck-results.json` 明确更正。

## 修复与定向检查

实际 watch 刷新只更新目录树，搜索沿用旧 packed index；手工刷新目录也沿用 Host
的索引缓存。accepted watch batch 现在通过已有 search owner 刷新端口；该 owner
先调用公开 `searchWorkspaceFiles({ refresh: true, query: "", limit: 1 })`，再读取 packed
chunks。刷新 ACK 回来后先查 scope ticket，旧 scope 不能开始读取或回写。没有新
服务协议、索引缓存、持久化格式、JSX/CSS、阈值或资源修改。

两项新合同修前均失败，修后两个 suite **15/15** 通过。8 个改动代码文件 oxlint
0 warning/error、9 个代码/spec 文件 oxfmt 通过；changed 架构检查为零。可复用真实
浏览器用例在 `packages/ui/test/helpers/file-tree-live-search.browser.mjs`，调用者提供
实际 page 和带合成标记的隔离 workspace；它只创建/清理自身 UUID 文件。

UI project typecheck 实际 exit 2：缺少 shared/services project reference 的 dist 声明，
TS6305 后有大量级联诊断。没有把它写成通过，也没有为此重复构建/8k 全量测试。

## 跨模块阻塞与仍未验证

- 源码 HTTP/Web 未注册 `window-controller` 通道；订阅和 pinned 读取报超时。
  全局 pinned/grouped 列表需父任务协调 Web/Controller 装配，不在本路加 fallback。
- 多次浏览器新进程观察到 `OnboardingDialog` hook 顺序错误，error boundary 捕获
  `areHookInputsEqual` TypeError。功能步骤可继续，但不能宣称 console 无错；转交
  原 onboarding/service hook 范围继续定位，不以 pageerror 数组为空遮蔽已捕获错误。
- 真实 Agent 运行所需构建产物缺失，索引订阅返回
  `KNORVIA_AGENT_RUNTIME_UNAVAILABLE`；真实历史消息、执行/续接、运行中恢复待验收。
- 旧 Host 停止后 cleanup 报剩余 esbuild zombie（PID 17570、PPid 1），exit 1。
  新 PID 恢复成功仅证明这次非干净退出后的数据恢复，不证明优雅退出通过。详见
  [shutdown-failure.json](shutdown-failure.json)，由 services/进程管理范围处理。
- 部分 github-light/dark 懒加载主题 JS 请求被中止；正文实际可见，但未验收全部主题。
- 环境无 runnable Electron、Windows/Wine 或 macOS、无原生安装包。
  已阅读 `test:studio:ui` 与 packaged 脚本及历史 Windows 记录；本轮未运行它们，
  Linux 源码 Web 结果不能代替桌面 smoke、当前安装包、首次安装或升级验收。

本路仍为 source-exposed / Apache-2.0 过渡候选。版权、LICENSE、NOTICE、依赖及全局
来源清单保留；这些 GUI/数据证据不构成 MIT 权利决定。
