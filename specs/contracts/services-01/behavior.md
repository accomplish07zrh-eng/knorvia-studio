# services-01 行为规格（v1）

范围：`packages/services/src` 7 个目录共 60 个继承文件（58 个 TypeScript 模块与 2 份继承规范文档，清单见 `scope-files.json` 与 `README.md`）。
编号冻结后不重用；每条在 `README.md`「条目 → 测试」对照表里均有精确测试断言覆盖。

---

## 一、通用约定（所有条目共用）

- **时序与并发**：除明确注明的跨进程锁、文件 IO 与子进程 stdio 交互外，其余接口均为确定性同步或短 Promise 纯逻辑；长驻连接与会话订阅在 dispose 时必须显式断开与清理。
- **幂等**：查询与投影接口天然幂等；写操作（如保存凭据、创建任务、更新状态、注册/取消订阅）均有明确的状态机或去重/对账保障。
- **资源释放**：涉及临时文件、文件锁、事件监听器（`onDynamic*`、`onDid*`）与子进程的模块，必须在对应 dispose/close 入口或生命周期终态释放全部资源，不造成内存泄漏或僵尸句柄。
- **日志级别**：协议与适配层错误严禁静默吞掉；错误必须以返回值、抛出结构化错误（带 `code`）或通过既有日志器记录。
- **平台差异**：路径计算与文件系统操作在 POSIX 与 Windows（反斜杠、大小写不敏感、UNC 路径等）上均有明确规范化，严格对齐平台边界。
- **状态所有者**：每个状态（凭据、任务索引、广播 lease、命令配置、权限状态机）有且仅有唯一的模块负责持有和写盘，禁止跨模块绕过接口直接写入。
- **金样与红线**：协议常量、wire 字段名、数据目录与环境变量**逐字冻结，一字不改**。

---

## 二、Surface 与包形状（B1–B3）

### B1 范围清单（`surface.test.mjs`）

- **输入**：`scope-files.json` 与 `licensing/current-files.json`。
- **输出**：范围文件严格冻结为 60 个继承文件（36 unreviewed + 23 upstream-modified + 1 upstream-unchanged），21,682 行 / 829,825 字节，分布在 `agent/`、`broadcast/`、`commands/`、`conversation-telemetry/`、`credential/`、`cua-permission-broker/`、`file/` 7 个目录中。
- **错误语义**：文件增删或分类口径漂移会导致断言失败。
- **时序/并发**：测试期断言。幂等：纯读。资源释放：无。平台差异：无。状态所有者：`scope-files.json`。日志：无。
- **测试**：`tests/surface.test.mjs` · `B1 范围清单`

### B2 兼容面同步（`surface.test.mjs`）

- **输入**：`interface.md`、范围源码 AST 与编译产物（dist）。
- **输出**：58 个 .ts 模块路径与 336 项顶层导出声明在 interface.md、源码 AST 与 dist 运行时导出间保持严格双向一致；无多余未登记键，无遗漏导出。
- **错误语义**：任何未登记的运行时导出或丢失的签名导出均立即报错。
- **时序/并发**：纯静态校验。幂等：纯读。资源释放：无。平台差异：无。状态所有者：`interface.md`。日志：无。
- **测试**：`tests/surface.test.mjs` · `B2 兼容面：interface.md 与源码同步`

### B3 公开入口形状（`surface.test.mjs`）

- **输入**：`packages/services` 的六个公开入口（`.`、`./node`、`./storage-startup`、`./cua-permission-broker`、`./process/processTreeTerminator`、`./window-controller`）。
- **输出**：根入口暴露完整服务描述符与浏览器安全类型面；`node` 入口暴露环境装配函数；`cua-permission-broker` 子路径保持委托面与本地描述符导出。
- **错误语义**：缺少公开入口或破坏导出结构即抛错。
- **时序/并发**：无。幂等：纯读。资源释放：无。平台差异：无。状态所有者：`package.json`。日志：无。
- **测试**：`tests/surface.test.mjs` · `B3 公开入口形状`

---

## 三、凭据与广播域（B4–B11）

