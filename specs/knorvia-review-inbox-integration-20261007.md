# Diff 批注回改与跨内核待处理收件箱：整合与发布契约

2026-10-07。本 spec 属于整合发布任务，功能实现由现有两条任务负责，第三条任务独立回归和来源核对。先写 spec，再改变行为。用户已授权完成两项改进、合并通过检查的结果并发布稳定版。

## 独立基线

- 本地、`origin/main` 与 GitHub main 均为 `a8f83c98baacefe18208ebfde136b3d0d3a1fdfd`，工作区干净；freshness 为 ahead 0 / behind 0。
- 该 exact main 的离线 CI [37601248896](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37601248896) 成功。基线全量与 changed 架构检查均 exit 0、violations 0；不重复运行没有变化的完整离线基线。
- 最新稳定版 v0.9.0，发布源 `d68371e5574fa6e0b12e5e3d60f229d9efc1420c`，draft=false / prerelease=false，24 个 Windows/Linux 文件。main 后续的网站下载引用与来源清单提交须保留；没有部署网站。
- v0.9.0 Windows setup 首次验收出现 `0xC0000005`，一次失败作业重试通过，原生原因尚未确定。本轮不得称其已修复；重现时保留真实错误并调查，不削弱安装验收。

## 用户行为与范围

1. 用户在现有隔离工作区 Diff 上给出行内批注，保存可编辑草稿，确认后提交给产生该产物的原 Agent 进行定向修改。批注必须携带被冻结的文件版本与原运行/步骤归属，版本变化时明确阻止静默错位并保留草稿。
2. 在现有桌面 Studio 入口提供跨内核待处理视图，聚合审批、失败和完成未读。点击导航、标记已读与审批是不同动作；读状态不得回答审批或启动任务。
3. 保留已有原生搜索/未读、草稿、数据、审批与工作区安全边界，沿用黑白视觉语言与 `text-ui-*` 控件尺度。
4. 不包含账号额度、终端重启历史、手机、macOS、网站部署、签名配置/凭据、新云账户或付费服务。所有发布包继续如实标为 unsigned。

## 已核对的入口与唯一所有者

| 事实或动作       | 现有入口/所有者                                                                         | 本轮边界                                                                         |
| ---------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 隔离差异与接纳   | `IStudioRuntimeService.workspaceChanges` / `applyWorkspaceChanges`，Studio Runtime Host | Host 重新核验归属、路径、版本与锁；批注不能获得隐式应用权限                      |
| Diff 审阅 UI     | `StudioRunHistory`、`StudioWorkspaceReviewCard`、`DiffViewer`                           | Renderer 只持有未提交草稿、选择和请求状态；不能形成第二个已接纳队列              |
| 现有聊天批注     | `lib/codeCommentContext.ts`、`useCodeCommentContexts`、`codeCommentPreviewStore`        | 新版本锚点必须兼容旧草稿，不能清空或把历史上下文升级为有效授权                   |
| Studio 命令      | `IStudioRuntimeService.command`、`StudioClient`                                         | 原 Agent 定向回改复用既有受理与内核能力校验；新增公共能力须先补 contract/example |
| 原生受理消息     | CLI/runtime CommandInbox                                                                | 保持串行受理、稳定命令 ID、ACK；Renderer 不维护另一份 accepted queue             |
| Studio 交互      | 既有 `answer` 命令和持久 interaction 记录                                               | 显式回答审批才写审批状态；跳转和已读不能调用 `answer`                            |
| 原生未读         | task meta `unreadAt`，现有 session 服务                                                 | 收件箱读取该事实并调用原有已读入口；不重新实现搜索/未读                          |
| Studio 运行/完成 | 现有 run、step-result、turn 与完成通知                                                  | 收件箱为投影；若需已读收据，仅保存读取游标，不另存运行/审批真相                  |
| 工作区隔离       | 优先 `workspaceIdentity?.trim()`，为空时使用 `workspacePath`                            | identity 用于隔离，path 用于执行/显示；同 ID 在不同 Host/workspace 不能碰撞      |

```text
批注 → Renderer 未提交草稿 → Host 校验归属/版本 → 既有命令受理 → 原 Agent
运行/交互/未读事实 → 只读聚合 → 现有导航 / 显式已读 / 显式审批命令
```

## 跨任务接口与先行约束

