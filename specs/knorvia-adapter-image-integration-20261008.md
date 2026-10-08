# 外部适配器保真、聊天贴图与工作区图片对比集成

2026-10-08。用户批准「修正＋贴图＋图片对比」，并已明确授权三项统一通过验收后合入 main、按既有 Windows/Linux 范围发布新的正式版。先交付新的 draft 集成 PR、独立回归和适用桌面构建；验收完成前不发布。集成/发布仅由本路线执行，不发布 preview/draft release，不部署网站、不增加手机/macOS矩阵、不修改签名配置或授权策略。

## 基线与范围

- 开工远端 main：`34078257b5d9d1e78c40308b34dab8ff45565156`；最新稳定版 `v0.10.0`，根版本 `0.10.0`。
- 原集成分支 `codex/review-inbox-integration-20261007` 在 `99b913857a0f7055bad8b06b180015cb7520824b`，无未提交改动；它是已合并候选，本轮不继续使用。
- 新分支 `codex/adapter-images-integration-20261008` 从当前 `origin/main` 创建；freshness fetch 后及新分支检查均 exit 0，新分支 ahead 0 / behind 0。基线全仓架构检查 exit 0，违规/基线/新增均为 0。
- 保留全部已有功能、黑白 UI、历史数据、旧记录兼容、根 LICENSE/NOTICE/THIRD-PARTY-NOTICES 和冻结来源证据。版本号暂保持 `0.10.0`；构建须标明候选 exact commit，不能冒充新的稳定版本。
- 三项首批：合成协议证实的外部适配器信息/状态最小修正；本地 Codex 或明确核验图片输入能力的 PNG/JPEG 截图粘贴/拖放；既有隔离工作区精确快照的静态栅格 before/after 并排。
- 矩形短评、文件反查任务、PR 面板、备份检查、评测平台、手机改动不在本轮。既有按明确路径读图能力保持，不把新增 composer 附件入口描述成此前不能读图。

## 当前入口与唯一所有者

| 事实/状态                                 | 所有者与既有入口                                                                                  | 本轮边界                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 原生协议消息与 turn 终态                  | `adapters/kernels/*Protocol.ts`、`kernelRun.ts`；`StudioKernelEvent` / `StudioKernelTurnResult`   | 准确保留协议事实；关联 session/turn，不用 UI 或未知状态推断成功        |
| 发送命令、审批、取消与去重                | `IStudioRuntimeService.command`、现有 command admission/run/session/lease；`StudioKernelSink.ask` | 沿用 commandId/dispatchId 和 owner；新增图片不得绕过审批或另起接受队列 |
| 外部聊天未提交草稿                        | `StudioExternalChat`、`studioAgentStore`、`chatSubmission`                                        | text 和图片属于同一目标的草稿；ACK 只清除对应提交版本                  |
| 已核验能力                                | `StudioKernelStatus` / `kernelOptions` 的能力证据及既有发送 gate                                  | 图片能力为增量、显式证据；缺失/未知不当作支持，不改变五项权限能力      |
| 隔离 baseline、working、source 和文件版本 | `createStudioWorkspaceManager`、`workspaceSnapshot`、Host 运行/步骤收据                           | Host 定位并复验 run/step/path 和三份 hash；Renderer 不选绝对快照路径   |
| 工作区审阅弹窗与异步视图                  | `StudioRunHistory`、既有 `workspaceChanges` / `applyWorkspaceChanges`                             | 新图片只读投影与现有文本/应用共存；关闭/切换后迟到结果不得替换新目标   |
| 二进制传输与图片显示                      | `IFileService.readBinaryPreview`、既有图片预览组件                                                | binary 默认及上限为 25 MiB；`readMediaPreview` 的 4/8 MiB 是另一条边界 |

`workspaceIdentity?.trim() || workspacePath` 保持身份隔离，`workspacePath` 只用于文件/cwd。Desktop continuous 与既有 replayable 恢复语义保持，新增首批图片输入不扩大远程/手机支持。

```mermaid
sequenceDiagram
    participant U as 用户
    participant D as 原聊天草稿
    participant H as Host admission/session owner
    participant A as 原生适配器
    U->>D: 粘贴/拖放并编辑文字
    D->>D: 目标、图片格式、能力和草稿版本核验
    U->>D: 发送一次
    D->>H: 冻结输入与稳定 commandId
    H->>A: 同一 run/turn/dispatch，既有授权上限
    A-->>H: 关联 session/turn 的事件或审批
    H-->>D: 对应提交版本 ACK/失败
    D->>D: 仅对应成功提交清除；失败/新草稿保留
    U->>H: 打开既有 run/step/path 图片差异
    H->>H: 从 baseline/working 定位并复验三份 hash
    H-->>U: 精确两侧内容或明确失败状态
```