### B4 凭据密文格式与解密（`credential/credential.ts`、`credential/providers/credentialCipherProvider.ts`）

- **输入**：密文字符串或明文。
- **输出**：密文以 `enc:v1:` 为前缀，载荷包含随机 IV 与 AES-256-GCM 密文；非前缀值原样透传；解密结果逐字节还原。
- **错误语义**：格式损坏、长度异常或密钥不匹配均抛稳定 code 错误，并在异常中附带可读原因。
- **时序/并发**：纯加解密，无时序。幂等：对同一明文使用不同随机 IV 加密，解密结果恒等。资源释放：无。平台差异：无。状态所有者：`credentialCipherProvider`。日志：无。
- **测试**：`tests/credential.test.mjs` · `B4 凭据密文格式`

### B5 凭据读取与损坏留证（`credential/credentialService.ts`）

- **输入**：读取 `credentials.json`。
- **输出**：文件不存在返回空对象；格式正常则解密并解析为凭据字典；若内容损坏或 JSON 不合 schema，拒绝覆盖写并生成带内容摘要的 `.bak` 备份文件，抛出 corrupt 错误。
- **错误语义**：拒绝向损坏文件写回新数据，避免丢凭据。
- **时序/并发**：文件读取受进程内锁与跨进程锁保护。幂等：重复读取损坏文件重复报错且备份文件名幂等。资源释放：释放文件读取流。平台差异：路径与备份后缀全平台一致。状态所有者：`credentialService`。日志：记录 warn 审计。
- **测试**：`tests/credential.test.mjs` · `B4 凭据服务`

### B6 进程内并发读改写串行化（`credential/credentialService.ts`）

- **输入**：并发 `saveCredential` 与 `deleteCredential`。
- **输出**：所有操作在内存队列与锁内串行化执行；落盘后再触发变更广播通知；读改写过程保留同存储内未修改的其他键值。
- **错误语义**：单个操作失败不污染队列中后续操作。
- **时序/并发**：严格保证读改写原子性。幂等：写回相同凭据不破坏状态。资源释放：完成后归还队列锁。平台差异：无。状态所有者：`credentialService`。日志：变更落盘后输出 info。
- **测试**：`tests/credential-broadcast.test.mjs` · `S15 进程内并发串行化`

### B7 跨进程文件锁（`credential/credentialService.ts`）

- **输入**：多进程同时读写 `credentials.json`。
- **输出**：竞争 `credentials.json.lock` 目录；被占有时等待并重试，获取锁后先重新读取磁盘最新数据再进行改写，防止多进程覆盖丢数据。
- **错误语义**：锁超时则报错并放弃本次写操作。
- **时序/并发**：跨进程互斥。幂等：重试机制保证最终一致。资源释放：无论成功或异常退出，`finally` 块必须清理锁目录。平台差异：基于 `mkdir` 的原子目录锁兼容 POSIX 与 Windows。状态所有者：操作系统目录系统。日志：记录锁等待与超时日志。
- **测试**：`tests/credential-broadcast.test.mjs` · `S16 跨进程锁`

### B8 密钥来源与缺失回退（`credential/providers/credentialCipherProvider.ts`）

- **输入**：环境变量 `KNORVIA_CREDENTIAL_SECRET` 或缺失。
- **输出**：若环境变量存在且非空，作为根密钥；若缺失或为空串，则基于本机硬件与用户唯一标识派生稳定密钥，实现同机互解、跨机隔离。
- **错误语义**：派生过程失败抛明确错误。
- **时序/并发**：单例缓存。幂等：同机多次调用派生密钥相同。资源释放：无。平台差异：读取各平台特定的机器 ID 事实源。状态所有者：`credentialCipherProvider`。日志：无。
- **测试**：`tests/credential-broadcast.test.mjs` · `S17 密钥缺失回退`

### B9 对话埋点服务（`conversation-telemetry/conversationTelemetry.ts`）

