# PR24 实际 Web GUI 与 Host 退出验收

本批继续 `rewrite/ui-20261003`，受测组合最终为
`902e35c6dbcfa4b829270352fecf03ebc07b219f`，此前兼容检查运行于
`ad712690b3eb1501574c1d29361dc801c1414373`。没有新增生产源码变更。
实际 Desktop renderer 是 `packages/desktop/src/renderer/`；本环境只接受下面的
Linux Chromium Web 场景，没有运行 Electron 或原生安装包。

## 实际结果

| 组合 / 场景 | 结果与证据 |
| --- | --- |
| 902 冷启动、workspace 切换、reload | 原合成 profile 的 alpha/beta 中文草稿独立；Hook、caught boundary、pageerror 均为零。[GUI 记录](902/combined-file-pinned-results.json)、[截图](902/combined-cold-startup.png) |
| 902 资源基础 | 窄栏实测 56px，品牌 PNG 已加载、naturalWidth 1254、filter none。只接受资源基础。 |
| 902 文件树搜索 | 实际文件 create → preview → rename → delete；搜索保持开启，watch 更新，没有手动刷新。[截图](902/file-tree-live-search-created.png) |
| 902 Controller | 实际右键 Pin task → 全局 Pinned 行 → reload 保持 → Unpin 移除；真实 `subscribeControllerV4/listTaskList` 成功。[调用日志](902/gui-host-controller.log)、[截图](902/combined-controller-pinned.png) |
| 902 群聊恢复 | 从 ad712 数据恢复群定义、目标、workspace 和未发送中文草稿。[单项复核](902/group-recovery-bounded-recheck.json)、[截图](902/combined-group-recovered.png) |
| 902 菜单分屏 | 真实 task 菜单打开两 pane。[截图](902/combined-task-split.png)。仅合成 task index 元数据与布局，没有运行时对话历史。 |
| 902 CLI 存储 | 真实 `prepareStorage` ready，22 个初始化迁移完成，观察到托管 Agent PID 31581。[记录](902/agent-readonly.json) |
| 902 Host await-dispose | 存活 Agent 随 Host PID 31548 关闭：services dispose 完成、HTTP 关闭、Host/Agent exit 0，所观察 PID/Agent 进程组无残留。[退出记录](902/host-exit-results.json)、[关闭前进程](902/host-exit-before.json)、[日志](902/storage-and-exit-host.log) |
| ad712 群聊创建 | 实际创建群、填写目标和中文草稿，页面往返恢复。[记录](ad712/web-group-split-results.json)、[截图](ad712/web-created-group.png) |
| ad712 旧布局 / 群聊 | pane v1 导入 v2，beta 焦点、比例保持；指针提交新比例后 reload 保持。群 v1 经实际 Host ACK 后删除旧键，v2 草稿保持。[记录](ad712/web-legacy-results.json)、[布局截图](ad712/web-legacy-pane-migrated.png)、[群截图](ad712/web-legacy-group-imported.png) |
| ad712 合成旧 SQLite | 真实 `node:sqlite`、冻结 v1 DDL、五个 Host task-index 迁移；字段、坏 JSON、分组/定时/低峰绑定、WAL 快照、重开幂等及 checksum/future 拒绝不写原行均接受。[记录](ad712/legacy-acceptance-result.json)、[driver](ad712/recipes/legacy-acceptance.mts.txt) |

902 GUI 首轮为五项通过、一项 locator 失败。群目标同时存在于主区 h2 和详情 p，
原 `getByText(..., exact)` 违反 strict mode；只将私有检查脚本定位改为对应 heading，
单项复核通过，产品 DOM 没有改动。原失败 JSON 完整保留，因此六个不同 GUI
场景分别接受，没有把首轮记录改成六项全通过。复核脚本曾在运行浏览器前出现一次
文本截取语法错误，修正后才执行单项；这不是产品错误。

ad712 旧数据结果保持原受测 SHA，没有重标成 902 重跑。
[构建字节记录](902/built-artifact-bindings.json) 对所列 UI/Web/CLI/shared/数据库/Controller
路径做有界 Git 差异检查，ad712 → 902 无变更；902 的产品变化位于三个 services
process-tree 文件。[源码字节绑定](source-bindings.json) 不是全项目审计。

