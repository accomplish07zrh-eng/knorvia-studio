# 外部内核原生能力不受限：生成媒体可见（2026-10-10）

用户要求：Codex、Grok Build 等内核套用 Knorvia GUI 后，原生能力不能受限；例如 Grok Build 本可调用原生图片、视频生成，在 Knorvia 里同样要能用、结果要能看到。

## 调查结论（2026-10-10）

已确认：

- 启动侧没有任何关闭工具、MCP、联网搜索或图片生成的参数；各 CLI 原生工具照常运行。共享 MCP 以追加方式注入。
- 展示侧丢失了生成结果。内核事件只有 text、progress、reasoning、tool、usage 五类，没有媒体类型：
  - Grok／ACP：`agent_message_chunk` 中的 image、audio、resource、resource_link 内容块因无 `text` 被静默丢弃；工具调用 content 中的图片被 JSON 字符串化并在 24,000 字符处截断。
  - Codex：只映射 agentMessage、commandExecution、fileChange、mcpToolCall、webSearch、dynamicToolCall，其余条目（含图片生成、查看图片）被丢弃。
  - Claude Code：assistant 的 image 块被丢弃；tool_result 中的图片被字符串化截断。
  - 外部聊天的 Markdown 未传工作区路径，回答中以相对路径引用的图片无法解析。
- ACP 权限：用户点「允许一次」时，若内核只提供「始终允许」选项，Studio 回复 cancelled，等同拒绝。
- Claude Code `--permission-mode manual` 为当前 CLI 合法取值（`claude --help` 已核对），不是问题。

保持不变（属权限语义而非能力限制，用户已确认各内核权限不同属正常）：Codex「变更前确认」使用只读沙箱加按需审批；只读／完全访问的映射；Antigravity 无审批通道。

## 规则

### 内核媒体事件

- 新增内核事件 `{ type: "media", items }`，每项含种类（image、video、audio、file）、MIME、名称，以及 `uri`（http(s)、file:// 或本机绝对路径）或内联 `dataBase64` 之一。
- 来源：
  - ACP／Grok：消息块 image、audio（内联或 uri）、resource_link（uri）、resource（blob 内联或 uri）；工具调用 content 中的同类内容块；已完成工具的原始输出中，整个字符串值就是媒体文件路径或 URL 的字段（扩展名为常见图片、视频、音频）。
  - Codex：`imageGeneration`（结果为 base64 或路径）、`imageView`（路径）条目。
  - Claude Code：assistant 与 tool_result 中的 image 块（base64 或 url）。
- 只读取内核自己给出的位置，不扫描工作区、不复制用户文件。

### 内联内容落盘

- 内核注册表在外部内核 sink 外包一层：内联内容按 SHA-256 写入 Studio 数据目录 `studio/media/<sha256>.<扩展名>`（异步 IO，已存在则复用），事件改为引用该路径后再交给运行时。单项上限 64 MB，超出的只记录名称并标注过大。
- 数据库消息只保存引用，不保存媒体字节。

### 消息与展示

- 消息新增 `kind: "media"` 与 `media` 引用列表；同一 turn 内同一位置只保存一次（消息 ID 由 turn 与位置哈希构成，幂等）。
- 外部聊天时间线：图片用既有 `readMediaPreview` 读取本机文件，视频用既有 `mediaPreviewService` 准备播放地址（与创作页同一实现），http(s) 直接加载；音频用原生播放器；其他文件显示名称与「在文件夹中显示」。读取失败显示原因，不影响其他消息。
- 外部聊天的回答 Markdown 传入会话工作区路径，相对路径图片可解析。
- 交接、导出与群聊摘要继续只取文本与工具消息。
- 远程内核暂不展示媒体（路径属于远端机器），保持现状并在本规格记录。

### ACP 权限

- 用户选择「允许一次」而内核不提供 allow_once、只提供 allow_always 时，回复 allow_always（用户已明确允许，该内核只提供此粒度）；用户拒绝时同理回退到 reject_always。都没有时仍回复 cancelled。

## 验收

- 单元：各来源媒体提取（ACP 消息块、工具 content、原始输出路径字段、Codex 条目、Claude 块）；内联落盘按哈希去重、超限标注；媒体消息幂等保存；ACP 权限回退。
- UI：媒体消息渲染图片、视频、音频、文件；Markdown 相对图片带工作区路径。
- typecheck、lint、fmt、架构、来源清单、services 与 UI 测试。
