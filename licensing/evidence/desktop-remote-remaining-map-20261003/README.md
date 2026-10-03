# Desktop / remote 剩余实现地图 — batch51

基线 `a99b8e784cd2526b8a232b67a59765d99f8b7c19`，继续原 draft PR9。按父任务要求停止近似表达候选的安装推进；本批只有这份地图、`map.tsv` 和 `summary.json`，没有作者、新稿、产品源修改、旧测试或 build/native。已有提交保留，独立信用0、MIT未声明、未整合 main。

范围精确到当前分支253个 desktop TS/TSX产品源和38个 server/remote TS源。每行记录路径、行数、当前本地SHA、分类、lane限制、活动PR重合和可见技术receipt。资产/HTML、生成JS、声明文件、测试、配置及其他分支未整合函数体不在这张源地图中；它不是全项目许可清单。只读现有源字节做hash/行数统计，以及指令、功能spec、receipt与文件名metadata；本批不审读/显示旧函数体、不向作者转发任何源。既往 curator 来源暴露仍成立。

## 四类与可信限度

| 类别      | 当前源文件数 | 含义                                                                                                                                              |
| --------- | -----------: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| UNCOVERED |          197 | 本地未有PR9候选覆盖，含root/B/A范围和小型未核定实现；**不是197个新授权大块，也不证明其他lane/私有源未完成**。大块详见下表，小文件未强归为纯胶水。 |
| GLUE      |           12 | 此前限定查明的协议、声明、配置或薄转发面。个别含普通小helper，不能给独立信用，也不宣称整文件无可执行逻辑。                                        |
| CANDIDATE |           64 | 已有技术候选，待表达/来源审查；desktop33个，remote31个。desktop另有1个候选RecoveryStore计入HOLD。                                                 |
| HOLD      |           18 | 4个明确私有accepted HOLD；10个父任务accepted相邻保留面；4个dormant/明确排除/模糊分配HOLD。后两组不是新断言的“私有accepted”。                      |

当前38个remote源的旧receipt所记SHA全部仍匹配；31个技术候选、3个既有声明/配置胶水、4个root cache/CDN/network/progress边界。无需重新测试或重写。既有34个desktop候选（含dormant RecoveryStore）都有当前SHA可见于限定source/installed-binding receipt；这只是候选/字节关联，不是独立表达接受。metadata小型查找不把保留hash大清单当独立作者证明。

活动PR8/10/11/12本次只取文件名，分别1711/451/2183/555条，无patch/body。root PR12的12个源文件名在本分支尚不存在：Host process拆分2、remote session拆分6、window guest1、cache拆分3；只记录文件名，未取源、整合或判完成。root范围比文件名重合更广，Main即使未出现在PR12中也不自动归本路。Renderer/B、scheduler/A、provider/config/service/registry/D继续排除；D的产品源不属于此地图目录。

## 未覆盖的大块业务/平台状态

以下规模用于定位业务边界，**规模本身不是实质性、授权或来源结论**。root/B及accepted/private范围不作为本路新稿入口。

| 完整业务块                            | 当前本地文件与行数                                                                                                                                                      | 当前限制                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 应用启动、窗口、Host进程编排          | main/index1642；desktopHostProcess714；desktopWindowChrome536；desktopRuntimeEnv496；desktopWindowLifecycle423；desktopMainIpcPlatform418                               | root Main/PR12范围，候选尚未在本分支整合；不因本地旧字节而重做              |
| Desktop远程会话编排                   | desktopRemoteSessions808；desktopMainIpcRemote359                                                                                                                       | root PR12，6个session拆分源尚未在本分支；与Host连接registry不是同一个owner  |
| 远程资源缓存/获取与上传进度           | remoteAssetCache1930；remoteAssetCdn195；remoteAssetNetwork11；sshUploadProgress119                                                                                     | root PR12，3个cache拆分源未整合；network薄面也不能包装为新大块              |
| Main诊断、日志导出、资源生命周期      | exportLogs1271；desktopStabilityTelemetry978；resourceManagerWindow502；desktopResourceTelemetry491；desktopCrashCapture456；desktopDataSizeTelemetry431                | root Main范围；当前地图没有据缺receipt作全项目“未实现”判断                  |
| 原生浏览器数据、权限/密钥、编辑器启动 | chromeLocalStorageManager711；editors661；cuaAccessibilitySettings654；desktopCuaPermissionIpc529；windowsChromeAppBoundKey482；chromeCookieManager480；openInEditor411 | root/原生平台范围，明确不改security/permissions，不读取真实浏览器数据或凭据 |
| 实时/Host控制/数据库/附件业务状态     | taskRealtimeBus1081；windowHostControllerService803；projection556；sessionObserver362；mediaProxy379；taskRealtimeBridge262                                            | 父任务accepted相邻/private HOLD；保留而非新稿                               |
| Guest整体编排与dormant恢复            | browserGuestManager4645；browserTabRecoveryStore270                                                                                                                     | 明确排除；RecoveryStore保持dormant，不能以激活增加完成数                    |

