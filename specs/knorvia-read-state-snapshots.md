# 文件已读快照与恢复边界

2026-09-30。继续独立实现迁移，先固定文件已读水位和持久化快照的可观察契约。此边界不修改文件内容、界面、工作区身份或已有数据格式；不把技术替换自动认定为 MIT 来源闭环。

## 状态与依赖

Runtime 持有的 `ReadFileStateMap` 是当前会话唯一已读状态。Read/Write/Edit 的成功路径更新该 Map；本边界只提供键、查询、快照编码和解码，不增加缓存、磁盘访问或第二份可写状态。

```text
成功工具结果 → Runtime 已读 Map → 结构化 v1 metadata → 历史恢复
                  ↑                                    │
                  └──────── 活跃分支内的合法快照 ───────┘
```

保留现有公开函数、类型及调用路径。路径等价继续委托既有 path-normalization，不扩大大小写折叠，不自行解析远程身份。历史分支、compact、rewind 和 range 恢复策略仍归原有恢复器所有；本轮不替换该恢复器。

## 兼容契约

- key 为平台规范路径、offset（未提供为 1）、limit（未提供为空串）的 NUL 分隔组合；零 offset 和零 limit 不等同于未提供
- 同一路径查询按 readAt 选择最新条目，相同时间以 Map 后出现的条目为准，返回原条目引用；partial、Read/Write/Edit 均参与，不优先旧 full Read；未提供 Map 或没有匹配返回 undefined
- mtime 向下取整，undefined 保持 undefined；不更改已存在的数字运算语义
- v1 metadata 必须有工具名 Read/Write/Edit、非空 path/revisionId、字符串 content、boolean isPartialView、有限数 readAtMs/mtimeMs/sizeBytes；空 content 合法，数值不新增正整数约束
- 解码只接受非数组对象中的 readFileState 对象；未知属性不复制。可选 offset/limit 仅在有限数时保留，其他值作为未提供处理。输入对象与嵌套对象不得修改
- 从 entry 编码要求 mtimeMs、sizeBytes 存在且 revisionId 非空；完成时间来自 completedAt 而不是旧 entry.readAt。保留现有编码与解码的不同信任边界，不默默修改旧数据接受规则
- 从工具结果编码只接受 Read 和既有 ReadOutputSchema 认可的 text/file_unchanged 结果；按结果路径及输入窗口精确查 Map，不从 provider-visible 文本重建快照，不使用最新条目代替窗口匹配
- 不读取当前磁盘来补全旧 metadata，不把缺失 revision 的历史记录认证为已读，不扩大 Edit/Write 的实际权限

## 实现方式与来源限制

先以人工设计的合成输入锁定兼容用例，再用字段描述驱动的快照解码器统一类型验证及投影；查询保持无副作用的单次遍历。不复制旧分支结构作为新文件模板。已为提取契约阅读旧实现，不能声称未接触源码的 clean room。现有 Apache/NOTICE 继续适用，逐文件来源决定保持待复核，不能凭测试通过修改许可。

## 验收

覆盖 POSIX/Windows/Unicode key、窗口隔离、时间平局、不同路径、partial 新水位、缺失 freshness、所有必填字段错误类型、未知字段剔除、可选非有限数、工具输出严格 schema、精确窗口及输入不变。先在旧实现运行同一测试，再替换，分别检查源码和实际 emitted JS。既有工具执行 metadata 集成测试、根与 CLI 类型/lint、完整离线回归、构建、来源新鲜度和精确提交 CI 均保留；环境禁止本地 socket 的失败与真正通过分开记录。