## 三路交接与共享文件边界

各路独立新分支、中文提交、独立 draft PR；通过本集成 PR 回报 spec、exact head、最小契约补丁、旧基线复现和验证证据。集成路按冻结 head 吸收提交，完成全部 gate 后才统一合入 main；任何路线不得 force-push main 或覆盖 tag/release。首次共享契约改动前先在集成 PR 贴出字段/事件与所属文件，避免各路各自发明图片类型或改写同一段。

| 路线            | 首要拥有文件/语义                                                              | 共享切片与交接规则                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A：适配器保真   | `adapters/kernels/*Protocol.ts` 的事件/状态处理、协议 fixtures、相关运行投影   | `kernelTypes.ts` 的事件/结果字段由 A 协调；`codexProtocol.ts` 的通知、请求、终态/归属切片由 A 改。不得顺带改图片输入、权限策略或 composer                                                              |
| B：外部聊天贴图 | `StudioExternalChat.tsx`、`chatSubmission.ts`、草稿/store、附件接纳与发送链    | `kernelTypes.ts` 的图片输入类型/显式能力字段及 `StudioKernelTurn` 输入切片由 B 提出，与 A 对齐后提交；`codexProtocol.ts` 只改构造输入的切片。`contract.ts` 只扩展既有 send 字段，保留旧 text-only 调用 |
| C：快照图片对比 | `workspaceManager.ts`/快照读取、版本和预览类型、`StudioRunHistory` 的图片分支  | `types.ts` 的 `StudioWorkspaceChange` 和快照读取请求由 C 协调；`contract.ts` 只涉及工作区读取切片，与 B 的 send 字段分开。复用 Host 入口/传输，不增不受控路径读取                                      |
| 集成：本路线    | 本总 spec、独立跨路线测试/真实浏览器验收、必要冲突修正、最后来源指纹与构建证据 | 在功能 PR 冻结前不抢改功能所有者文件；负责 `contract.example.ts` 组合示例和共享变更最终归并，任何更广的修正先给对应路具体复现                                                                          |

- `app/commandAdmission.ts`、`domain/validation.ts`、`app/turnSession.ts`、`app/ports.ts`、`types.ts`：B/C 若需触及，先列出精确符号/切片；既有 approval、session writeback、review、attention 分支均保留。
- `contract.ts` 当前公开 RPC 为 12 个；本轮保持现有预算，不通过放宽架构策略新增平行 RPC。C 先给出复用入口的 typed 请求/响应补丁；若其设计确需新增入口，先在本 PR 列明预算与替代方案，不能直接弱化 gate。
- 新类型必须可选/增量且浏览器安全；缺失按旧记录处理，未知格式不得强行覆盖。持久字段升级必须给旧 SQLite/JSON/草稿 fixture，不凭新建空库推断兼容。
- `third-party/inventory.json` 为生成文件，各路按自己冻结代码再生；集成冲突只从最后合并树重生成，保留原材料义务/历史指纹，不手工「解决」为失实来源。
- 通用 prompt/editor/图片显示组件只做经证实必要的最小扩展，保留内置聊天行为；不为外部内核另起聊天壳子。

## A：修正前必须证实

每个问题先记录现象、当前源码路径、合成原生消息、旧基线 actual/expected 和失败 exit，再最小修正。同一 fixture 在新代码通过并与现有 protocol/runtime 路由核对，才计为已复现/已修复。上游测试名称、定义或文档只是线索，不是本项目复现证据。

- 信息、工具更新、使用量、终态和错误必须保持原生含义；未知字段/状态不能静默等同成功，缺失数据保持未知。
- 不同 session/turn、迟到事件、请求撤回、取消、重复通知不能污染活跃轮次；同一审批仍只有原 owner 接受显式答复。
- 原生 child 权限归属属于高风险修正：先用本项目 fixture 证实 root/child 注册与审批链，保留根 thread fence。首批不擅自增加 child lineage 或新的授权 owner；若需扩展，先给父线程具体最小设计、归属证据和风险，取得范围确认后再实现。未知 child、其他线程和迟到旧轮请求继续拒绝，不得只删除 threadId 判断来使 fixture 通过。
- 合成协议不得联网、调用付费模型、读取真实凭据或真实用户 profile。日志和持久投影不增加秘密或隐藏推理暴露。