其余本路未覆盖Host面共19个，18–114行，完整路径/大小在summary中：telemetry/log/初始化/异常与消息guard/关闭阶段/task tracker/模型选择/Worker入口。这里没有经过核定的新大型业务owner；不将这些小面拼接、拆helper或改同义变量凑“大块”。Studio schedule/outcome两个已有功能来源/分配仍模糊，计入HOLD，不当作新继承目标。

## 已有候选待表达审查

- Host装配index1888，以及registry700、browserControlMainBridge406、remotePromptAttachments297、remoteWorkspaceServiceCollection209、proxy129、recording materializer65、Cron138、disk180、storage preparation260：既有完整技术候选，不能再计新完成。
- Browser Playwright/command/screenshot/recording/residency/clipboard链及preload：候选原稿、失败与source-exposure已在旧packet；不重测/重写旧browser/server。Recovery候选单独HOLD。
- Remote连接、SSH/WSL/Docker backend、transport、deploy/installer/identity/lock等31个：当前源精确命中旧候选SHA。原schema/argv/协议/固定catalog胶水不因整稿作者而变成独立表达。
- Cron批49及disk/preparation批50的近似对应保持零信用。这个地图不重跑normalizer、不制造新的测试或“通过”替代表达审查。

## 唯一推荐下一块：Host远程连接registry的完整表达审查

`packages/desktop/src/host/windowRemoteConnectionRegistry.ts`，700行，当前SHA `08736fcc524e2eca3ea1be79446214d52308b6ce1065b0c7c102bb3b6f77e2d5`。本路旧完整候选，关联 `desktop-host-resource-owners-20261003/final-source-bindings.json`；不是未覆盖的新owner。优先它是因为其业务边界完整：窗口内共享SSH/WSL、专用Docker transport，逻辑session与workspace identity、WSL释放代际、取消/任务延期/空闲/销毁，直接关系用户会话复用和数据归属；与root Main session编排和D resolver/provider边界可分。

现有batch38表达receipt报告53个body匹配对、5个不同规范化body、241个表达对应；仍零独立信用。因此下一动作应先做**一整个owner的产品状态/输入/输出规则与表达来源审查**，而非继续安装。功能依据是AGENTS进程/identity规则和 `specs/knorvia-desktop-host-resource-owners-20261003.md`，后者是源暴露curator整理的行为说明，不能冒称独立来源设计证明。

如果后续确实能提出由产品状态与端口驱动、完整保兼容的独立设计，可先冻结一份未安装整稿并比较；没有实质不同表达或来源仍无法建立时，只保留未安装稿。同义变量、重排语句、拆helper、通过旧fake检查均不能增加完成数。这一批不重开registry函数体、不产新稿、不作独立设计已经完成的声明。

## 所有HOLD与剩余阻塞

私有明确HOLD：broadcastHub、databaseStartupRelay、taskRealtimeBus，以及Host175行promptAttachmentTransferService。Prompt父任务accepted checkpoint `a3d4b1f6812cb3651514840a1c9b608008b2ebf4` / SHA `a777a064c6cbfe84c4ff45b2b191ab18f00a7134d5b207f2e2cde2b14b5e72d6`；当前本地 `3d7dc93679dde534d818a38510e07829e31f21bf4f9156e6ffc05f4a413d2fd7`不是accepted equality证据。私有receipt/bytes不可用，禁止以公开旧源覆盖、恢复或绕路。

数据库startup、window附件/controller/projection/session observer、media proxy/helpers、realtime bridge、network aggregator等父任务accepted保留，具体本地hash和不应混同私有accepted的原因见summary。broadcast/network当前本地SHA亦不等于父任务所报accepted SHA，不能将本地旧字节称为accepted恢复；完整差异见summary。地图之外3个shared预览/持久merge/workflow reducer保护hash也确认未变。Guest、dormant Recovery及模糊Studio schedule/outcome排除保持。

当前阻塞是独立表达/来源接受、私有accepted字节不可用，以及root/B/D所有权和尚未整合的候选，而不是缺更多近似稿或更多测试。本批没有合格的新授权大型owner，不强做一版。Library403无替代访问、取消上传无重试、无主分支合并、依赖/许可/全局inventory/policy变化。Sol/high/Fast仍只沿用父任务已确认的主lane UI；无新作者实际模型/Fast claim。