- 批注任务拥有批注 spec、模型/版本锚点、编辑与保存/提交 UI、原 Agent 定向回改能力及相应测试。
- 收件箱任务拥有收件箱 spec、跨内核事实投影、导航/已读 UI、读取游标（如确有需要）及相应测试。原任务因超出工具参数大小限制而失败，原线程重试仍失败，父任务已明确停止调用该失败线程；没有可见实现可接纳。
- 按父任务后续分工，复用原独立回归任务 `01a114d9-8ba5-76ea-9e1c-9186dc652024` 承接收件箱与原生读取回包 CAS 防护。该任务负责 `taskQueryCacheStore`、`useWorkspaceTaskNavigation` 等必要生产修正及其功能回归，不新建替代线程，不复制另一个产品实现。
- 整合任务拥有本 spec、独立跨功能验收与发布报告；收到功能 PR 后再做必要接口修复。整合任务尚未修改 CAS 生产文件，将独立验证接手任务的实现，不与其同时编辑共用缓存/导航文件。
- 两任务如需修改 `studio-runtime/contract.ts`、`types.ts`、服务注册、`StudioClient`、共享消息或菜单入口，须先通过各 PR 评论报告公共字段、唯一写入者与冲突文件；独立回归/整合协调合并顺序，避免重复写入者。
- 回改请求必须绑定 run/step、产物路径、内核/原 conversation、冻结内容摘要/版本、批注范围与明确用户文字；从 Host 已有收据解析归属，不信任 Renderer 自报绝对路径或切换后的 Agent。
- 明确事件顺序：读取差异 → 建立锚点 → 编辑/持久草稿 → 提交时再核验 → 既有受理 → 回执 → 派生收件箱。await 前后校验连接/workspace/归属，旧请求结果不能覆盖新上下文。
- 相同提交的稳定 command/idempotency ID 只能受理一次；失败、拒绝、断连、未知受理状态保留可恢复草稿，不能自动重试产生重复回改。忙碌行为和内核 unsupported 必须明确。
- 批注文本属于用户可见上下文，不是审批授权，不保存隐藏推理或秘密，不触发工具自动执行。
- 收件箱 key 包含 Host/连接、工作区、对象类型与稳定对象 ID；分页/重放/断连不能重复项或把旧审批变成新的批准。
- 完成已读收据绑定所看到的完成版本/事件序列；后续新完成仍显示未读，历史未知版本保守处理。原生已读仍使用原 owner。
- 已确认的原生迟到回包风险必须修正：`setTaskUnread` 的 Host `expectedUnreadAt` CAS 只保护持久事实；原请求先完成后，UI 收到新 `unreadAt` 再收到旧已读回包时，当前无条件 `reconcileTaskUnread` 会清掉新缓存 marker。该风险及复现证据见 [独立回归评论](https://github.com/accomplish07zrh-eng/knorvia-studio/pull/46#issuecomment-6037678624)。这是缓存时序证据，不宣称 GUI 或持久数据已损坏。
- 新收件箱的原生已读与共用导航入口必须覆盖三种次序：旧请求晚于新事件到 Host（既有 CAS 拒绝）；Host 已完成旧请求但旧响应晚于新权威事件到 UI（保留新 marker）；旧响应晚于第二次阅读/新实例（ABA、错误/rollback 均不得影响新操作）。UI 操作身份与权威事件版本应由现有 query cache owner 维护或核验，不能形成新的持久未读所有者。仅比较 ACK 的空值或旧文本不足以证明安全。
- 桌面连续流与已有远端连接使用既有契约；本轮不修改 mobile/replay 行为。

## 代表性验收与证据门槛

### 整合任务的独立读取回包交互 gate

整合任务将在真实 React DOM 中挂载现有 `useWorkspaceTaskNavigation`，点击触发真实 query cache 路径；仅替换服务/会话/tab 等外部 ports，用合成任务和受控 Promise 分别保留成功/失败回包。该辅助 gate 不修改共用生产文件，不预设接手任务的操作 token 字段。jsdom 为 `/tmp` 中的验收依赖，不加入产品依赖或发布包。

必测：正常已读、新权威 marker 后旧成功/失败回包、第二次阅读后旧回包的 ABA、删除或清空后同 ID 重建、不同 workspaceIdentity 的隔离、旧 marker 查询与 Host CAS 回包。还须通过真实 `taskStatusUnreadSync` 入口验证后台 mark-unread 的旧成功回包不能覆盖后来显式阅读，旧失败 rollback 不能清新 marker 或回写旧 Dock 兼容投影。该共用异步消费端由收件箱/CAS owner 一并修正，整合只写独立测试。调用计数只能使用既有未读字段入口，不能调用 `answer`/`send`/`resume`。旧树须确实暴露反例；接手修复 head 的相同 gate 必须通过，不能修改断言来适应错误行为。

这证明真实 React hook/cache 的交互和受控服务时序，不等于完整桌面 GUI、真实 provider 或真实账号。当前环境没有 Electron 已安装运行时、desktop main 输出或 Xvfb；这些缺失如实记录，完整桌面验收需补齐环境或在已有 CI 中实际执行，不能把 DOM gate 声称为已安装 GUI。

辅助 gate：`packages/ui/test/integration-native-read-response.dom.mjs`，延续现有 `.dom.mjs` 辅助交互 gate 约定，需显式运行，不以普通离线入口通过替代它。旧生产树在 `55ea3339` 上的执行结果为 exit 1，12 tests / 4 pass / 8 fail / 0 cancelled / 0 skip；失败次序正是上述迟到回包/ABA/重建/新 membership/后台同步反例，不是测试框架加载失败。接手修复与最终整合 head 必须使同一 gate 全部通过。

```bash
npm install --prefix /tmp/knorvia-integration-dom --cache /tmp/knorvia-integration-npm-cache --no-audit --no-fund --ignore-scripts jsdom@26.1.0
TSX_TSCONFIG_PATH="$PWD/packages/ui/tsconfig.json" KNORVIA_INTEGRATION_DOM_DEPS=/tmp/knorvia-integration-dom node --experimental-test-module-mocks --import tsx --test --test-concurrency=1 --test-timeout=120000 packages/ui/test/integration-native-read-response.dom.mjs
```

| 场景                                | 必须断言                                                                                             | 证据                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 行内批注保存、编辑、重开            | 草稿与冻结行/文件版本一致，旧草稿保留                                                                | 真实组件操作与持久层/重开夹具                               |
| 原 Agent 定向提交                   | 同 run/step/conversation/workspace，原审批上限与能力约束不变，单次受理                               | 组件 → 公共命令 → 真正 Runtime/本地内核协议夹具             |
| 审阅后产物变更或源冲突              | 锚点失效明确，草稿保留，不修改源文件，不错投另一 Agent                                               | 磁盘字节/版本与 Runtime 断言                                |
| 双击、迟到回执、切换 workspace/连接 | 不重复受理，旧回执不清空另一份草稿                                                                   | 延迟/竞争夹具                                               |
| 审批聚合、导航、已读                | 读动作不批准、不重试、不发消息；仅显式回答调用 owner                                                 | 跨内核真实组件与命令计数                                    |
| 完成、失败、取消/重启               | 各状态遵循真实 owner；已读仅覆盖所见完成，新版本再次未读                                             | 持久重开与去重夹具                                          |
| 原生迟到已读 ACK / ABA              | Host CAS、新权威事件后旧 UI 成功回包、第二次阅读后旧回包及失败 rollback 分别有 fence；新 marker 保留 | 真实 taskQueryCacheStore/导航入口的受控时序，不仅数据库测试 |
| 原生搜索/未读及同 ID 隔离           | 原入口和语义不变，异 workspace/Host 不互相标记                                                       | 既有回归与组合场景                                          |
| 旧数据与安全边界                    | 无清空、无隐式授权、无凭据泄露、无自动回放                                                           | 旧记录/无权限/unsupported/不可信路径夹具                    |

- 不把静态源码字符串断言替代真实交互。各任务给出已执行命令、exit code、覆盖数量、未执行限制；独立回归任务确认不是镜像实现测试。
- 首次与最终代码变更运行 changed/full architecture、fmt、provenance regeneration/check、lint、根 typecheck。CLI 构建先于完整离线测试；目标与交叉集成测试真实执行。无新变更/失败/未解疑点时不重复整套验证。
- 最终不可变候选、合并 main 与发布源均有 exact SHA CI；独立合并前重新 fetch 与检查并发 main，不 forcepush main，不覆盖 tag/release。
- 先以 draft PR 审核；所有功能、独立回归与必需检查通过后才转 ready/合并。禁止部分功能先发布。

## 稳定发布与连续性

- 按项目 semver 规则与实际未使用 tags 选下一稳定版，更新中文用户可见 changelog、版本和仓库下载引用；网站只允许仓库引用保持真实，不部署。
- 保留 LICENSE、NOTICE、第三方共同声明与冻结来源证据；只按原规则再生当前来源清单，不添加复制实现。
- 复用现有 Windows/Linux 发布矩阵及安装/portable 验收；不新增 macOS、签名、账户、缩减验收或扩大超时来掩盖失败。
- 全部质量、打包、安装/portable、统一验证与 publish 作业达到终态成功；失败按证据诊断和有限重试，记录未定位原生故障。
- 独立核对公共 tag peeled target、release draft=false/prerelease=false、24 个预期文件的名称/数量/大小/GitHub digest、实际下载哈希与 SHA256SUMS/单文件校验、metadata source/所有四变体成功、源归档版本与法律文件一致。
- 实际证据仅支持运行过的验收；不宣称人工 GUI、真实付费模型、签名或未运行的历史配置迁移已验证。