## 运行产物与隔离

- Node 24.14.0、pnpm 10.33.2 匹配 `mise.toml`；Chromium 151.0.7922.173，
  Playwright Core 驱动实际生产 Web，1360×900。没有替代组件、RPC 回包、services
  或 Controller。临时 Host 使用公开 `createLocalServices/createHttpServer` 工厂，
  按 server 正式 defines/externals 编译；owned SIGTERM handler 先
  `await disposeServiceResourcesAndWait`，再关闭 HTTP。
- ad712 构建 RPC/provider/shared/services/client/server 声明、正式 Web Vite
  production、配置中的 HTTP entry，以及官方 `build-desktop-agent-cli.mjs` 的
  实际 CLI 与所需插件产物。命令、退出码及警告见各 `*-build.json/log`。
- 902 重建 services/server 依赖、正式 HTTP entry、真实工厂 Host 夹具与 Web
  production。CLI 相关源码未变，复用 ad712 刚构建产物；CLI 与 desktop staged
  CLI 字节一致且等于旧绑定，没有声称在 902 重建 CLI。
- Vite 存在 large chunk 与 PreviewPdf/Pptx/Office 动态导入不能拆包的警告；GUI
  lazy GitHub dark/light chunk 请求记录 `net::ERR_ABORTED`，没有隐去。完整主题和
  Office 资源表现仍未验证，基础品牌资源通过不替代这些边界。
- 数据都是本任务合成的旧 task metadata、群、草稿和 SQLite。没有提交真实用户
  配置、浏览器 profile、CA 私钥或凭据；没有发送模型任务、配置账号或付费调用。

无账号存储探测最初实际失败 `open_failed/ENOENT`。CLI 原始日志指向配置默认的
`~/.knorvia-studio/cli/db/db.sqlite`，这个默认值不是 Host 临时 data base。
随后仅为夹具通过既有 `KNORVIA_SESSION_DB_PATH` 显式指定临时数据库，并设置
`KNORVIA_STORAGE_DIR` 隔离工具目录；没有改 `HOME/CODEX_HOME` 或其他路源码。
[原失败](902/agent-storage-before-correction.json)、[更正绑定](902/storage-fixture-correction.json)、
[真实 CLI 事件](902/real-cli-storage-events.json) 均保留。失败启动后的 Host dispose
也 exit 0；最终存活 Agent 退出另有独立证据。`initialize` 实际返回
`provider_not_ready`，只接受 storage/control 与 shutdown，没有接受模型交互。

原始 JSON/PNG 按历史组合分目录保存。实际私有 driver 原文以 `.txt` 保留于
`recipes/`，不登记为新 suite；临时目录与版本见 [fixture-bindings.json](fixture-bindings.json)。
完整原日志的字节/hash 和完整日志块的选择规则见
[raw-log-bindings.json](raw-log-bindings.json)，提交的是可阅读节选。
交付字节清单见 [SHA256SUMS](SHA256SUMS)。

## 尚未验证与协调

只运行必要产物构建和有界真实 GUI/control/dispose 检查，没有重跑根 typecheck、
lint、全量架构、约 8k 回归或来源/权利审计。以前 UI reference typecheck 的缺 dist
失败仍是历史结果；本轮确实生成了运行需要的声明，不能再把当前 GUI 判为缺产物，
也不能据构建成功声称全量 UI 类型检查通过。

真实历史、执行、续接及运行中的工具/MCP 后代关闭仍未接受；关闭前没有独立
tool/MCP 后代，不能推广为所有后代/Z 状态分支通过。Electron、Windows/macOS
当前安装/升级、移动布局、完整主题与 Office 表现未验证。历史 PID1 zombie 证据
没有改写；services 路 33 项结果由其原记录负责，本路没有重复执行或修改修复。
Web Controller 通道与 Hook 冷启动在这个实际组合已接受，不再列为当前缺装配阻塞。

按当前 AGENTS 的用户更正沿用根 Apache-2.0；组件实际许可、版权、NOTICE 和来源
历史保留。本批组合运行证据不能证明 clean-room 或全项目独立替换完成。全局清单、
CI 和原生平台缺口继续由整合任务维护；本路没有新增共享接口需求。
