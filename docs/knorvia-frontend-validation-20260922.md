# Knorvia Studio 前端壳验收记录

2026-09-22。运行时代码构建提交 `7b0549f84b6034220d047125a03ffe3d0ffd1bd3`；其后仅格式和文档整理。产品规则以 [当前 spec](../specs/knorvia-frontend-shell.md) 为准。

## 已交付

- 在原 GUI 中增加主侧栏单聊／群聊切换、内核选择和工作流入口，保留自动化；搜索移至顶部图标；只按项目显示单聊。
- 四内核复用原 WorkspaceHeader、ConversationDraftEmptyState、ChatEmptyWorkspacePreviewMenu、ChatPromptEditor 和 LexicalChatInput。输入卡收口到 ConversationComposerSurface；草稿布局与原 ConversationTimeline 共用常量。
- 外部会话项目、文字草稿由 studioAgentStore 唯一持有。切换内核新建会话；旧草稿可以单独恢复。外部编辑器不挂载原 Knorvia slash／mention 目录，也不调用原生发送或会话预热。
- 设置中的 Agent 管理可以保存 CLI 路径与权限偏好。群聊可以维护成员、主持人和共享说明、写 @ 草稿。工作流有可编辑节点与连线、属性、保存、图校验和运行历史空态。
- 移除独立插件市场及浏览市场、添加市场来源入口；原偏好和事件迁往同一插件管理。保留已安装插件的配置、启停、更新、卸载与创建入口。
- 模型模板统一排列，按本地化名称排序；没有智谱／其他分区。设置和自动化标题使用 text-ui-lg（默认 16px）。自动化顶栏补齐原窗口控件。
- 保持 Knorvia Studio 名称、白色默认主题、透明图标、去产品登录与独立资料目录。

## 自动检查

| 检查 | 结果 |
| --- | --- |
| 根目录 `pnpm typecheck` | 通过 |
| 桌面 renderer 类型检查 | 通过 |
| `pnpm lint` | 0 错误，29 条既有警告；本轮新增警告 0 |
| architecture | 0 违规 |
| 前端实质测试 | 43 / 43 通过 |
| 改动文件格式及 diff 检查 | 通过 |
| 生产构建 | 通过；保留上游已有的大块资源警告 |
| 便携包校验 | 品牌、便携标记、归档完整性和运行时资源匹配；无 login.html |
| 图标 | 7 种 ICO 尺寸均匹配，透明边角保留 |
| 覆盖交付时的数据保护 | data 中 76 个文件逐个 SHA-256 比较一致 |

测试命令从根目录执行，tsx 必须指定 UI tsconfig 解析 `@/` 路径：

```powershell
pnpm exec tsx --tsconfig packages/ui/tsconfig.json --test packages/ui/test/studio-workflow.test.ts packages/ui/test/studio-navigation.test.ts packages/ui/test/studio-group-store.test.ts packages/ui/test/studio-agent-store.test.ts packages/ui/test/knorvia-clean-base.test.ts packages/ui/test/settings-plugin-navigation.test.ts
```

本轮新增项目归属测试覆盖：项目与文字重开恢复、错误内核不能改写、清空文字仍保留项目、脱离项目保留文字、旧 v1 无路径草稿兼容、损坏路径数据不被覆盖。现有测试覆盖分支／并行图、撤销／重做、持久化失败、群成员与主持人一致性、旧插件导航迁移等。

## 桌面交互

全部测试草稿写入独立的 `D:/tools/.cache/knorvia-frontend-gui`；不复制到交付数据。

| 场景 | 实测结果 |
| --- | --- |
| 原首页、顶部搜索、内核下拉 | 原样式保留，搜索可达，四项清楚显示 |
| 群聊 | 创建双成员群聊，编辑并插入 @，重开后配置和草稿恢复 |
| 工作流 | 创建并行模板，6 个节点与连线可见，编辑节点说明并保存，校验指出缺少说明的节点 |
| 外部会话原有隔离 | Codex 草稿与 Claude 新会话分离；切换返回设置的路由保留 |
| 最终共享聊天界面 | Knorvia 与 Codex 的标题栏、问候语、项目栏、输入卡位置尺寸一致 |
| 最终共享编辑器 | 旧 Codex 草稿正常恢复；输入、回车保留草稿，不发送；`/goal` 与 `@` 为普通未发送文字 |
| 最终项目选择 | 原项目菜单打开系统选择器，选择本机工程后项目名进入当前草稿与侧栏，文字保留 |

最后一轮桌面检查期间，测试窗口被最小化，自动化操作持续报告用户输入；因此没有继续争抢窗口。最终 Claude／Grok 的逐页截图、合并后设置和自动化页复查，以及本轮交付目录再次启动，未完成独立实机复验；它们的共享代码、路由测试、类型检查、生产构建与包结构校验已通过。此前独立便携版启动和基础隔离检查不能替代本轮上述未执行场景。

## 交付和范围

交付目录：`C:/Users/17018/Desktop/Knorvia Studio Portable`。已展开，直接运行 `Knorvia Studio.exe`。保留现有 data，没有生成额外压缩包。

- 可执行文件 SHA-256：`52a1e287f963e3c55a3cc5e90b4a50e975e646c82239ad19ac564d364f284bfd`。
- 归档完整性值：`ab205bc83322de2862d59d5616d6c5a5cd4523dc2f12dfc7269b16ba42fdadb0`。
- 原内核资源逐项匹配；基础登录移除与数据隔离没有改回上游。

外部 CLI 连接／安装管理、群聊调度、工作流执行仍是后续后端范围。本轮按钮不会伪造已连接、执行中或成功。没有调用真实付费模型，也没有代用户登录。

证据在 `D:/tools/.cache`：`knorvia-final-typecheck.log`、`knorvia-final-renderer.log`、`knorvia-final-lint.log`、`knorvia-final-architecture.log`、`knorvia-final-ui-tests.log`、`knorvia-final-build.log`、`knorvia-final-repack.log`、`knorvia-final-delivery-verification.json`、`knorvia-final-delivery-copy-summary.json`、`knorvia-final-data-before.json`。