## B：输入/草稿接纳契约

- 首批 PNG/JPEG；逐文件核验类型与实际字节、大小/数量/总量明确有界，错误明确且保留已有正文/附件。限制由 B 的 spec/typed 常量说明，不能混用二进制预览预算。
- 支持 image-only 和 text+image，复用一次 send/admission；只把有明确图片能力证据的目标接纳为支持。未知/不支持明确拒绝，零 native dispatch，不自动改内核、模型、权限或使用降级隐藏发送。
- 本地 Codex 协议输入的形状由真实可核验协议/本项目合成 fixture 证实；原明确路径读图与 text-only 行为继续保留。
- 粘贴/拖放只创建当前目标未提交草稿。读取取消、组件卸载、切换 kernel/session/workspace 和迟到 FileReader/ACK 都按目标及草稿代次隔离；不能清除或插入另一个目标的内容。
- 重复 Enter/按钮共用原同步 in-flight gate 与稳定 commandId；确认接纳前失败保留草稿，接纳后的不确定状态不得自动重发。取消沿用原 runId，不顺便发送第二次输入。
- 发送后不可让 Renderer 自选任意 Host 路径；临时文件仅属受控本轮 owner，处理跟随生命周期且不能删用户文件。图片字节不进入公开运行摘要、结构化 handoff 或诊断秘密；持久草稿/已接纳附件的实际存储与清理边界须由 B 明确。
- 旧 text-only 草稿、旧 send 命令、旧持久运行与恢复路径均可用；能力字段缺失诚实为未知，不阻断既有纯文字功能。

## C：精确快照图片契约

- 只做明确白名单的静态栅格并排，沿用已有图片显示；格式由 C spec 写明且至少覆盖 PNG/JPEG。不把任意 `image/*`、SVG/活动内容、视频或未核验动态格式当成静态支持；矩形/区域批注以后再做。
- 每次请求绑定已有 `runId`/`stepId`/Host 返回的相对 `path`、side 和完整 `beforeHash`/`afterHash`/`sourceHash`。Host 根据隔离收据与安全目录解析定位 baseline/working，不能拿两个实时源项目路径冒充旧新。
- 现有 binary change 没有 `version`；先由同一 workspace owner 增量投影三份 hash，再读取精确内容。before 来自发布过的 baseline，after 来自对应 working；source 仅作并发/冲突核验，不能替代 before。
- 预览与读取之间任一字节/hash变化必须明确拒绝；重读获取新版本。读取前后都按安全文件/版本约束验证，路径穿越、链接、ADS/危险别名、秘密路径、跨 run/step/project 不得放宽。
- 单侧 added/deleted 的 null hash/内容是预期缺侧；期待存在却缺失是失败，两者 UI 区分。保留过大、缺失、格式不支持、解码失败、版本过期的明确状态，不显示伪造空白旧图或悄悄截断为可用图片。
- `readBinaryPreview` 默认及上限 25 MiB 保持；复用传输仍先由 Host 定位快照并复验版本，不放开任意路径。`readMediaPreview` 的 4/8 MiB 不作为本入口事实。
- UI 弹窗请求代次/完整目标与版本绑定；关闭、切换文件/运行、迟到读取/图片 decode、重复打开、失败重试均不能覆盖新目标。图片错误不能阻断既有文本 diff/逐文件应用。
- 旧 baseline metadata v1 和旧 `StudioWorkspaceChange` 无新字段时保留既有二进制说明；可以重新从真实完整 baseline 投影版本，不重建/伪造历史，也不迁移或自动应用源文件。

## 独立验收与交付 gate

首个独立门禁 `packages/services/test/studio-adapter-image-integration.test.ts` 在 v0.10.0 基线实际执行：2/2 pass、0 fail/skip、exit 0。它经原生合成 stdio 与真实 registry/adapter 验证 unowned thread 不能输出、提前结束或打开审批，以及原 read-only owner 继续拒绝执行权限而不显示审批。该结果是保留边界的基线证据，不是三项新功能已完成。初始 fmt/provenance/lint/typecheck/verify:pre-push/fmt:check 均 exit 0；lint 只有原有一条 warning。

第二个独立基线 `packages/services/test/studio-image-legacy-schema.integration.test.ts` 实际执行 1/1 pass、0 fail/skip、exit 0。fixture 直接使用 main `34078257` 的 schema 2 DDL，种入旧 conversation/run/message/command、旧游标与未知字段；重开 owner 后逐字节复核原记录与旧表/索引，未使用新构造器建空库来冒充迁移。新图片写入、受理回执与重开恢复仍须在 B 冻结实现后扩展验证，此基线不能代替这些新行为验收。