- **输入**：`IConversationTelemetryService` 与埋点事件监听。
- **输出**：按 `onDynamic*` 规范建立委托，将底层事实流向订阅方广播；对 target 上的白名单字段进行验证并透传其余业务载荷。
- **错误语义**：底层异常原样透传，不静默吞掉。
- **时序/并发**：事件驱动。幂等：重复注册返回独立取消订阅函数。资源释放：调用 dispose 移除监听器。平台差异：无。状态所有者：`conversationTelemetryService`。日志：无。
- **测试**：`tests/credential-broadcast.test.mjs` · `S18/S19 对话埋点服务`

### B10 跨窗口广播与 Claim 语义（`broadcast/broadcastService.ts`）

- **输入**：跨窗口/跨进程事件 `send` 与 `claim`。
- **输出**：支持基于 reservation/commit/release 的 claim 语义，避免多个窗口同时执行相同工作流；无 parentPort 时在进程内内存表仲裁，有 parentPort 时通过 worker/process 通道协调。
- **错误语义**：超出 claim 预算超时释放并报错。
- **时序/并发**：claim 状态转换受锁保护。幂等：释放未知或已超期的 claim 不抛错。资源释放：清理超期与释放的 token。平台差异：无。状态所有者：`broadcastService`。日志：记录 claim 仲裁结果。
- **测试**：`tests/credential-broadcast-2.test.mjs` · `S23 进程内 claim 语义`

### B11 广播过滤与投递纪律（`broadcast/broadcastService.ts`）

- **输入**：广播消息过滤条件与入站消息。
- **输出**：按通道、workspaceKey 与 reason 进行入站过滤；对广播流遵循上层业务去重规则，底层服务不擅自丢弃重复广播。
- **错误语义**：网络或序列化错误回退至本地派发。
- **时序/并发**：FIFO 顺序派发。幂等：多次派发独立递送。资源释放：解散窗口时清理订阅表。平台差异：无。状态所有者：`broadcastService`。日志：记录重要广播事件。
- **测试**：`tests/credential-broadcast-2.test.mjs` · `S22 入站投递与过滤`

---

## 四、用户命令服务（B12–B20）

### B12 命令配置文件发现与解析（`commands/commandDiscovery.ts`、`commands/commandFileParser.ts`）

- **输入**：工作区 `.knorvia/commands/` 目录下的 Markdown 命令文件。
- **输出**：解析 frontmatter（`description`、`argument-hint`），正文作为提示词模板；支持缩进行折叠续写，键名大小写不敏感；非字符串输入与损坏格式安全回落。
- **错误语义**：格式不合规范时跳过该文件并在诊断列表中留下警告，不中断其余命令加载。
- **时序/并发**：目录扫描与文件读取串行化。幂等：相同文件生成相同 Command 描述对象。资源释放：关闭目录与文件句柄。平台差异：规范化文件路径。状态所有者：`commandsService`。日志：warn 记录解析失败文件。
- **测试**：`tests/commands.test.mjs` · `S24 parseCommandFile frontmatter 接受样例`、`S25 拒绝与容错`

### B13 命令文件内容生成与回写（`commands/commandFileParser.ts`）

- **输入**：命令元数据与提示词内容。
- **输出**：若无元数据则原样输出正文；有元数据时输出标准 YAML frontmatter + 空行 + 正文；保留已存在文件中的未知元数据字段与注释。
- **错误语义**：无法序列化的值抛明确异常。
- **时序/并发**：纯数据转换。幂等：反复生成内容逐字节一致。资源释放：无。平台差异：换行符保持 POSIX LF。状态所有者：无。日志：无。
- **测试**：`tests/commands.test.mjs` · `S26 generateCommandFileContent 写回生成`

### B14 命令配置覆盖与启用状态（`commands/commandConfig.ts`）

- **输入**：`commandConfig.json` 的更新。
- **输出**：合并内置命令与工作区发现命令；支持针对命令 id 配置 `enabled: false` 显式禁用；写回保持格式美化与原子重命名写盘。
- **错误语义**：配置不可写时抛明确 IO 错误。
- **时序/并发**：写操作受排他锁保护。幂等：写回相同配置不产生差异。资源释放：写入后关闭临时文件。平台差异：跨平台原子重命名。状态所有者：`commandsService`。日志：info 记录配置更新。
- **测试**：`tests/commands-2.test.mjs` · `S27 命令配置合并与覆盖`

