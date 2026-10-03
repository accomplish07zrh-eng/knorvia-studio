# 原项目继承实现的精确后续范围

2026-10-03 后续接收状态：下表绑定旧基线的历史判断保留；UI4/native4/CLI3 及
services 三批已交付并合流为候选，确切 heads、保留表达与集中验收边界见
[四路最终接收记录](unified-source-intake.md)。这项接收不把旧来源记录或尚未运行的
统一验证改为通过，也不为短通用表达新增重写任务。

当前目标是 Apache-2.0 下继续独立替换原项目实现，保留普通第三方依赖及真实通知。下面是一份**有界、非穷尽**的后续文件表，绑定 main `59517d9699519b0a7a44980da27df29d45f0e91e`。先从既有来源清单筛选，然后仅实际读取下面 14 个完整本地文件及固定上游 `872ad960de7ec172591f7e1952f7849229f94521` 的对应完整原件；HTTP 均 200，Git blob 与既有基线一致，当前文件与确切上游逐字节相同。没有重新扫描全仓代码/权利，没有执行运行时或产品测试。

[机器可读摘要、blob、URL 和函数区段](bounded-inherited-source-facts.json) 支持原样继承这一事实。列表没有混入已变更的新独立候选，也不把一般 API、固定词汇、来源曝光或语法相同自动判为侵权或许可证要求重写。后续需先取行为合同、确认生产消费者并采用实质不同且兼容的实现；固定接口、用户数据 schema、UI 视觉值及常规第三方保持原边界。

以下 11 个文件存在完整继承的功能实现主体。这里的最小单元是从实际执行路径划定的规划边界，尚未实施；UI/native 完成当前 GUI/打包阶段后由父任务安排，CLI/services 保持现有独占顺序。所有行共同依据是上述完整文件与固定原件逐字节相同，具体 SHA/blob/URL 见机器记录，不能仅以接口或函数数量代替该依据。

| 原任务归属          | 完整文件路径                                                          | 最小替换单元及保留边界                                                                                                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI                  | `packages/ui/src/lib/assistantDirectiveParser.ts`                     | 引号/转义/闭合扫描与参数解析（`findDirectiveClosingBrace`、`parseQuotedValue`、`parseDirectiveParameters`、`extractAssistantDirectives`），以及 `findMarkdownCodeRanges` / 两个流式尾部判定。保留 directive 名、错误/转义结果、代码范围与流式显示契约；不为常规 regex escape 重写。 |
| UI                  | `packages/ui/src/lib/toolDiffPreview.ts`                              | `extractStructuredDiff` 输入适配及 `buildUnifiedDiff` 的 hunk 生成调度，包含实际 LCS / 唯一行锚点大区间 fallback 组合。保留全部输入字段、上下文行、创建/删除语义与 `@pierre/diffs` 依赖；标准算法名称、diff 格式及小型值判定不作为必须改写理由。                                    |
| UI                  | `packages/ui/src/v4/timelineScrollAnchor.ts`                          | `reconcileFollowingForContentAnchor` / `resolveFollowingAfterScroll` 的用户滚动权协调及两类 prepend 补偿。保留 following、程序化/布局事件边界、阅读锚点和历史加载行为；标准距离公式、按键名、阈值与短布尔辅助不单独追求差异。                                                       |
| UI                  | `packages/ui/src/settings/automationFormat.ts`                        | `buildCronExpr` / `parseCronToBuilder` / `describeCronBuilder` / `describeCron` 的 builder 双向转换和描述分派。保留 cron 数据、支持/回退模式、中英文消息及日期呈现；标准 Date API、pad2 和公共类型不列为必须重写。                                                                  |
| native              | `packages/desktop/src/main/chromeProfileDiscovery.ts`                 | `discoverChromeProfile`、Windows policy 读取/展开、Local State/Profile 枚举和可导入筛选/选择策略。保留候选优先级、last_used/Default/ambiguity、Cookie/LocalStorage 规则及隔离；普通 access/Promise 包装不单独重写。                                                                 |
| native              | `packages/desktop/src/main/chromeExecutableDiscovery.ts`              | `resolveChromeExecutablePath` 的进程/注册/标准/PATH 候选选择，以及 macOS 注册与 Linux desktop entry 收集。保留平台命令、执行权限、候选顺序与失败继续边界；node:path/execFile API 与系统词汇照常使用。                                                                               |
| native              | `packages/desktop/src/main/chromeInstallationCandidates.ts`           | `buildStandardChromeInstallations` 及 `parseRunningChromeInstallations` 的产品候选构造/运行进程资料匹配。保留 Chrome 产品名、系统目录、Snap/Flatpak、user-data-dir/password-store 和主进程过滤；不改常量制造独立性指标。                                                            |
| native              | `packages/desktop/src/main/crashDumpAnnotations.ts`                   | `readAnnotationAt` / `extractCrashDumpAnnotations` 的安全字节扫描及 `resolveOomKind` / `summarizeCrashDumpAnnotations` 的 OOM 摘要决策。保留 Crashpad 格式、V8 键、大小界限、首值与坏输入结果；标准对齐/数字/布尔转换不单独重写。                                                   |
| CLI（待父任务排序） | `apps/cli/packages/bootstrap/src/protocol/session-resident-pool.ts`   | `acquireOperation` 的 lease/release、`rebalance` / `readCandidates` 的 TTL/LRU/fresh-facts admission，以及 `executeDeactivation` 的回收生命周期。保留宿主接口、全进程/逐 session lease、安全事实和同步摘除顺序；普通 Map 操作/公共字段不作为替换理由。                              |
| CLI（待父任务排序） | `apps/cli/packages/bootstrap/src/app/script-workflow-child-source.ts` | `SCRIPT_WORKFLOW_CHILD_SOURCE` 内的 response/pending/callParent IPC owner、AsyncLocalStorage callPath 分配、agent/parallel/pipeline 效果编排及 complete 收尾。这里是实际嵌入的程序，TS 函数清单为空不代表纯类型。保留协议、上下文路径、预算及确定性限制。                           |
| CLI（待父任务排序） | `apps/cli/packages/cli/src/custom-command-expand.ts`                  | `splitCliCustomCommandArguments` 的引号/转义 tokenizer 与 `expandCliCustomCommandPrompt` 的占位符/参数及 prompt 组装。保留 `$ARGUMENTS` / `$N`、尾反斜杠、动态 shell 拒绝和 Skill 指令；固定文本/接口保持。                                                                         |

