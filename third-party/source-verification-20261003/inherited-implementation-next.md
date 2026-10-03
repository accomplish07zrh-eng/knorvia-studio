# 原项目继承实现的精确后续范围

当前目标是 Apache-2.0 下继续独立替换原项目实现，保留普通第三方依赖及真实通知。下面是一份**有界、非穷尽**的后续文件表，绑定 main `59517d9699519b0a7a44980da27df29d45f0e91e`。先从既有来源清单筛选，然后仅实际读取下面 14 个完整本地文件及固定上游 `872ad960de7ec172591f7e1952f7849229f94521` 的对应完整原件；HTTP 均 200，Git blob 与既有基线一致，当前文件与确切上游逐字节相同。没有重新扫描全仓代码/权利，没有执行运行时或产品测试。

[机器可读摘要、blob、URL 和函数区段](bounded-inherited-source-facts.json) 支持原样继承这一事实。列表没有混入已变更的新独立候选，也不把一般 API、固定词汇、来源曝光或语法相同自动判为侵权或许可证要求重写。后续需先取行为合同、确认生产消费者并采用实质不同且兼容的实现；固定接口、用户数据 schema、UI 视觉值及常规第三方保持原边界。

| 原任务归属                         | 精确文件                                                              | 实现边界与保留要求                                                      |
| ---------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| UI                                 | `packages/ui/src/lib/assistantDirectiveParser.ts`                     | 指令及引号/括号解析；保留错误、转义和显示边界                           |
| UI                                 | `packages/ui/src/lib/toolDiffPreview.ts`                              | 多种工具结果到 diff 预览的解析；保留全部输入格式和呈现                  |
| UI                                 | `packages/ui/src/v4/timelineScrollAnchor.ts`                          | 跟随滚动与锚点决策；保留滚动状态及交互                                  |
| UI                                 | `packages/ui/src/settings/automationFormat.ts`                        | 自动化状态、cron 与日期格式；保留语义及中英文呈现                       |
| native                             | `packages/desktop/src/main/chromeProfileDiscovery.ts`                 | 多平台浏览器资料路径发现；保持身份隔离和发现顺序                        |
| native                             | `packages/desktop/src/main/chromeExecutableDiscovery.ts`              | 可执行程序及进程线索发现；保留平台及错误边界                            |
| native                             | `packages/desktop/src/main/chromeInstallationCandidates.ts`           | 浏览器安装候选构造；固定产品名/目录词汇可保留，不用改常量伪装独立实现   |
| native                             | `packages/desktop/src/main/crashDumpAnnotations.ts`                   | minidump 注释提取；保留二进制解析和坏输入边界                           |
| services                           | `packages/services/src/plugin-sync/pluginSyncPath.ts`                 | 插件同步相对路径归一与 root containment；保持安全拒绝条件及平台语义     |
| services（功能策略复核，低优先级） | `packages/services/src/agent/automationToolPolicy.ts`                 | 两组任务工具 denylist；固定工具名及常见 Set 合并不单独列作必须重写表达  |
| CLI（父任务决定后续顺序）          | `apps/cli/packages/bootstrap/src/protocol/session-resident-pool.ts`   | resident/session 生命周期、租约和回收；保留状态与顺序                   |
| CLI（父任务决定后续顺序）          | `apps/cli/packages/bootstrap/src/app/script-workflow-child-source.ts` | 嵌入子进程脚本文本，非纯类型；保留 IPC/运行时契约                       |
| CLI（父任务决定后续顺序）          | `apps/cli/packages/cli/src/custom-command-expand.ts`                  | 自定义命令展开、参数与动态 shell 检测                                   |
| 整合者/shared 协调                 | `packages/shared/src/localTtft.ts`                                    | 本地时钟/TTFT 校准；标准时钟 API 与固定数据字段不因来源相同自动要求改写 |

以上表是可交给原任务继续规划的保留实现范围，不是已完成替换清单，也不是授权新的云任务。源码等同关系与是否具有需要另行组织的表达分开处理，简单功能策略优先核对性质。其他只含类型、公共 schema 或数据兼容迁移 DDL 的清单项没有批量纳入。

## 已有候选与当前独占工作

CLI 来源报告 `801179367c13fce707049aeb8ae5f92fe7cc9328` 已实际读取，覆盖当前 `apps/cli/packages/core/src/runtime-task/registry.ts`、新订阅 helper、确切上游/Apache 原件及保留区段。新订阅 owner 继续保留；不以旧缺 receipt 为由把整个 Registry 重写。父任务已把 queueMessage / drainMessages 两段最小独立实现交给原 CLI 任务，方案 head 为 `e4ce9918252bc5d90f9e88722312d5f469d5de5e`；本整合任务不编辑其生产源码，其余普通 Map/API 表达不列作重写理由。

services 的 [精确残留报告](../../docs/evidence/services-five-owner-provenance-20261003/residual-implementation-scope.md) 已按 `33bbc7b2593d142725a91fb90efe107418706db1` 接收。父任务把以下三个最小批次交给原 services 任务独占，本整合任务不编辑对应生产源码：

1. `session/tasksDatabase/startup.ts` 的 `StorageLockWindow.acquire` 锁等待，以及 `git/commitMessageFileScope.ts` 的 `scopeSpelling`；保留新的 trie、失败 owner 与 SQLite/migration 顺序。
2. `agent-session/sessionService.ts` 的条件 draft 关闭，以及 `sessionPreparation.ts` 的诊断 helper；保留新 draft registry、retry/repair/index 边界。
3. `agent/task-index-ingestion/sessionIndexProjection.ts` 的 `readback` / `complete` / `titleChanged` / `unread`，以及 `snapshotProjection.ts` 的 `model`；保留新 topic/cursor/recovery owner。

以上路径相对 `packages/services/src/`，具体完整文件和区段摘要见原任务证据。`creation/creationReference.ts` 未证实存在原项目实现残留，不因此次核验安排重写。已接收的其他候选也不因为旧 `upstream-modified` / `NOASSERTION` 标签自动重写；不能用新文件名、入口缩短或元数据数量代替完整实际执行路径判断。
