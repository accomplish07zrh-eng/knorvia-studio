# Read 文本投影与线性预算选择

2026-09-30。继续技术替换 Read 的文本结果处理和粗略 token 估计。保留现有外部行为，不改变文件读取权限、磁盘数据、已读快照或 UI。先冻结旧实现的契约再替换，不提前新增 MIT 来源决定。

## 所有者与边界

- FileSystemPort 独占实际 IO、范围读取、取消与文件 revision 的事实；工具只转发读取参数并投影结果
- context/utils 的字符估算单位为唯一 token 权重定义；read-text 不另写一套中文判定或隐藏预算常量
- 已读状态仍由调用方的 onRead 回调管理。回调在 IO 成功后、预算投影前执行一次；回调异常保持原样向外传播
- 不增加缓存、不读取第二次、不写用户文件、不改变 read.ts 的调用入口或工具 schema

## 必须保持的行为

- 未提供 offset 或 offset <= 1 时传 offsetLine=0，否则传 offset-1；limit 是否提供决定 maxBytes：未提供为 READ_MAX_FILE_SIZE_BYTES，提供则 undefined；signal 与 trace 原样传递
- 默认只在初次全文读取时允许 partial fallback，调用方显式 boolean 可覆盖；取消和 adapter 异常不转换为成功结果
- token 估计仍为 ceil((UTF-16 长度 + U+4E00..U+9FFF 字符数量) / ESTIMATED_TOKEN_CHAR_DIVISOR)。其余字符包括代理对按现有 UTF-16 长度计数，空串为零
- 未超 READ_MAX_OUTPUT_TOKENS 时保留 adapter content、lineCount、startLine、totalLines、sizeBytes、bytesRead、truncated。offset=0 的普通结果 startLine 保持0。空文件且输出窗口从1开始时，旧的 numLines/totalLines 归一为1行为保留
- 超预算且不允许 partial 时保留 ToolExecutionFailed、原错误文本、recoverable 和 context(code/filePath/maxTokens/tokenCount)
- partial 目标仍为输出预算的85%向下取整。先取 CRLF/LF 分行后、以 LF 连接的最大完整行前缀；前缀以 adapter startLine 为准，保留总行数和字节事实，设置 truncated/truncatedByTokenCap 与现有继续读取提示
- 一行都放不下时，取原始内容可容纳的最大 UTF-16 前缀，numLines=1，保留现有长首行提示；不额外引入 Unicode 裁剪语义变化
- 模型文本仍为可选 partial system-reminder、空文件/越界提示或带行号正文；CRLF 正规化、尾部空行、行号和 tab 分隔完全保持

## 实现选择

用可加和的字符权重累计行前缀，避免二分每一步反复 slice/join 并重新扫描已读前缀。token 估计使用同一权重函数，避免正则 match 分配一个与中文字符数等大的数组。只在最终选中边界生成输出字符串。复杂度目标为所读内容长度的线性扫描，未引入第二种状态或预算定义。

## 验收与限制

先覆盖读取参数/回调时序、取消/异常、普通/空/越界内容、0 offset、范围 limit、预算精确边界、中英文混排、CRLF、空行、长首行、代理对和两种 partial 提示。用固定合成 fixture 对照旧结果与错误，再验证实际 emitted JS、真实 read 调用者、根及 CLI 类型/lint、构建、架构与全量离线回归。记录性能测试方法，不用机器负载下的偶然毫秒差宣称性能提升。

已经阅读旧实现提取外部契约，不能声称未接触源码的 clean room。错误和提示文本为必须保留的既有契约，来源复核继续保留这部分事实。源码技术替换、测试通过、文件独立许可判定分别记录。