以下 3 个文件也确认来自同一固定原件，但本次完整阅读没有据此新增必须替换的实质单元：

| 完整文件路径                                          | 性质与处置                                                                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/services/src/plugin-sync/pluginSyncPath.ts` | 两个短路径安全函数是常见归一、dot-segment/absolute 拒绝及 root containment 组合。保留安全语义；目前只证明来源相同，尚不足以要求为了相似度而另造复杂实现。 |
| `packages/services/src/agent/automationToolPolicy.ts` | 固定工具 denylist 与常规 Set 合并；普通功能策略，不列为必须重写表达。                                                                                     |
| `packages/shared/src/localTtft.ts`                    | 主体为公共 schema/兼容字段、标准时钟 API 与 offset/round-trip 计算。保留接口、数据及通常唯一表达；如以后发现特有实现模板再限缩安排。                      |

以上区分是可交给原任务继续规划的保留实现范围，不是已完成替换清单，也不是授权新的云任务。源码等同关系与是否具有需要另行组织的表达分开处理，简单功能策略优先核对性质。其他只含类型、公共 schema 或数据兼容迁移 DDL 的清单项没有批量纳入。

## 已有候选与当前独占工作

CLI 来源报告 `801179367c13fce707049aeb8ae5f92fe7cc9328` 已实际读取，覆盖当前 `apps/cli/packages/core/src/runtime-task/registry.ts`、新订阅 helper、确切上游/Apache 原件及保留区段。新订阅 owner 继续保留；不以旧缺 receipt 为由把整个 Registry 重写。父任务已把 queueMessage / drainMessages 两段最小独立实现交给原 CLI 任务，方案 head 为 `e4ce9918252bc5d90f9e88722312d5f469d5de5e`；本整合任务不编辑其生产源码，其余普通 Map/API 表达不列作重写理由。

services 的 [精确残留报告](../../docs/evidence/services-five-owner-provenance-20261003/residual-implementation-scope.md) 已按 `33bbc7b2593d142725a91fb90efe107418706db1` 接收。父任务把以下三个最小批次交给原 services 任务独占，本整合任务不编辑对应生产源码：

1. `session/tasksDatabase/startup.ts` 的 `StorageLockWindow.acquire` 锁等待，以及 `git/commitMessageFileScope.ts` 的 `scopeSpelling`；保留新的 trie、失败 owner 与 SQLite/migration 顺序。
2. `agent-session/sessionService.ts` 的条件 draft 关闭，以及 `sessionPreparation.ts` 的诊断 helper；保留新 draft registry、retry/repair/index 边界。
3. `agent/task-index-ingestion/sessionIndexProjection.ts` 的 `readback` / `complete` / `titleChanged` / `unread`，以及 `snapshotProjection.ts` 的 `model`；保留新 topic/cursor/recovery owner。

当前独占源文件的完整路径是：`packages/services/src/session/tasksDatabase/startup.ts`、`packages/services/src/git/commitMessageFileScope.ts`、`packages/services/src/agent-session/sessionService.ts`、`packages/services/src/agent-session/sessionPreparation.ts`、`packages/services/src/agent/task-index-ingestion/sessionIndexProjection.ts`、`packages/services/src/agent/task-index-ingestion/snapshotProjection.ts`。原任务证据对完整私有执行路径给出具体区段/规范化 body 对应；不只依据入口名字或数据接口。`packages/services/src/creation/creationReference.ts` 未证实存在原项目实现残留，不因此次核验安排重写。已接收的其他候选也不因为旧 `upstream-modified` / `NOASSERTION` 标签自动重写；不能用新文件名、入口缩短或元数据数量代替完整实际执行路径判断。