### B15 命令热重载与文件监视（`commands/commandsService.ts`）

- **输入**：命令目录文件变更事件（add, change, unlink）。
- **输出**：防抖触发重读并广播 `commands_changed` 事件；订阅方获取最新可用命令清单。
- **错误语义**：单个文件变动故障不影响全局命令缓存。
- **时序/并发**：防抖时间窗口合并短时间内连续事件。幂等：多次相同事件收敛为一次重载。资源释放：dispose 时注销文件监视器。平台差异：适配各平台 chokidar/fs.watch 行为。状态所有者：`commandsService`。日志：debug 记录重载过程。
- **测试**：`tests/commands-2.test.mjs` · `S28 热重载与广播`

---

## 五、工作区文件服务（B21–B30）

### B21 工作区目录结构与名字校验（`file/fileServiceIO.ts`）

- **输入**：对话、默认与草稿工作区路径创建请求。
- **输出**：所有工作区安全约束在数据根目录下；名字校验先于磁盘 IO；目录已存在时复用，`created` 标识仅反映真实新建。
- **错误语义**：路径遍历越界或非法字符立即拒绝；目标被非目录文件占据时抛稳定错误并保留原始 cause，不盲目覆盖。
- **时序/并发**：目录创建操作同步/短异步。幂等：重复调用返回已有路径。资源释放：无持续句柄。平台差异：路径分隔符规范化。状态所有者：`fileService`。日志：无。
- **测试**：`tests/file-service.test.mjs` · `工作区创建与名字校验`

### B22 目录列表与属性投影（`file/fileServiceIndex.ts`）

- **输入**：`listFiles` 目录列举。
- **输出**：默认隐藏点开头条目；目录整体先于文件；同类条目按 `localeCompare` 排序；目录只回 `path` 与 `type`，文件返回真实 `size` 与 `mtimeMs`。
- **错误语义**：目录不存在或无权限读取抛标准错误。
- **时序/并发**：单目录读取。幂等：只读操作。资源释放：关闭目录流。平台差异：保持平台原生路径大小写与换行。状态所有者：文件系统。日志：无。
- **测试**：`tests/file-service.test.mjs` · `目录列表与属性`

### B23 符号链接判定与安全处理（`file/fileServiceIndex.ts`）

- **输入**：包含符号链接的工作区文件树。
- **输出**：符号链接目录的 `type` 由其目标决定；`isSymbolicLink` 字段准确保留 Dirent 的原始事实；悬空符号链接安全退回为 `file`，避免崩溃。
- **错误语义**：循环链接安全阻断。
- **时序/并发**：带深度的解析。幂等：只读。资源释放：无。平台差异：Windows symlink 与 Junction 统一抽象。状态所有者：文件系统。日志：无。
- **测试**：`tests/file-service.test.mjs` · `符号链接处理`

### B24 二进制与文本启发式判定（`file/fileServiceIO.ts`）

- **输入**：文件前段字节流。
- **输出**：遇到 NUL 字符立即判定为二进制并清空文本内容；控制字符按占比阈值判定；制表符（`\t`）、换行符（`\n`、`\r`）不计入控制字符。
- **错误语义**：空文件安全判定为文本。
- **时序/并发**：纯字节缓冲判定。幂等：确定性输出。资源释放：无。平台差异：无。状态所有者：无。日志：无。
- **测试**：`tests/file-service.test.mjs` · `S38 二进制判定`

### B25 文件范围读取（`file/fileServiceIO.ts`）

- **输入**：`readFileRange({ path, offset, length })`。
- **输出**：返回 `Uint8Array`；长度落在 1 到 1MiB 上限之间；到达 EOF 返回截短数组；越界 offset 返回空数组而不发生实际盘读；回写 `truncated` 与 `totalBytes`。
- **错误语义**：文件不存在抛 `ENOENT`。
- **时序/并发**：带偏移量与长度的文件读取。幂等：只读。资源释放：及时关闭底层 fd。平台差异：无。状态所有者：文件系统。日志：无。
- **测试**：`tests/file-service.test.mjs` · `S39 readFileRange`