第三个独立基线 `packages/services/test/studio-image-rpc.integration.test.ts` 经真实二进制 RPC 与两个独立旧 SQLite Host 核对原 timeline 一/二/三参数、undefined 空位、focus run owner 和连接关闭后的另一 Host 隔离。初始 RPC 用例 1/1 pass、0 fail/skip、exit 0。复核旧 fixture 后将 command 调整为既有 canonical payload/result 真实回执形状，并补原请求重放/不同载荷同 CID 拒绝；修正后的结果单独回报。新增第四 imageId/第五 admissionCommandId 仍待 B 冻结后在同一 RPC 链路扩展，不能用直接 mock 方法调用冒充传输与归属验证。

初始完整 `test:studio` 已完成：835 文件、8428 总数、8420 pass、0 fail/cancel、8 skip、exit 0。跳过项如实保留，为既有平台/环境条件，不是本轮新增图片验收；CLI 构建 17/17、主图标与 35 个生成资产核验也 exit 0。同一合法 thread 的旧 native turnId 四个 delta/tool/terminal/approval 用例由集成独立 stdio 在旧行为实际复现为 0/4、exit 1，仍等待 A 最小修正后复验，不在初始全量通过中隐去该失败。

以下是三项功能的计划验收，尚未执行，不能提前记为覆盖或通过。

1. A 的具体旧基线反例：合成协议实际失败、新实现通过；跨 thread/session/turn 的迟到/重复/取消与原审批请求仍归正确 owner。
2. B 的 image-only、text+image、纯文字旧命令； PNG/JPEG 字节/格式/预算边界、未知/不支持能力零派发、图片失败保留草稿；单次提交原 kernel/session/工作区/授权不变。
3. B 的真实浏览器粘贴/拖放、移除、取消、重复点击/Enter、切换目标、失败后恢复；迟到读取与旧 ACK 不清除新正文/附件。合成数据，不用付费 provider。
4. C 的真实 baseline/working 两侧各异、源项目后来变化、added/deleted、过大/缺失/损坏/不支持；返回内容 hash 与声明一致，读取间修改失败，任意路径/错 run/step 拒绝。
5. C 的真实浏览器并排显示、关闭/取消、切换目标、迟到 decode/响应、重复打开、失败恢复；旧文本 DiffViewer、review draft、apply、attention/read 与 native unread 继续可用。
6. 跨路线组合：含图片的一次 native chat turn 经保真事件/取消/审批完成，原 session writeback 仍归同一持久运行；另在既有隔离 group/workflow run 验证图片差异审阅与该运行/步骤收据一致。现有 chat 使用源 cwd，不为组合用例擅自引入 chat 隔离。重开旧/新合成数据不隐式重发、不自动批准、不损失旧字段。
7. 最后冻结的集成 exact head 执行 fmt、来源再生/check、lint、typecheck、全量及 changed architecture、CLI build、重点及完整 `test:studio`；图标/冻结来源按实际要求检查。先 fmt 后来源指纹再生。
8. 运行适用桌面构建并绑定 exact commit。验收阶段优先使用已有非发布构建入口；构建成功不等于实际安装、人工 GUI 或全历史迁移验收。
9. 选择项目策略一致、尚未占用的下一稳定 semver，更新真实用户变更/升级说明，冻结最后 head 并取得该 exact head 的 Windows/Linux CI。freshness 与 expected SHA guard 检查通过后仅由本路线合入 main；核对 merge tree 与验收候选一致，并在实际合并 SHA 上执行既有完整 Windows/Linux 发布矩阵。
10. 发布矩阵的 resolve、两平台 quality、四变体 fresh packaging/实际包验收、aggregate validation、publish 全部监控到终态；失败先诊断、仅 bounded retry，不在结果未知时重复发布。匿名核验公开 tag/commit/latest/draft=false/prerelease=false、全部资产名字/数量/大小/hash/checksum/metadata与源链接/归档；Windows未签名如实报告，旧稳定版不覆盖。

每项回报 executed/failed/skipped/not-run、真实 exit、exact head、日志或 PR/CI 链接。瞬时失败先诊断，仅 bounded retry，不删除真实断言或改变不相关语义。工作区 freshness 在吸收功能提交和最后冻结时复核；验收前 main 只读，验收后只发布完整统一版本，保留已有稳定 tag/release。
