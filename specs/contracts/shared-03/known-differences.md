# shared-03 已知差异（v1）

替代路径：`specs/contracts/shared-03/README.md`。本文件是**替换阶段的红线清单**——
列出「新旧实现即使正确也必然不同」的差异面，以及「必须逐字保持」的取值面。

## 1. 预登记差异（允许的实现层差异）

| 面            | 旧实现                          | 新实现（要求）                           | 金样/断言口径                           |
| ------------- | ------------------------------- | ---------------------------------------- | --------------------------------------- |
| 文件布局      | 34 个文件单模块组织             | 允许内部重组（拆合模块、重命名私有助手） | 模块路径与导出名不变（interface.md §3） |
| 注释与命名    | 旧注释/局部命名                 | 全部自写、与旧不同                       | 相似度两门 < 阈值（替换阶段）           |
| 私有实现      | 旧内部结构                      | 自由重写                                 | 只有公开导出面 + 金样受约束             |
| 摘要/哈希实现 | `node:crypto` createHash sha256 | 同算法同载荷（**载荷结构冻结**）         | bundleDigest/declDigest 逐字节（金样②） |
| 解析器构造    | 逐文件独立 zod 构造             | 允许共享 schema/helper                   | 解析结论逐字段一致（金样 + 47 断言）    |

## 2. 必须逐字保持（红线清单，测试即守门）

1. **workspace-hook**：7 事件名单与序、digest schema v1、trust schema v1、默认限额 60000/32768、
   摘要载荷元组结构（`workspace-hook-declaration`/`workspace-hook-bundle` 前缀与 1 版本位）、
   `reviewItemId` 格式、4 个 MutationError code、6 个 review verdict 值、
   违例文案（`workspaceKey must match workspaceIdentity fallback rule` 等三句，见金样③）。
2. **background-task**：状态六值、kind 别名表（namedKinds/backgroundKinds 各 token）、
   jobId 合成格式 `background-task:<pid|no-pid>:<start|no-start>:<command>`、
   `BACKGROUND_BASH_OUTPUT_MAX_BYTES = 8192`、展示 schema 150000/32768、可见阈值 30000、
   通知标签名（tool-use-id/output-file/…）与实体反转序。
3. **conversation/assistant**：投影策略判定序与两张名单（17 项合成源、6 项触发源）及顺序、
   legacy 文本哨兵（`<task-notification>`/`<subagent-notification>`/rewind 两句）、
   预览限额 15/10、扩展名→kind→mime→artifactType 定义表（含 MEDIA_PREVIEW_FORMATS 派生 11 项）、
   分享 schema v1、accessMode 三值、错误码 17 值、`knorvia-artifact://share/` ref 正则、
   sha256 正则、locale 前缀表（zh-CN→/cn、en-US→空）、出站 strict/入站宽容纪律。
4. **workspaceFile**：打包行格式 `<type>\t<escaped>` 与转义三则（`\`→`\\`、`\t`→`\\t`、`\n`→`\\n`）、
   分隔符随根形态、type 归一两值、`WORKSPACE_FILE_ENTRIES_CHUNK_SIZE = 4000000`、
   `WORKSPACE_FILE_SEARCH_DISPLAY_CAP = 1000`、打分三段阈值（前缀 <100、子串 100+、模糊 200+）、
   空 query 默认列表「文件优先、目录在后」、启动索引回绕规则。
5. **tool/execution**：`KNORVIA_KNOWN_TOOL_NAMES` 31 项与序（含 `submit_result` 下划线、
   `mcp__node_repl__*` 前缀）、family 14 值映射、i18n 状态键 5 个、变更行计数（尾 LF 不计）、
   运行时工具表（env 名三值、资源目录三值、`.exe` 后缀规则、远端版本表四行），
   流式预览常量 1/750/8192/1000、`partialStringFields` 24 字段名与序。
6. **process/subagent**：诊断前缀 `[knorvia-process-exception] `、四上限 128/4000/16000/131072、
   lifecycle 标记、进程名段清洗规则（24 截断、`knorvia-` 前缀）、
   遥测 roles 10/lanes 3/事件名 3/禁词正则/白名单键名（snake_case）、
   subagent builtin 名单（Explore、general-purpose）与导入权威规则。
7. **task-realtime-core**：reason 14 项与序、deliveryPurpose 2 项、hostDeliveryKind 2 项、
   workspaceKey 回退规则、runId===traceId、batchSeq/seq 双轴、remoteSessionId⇒workspaceIdentity、
   lease 双态与 `owned_by_other_host`、attachment 5-kind（file 必带 sizeBytes）、
   owner-command 7 type 与 3 错误码、clientMode 字面 `web-remote-replayable`、
   `^[a-f0-9]{64}$` 摘要正则。

## 3. 平台边界

- 路径类（B23/B24/B27/B38）：Windows（`\`、`X:\`、UNC）与 POSIX 双语义已入金样与断言；
- `.exe` 后缀仅 win32（B32）；`localeCompare` 排序受运行环境 locale（B28，断言用行为口径）；
- 原子写（B11）：Windows rename 覆盖目标可能 EPERM，错误原样抛（测试不钉 errno）。

## 4. 不在此列

协议常量/字段/数据格式：**一字不改**（本包 schema 全部是 wire 契约，strict 面未知字段即拒）；
金样文件内容（fixtures/\*.json）：替换阶段只读不改。