### B26 媒体与二进制预览（`file/fileServiceIO.ts`）

- **输入**：图片/音视频或二进制文件预览请求。
- **输出**：MIME 按小写扩展名提取；图片表优先于音视频表；未知类型回落为 `application/octet-stream`；base64 编码可逆；与媒体预览共用闸门但设置 25MiB 严格上限。
- **错误语义**：超出上限文件拒绝预览并返回提示。
- **时序/并发**：短 IO。幂等：只读。资源释放：释放读取缓冲。平台差异：扩展名大小写不敏感匹配。状态所有者：文件系统。日志：无。
- **测试**：`tests/file-service.test.mjs` · `S40 媒体预览`、`S41 二进制预览`

---

## 六、Computer-Use 权限经纪服务（B31–B42）

### B31 权限申报与状态机（`cua-permission-broker/`）

- **输入**：Agent 发起的屏幕操作、点击、键入等 CUA 权限请求。
- **输出**：维护 `pending`、`granted`、`rejected`、`expired` 状态迁移；支持按会话与操作类型细粒度授权。
- **错误语义**：非法状态迁移抛明确异常。
- **时序/并发**：受状态机互斥锁保护。幂等：重复确认相同请求返回当前状态。资源释放：请求完成后清理挂起记录。平台差异：无。状态所有者：`cuaPermissionService`。日志：记录权限授予与拒绝。
- **测试**：`tests/cua-permission-broker.test.mjs` · `权限状态机`

### B32 IPC Socket 通道（`cua-permission-broker/`）

- **输入**：Local Domain Socket 或 Windows Named Pipe 连接。
- **输出**：跨平台 socket 路径铸造；POSIX 下使用 `/tmp` 下带有权限约束的 socket 文件，Windows 下使用 `\\.\pipe\` 命名管道；跨平台仅按 basename 断言。
- **错误语义**：连接断开自动清理客户端会话。
- **时序/并发**：双工流。幂等：多次启动监听相同路径前先清理孤儿 socket。资源释放：服务停止时 unlink socket。平台差异：POSIX unix socket vs Windows named pipe。状态所有者：操作系统 IPC。日志：记录握手与断开。
- **测试**：`tests/cua-permission-broker.test.mjs` · `S56 socket 路径常量`

### B33 PiP 串行投递与延迟重放（`cua-permission-broker/`）

- **输入**：画中画（PiP）事件序列。
- **输出**：按严格 FIFO 顺序投递；挂起的 `turn-started` 事件由重放定时器在 250ms 后自动重投；超过 30s 截止期未处理则作为超期丢弃并记录上下文 warn。
- **错误语义**：投递异常记录 warn 但不阻塞后续事件流。
- **时序/并发**：有序事件队列。幂等：超时判定确定性。资源释放：取消定时器与重放队列。平台差异：无。状态所有者：`cuaPipSessionService`。日志：warn 记录投递失败与丢弃。
- **测试**：`tests/cua-permission-broker-2.test.mjs` · `S48 PiP 串行投递`

### B34 子桶委托导出面（`cua-permission-broker/index.ts`）

- **输入**：子入口 `@knorvia/services/cua-permission-broker` 导入。
- **输出**：委托导出 `@knorvia/cua/broker/server` 的全部 producer 符号；本地服务实现经子桶再导出仍是同一对象引用，不产生重复实例。
- **错误语义**：缺少依赖立即导致模块链接失败。
- **时序/并发**：无。幂等：单例引用。资源释放：无。平台差异：无。状态所有者：`cua-permission-broker/index.ts`。日志：无。
- **测试**：`tests/cua-permission-broker-2.test.mjs` · `S56 子桶委托面`

---

## 七、Agent 进程管理与传输（B43–B52）

### B43 Agent 进程生命周期（`agent/agentProcessManager.ts`）

- **输入**：`startAgentProcess`、`killAgentProcess`、工作区参数。
- **输出**：启动底层 Python/Node Agent 运行时子进程；维护活动进程句柄表；优雅退出超时后进行 SIGKILL 强杀；子进程异常退出触发状态机迁移。
- **错误语义**：启动参数错误或二进制缺失抛明确启动异常。
- **时序/并发**：进程管理由互斥锁保护。幂等：关闭已退出的进程安全返回。资源释放：子进程彻底退出后释放 stdio 句柄与 pid 映射。平台差异：跨平台信号发送与命令执行。状态所有者：`agentProcessManager`。日志：记录进程启动与退出。
- **测试**：`tests/agent-process.test.mjs` · `进程生命周期`

### B44 Stdio 协议传输（`agent/stdioTransport.ts`）

- **输入**：JSON-RPC 消息帧与子进程 stdout/stdin 流。
- **输出**：基于换行或 Content-Length 的双向帧拆解与封装；流断开时立即通知上层连接终止。
- **错误语义**：数据帧畸变或非法 UTF-8 抛解析错误并关闭通道。
- **时序/并发**：异步双工。幂等：写入关闭通道报错。资源释放：关闭管道读写端。平台差异：无。状态所有者：`stdioTransport`。日志：debug 记录收发数据。
- **测试**：`tests/agent-process.test.mjs` · `StdioTransport`

### B45 Stderr 采集与归属规约（`agent/agentStderrCollector.ts`）

- **输入**：子进程 stderr 输出流。
- **输出**：严格按 `agent/STDERR-OWNER-SPEC-20261003.md` 规范提取带时间戳的错误日志段落；识别崩溃 stacktrace 并归属到对应的 runId/traceId。
- **错误语义**：异常日志不影响主 stdout 协议流处理。
- **时序/并发**：流式行缓冲。幂等：只读处理。资源释放：进程退出时 flush 缓冲。平台差异：换行符归一。状态所有者：`agentStderrCollector`。日志：将诊断转存至专用日志通道。
- **测试**：`tests/agent-process.test.mjs` · `Stderr 采集与规约`

### B46 存储就绪门闩（`agent/storageStartupGate.ts`）

- **输入**：系统启动阶段各个服务模块的存储就绪申报。
- **输出**：阻塞 Agent 连接直至关键存储（SQLite、配置）完成初始化与迁移；就绪后广播开启连接。
- **错误语义**：迁移超时或失败阻断 Agent 启动，防止读写损坏状态。
- **时序/并发**：基于 Promise 的状态门闩。幂等：就绪后再次调用立即放行。资源释放：无。平台差异：无。状态所有者：`storageStartupGate`。日志：记录各模块就绪耗时。
- **测试**：`tests/agent-process.test.mjs` · `StorageStartupGate`

---

## 八、Task 适配与会话管理（B53–B72）

### B53 任务工厂与公开接口（`agent/taskServiceAdapter.ts`）

- **输入**：`createTaskServiceAdapter(options)`。
- **输出**：返回符合 `IKnorviaTaskService` 契约的完整适配器对象；`initialize` 由协议名称与版本组合；释放接口透传工作区身份。
- **错误语义**：缺失必要依赖抛注入异常。
- **时序/并发**：工厂调用同步完成。幂等：返回独立适配实例。资源释放：拥有 `disposeAll` 与 `disposeAllAndWait`。平台差异：无。状态所有者：适配层。日志：记录初始化。
- **测试**：`tests/task-service-adapter.test.mjs` · `A51 工厂与公开面`

### B54 任务创建与 Draft 会话复用（`agent/taskServiceAdapter.ts`）

- **输入**：`createTask` 请求。
- **输出**：普通创建走 `createSession`，写入 task index、置顶分组并广播 `task_created`；若存在匹配的 draft session，按 UI 当前选择的模型与思考档位对齐后直接复用；draft 失效时平滑降级新建。
- **错误语义**：底层创建失败不写入 index 脏数据。
- **时序/并发**：任务创建串行排队。幂等：新建会话获得全局唯一 taskId。资源释放：无。平台差异：无。状态所有者：`taskIndexRepo` 与 `agentService`。日志：记录任务新建。
- **测试**：`tests/task-service-adapter.test.mjs` · `A52 createTask 与 draft 复用`

### B55 任务列表读取与分页查询（`agent/taskServiceAdapter.ts`）

- **输入**：`listTaskList`、`queryTaskList`。
- **输出**：分区读取统一注入 Knorvia provider 边界并透传 `workspaceIdentity`；保留排序与搜索参数；分页返回项目列表、total 与 hasMore。
- **错误语义**：非法排序键回落默认按 `updatedAt` 降序。
- **时序/并发**：并发只读。幂等：只读。资源释放：无。平台差异：无。状态所有者：`taskIndexRepo`。日志：无。
- **测试**：`tests/task-service-adapter.test.mjs` · `A53 任务列表读取`

### B56 会话快照读取与运行态判定（`agent/taskServiceAdapter.ts`）

- **输入**：`getTaskSnapshot`。
- **输出**：任务状态由 session 事实、阻塞运行态与 lastError 共同判定；contextUsage 优先取 runtime 持久化统计；messageLimit 只保留尾窗并显式标注截断；ETag 基于快照内容哈希实现无变更缓存命中。
- **错误语义**：目标不存在抛 `KNORVIA_SESSION_TARGET_NOT_FOUND`。
- **时序/并发**：支持 ETag 缓存优化。幂等：只读。资源释放：无。平台差异：无。状态所有者：`agentService`。日志：无。
- **测试**：`tests/task-service-adapter.test.mjs` · `A54 快照读取与运行态判定`

### B57 子 Agent 隔离与工作区身份（`agent/taskServiceAdapter.ts`）

- **输入**：subagent 任务与不同 `workspaceIdentity` 的任务请求。
- **输出**：`subagent_child` 快照只读，不回写主任务索引；`parentSessionId` 渲染不可跳转的分隔线；同一 taskId 在不同 `workspaceIdentity` 下缓存与状态严格隔离，不发生串台。
- **错误语义**：跨作用域非法访问被拒绝。
- **时序/并发**：按作用域隔离。幂等：只读。资源释放：会话关闭时按作用域清理。平台差异：无。状态所有者：适配层目标表。日志：记录隔离异常。
- **测试**：`tests/task-service-adapter.test.mjs` · `A55 子 Agent 与工作区身份隔离`

### B58 Host Command 队列与调度（`agent/taskServiceAdapter.ts`）

- **输入**：`enqueueTaskCommand`、`promoteTaskCommand`、`cancelTaskCommand`。
- **输出**：入队立即返回 `accepted`；出队（drain）严格由上游 ready 事件驱动保持串行；promote 将命令调整至队首；运行中命令 cancel 幂等接受已开始状态，成功移除回投快照更新。
- **错误语义**：向无活跃输入的会话派发 owner 命令或旧 runId 操作判定为 stale 拒绝。
- **时序/并发**：严格保证每任务单一执行锁。幂等：重复取消已移除命令返回 `not_found`。资源释放：完成或取消时移出队列。平台差异：无。状态所有者：适配层 runtimeCommands 内存表。日志：info 记录命令状态收口。
- **测试**：`tests/task-service-adapter.test.mjs` · `A56 host command 队列与 owner/lease`

### B59 v4 CAS 命令收敛与重试（`agent/taskServiceAdapter.ts`）

- **输入**：模式切换、模型与思考档位调整命令。
- **输出**：`auto` 模式保留旧协议通道；其余模式与思考档位走 v4 CAS 命令；ACK 拒绝状态抛结构化错误，遭遇 stale 冲突时使用回报 revision 自动重试收敛。
- **错误语义**：连续 stale 超出上限抛重试放弃错误。
- **时序/并发**：乐观并发重试控制。幂等：相同 revision 仅成功生效一次。资源释放：无。平台差异：无。状态所有者：`agentService`。日志：记录 CAS 重试与失败。
- **测试**：`tests/task-service-adapter.test.mjs` · `A57 v4 命令收敛与错误传播`

### B60 事件投影与生命周期管理（`agent/taskServiceAdapter.ts`）

- **输入**：`onDynamicTaskEvent` 订阅。
- **输出**：建立本地状态机与上游 session 事件的双向订阅；session 事件精确映射为 task 状态流、权限请求与终态索引回写；`disposeAll` 幂等先释放 syncer 再释放 agentService。
- **错误语义**：未订阅任务保持静默。
- **时序/并发**：事件有序流式分发。幂等：重复 dispose 安全。资源释放：注销监听器、清理定时器与状态投影表。平台差异：无。状态所有者：适配层。日志：无。
- **测试**：`tests/task-service-adapter.test.mjs` · `A58 事件投影与订阅生命周期`

### B61 任务元数据写路径与 Tombstone（`agent/taskServiceAdapter.ts`）

- **输入**：`renameTask`、`pinTask`、`archiveTask`、`closeTask`。
- **输出**：写入 overlay 与索引补丁；专有 reason 广播变更；`closeTask` 记录 deleted tombstone 并从 live 投影中注销；unread 采用 CAS 对账回写。
- **错误语义**：写冲突或索引未找到安全回退。
- **时序/并发**：串行写盘。幂等：重复关闭已删除任务不重复广播。资源释放：清理 live 工具投影与会话句柄。平台差异：无。状态所有者：`taskIndexRepo`。日志：记录任务元数据写盘。
- **测试**：`tests/task-service-adapter.test.mjs` · `A59 任务元数据写路径`

### B62 路径定位、轨迹与日志归属（`agent/taskServiceAdapter.ts`）

- **输入**：`getTaskNativeSessionLogFile`、`getTaskSessionFilePath`、`getModelTrajectory`。
- **输出**：优先根据 `KNORVIA_LOG_DIR` 或数据根定位当日 JSONL；以 `taskId` 作为 session 与轨迹事实源；token usage 透传协议层，不私自本地聚合。
- **错误语义**：文件不存在返回 null 或空列表。
- **时序/并发**：只读。幂等：只读。资源释放：无。平台差异：路径分隔符规范化。状态所有者：文件系统与日志系统。日志：无。
- **测试**：`tests/task-service-adapter.test.mjs` · `A5A10 路径、轨迹与日志归属`

### B63 Claude 原生会话导入（`agent/taskServiceAdapter.ts`）

- **输入**：`scanImportableClaudeSessions`。
- **输出**：委托导入仓库；扫描参数不携带 `workspaceIdentity`；根据 JSONL 内部 cwd 与可选工作区路径过滤；安全导入历史会话。
- **错误语义**：无法解析的会话标记为 skipped。
- **时序/并发**：串行扫描导入。幂等：已导入会话不重复导入。资源释放：关闭导入流。平台差异：无。状态所有者：`claudeNativeSessionImportRepo`。日志：info 记录扫描与导入进度。
- **测试**：`tests/task-service-adapter.test.mjs` · `A514 Claude 原生导入面`

---

## 九、语义常量与错误码冻结表

| 标识符 / 常量                                          | 冻结值                                        | 所属模块                                           | 说明                       |
| :----------------------------------------------------- | :-------------------------------------------- | :------------------------------------------------- | :------------------------- |
| `KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE`               | `"KNORVIA_AGENT_RUNTIME_UNAVAILABLE"`         | `agent/agent.ts`                                   | Agent 运行时不可用错误码   |
| `KNORVIA_AGENT_MCP_STATUS_MODE_UNSUPPORTED_ERROR_CODE` | `"KNORVIA_AGENT_MCP_STATUS_MODE_UNSUPPORTED"` | `agent/agentErrors.ts`                             | MCP status-only 缺失错误码 |
| `CREDENTIAL_CIPHER_PREFIX`                             | `"enc:v1:"`                                   | `credential/providers/credentialCipherProvider.ts` | 凭据密文版本前缀           |
| `BROKER_SOCKET_ENV`                                    | `"KNORVIA_CUA_BROKER_SOCKET"`                 | `cua-permission-broker/`                           | CUA Broker 通信环境变量    |
| `BROKER_UNAVAILABLE_ENV`                               | `"KNORVIA_CUA_BROKER_UNAVAILABLE"`            | `cua-permission-broker/`                           | CUA Broker 不可用标记变量  |
| `DEFAULT_CONFIG_OPTION_IDS`                            | `["model", "mode", "thought_level"]`          | `agent/configOptions.ts`                           | 配置项固定标识清单         |
