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
- **测试**：`tests/surface.test.mjs` · `60 个继承文件：7 目录分布与三类分类计数`

### B2 兼容面同步（`surface.test.mjs`）

- **输入**：`interface.md`、范围源码 AST 与编译产物（dist）。
- **输出**：58 个 .ts 模块路径与 336 项顶层导出声明在 interface.md、源码 AST 与 dist 运行时导出间保持严格双向一致；无多余未登记键，无遗漏导出。
- **错误语义**：任何未登记的运行时导出或丢失的签名导出均立即报错。
- **时序/并发**：纯静态校验。幂等：纯读。资源释放：无。平台差异：无。状态所有者：`interface.md`。日志：无。
- **测试**：`tests/surface.test.mjs` · `每个范围模块都有一节，且声明名集合与 AST 导出一致`

### B3 公开入口形状（`surface.test.mjs`）

- **输入**：`packages/services` 的六个公开入口（`.`、`./node`、`./storage-startup`、`./cua-permission-broker`、`./process/processTreeTerminator`、`./window-controller`）。
- **输出**：根入口暴露完整服务描述符与浏览器安全类型面；`node` 入口暴露环境装配函数；`cua-permission-broker` 子路径保持委托面与本地描述符导出。
- **错误语义**：缺少公开入口或破坏导出结构即抛错。
- **时序/并发**：无。幂等：纯读。资源释放：无。平台差异：无。状态所有者：`package.json`。日志：无。
- **测试**：`tests/surface.test.mjs` · `根桶暴露 descriptor 与浏览器安全类型面`

---

## 三、凭据与广播域（B4–B11）

### B4 凭据密文格式与解密（`credential/credential.ts`、`credential/providers/credentialCipherProvider.ts`）

- **输入**：密文字符串或明文。
- **输出**：密文以 `enc:v1:` 为前缀，载荷包含随机 IV 与 AES-256-GCM 密文；非前缀值原样透传；解密结果逐字节还原。
- **错误语义**：格式损坏、长度异常或密钥不匹配均抛稳定 code 错误，并在异常中附带可读原因。
- **时序/并发**：纯加解密，无时序。幂等：对同一明文使用不同随机 IV 加密，解密结果恒等。资源释放：无。平台差异：无。状态所有者：`credentialCipherProvider`。日志：无。
- **测试**：`tests/credential.test.mjs` · `B4 凭据密文格式`、`B4 凭据存储往返（旧写 → 新读 → 新写 → 旧读）`

### B5 凭据读取与损坏留证（`credential/credentialService.ts`）

- **输入**：读取 `credentials.json`。
- **输出**：文件不存在返回空对象；格式正常则解密并解析为凭据字典；若内容损坏或 JSON 不合 schema，拒绝覆盖写并生成带内容摘要的 `.bak` 备份文件，抛出 corrupt 错误。
- **错误语义**：拒绝向损坏文件写回新数据，避免丢凭据。
- **时序/并发**：文件读取受进程内锁与跨进程锁保护。幂等：重复读取损坏文件重复报错且备份文件名幂等。资源释放：释放文件读取流。平台差异：路径与备份后缀全平台一致。状态所有者：`credentialService`。日志：记录 warn 审计。
- **测试**：`tests/credential.test.mjs` · `B4 凭据服务`、`B4 凭据存储往返（旧写 → 新读 → 新写 → 旧读）`

### B6 进程内并发读改写串行化（`credential/credentialService.ts`）

- **输入**：并发 `saveCredential` 与 `deleteCredential`。
- **输出**：所有操作在内存队列与锁内串行化执行；落盘后再触发变更广播通知；读改写过程保留同存储内未修改的其他键值。
- **错误语义**：单个操作失败不污染队列中后续操作。
- **时序/并发**：严格保证读改写原子性。幂等：写回相同凭据不破坏状态。资源释放：完成后归还队列锁。平台差异：无。状态所有者：`credentialService`。日志：变更落盘后输出 info。
- **测试**：`tests/credential-broadcast.test.mjs` · `S15 进程内并发串行化（credential/credentialService.ts）`

### B7 跨进程文件锁（`credential/credentialService.ts`）

- **输入**：多进程同时读写 `credentials.json`。
- **输出**：竞争 `credentials.json.lock` 目录；被占有时等待并重试，获取锁后先重新读取磁盘最新数据再进行改写，防止多进程覆盖丢数据。
- **错误语义**：锁超时则报错并放弃本次写操作。
- **时序/并发**：跨进程互斥。幂等：重试机制保证最终一致。资源释放：无论成功或异常退出，`finally` 块必须清理锁目录。平台差异：基于 `mkdir` 的原子目录锁兼容 POSIX 与 Windows。状态所有者：操作系统目录系统。日志：记录锁等待与超时日志。
- **测试**：`tests/credential-broadcast.test.mjs` · `S16 跨进程锁（credential/credentialService.ts）`

### B8 密钥来源与缺失回退（`credential/providers/credentialCipherProvider.ts`）

- **输入**：环境变量 `KNORVIA_CREDENTIAL_SECRET` 或缺失。
- **输出**：若环境变量存在且非空，作为根密钥；若缺失或为空串，则基于本机硬件与用户唯一标识派生稳定密钥，实现同机互解、跨机隔离。
- **错误语义**：派生过程失败抛明确错误。
- **时序/并发**：单例缓存。幂等：同机多次调用派生密钥相同。资源释放：无。平台差异：读取各平台特定的机器 ID 事实源。状态所有者：`credentialCipherProvider`。日志：无。
- **测试**：`tests/credential-broadcast.test.mjs` · `S17 密钥缺失回退（credential/providers/credentialCipherProvider.ts）`

### B9 对话埋点服务（`conversation-telemetry/conversationTelemetry.ts`）

- **输入**：`IConversationTelemetryService` 与埋点事件监听。
- **输出**：按 `onDynamic*` 规范建立委托，将底层事实流向订阅方广播；对 target 上的白名单字段进行验证并透传其余业务载荷。
- **错误语义**：底层异常原样透传，不静默吞掉。
- **时序/并发**：事件驱动。幂等：重复注册返回独立取消订阅函数。资源释放：调用 dispose 移除监听器。平台差异：无。状态所有者：`conversationTelemetryService`。日志：无。
- **测试**：`tests/credential-broadcast.test.mjs` · `S18/S19 对话埋点服务（conversation-telemetry/conversationTelemetry.ts）`

### B10 跨窗口广播与 Claim 语义（`broadcast/broadcastService.ts`）

- **输入**：跨窗口/跨进程事件 `send` 与 `claim`。
- **输出**：支持基于 reservation/commit/release 的 claim 语义，避免多个窗口同时执行相同工作流；无 parentPort 时在进程内内存表仲裁，有 parentPort 时通过 worker/process 通道协调。
- **错误语义**：超出 claim 预算超时释放并报错。
- **时序/并发**：claim 状态转换受锁保护。幂等：释放未知或已超期的 claim 不抛错。资源释放：清理超期与释放的 token。平台差异：无。状态所有者：`broadcastService`。日志：记录 claim 仲裁结果。
- **测试**：`tests/credential-broadcast-2.test.mjs` · `S23 本地 claim 的 token 语义（broadcast/broadcastService.ts）`、`S24 本地 claim 表的有界保留（broadcast/broadcastService.ts）`、`S25 经 parentPort 的 claim 协议（broadcast/broadcastService.ts）`

### B11 广播过滤与投递纪律（`broadcast/broadcastService.ts`）

- **输入**：广播消息过滤条件与入站消息。
- **输出**：按通道、workspaceKey 与 reason 进行入站过滤；对广播流遵循上层业务去重规则，底层服务不擅自丢弃重复广播。
- **错误语义**：网络或序列化错误回退至本地派发。
- **时序/并发**：FIFO 顺序派发。幂等：多次派发独立递送。资源释放：解散窗口时清理订阅表。平台差异：无。状态所有者：`broadcastService`。日志：记录重要广播事件。
- **测试**：`tests/credential-broadcast-2.test.mjs` · `S22 入站投递与过滤（broadcast/broadcastService.ts）`

---

## 四、用户命令服务（B12–B16）

### B12 命令配置文件发现与解析（`commands/commandDiscovery.ts`、`commands/commandFileParser.ts`）

- **输入**：命令目录下的 Markdown 文件内容与路径（`parseCommandFile(content, filePath, format)`）。
- **输出**：`---` 围栏内的 `description`、`argument-hint` 提取为首个非空值加缩进续行（空格连接），键名大小写不敏感；正文（围栏之后）作为 `content`，`prompt` 为 `content.trim()`，`name` 取文件名去 `.md` 后加 `/` 前缀。
- **错误语义**：字符串输入永不返回 `null`——无围栏时整篇都当正文、未闭合围栏与正文中的第二组 `---` 按「首个围栏对」吞并；非字符串输入走 `catch` 返回 `null`。
- **时序/并发**：纯函数。幂等：同输入同输出。资源释放：无。平台差异：文件名取 `/[\\/]+/` 最后一段，两种分隔符都识别。状态所有者：无。日志：无。
- **测试**：`tests/commands.test.mjs` · `S24 parseCommandFile frontmatter 接受样例`、`S25 parseCommandFile 拒绝与容错`

### B13 命令文件内容生成与回写（`commands/commandFileParser.ts`）

- **输入**：`generateCommandFileContent(config, format, existingContent?)`。
- **输出**：无元数据时原样返回 `config.prompt`；有元数据时输出 `---` 块 + 空行 + prompt。传了 `existingContent` 时保留其中除 `description`/`argument-hint` 之外的元数据行（含缩进续行与未知键），被替换的两键整段丢弃后按新值重写。
- **错误语义**：不抛错——`description`/`argument-hint` 经 `trim()` 后为空则不写该键。
- **时序/并发**：纯数据转换。幂等：反复生成内容逐字节一致。资源释放：无。平台差异：换行固定 LF。状态所有者：无。日志：无。
- **测试**：`tests/commands.test.mjs` · `S26 generateCommandFileContent 写回生成`

### B14 命令配置覆盖与启用状态（`commands/commandConfig.ts`）

- **输入**：`<dataRoot>/cli/config.json` 的读写，以及 `withCommandEnabled(config, filePath, enabled)`。
- **输出**：`readCommandConfiguration` 缺失/坏 JSON/非对象一律返回 `{}`；写回为 `JSON.stringify(config, null, 2)` 加尾换行。禁用写 `config.command[filePath] = { enable: false }`，启用删该键，`command` 集合空时删整个键；其余未知字段原样保留。
- **错误语义**：`readEnabledOverrides` 只收 `enable` 为 boolean 的项；非对象的 `config.command` 视为空。写盘失败（`mkdir`/`writeFile`）原样上抛，无回滚。
- **时序/并发**：每次读写都直落磁盘，无进程内锁、无临时文件 + rename；并发写按 `writeFile` 的到达顺序互相覆盖。幂等：相同配置重复写回逐字节一致。资源释放：无。平台差异：无。状态所有者：`<dataRoot>/cli/config.json`（`commandConfig.ts` 独占）。日志：无。
- **测试**：`tests/commands.test.mjs` · `S21 commandConfig 读写`、`S22 withCommandEnabled 覆盖写回`、`S21 命令配置往返（旧写 → 新读 → 新写 → 旧读）`；`tests/commands-2.test.mjs` · `S33 update/delete/setEnabled/getPrimaryUserCommandsDirectory`

### B15 命令发现来源优先级与同名去重（`commands/commandDiscovery.ts`、`commands/commandLocations.ts`）

- **输入**：`list({ workspacePath, agentSource })` 触发的目录发现。
- **输出**：项目档先于用户档（有 `workspacePath` 时才扫项目档）；`knorvia` 描述符下 `~/.knorvia-studio/commands` 一旦发现到命令就不再回落到 `.agents/commands`；插件命令仅在未限定 `agentSource` 时追加；跨来源同名命令按「先发现者胜」去重。
- **错误语义**：单个目录 `readdir`/`lstat` 失败按空目录处理，已发现的命令保留（部分结果语义），不使整次发现失败；点开头条目直接跳过。
- **时序/并发**：目录遍历逐条 `await` 串行，目录递归深度优先；每次 `list` 都重新读盘与重读配置，无进程内缓存。
- **幂等**：只读操作，同一磁盘状态下输出稳定（顺序由遍历顺序与去重表决定）。**资源释放**：无长驻句柄。**平台差异**：`commandName` 用 `/[\\/]+/` 同时切分两种分隔符，扩展名匹配大小写不敏感。**状态所有者**：文件系统与 `<dataRoot>/cli/config.json`。**日志**：无。
- **测试**：`tests/commands-2.test.mjs` · `S28 目录来源优先级与同名去重`、`S29 插件命令发现的开关与候选源`、`S30 插件 manifest 与命令目录声明边界`

### B16 命令服务描述符与文件写入（`commands/commands.ts`、`commands/commandsService.ts`）

- **输入**：`ICommandsService` 的六个方法：`list({agentSource?, workspacePath?, workspaceIdentity?})`、`writeCommandFile(params)`、`updateCommandFile(params)`、`deleteCommandFile(params)`、`setCommandEnabled(params)`、`getPrimaryUserCommandsDirectory({agentSource?})`。
- **输出**：`list` 把 B15 的发现结果按 `agentSource` 过滤后返回 `{commands, userCommands, pluginCommands, capability:{userScopeAvailable:true}}`（`commands` = 用户档 + 插件档，限定 `agentSource` 时不追加插件档）；`writeCommandFile` 用 `commandFilename`（去掉前导 `/` 再加扩展名）定位文件，先 `mkdir(rootPath)` 再写盘，最后把该路径在 `<dataRoot>/cli/config.json` 的覆盖项清成「启用」并回 `{command}`；`updateCommandFile` 用 B13 的 `generateCommandFileContent` 带上原文件内容重写，改名时把旧路径的启用状态迁移到新路径，返回值 `enabled` 从覆盖表实读；`deleteCommandFile` 删文件并清掉该路径的覆盖键；`setCommandEnabled` 只写覆盖表（B14）；`getPrimaryUserCommandsDirectory` 建目录后回 `{path}`，指向当前 `agentSource` 的首选用户级目录。
- **错误语义**：`writeCommandFile` 用 `access` 预检，目标已存在时抛 `Command file already exists: <filename>`（不是裸 `EEXIST`），绝不静默覆盖；文件名只做「去掉前导 `/` + 加扩展名」，**不**过滤分隔符或 `..`（越界防护由上层 `storageLevel` 决定根目录）。`deleteCommandFile` 把 `ENOENT` 吞成成功（删不存在的命令不算错），其他错误原样上抛；`updateCommandFile` 对缺失的 `oldFilePath` 用 `catch(() => undefined)` 当「没有旧内容」，改名时 `rm` 旧文件失败也不阻断。写后解析失败抛 `Failed to parse written command file`。`list` 的目录读失败按空目录处理（与 B15 一致）。
- **时序与并发**：每次写都是「先落文件、后写配置」两步，中间失败会留下文件与覆盖表不一致（无事务）；同一路径并发写按到达顺序互相覆盖。`updateCommandFile` 改名分支的顺序是公开行为：**先** `rm` 旧文件、**再**对目标做存在性预检，所以改名撞车时旧文件已经消失、目标文件保持原样。`writeCommandFile` 只 `mkdir(rootPath)`、不建嵌套目录，因此 `/nested/new` 这类名字写盘时以 `ENOENT` 失败（`updateCommandFile` 用的是 `mkdir(dirname(filePath), {recursive:true})`，两者不一致）。**幂等**：`setCommandEnabled` 对同一目标值重复调用结果一致；`deleteCommandFile` 对已删除路径重复调用仍成功（`ENOENT` 被吞）；`writeCommandFile` 重复调用第二次抛「已存在」（不是幂等成功）。
- **资源释放**：无长驻句柄，写完即关。**平台差异**：`workspacePath` 缺省时不扫项目档；路径拼接用 `node:path`，Windows 下命令根在用户主目录下同样成立。**状态所有者**：命令文件本身由文件系统持有，启用覆盖由 `<dataRoot>/cli/config.json`（`commandConfig.ts`）独占。**日志**：无。
- **测试**：`tests/commands-2.test.mjs` · `S31 commands.ts 描述符面与 service 装配`、`S32 writeCommandFile`、`S33 update/delete/setEnabled/getPrimaryUserCommandsDirectory`

---

## 五、工作区文件服务（B21–B30）

### B21 工作区目录结构与名字校验（`file/fileServiceIO.ts`）

- **输入**：对话、默认与草稿工作区路径创建请求。
- **输出**：所有工作区安全约束在数据根目录下；名字校验先于磁盘 IO；目录已存在时复用，`created` 标识仅反映真实新建。
- **错误语义**：路径遍历越界或非法字符立即拒绝；目标被非目录文件占据时抛稳定错误并保留原始 cause，不盲目覆盖。
- **时序/并发**：目录创建操作同步/短异步。幂等：重复调用返回已有路径。资源释放：无持续句柄。平台差异：路径分隔符规范化。状态所有者：`fileService`。日志：无。
- **测试**：`tests/file-service.test.mjs` · `对话/默认/草稿工作区都落在数据根内，created 只反映真实新建，名字校验先于 IO`

### B22 目录列表与属性投影（`file/fileServiceIndex.ts`）

- **输入**：`listFiles` 目录列举。
- **输出**：默认隐藏点开头条目；目录整体先于文件；同类条目按 `localeCompare` 排序；目录只回 `path` 与 `type`，文件返回真实 `size` 与 `mtimeMs`。
- **错误语义**：目录不存在或无权限读取抛标准错误。
- **时序/并发**：单目录读取。幂等：只读操作。资源释放：关闭目录流。平台差异：保持平台原生路径大小写与换行。状态所有者：文件系统。日志：无。
- **测试**：`tests/file-service.test.mjs` · `默认隐藏点开头条目，目录整体先于文件，组内顺序等于 localeCompare`、`目录只回 path/type，文件带真实 size/mtimeMs，路径原样回显且不做词法归一`

### B23 符号链接判定与安全处理（`file/fileServiceIndex.ts`）

- **输入**：包含符号链接的工作区文件树。
- **输出**：符号链接目录的 `type` 由其目标决定；`isSymbolicLink` 字段准确保留 Dirent 的原始事实；悬空符号链接安全退回为 `file`，避免崩溃。
- **错误语义**：循环链接安全阻断。
- **时序/并发**：带深度的解析。幂等：只读。资源释放：无。平台差异：Windows symlink 与 Junction 统一抽象。状态所有者：文件系统。日志：无。
- **测试**：`tests/file-service.test.mjs` · `符号链接目录的 type 由目标决定，isSymbolicLink 保留 dirent 原始事实，悬空链接退回 file`

### B24 二进制与文本启发式判定（`file/fileServiceIO.ts`）

- **输入**：文件前段字节流。
- **输出**：遇到 NUL 字符立即判定为二进制并清空文本内容；控制字符按占比阈值判定；制表符（`\t`）、换行符（`\n`、`\r`）不计入控制字符。
- **错误语义**：空文件安全判定为文本。
- **时序/并发**：纯字节缓冲判定。幂等：确定性输出。资源释放：无。平台差异：无。状态所有者：无。日志：无。
- **测试**：`tests/file-service.test.mjs` · `S38 二进制判定（source）`

### B25 文件范围读取（`file/fileServiceIO.ts`）

- **输入**：`readFileRange({ path, offset, length })`。
- **输出**：返回 `Uint8Array`；长度落在 1 到 1MiB 上限之间；到达 EOF 返回截短数组；越界 offset 返回空数组而不发生实际盘读；回写 `truncated` 与 `totalBytes`。
- **错误语义**：文件不存在抛 `ENOENT`。
- **时序/并发**：带偏移量与长度的文件读取。幂等：只读。资源释放：及时关闭底层 fd。平台差异：无。状态所有者：文件系统。日志：无。
- **测试**：`tests/file-service.test.mjs` · `S39 readFileRange（source）`

### B26 媒体与二进制预览（`file/fileServiceIO.ts`）

- **输入**：图片/音视频或二进制文件预览请求。
- **输出**：MIME 按小写扩展名提取；图片表优先于音视频表；未知类型回落为 `application/octet-stream`；base64 编码可逆；与媒体预览共用闸门但设置 25MiB 严格上限。
- **错误语义**：超出上限文件拒绝预览并返回提示。
- **时序/并发**：短 IO。幂等：只读。资源释放：释放读取缓冲。平台差异：扩展名大小写不敏感匹配。状态所有者：文件系统。日志：无。
- **测试**：`tests/file-service.test.mjs` · `S40 媒体预览（source）`、`S41 二进制预览与 classifyFileEntry（source）`

### B27 工作区文件搜索索引与缓存（`file/fileServiceIndex.ts`、`file/fileService.ts`）

- **输入**：`searchWorkspaceFiles({rootPath, workspaceIdentity?, query, limit?, refresh?})`、`listWorkspaceFilesLength({rootPath, refresh?})`、`listWorkspaceFilesRange({rootPath, offset, length, refresh?})`。
- **输出**：`searchWorkspaceFiles` 回 `WorkspaceFileEntry[]`（只有 `name`/`path`/`relativePath`/`type` 四键；命中分数降序、同分按原索引顺序）；`listWorkspaceFilesLength` 回列式打包字符串的**字符长度**（不是行数），`listWorkspaceFilesRange` 按字符区间 `[offset, offset+length)` 切同一份打包串，`offset` 越界回空串。索引以 `<identity?.trim() || rootPath>` 为键缓存，TTL 60 000 ms、最多 4 个桶的 LRU（按插入序淘汰最旧），签名是 `<rootPath>\n<.knorviaignore 的 mtimeMs:size 或 "none">`；`refresh:true` 跳过缓存强制重建，同一键上的在飞扫描按签名复用同一个 promise。
- **错误语义**：`query` 非字符串或 `limit` 非有限数时抛 `Invalid workspace file search query or limit`；`limit` 先夹到 `[0, WORKSPACE_FILE_SEARCH_DISPLAY_CAP]` 并 `trunc`，`limit === 0` 在**建索引之前**短路返回空数组；单个目录 `EACCES`/`EPERM`/`ENOENT` 只跳过该目录，其他错误上抛。空白 query 不是错误：它返回全部候选（文件在前），不做「空查询即空结果」的短路。
- **时序与并发**：索引遍历用 8 个 worker 共享一个目录栈（`pop` 取下一个目录），条目按「目录整体先于文件、同类 `relativePath.localeCompare`」排序后列式打包；搜索先按 128 000 字符边界切块解码出候选（每块后 `setImmediate`），再做 top-K 归并，按 2048 条一批、批间 `setImmediate`，不在一次 tick 里跑完整棵树。符号链接目录被索引但不入栈（不跟随）。
- **幂等**：同一 `(rootPath, identity)` 在 TTL 内重复调用返回同一份缓存快照；`refresh:true` 语义上等价于「重建后再读」。**资源释放**：无长驻句柄；过期桶在下次访问时被淘汰，不设后台定时器。
- **平台差异**：路径按 `node:path` 拼装，排序用 `localeCompare`（受运行环境 locale 影响，跨平台不保证逐字节一致）。**状态所有者**：`fileServiceIndex` 独占索引缓存与 LRU 表。**日志**：无。
- **测试**：`tests/file-service.test.mjs` · `S42 工作区文件搜索索引与忽略规则（source）`

### B28 忽略规则判定与 `.knorviaignore`（`file/workspaceFileIgnore.ts`、`file/workspaceFileMentionFilter.ts`）

- **输入**：`readWorkspaceFileSearchIgnore(rootPath)`、`transformWorkspaceFileSearchIgnore(content, transform)`、`writeWorkspaceFileSearchIgnore(rootPath, content)`；`defaultWorkspaceFileSearchFilter` 的 `evaluate(entry, ignoreRules)`。
- **输出**：忽略文件名固定为 `.knorviaignore`（`WORKSPACE_FILE_SEARCH_IGNORE_FILE_NAME`）。`readWorkspaceFileSearchIgnore` 回 `{content, source:"file"|"template"}`：文件存在时原样回内容且 `source === "file"`；缺失时回**未落盘的**初始模板（`.gitignore` 内容作首段 + 同步标记 + 内置默认行 + 默认段标记 + 自定义区提示）且 `source === "template"`。`transformWorkspaceFileSearchIgnore` 只接受 `"sync-gitignore"`（重写同步段，保留默认段与自定义区）与 `"reset-defaults"`（重算默认段，保留同步段与自定义区），都只回 `{content}`、不写盘；内容里找不到两个标记时退化为「重新生成初始模板」。`evaluate` 对目录只在 `ignoreRulesActive === false` 时跳过 `SKIPPED_DIRECTORY_NAMES/PREFIXES/SUFFIXES`；隐藏判定是「自身名字或任一祖先以 `.` 开头」；文件排除 `.env`、`.env.*`、`SKIPPED_FILE_NAMES` 与 `SKIPPED_FILE_EXTENSIONS`（`.aar .class .dll .exe .jar .node .o .pyc .so .tsbuildinfo .war` 等）。
- **错误语义**：搜索侧的加载器 `loadWorkspaceFileSearchIgnoreRules` 读 `.knorviaignore` 失败（非 `ENOENT`，如 `EACCES`）时降级：有 `.gitignore` 就用它（`source:"fallback-gitignore"`），否则用内置默认模板（`source:"fallback-builtin"`），搜索照常进行；`.knorviaignore` 不存在时会**自动创建**（`source:"created-from-gitignore"` / `"created-from-template"`），创建失败也降级而不是让搜索失败。`transform`/`read` 侧的读失败一律 `catch` 成 `null` 后按「文件不存在」处理，不抛错。写入失败原样上抛。
- **时序与并发**：写盘走 `saveAtomically`：临时文件名为 `.<basename>.<pid>.<Date.now()>.<random>.tmp`、`open(..., "wx", 0o644)`、`handle.sync()` 后 `rename`，因此并发写不会产生半截文件，最后写入者胜；失败时关句柄并 `rm` 临时文件。
- **幂等**：`transform` 是纯函数（同一 `(rootPath, transform)` 在同一磁盘状态下输出一致）；`reset-defaults` 重复调用结果一致；`sync-gitignore` 重写同步段而不是无限追加。**资源释放**：临时文件句柄在 `finally` 中关闭。
- **平台差异**：忽略规则用 `ignore` 包按 gitignore 语法匹配，目录判定时给相对路径补尾部 `/`；相对路径在索引侧用 `/` 归一，Windows 反斜杠不会泄漏到规则里。**状态所有者**：工作区内的 `.knorviaignore` 文件（`workspaceFileIgnore.ts` 独占写入）。**日志**：`createServiceLogger("workspace-file-ignore")`——自动创建记 info，降级记 warn。
- **测试**：`tests/file-service.test.mjs` · `S42 工作区文件搜索索引与忽略规则（source）`

### B29 文件服务描述符与六个公开入口（`file/file.ts`、`file/fileService.ts`）

- **输入**：`IFileService` 描述符与 `createFileService()`。
- **输出**：`IFileService` 是 `ServiceChannels.File` 上唯一铸造的 descriptor 对象；实现面覆盖目录列举、`stat`、存在性检查、路径解析、工作区目录创建、文本切片、二进制判定、范围读取、媒体与二进制预览，以及 B27/B28 的搜索索引与忽略规则读写。所有方法都经 `workspacePath` + 可选 `workspaceIdentity` 定位工作区。
- **错误语义**：越出工作区根或数据根的路径立即拒绝；不存在的目标按各方法契约返回 `null`/空数组或抛底层 `ENOENT`（见 B21–B28），不静默造出空文件。
- **时序与并发**：读操作可并发；索引重建按 B27 的 TTL 与 LRU 串行化在同一键上。**幂等**：所有只读方法幂等；`createWorkspace*` 幂等复用已有目录（`created` 只在真实新建时为 true）。
- **资源释放**：每个方法自带 `finally` 关闭 fd 与目录句柄，不跨调用持有。**平台差异**：路径与大小写按平台原生语义，符号链接见 B23。**状态所有者**：文件系统 + B27 的索引缓存。**日志**：`createServiceLogger("workspace-file-ignore")`（忽略规则加载与自动创建）。
- **测试**：`tests/file-service.test.mjs` · `S31 IFileService 描述符与实现面（source）`

### B30 继承规范文档（`file/FILTER-SPEC-20261002.md`、`agent/STDERR-OWNER-SPEC-20261003.md`）

- **输入**：两份继承下来的规范文档。
- **输出**：`FILTER-SPEC-20261002.md` 记录 B28 的过滤规则取值与判定顺序，`STDERR-OWNER-SPEC-20261003.md` 记录 B45 的 stderr 归属与脱敏口径；两者随包保留，作为行为口径的旁证，不参与运行时。
- **错误语义**：无（纯文档）。**时序与并发**：无。**幂等**：纯读。**资源释放**：无。**平台差异**：无。**状态所有者**：无。**日志**：无。
- **测试**：`tests/surface.test.mjs` · `60 个继承文件：7 目录分布与三类分类计数`（文档计入 60 个继承文件的冻结快照）

---

## 六、Computer-Use 权限经纪服务（B31–B34）

### B31 CUA 准入代际与 Helper 安装（`cua-permission-broker/cuaAgentAdmissionGate.ts`、`cua-permission-broker/cuaHelperInstaller.ts`、`cua-permission-broker/cuaPermissionService.ts`）

- **输入**：`CuaAgentAdmissionGate.beginRecovery()` / `waitForSpawnAdmission({workspaceKey, workspacePath?, workspaceIdentity?, signal?})` / `commitRecovery(epoch)` / `failRecovery(epoch, error)`；`normalizeCuaHelperArch` / `normalizeCuaHelperArchs` / `canonicalizeCuaHelperInstallerOptions`。
- **输出**：恢复期外的 spawn 直接放行；`beginRecovery` 在途幂等复用同一 `epoch`（`activeEpoch` 已存在时原样返回），一次 `commitRecovery` 放行全部排队 waiter，`failRecovery` 用同一 reason 拒绝全部 waiter（非 `Error` 原因包成 `Error`）。架构归一：`amd64|x86_64|x64 → x64`、`aarch64|arm64 → arm64`，未知值只 trim；`normalizeCuaHelperArchs` 去重、剔空且不改入参。
- **错误语义**：陈旧 `epoch` 的 `commit`/`fail` 返回 `false` 且不碰 waiter；`signal` 已 abort 时 `waitForSpawnAdmission` 直接 reject（无 reason 用固定取消文案）并把 waiter 从队列摘除。`ICuaPermissionService` 的值谓词（`isCuaPermissionStatusAvailable`、`shouldRunCuaScreenCaptureProbe`）是 producer `@knorvia/cua/broker/ports` 的同一实现，省略 options 时不主动抓屏。
- **时序与并发**：waiter 集合按注册顺序遍历；`commit` 先清 `activeEpoch` 再放行，因此放行后的新 spawn 不会被再次排队。
- **幂等**：`beginRecovery` 幂等；重复 `commit`/`fail` 对同一 epoch 只生效一次。
- **资源释放**：`commit`/`fail` 都清空 waiter 集合且摘除 abort 监听。**平台差异**：无。**状态所有者**：`CuaAgentAdmissionGate`（`epochCounter`、`activeEpoch`、`waitingSpawns`）。**日志**：本模块不打日志，准入失败经 reject 上抛。
- **测试**：`tests/cua-permission-broker.test.mjs` · `S41 CuaAgentAdmissionGate recovery 代际所有权`、`S42 CuaAgentAdmissionGate spawn 准入语义`、`S43/S44 Helper 安装架构归一与 canonical 包装`、`S45/S46 权限与 PiP 服务描述符`

### B32 IPC Socket 通道与 Windows Helper 主机（`cua-permission-broker/windowsCuaDevHelperHost.ts`、`windowsCuaDevRuntime.ts`、`windowsCuaHelperHostSupport.ts`）

- **输入**：`BROKER_SOCKET_ENV` / `BROKER_UNAVAILABLE_ENV` 环境变量、`mintBrokerSocketPath` / `resolveBrokerSocketPath`；Windows 侧 `WindowsCuaHelperHost.start/waitForTransport/stop/restart` 与 `resolveWindowsCuaRuntime(options)`。
- **输出**：socket 路径由 producer `@knorvia/cua/broker` 铸造（POSIX unix socket / Windows named pipe），本包只做委托与常量再导出，跨平台断言只按 `basename`。Windows Helper 主机用单条 `lifecycleTail` 把每次 fork 串在前一代观测到的退出之后：`start()` 复用在飞 promise 且保留已发布的 transport 元组，`waitForTransport()` 有独立 30 s 预算，`stop/restart/restartAfterCurrentStartPreservingTransport` 共用同一条 tail。
- **错误语义**：`resolveWindowsCuaRuntime` 在非 `win32` 上**先**失败关闭、不触碰文件系统；dev 模式要求 `KNORVIA_CUA_DEV_ROOT` 绝对路径且 `@knorvia/cua` 的入口与 addon 是目录内、非符号链接的普通文件；打包模式读 `resources/tools/cua-helper/runtime-manifest.json`，要求键集精确、`platform/arch/electronVersion` 匹配、产物路径受目录约束且 sha256 命中。全部失败抛 `WindowsCuaDevRuntimeResolutionError` 且 `reason` 取自冻结枚举。终止阶梯在 shutdown→kill 两级有界等待后仍存活则抛 termination blocker，并让后续 `start` 中毒；`checkHealth` 在未运行时抛错。
- **时序与并发**：`lifecycleTail` 保证跨代 fork 不重叠；`parseReadyMessage` 把非对象判 `null`、未知 `type` 判 `ignore`、缺 `socketPath`/`pid` 判 `null`；`isExactHealthPid` 要求 health pid 与子进程 pid 完全相等。
- **幂等**：重复 `start()` 复用同一在飞 promise，不重复 fork；`stop()` 对已退出子进程安全返回。**资源释放**：`stop` 走完整终止阶梯并释放 transport；`dispose` 清理 tail 与监听。**平台差异**：整个 Windows Helper 面只在 `win32` 生效，非 Windows 一律失败关闭。**状态所有者**：Helper 主机进程与 `@knorvia/cua` producer（socket 路径事实）。**日志**：握手、health 与终止阶梯结果经 `createServiceLogger`。
- **测试**：`tests/cua-permission-broker-2.test.mjs` · `S49 Windows Helper 主机支持层纯判定`、`S50 WindowsCuaChildLifecycle 终止阶梯`、`S51 WindowsCuaHelperHost 启动握手`、`S52 WindowsCuaHelperHost transport 承诺与并发`、`S53 WindowsCuaHelperHost stop/restart 边界`、`S54 resolveWindowsCuaRuntime 平台门与开发根解析`、`S55 resolveWindowsCuaRuntime 打包模式与完整性`；`tests/cua-permission-broker.test.mjs` · `S56 socket 路径常量与铸造入口保持 producer 语义，跨平台只按 basename 断言`

### B33 PiP 串行投递与延迟重放（`cua-permission-broker/cuaPipSessionService.ts`、`agent/cuaOperationTurnTracker.ts`）

- **输入**：`createCuaPipSessionOwner(options, ports)` 的 `publish(event)` 事件序列与 `publishFocus`/`publishLifecycle`；`createCuaOperationTurnTracker` 消费的 `KnorviaComputerUseOperationEvent` 旁路事件。
- **输出**：所有投递串在一条 `tail` promise 上严格 FIFO；`turn-started` 在凭据未回时只保留**最后一笔** `pending`，凭据恢复后由下一个事件带动重放，或由 250 ms 重放定时器自行重投；重放截止期为 `Date.now() + 30_000`，超期则丢弃并留下带事件上下文的 warn。turn tracker 按 `eventId` 去重（上限 8192）、丢弃陈旧 `sequenceNumber`、退休 turn 键（上限 2048），只在 `tool-scheduled` 标记 `computerUse` 的调用收到 `tool-started` 时点亮活跃轮次。
- **错误语义**：`enabled=false` 时不解析凭据也不建客户端（`skipReason: "service-disabled"`）；已 dispose 时 `skipReason: "service-disposed"`；凭据缺失为 `credentials-unavailable`，`version_mismatch` 把该 socket 隔离到换 pipe 为止（`transport-disabled`）。`connect` 失败关闭客户端且不抛出。投递失败记 warn（带 `errorMessage`）后继续后续事件；**日志器本身抛错会沿 tail 传播**，`publish` 以同一错误 reject 且后续事件不再解析凭据。tracker 的 reporter/PiP 回调异常只记 warn，不打断会话事件链。
- **时序与并发**：同一 `socketPath` 复用客户端，换 socket 先关旧再建；挂起事件的重放同样排在 `tail` 之后，因此不会与在途投递交错。
- **幂等**：匹配的 `turn-ended` 与无 `turnId` 键的 `session-closed` 取消 pending；带 `turnId: undefined` 键的事件不误取消。**资源释放**：重放定时器 `unref()`，`dispose` 取消定时器；`dispose` 落在凭据等待期间时在途投递仍完成，后续事件记 `service-disposed`，再次 `dispose` 才释放客户端。**平台差异**：无。**状态所有者**：`cuaPipSessionOwner`（`current`、`quarantinedKey`、`tail`、`pending`、`replayDeadline`）。**日志**：`createLogger()` 缺省由 ports 提供，上下文走 `eventLogContext`，按级别分流。
- **测试**：`tests/cua-permission-broker.test.mjs` · `S47 PiP 客户端解析与凭据门`、`S48 PiP 串行投递与 turn-started 延迟重放`

### B34 子桶委托导出面（`cua-permission-broker/index.ts`）

- **输入**：子入口 `@knorvia/services/cua-permission-broker` 导入。
- **输出**：委托导出 `@knorvia/cua/broker` 的 producer 符号（含 `BROKER_SOCKET_ENV`、`BROKER_UNAVAILABLE_ENV`、`mintBrokerSocketPath`、`resolveBrokerSocketPath`、`CuaHelperError` 等）；本地实现（`WindowsCuaHelperHost`、`cuaPipSessionService` 等）经子桶再导出仍是**同一对象引用**，不在 services 侧留副本，也不复制 producer 逻辑。
- **错误语义**：缺少 `@knorvia/cua` 依赖立即导致模块链接失败。
- **时序与并发**：无。**幂等**：单例引用，多次导入得到同一对象。**资源释放**：无。**平台差异**：Windows Helper 符号在非 `win32` 上仍可导入，但调用即失败关闭。**状态所有者**：`cua-permission-broker/index.ts`。**日志**：无。
- **测试**：`tests/cua-permission-broker.test.mjs` · `S56 cua-permission-broker 子桶委托面`

---

## 七、Agent 进程管理与传输（B43–B52）

### B43 Agent 进程生命周期（`agent/agentProcessManager.ts`、`agent/agentPresentationSurface.ts`、`agent/agentSpawnCwd.ts`、`agent/stdioTapDevConfig.ts`）

- **输入**：`new KnorviaAgentProcessManager(options)` 后的 `getClient({ workspacePath, workspaceIdentity? })`；`options` 含 `commandResolver`、`presentationSurface`、`requestTimeoutMs`、`lane`、`idleTimeoutMs`、`spawnFallbackCwd`、`resolveSpawnEnv`、`waitForSpawnAdmission`、`processLifecycleReporter`。
- **输出**：`resolveDefaultKnorviaAgentCommand` 按「`KNORVIA_AGENT_SERVER_COMMAND` 显式覆盖 → 本仓库 bundled CLI 入口 → Electron runtime `knorvia.cjs` → 已部署 native binary」顺序给出 `{command,args,cwd,env,supportsStorageStartup}`；`presentationSurface==="desktop"` 时重写 `--surface desktop`（只消费非 option 的 value，孤立 `--surface` 不吞后续 `--stdio`）。`getClient` 按 `workspaceKey` 复用已有 client，启动中按 key 收敛为一次 spawn，`getExistingClient` 不隐式拉起进程。
- **错误语义**：`disposed` 后 `getClient` 抛 `agent process manager is disposed`；`getExistingClient` 空池返回 `undefined`，`getRuntimeIdentity` 抛错；`resolveSpawnEnv` 收到的上下文是 workspace 三元组，`command.env` 优先级低于 spawn env、身份 env 最高。
- **时序与并发**：每 workspaceKey 一条 `startingByWorkspaceKey` 启动 promise；`disposeWorkspace` 通过 `AbortController` 取消在飞启动（stale run 不得写回进程池）；`onSpawn` 先于 `onReady` 且绑定同一 `runtimeInstanceId`；reporter 回调抛错只记日志不阻断启动。
- **幂等**：`disposeAll` 之后再取 client 一律抛错；`disposeAllAndWait` 复用同一次回收 promise 并等进程树真正消失；`markReady` 同一 runtime 只上报一次。
- **资源释放**：退出/崩溃后退休池位并递增 generation，下次 `getClient` 透明重启；`idleTimeoutMs` 到期按 `expected/idle-timeout` 回收整棵进程树；请求超时按 `protocol-close` 回收。
- **平台差异**：`spawnFallbackCwd` 只在「默认 cwd 就是目标 workspace 且该目录不可用」时启用，业务 `workspaceKey` 不变；进程树信号与 `SIGKILL` 兜底由 `process/processTreeTerminator` 按平台实现。
- **状态所有者**：`agentProcessManager`（进程池、generation、lane、idle 定时器）。**日志**：spawn/exit/lifecycle 走 `createServiceLogger`，含 `workspaceKey` 与 `lane`；stdio tap 仅在开发态且 `dev/stdio-tap.json` 显式开启时旁路写盘。
- **测试**：`tests/agent-process.test.mjs` · `A34 getClient 启动、复用与并发串行化`、`A37 退出、崩溃与换代重启`、`A38 disposeWorkspace 取消在飞启动（stale run 防护）`、`A41 spawn cwd 兜底与失败可见性`、`A42 请求超时看门狗与空闲回收`；`tests/agent-surface.test.mjs` · `A14 Desktop 呈现面判定（agent/agentPresentationSurface.ts）`、`A24 spawn cwd 选择（agent/agentSpawnCwd.ts）`

### B44 Stdio 协议传输（`agent/stdioTransport.ts`、`agent/protocolClient.ts`、`agent/protocolTransport.ts`）

- **输入**：子进程 `stdout`/`stdin` 流与 `KnorviaProtocolMessage`；`KnorviaProtocolClient.send` 的请求（默认超时 180 000 ms）。
- **输出**：**只**按换行分帧（`JSON.stringify(message) + "\n"` 写出；读入按 `\n` 切分、剥尾随 `\r`、空行丢弃），每帧过 `knorviaProtocolMessageSchema.parse` 后经 `onMessage` 抛出；`id + result/error` 回填待决请求，`id + method` 走服务端请求发射器，其余按通知派发。
- **错误语义**：非法 JSON 或 schema 不符触发 `protocol_parse_error` 并 `publishClose`（首次原因留在退出轨迹的 `firstCleanupReason`）；`stdin`/`stdout` 错误分别以 `stdin_error:`/`stdout_error:` 关闭；已关闭/已 dispose/`child.killed`/stdin 不可写时 `send` 抛 `agent stdio transport is closed`；请求超时抛 `KnorviaProtocolRequestTimeoutError`。
- **时序与并发**：写入按回调串行 resolve；`storageStartup` 未 ready 前请求被门闩挂起；`publishClose` 只生效一次，transport 关闭时把所有待决请求以同一原因 reject 并触发 `onClose`。
- **幂等**：`dispose()` 重复调用直接返回；`disposeAndWait()` 复用同一次 `cleanupPromise`；关闭后到达的帧被丢弃。
- **资源释放**：`dispose` 先释放本地资源、以 3250 ms 上限等待 stderr 排空，再按 `ownedProcessGroupId` 终止整棵进程树；stdout 监听器在退出时摘除。
- **平台差异**：Windows 下 stderr 排空窗口取 `min(EXIT_STDERR_DRAIN_MS, windowsDeadlineAtMs - Date.now())`。**状态所有者**：`stdioTransport`（缓冲、decoder、closed 标志）与 `protocolClient`（请求账本）。**日志**：`agent-process-tree` scope 记录 cleanup 与协议错误。
- **测试**：`tests/agent-process.test.mjs` · `非法 stdout 帧触发 protocol-close 回收，并把首次 cleanup 原因留在退出轨迹里`、`A42 请求超时看门狗与空闲回收`

### B45 Stderr 采集与排空（`agent/agentStderrCollector.ts`）

- **输入**：子进程 stderr 可读流与可选 `onLine(line)` 回调。
- **输出**：用 `node:readline` 逐行读，原样把每行交给 `onLine`；对外只暴露**一个共享 drain promise** 与 `waitForDrain(timeoutMs = EXIT_STDERR_DRAIN_MS)`。`EXIT_STDERR_DRAIN_MS = 250`。
- **错误语义**：不抛错——readline `close`/`error`、input `error`/`close` 都归一到同一个 `complete()`，`complete()` 只生效一次。
- **时序与并发**：多次 `waitForDrain` 只在请求的绝对 deadline **严格早于**当前 deadline 时才替换定时器（取最早 deadline），返回的始终是同一个 promise 身份；input 已 `destroyed`/`readableEnded` 时构造即完成。
- **幂等**：`complete()` 重复调用为 no-op；`timer` 为真值时才 `clearTimeout`。
- **资源释放**：完成时清定时器、`reader.close()` 并 resolve drain；不销毁 input、不摘除上层监听、不发信号。
- **平台差异**：无（换行由 readline 归一）。**状态所有者**：`agentStderrCollector`（reader、drain promise、completed 标志、deadline、timer）。**日志**：本模块不打日志，只把行交给调用方（`stdioTransport` 侧做脱敏与尾窗）。
- **测试**：`tests/agent-process.test.mjs` · `非零退出码的崩溃被归为 unexpected，并带 stderr 尾窗与脱敏结果`、`结构化异常行走 onException 旁路且不进 stderr 尾窗，脱敏与限长后再上报`

### B46 存储就绪门闩（`agent/storageStartupGate.ts`）

- **输入**：`new KnorviaStorageStartupGate(required, firstStatusTimeoutMs = 30_000)`；`accept(input: unknown)` 收 CLI 上报的 `startup/storageState` 帧（`knorviaStorageStartupStateSchema`）。
- **输出**：`required=false` 时完全不设门（无定时器、`wait()` 立即返回）；`required=true` 时 `wait(signal?)` 阻塞到 `phase === "ready"`，`snapshot` 暴露最近一条上报，`onDidChange` 按帧序发事件。
- **错误语义**：schema 不通过、已 `rejection`、已到 `ready`/`failed`、`attemptId`/`databaseId` 变化或 `sequence` 不递增的帧一律 `accept` 返回 `false` 且不产生副作用；`failed` 帧（或缺少 `errorCode`）以 `SQLite startup failed: <code>` reject；首个状态超时以 `startup_status_timeout` 拒绝；`dispose` 时仍在等待则以 `transport_closed` 拒绝。
- **时序与并发**：一个进程尝试独占「观测事实 + 共享 completion + 首状态时钟」；合成失败时**先**发一条 `sequence + 1` 的 `failed` 事实，**再**保存错误并 reject 共享 completion；`wait(signal)` 用 `Promise.race` 响应 abort 并移除监听。
- **幂等**：`beginRecovery` 式的重复 `accept` 不重复 settle；`dispose` 后 `accept` 恒为 `false`。
- **资源释放**：`dispose` 清首状态定时器、拒绝未完成的 completion 并 `events.dispose()`；定时器 `unref()` 不阻止进程退出。
- **平台差异**：无。**状态所有者**：`storageStartupGate`（单条观测事实与共享 completion）。**日志**：本模块不打日志，失败原因经 `Error` 与 `onDidChange` 事实外传。
- **测试**：`tests/agent-process.test.mjs` · `A43 存储启动门闩上报`

### B47 V4 连接作用域与订阅归属（`agent/agentConnectionScope.ts`）

- **输入**：`createKnorviaAgentConnectionScope(base, {connectionId, clientMode, role?})`；`clientMode` 取 `"desktop-continuous"` 或 `"web-remote-replayable"`，`role` 取 `"trusted-host-relay"` 时跳过 hello/initialize 门。`connectionId` 必须非空、去空白后非空且长度 ≤ `MAX_DOWNSTREAM_CONNECTION_ID_LENGTH = 256`。
- **输出**：返回 `{service, setTransportFlowState, dispose}`。`service` 是 `IKnorviaAgentService` 的 facade：`helloConversationV4()` 由 facade **本地**合成 hello（`deliveryProfile` 为 `continuous`/`replayable`，`capabilities.nativeDialogs`/`localTerminal` 仅 continuous 为 true，`binaryFrames:false`、`compression:"none"`、`workspaceHookReview:true`、`independentPlanState:true`），不转发 base；`initializeConversationV4(clientHello)` 钉死 `clientId`；其余方法在转发前把调用方传入的 `__knorviaTrustedV4Connection`/`__knorviaTrustedV4UnsubscribeRoute` 与顶层 `connectionId`/`clientMode` **删除**，再注入 host 真值。
- **错误语义**：`fault.connection.invalidConnectionId`（构造期）、`fault.connection.handshakeRequired`（hello/initialize 之前调用订阅或查询）、`fault.connection.clientChanged`（initialize 换 `clientId`）、`fault.connection.closed`（dispose 之后一切入口）、`fault.command.clientMismatch`（command 的 `envelope.clientId` 与握手值不符）、`fault.command.queryForeignWorkspace`（query 绑定到另一个 workspace）、`fault.subscription.notOwned`（unsubscribe/resync 用了未登记的 `subscriptionId`）、`fault.subscription.runtimeRestarted`（ACK 期间 runtime 换代）、`fault.subscription.initialFrameStagingOverflow`（早帧暂存超限，整批清空而非 shift 最旧帧）。
- **时序与并发**：订阅在飞时同 topic 的早帧按到达顺序 stage，ACK 后按原序补投；同一 `(kind, workspace, topic)` 重复订阅会顶掉旧 owner，旧 `subscriptionId` 的帧与 unsubscribe 都不再命中。流控 `saturated` 只对已存在 route 下发且同 route 同 state 去重，`closed` 是终态（后续 `drained` 被忽略）；释放最后一个订阅时**先**发 `closed` **再** unsubscribe。relay 角色把自身与下游 `connectionId` 拼成 `relay:<len>:<up><len>:<down>` 的 opaque route key。
- **幂等**：`dispose()` 重复调用不产生新调用；`initialize` 同 `clientId` 重复调用放行；`unsubscribe` 对已 forget 的 id 是 no-op；重复 `saturated` 不重复下发。**资源释放**：`dispose()` 先入队 `closed`，再清空 owned/pending/routes 并逐个反向 unsubscribe，最后释放 lifecycle 监听。
- **平台差异**：无。**状态所有者**：`agentConnectionScope`（`owned` 订阅表、pending ownership 暂存、route 流控状态、`runtimeGenerationByWorkspaceKey`）；`MAX_PENDING_OWNERSHIP_FRAMES = 1024`、`MAX_PENDING_OWNERSHIP_BYTES = 32 MiB`。**日志**：无。
- **测试**：`tests/agent-connection-scope.test.mjs` · `A61 V4 attachment facade 握手门与可信连接注入`、`A62 订阅 ownership、早帧暂存与反订阅归属`、`A63 流控 SAT/DRN/closed 顺序与 dispose 回收`、`A64 runtime 换代失效与 query 的 workspace 绑定`

### B48 Host 侧 v4 命令信封与 CAS 收敛（`agent/v4HostCommand.ts`）

- **输入**：`createHostCommandEnvelope({type, payload, sessionId, commandId?, clientId?, baseRevision?, baseLogEpoch?})`、`assertV4CommandAckOk(commandType, ack, contextMessage)`、`sendHostCasCommandV4({send, type, payload, sessionId, contextMessage, maxAttempts?})`、`uuidv7(now?)`。
- **输出**：`uuidv7` 按 RFC 9562 生成 48-bit 毫秒时间戳 + 74-bit 随机（第 7 字节高半字节固定 `7`、第 9 字节高两位固定 `10`）；信封固定 `{commandId, clientId, sessionId, type, payload, issuedAt}`，`baseRevision`/`baseLogEpoch` 只在显式给值时出现；`clientId` 缺省用进程内稳定的 `host-services-<uuidv7>`；`assertV4CommandAckOk` 对 `accepted`/`duplicate`/`noop` 原样返回。
- **错误语义**：`COMMANDS_REQUIRING_BASE_REVISION` 里的命令缺 `baseRevision` 抛 `command <type> 是 CAS 命令，必须携带 baseRevision`；`ROW_TARGETING_COMMANDS` 里的命令缺 `baseLogEpoch` 抛 `command <type> 是 row target 命令，必须携带 baseLogEpoch`；`rejected`/`stale`/`failed` 抛 `KnorviaV4CommandRejectedError`（`code = "KNORVIA_V4_COMMAND_REJECTED"`，携带 `commandType`/`ack`），消息格式为 `v4 command <type> <status>[ (<reasonCode>)][: <message>] — <contextMessage>`。
- **时序与并发**：`sendHostCasCommandV4` 首发 `baseRevision = 0` 作探测，每次 `stale` 用 `ack.revisionAtDecision` 收敛重试、且**每次尝试换新 commandId**（stale 不进幂等表）；默认 `maxAttempts = 4`，用尽后抛 `KnorviaV4CommandRejectedError` 且 contextMessage 追加「（连续 stale，放弃重试）」。
- **幂等**：`duplicate`/`noop` 视为成功；CAS 重试链里 stale 不写幂等表，换 commandId 语义等价。**资源释放**：无。**平台差异**：无。**状态所有者**：`v4HostCommand`（进程内 `hostV4ClientId`）。**日志**：无。
- **测试**：`tests/v4-host-command.test.mjs` · `A65 uuidv7 与信封构造`、`A66 ACK 六态映射与 CAS 收敛`

### B49 模型调用轨迹读取（`agent/modelTrajectory.ts`、`agent/modelTrajectoryFileTail.ts`）

- **输入**：`readModelTrajectory(taskId, limit = 200)`；`readTrajectoryFileTail(filePath)`；`resolveModelIODirs()`；`sanitizeSessionSegment(value)`。
- **输出**：`resolveModelIODirs()` 回 `<dataRoot>/cli/{debug,rollout}` 两个目录；`sanitizeSessionSegment` 把非 `[a-zA-Z0-9_-]` 压成 `-`、剥首尾 `-`、截到 80 字符；`readTrajectoryFileTail` 只读文件末尾 `MAX_TRAJECTORY_READ_BYTES = 32 MiB`，截断时丢掉第一条不完整行并置 `truncated: true`；`readModelTrajectory` 只收 `type === "model_io"` 且 `sessionId === taskId` 的记录，按 `startedAt` 再按 `requestId` 排序，把 `messagesKind === "delta"` 的增量按 `messageOffset` 与前一条记录拼接还原，`truncated` 为「输入被截断 或 记录数超 `limit`」的或，超限时保留**最近** `limit` 条，`sourceFiles` 列出命中的文件。
- **错误语义**：目录 `readdir` 失败静默跳过（`continue`）；单文件读取失败只记 debug 后跳过，不使整次调用失败；非 JSON 行、非 `model_io`、`sessionId` 不匹配的行都跳过；`limit` 非有限数或 `<= 0` 回落 200。`callSource` 分类顺序是 `main_turn → main`、`subagent → subagent`、`compact` 或 `model.role === "compact" → compact`、其他 `querySource → sidecar`、`model.role === "subagent" → subagent`、兜底 `main`；系统提示以 `Generate a concise title for this coding session.` 开头的请求推断为 `session_title`。
- **时序与并发**：目录按 `resolveModelIODirs()` 顺序遍历，记录先全量收集再统一排序（不假设文件内已有序）。**幂等**：只读，同一磁盘状态输出稳定。**资源释放**：`readTrajectoryFileTail` 在 `finally` 里 `handle.close()`。
- **平台差异**：路径用 `node:path` 拼装；`sanitizeSessionSegment` 同时去掉 Windows 非法字符。**状态所有者**：文件系统（`model-io-<sanitized>.jsonl`）。**日志**：`createServiceLogger("model-trajectory")`，读取字节数/耗时/失败走 debug。
- **测试**：`tests/model-trajectory.test.mjs` · `A67 轨迹尾读与段名归一`、`A68 model-io 记录还原与 callSource 分类`

### B50 后台会话事件合并（`agent/sessionEventCoalescer.ts`）

- **输入**：`createBackgroundSessionEventCoalescer({emit, flushDelayMs = 1500, maxItems = 96})` 的 `accept(event)`/`flush()`/`dispose()`。
- **输出**：只有三类事件进合并表并带 key：`model.streaming` 且 `payload.kind` 为 `text_delta`/`reasoning_delta`/`tool_input_delta` 且 `delta` 是字符串（key 由 `type/sessionId/turnId/kind/inputId/assistantMessageId/toolCallId/parentToolUseId/parentToolCallId` 以 `\u0000` 拼成）、`tool.updated` 且 `payload.kind === "progress"`、`streamRecovery.updated`。同 key 的连续 `model.streaming` 把 `delta` 拼接（其余字段取最新），其他类型直接覆盖。非 `session.event` 或 key 为 `undefined` 的事件**先 flush 当前批次再立即 emit**，保持顺序。
- **错误语义**：不抛错——`emit` 抛出的异常不在本模块捕获（由调用方负责）。`disposed` 之后 `accept` 是 no-op。
- **时序与并发**：首次入表时起一个 `flushDelayMs` 定时器，到点整批按**插入序** emit；表长达到 `maxItems` 或 `flushDelayMs <= 0` 时立即 flush 且不再起定时器。
- **幂等**：`flush()` 清表并取消定时器，空表调用无副作用；`dispose()` 先 flush 再置 `disposed` 并取消定时器，重复调用无副作用。**资源释放**：定时器在 flush/dispose 时清除。
- **平台差异**：无。**状态所有者**：`sessionEventCoalescer`（pending 表、timer、disposed 标志）。**日志**：无。
- **测试**：`tests/session-event-coalescer.test.mjs` · `A69 合并键与 delta 拼接`、`A70 flush 边界与 dispose 幂等`

### B51 子 Agent 派生索引修复（`agent/repairSubagentTaskIndex.ts`）

- **输入**：`repairSubagentTaskIndex({target, visibleSessionIds, agentService, taskIndexRepo, isCurrent, onRemoved})`。
- **输出**：先 `listTaskMetas({...target, provider: KNORVIA_AGENT_PROVIDER})` 取本 workspace 全部任务行，筛出**不在** `visibleSessionIds` 里的 `taskId`，按 `IDENTITY_QUERY_BATCH_SIZE = 64` 分批用 `listSessions({sessionIds: batch, includeArchived: true, runtimePolicy: "existing-only"})` 回查权威身份。
- **错误语义**：只有同时满足「`sessionKind === "subagent_child"`」「`sessionId` 属于本批」「`resolveWorkspaceKey(session.workspace)` 与 target 相同」三条的会话才被判为可删除；缺失记录、跨身份结果、已失效订阅都**不**推断为可删除。`listSessions` 抛错直接上抛（旧 Agent 不支持参数时整次修复失败），不做静默跳过。
- **时序与并发**：每批之间与每条命中之后都检查 `isCurrent()`，失效即 `return`（不再继续写）。**幂等**：命中的行写 `patch: {deleted: true}`，重复执行收敛到同一状态。
- **资源释放**：无长驻句柄。**平台差异**：无。**状态所有者**：`taskIndexRepo`（派生索引）；本模块不删 Agent 转录。**日志**：无（`onRemoved` 由调用方决定是否广播）。
- **测试**：`tests/repair-subagent-task-index.test.mjs` · `A71 权威身份确认与批量边界`

### B52 Agent 服务组合根（`agent/agentService.ts`）

- **输入**：`createKnorviaAgentService(options?)`，`options` 含 `commandResolver`、`presentationSurface`、`requestTimeoutMs`、`resolveSpawnEnv`、`waitForSpawnAdmission`、`processLifecycleReporter`、`cuaOperationStateReporter`、`onCuaPipSessionLifecycle`、`mcpStatusIdleTimeoutMs`。
- **输出**：返回 `IKnorviaAgentService & {disposeAllAndWait(): Promise<void>}`。组合根装配**三个**独立的 `KnorviaAgentProcessManager`：主 lane（透传 `options`）、`mcp-status` lane（`MCP_STATUS_LANE_IDLE_TIMEOUT_MS = 5 * 60_000`，只带 `commandResolver`/`presentationSurface`/`processLifecycleReporter`/`requestTimeoutMs`/`resolveSpawnEnv`/`waitForSpawnAdmission`）与插件进程池；三者共享 workspace 路径但不共享请求队列或 watchdog。v4 订阅 route 以 `(connectionId, topic)` 为键，`connectionId` 是进程内 `host-<randomUUID()>`（一个 host 进程服务一个 renderer 窗口）；`onRuntimeRestarted` 时清掉该 workspaceKey 的 route 与 CUA turn tracker。
- **错误语义**：`disposed` 后的入口按各方法契约抛错（见 B43）；底层协议错误按 B44 的关闭语义上抛，不吞成成功。
- **时序与并发**：`disposeAllAndWait()` 用 `Promise.all` 并行等三个 process manager 的 `disposeAllAndWait()`，**全部到齐后**才关两个 SQLite repo 并 `disposeLocalState()`；`disposeAll()` 是同步版，同一顺序但不等待进程树。**幂等**：`disposeAll`/`disposeAllAndWait` 幂等（进程池自身的幂等语义见 B43）；重复调用不会重复关 repo。
- **资源释放**：关闭三个 process manager、`AutomationRepo` 与 `TaskIndexRepo` 的 SQLite 连接、各 emitter 与 WeakMap 里登记的 client 监听。
- **平台差异**：CUA 相关 reporter 只在 desktop 注入，其余平台走无 CUA 分支。**状态所有者**：`agentService`（会话镜像、pending 权限/输入、订阅 route、序列状态）。**日志**：`createServiceLogger` 的多个 scope，生命周期走 info、协议诊断走 debug。
- **测试**：`tests/agent-service-composition.test.mjs` · `A72 组合根三进程池与 disposeAllAndWait 幂等`

---

## 八、Task 适配与任务索引（B53–B67）

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
- **测试**：`tests/task-service-adapter.test.mjs` · `A52 普通创建走 createSession，同步 task index、置顶分组并广播 task_created`、`A52 draft session 复用：模型与思考档位按 UI 当前选择对齐`

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
- **测试**：`tests/task-service-adapter.test.mjs` · `A514 Claude 原生导入面走导入仓库，扫描参数不携带 workspaceIdentity`

### B64 任务索引同步器装配（`agent/taskIndexSyncer.ts`）

- **输入**：`createKnorviaTaskIndexSyncer({agentService, taskIndexRepo})`，以及 `ensureWorkspaceSubscription(target)`、`ensureSessionSubscription(target, {includeSnapshot?})`、`syncSnapshotAndBroadcast(snapshot, options)`、`syncTaskModel(target, model)`、`emitWorkspaceTaskListChanged(...)`、`getWorkspaceEmitter(workspace)`、`onDynamicWorkspaceEvent(workspace)`、`onSessionTerminalEvent`、`onSessionReadyEvent`、`disposeAll()`。
- **输出**：每个 `workspaceKey`（`resolveWorkspaceKey`）一个 `WorkspaceOwner`，内含两条**独立**的 topic ingest：`sessions-index`（`topic = sessions-index/<workspaceKey>`）与 `workspace-config`（`workspace-config/<workspaceKey>`），都带 `visibility:"background"`、`subscriberScope:"task-index"`、`runtimePolicy:"existing-only"`。两个 topic 在同一同步入口启动、各自独立代际，sibling 的 ACK 不受另一个 topic 重试影响。`workspace-config` 的 apply 在 `configOptions` 为空时**直接返回**（空种子目录不清除 UI 现有模型选项），非空时 `fire({type:"workspace_config_options_update", ...})`。
- **错误语义**：`disposed` 或 `target.workspacePath` 为空时 `ensureWorkspaceSubscription` 直接返回；已存在的 workspaceKey 不重建。`agentService.onAgentRuntimeLifecycle` 缺失时退回 `onAgentRuntimeRestarted`（只重启不失效）；两者都缺失时 `lifecycleAware = false` 且创建即启动。`disposeAll` 里单个 listener 的 `dispose()` 抛错被吞掉，其余资源照常释放。
- **时序与并发**：`available` 表记 `workspaceKey → generation`；`unavailable` 且 generation 匹配时把 `runtimeGeneration` 置 null、两条 ingest 各 `reset(false)` 并清 assembly 定时器（**不**反向 unsubscribe）；`available` 且 generation 变化时 `start(workspace, "runtime-restart")`。`scheduleAssembly` 取两条 ingest 的 `nextExpiryAt` 最小值起一个 `unref()` 定时器，到点各自 `expire(now)` 后重排。
- **幂等**：`ensureWorkspaceSubscription` 对同一 key 重复调用只建一次；`getWorkspaceEmitter` 对同一 key 复用同一 emitter；`syncTaskModel` 对 `model.trim()` 为空返回 `null` 且不写盘。**资源释放**：`disposeAll()` 对每个 workspace 的两条 ingest 各 `reset(true)`、清定时器、逐个 `dispose()` listener（单个抛错不阻断），再清 `workspaces`/`emitters`/`available` 并 dispose 三个 emitter 与 lifecycle 订阅。
- **平台差异**：无。**状态所有者**：`taskIndexSyncer`（`workspaces`、`emitters`、`available`、terminal/ready emitter）。**日志**：`createServiceLogger` 的 `task-index` scope；`emitWorkspaceTaskListChanged` 打 `[list-refresh-trace]` debug。
- **测试**：`tests/task-index-syncer.test.mjs` · `A73 workspace 订阅与双 topic 独立代际`、`A74 runtime 生命周期失效与 disposeAll 资源收口`

### B65 会话索引投影与子 Agent 派生行（`agent/task-index-ingestion/sessionIndexProjection.ts`）

- **输入**：`createSessionIndexProjection({target, agent, repo, logger, emit, sync, terminal, captureGenerationGuard})` 的 `apply(frame)`。
- **输出**：`sessions-index` 的 snapshot/delta 帧被投影成 `taskIndexRepo` 的行写入与 `workspace_task_list_changed` 广播；`terminal(target, summary)` 在会话进入终态时按 `summary.phase === "error"` 分流成 `turn.failed`/`turn.completed` 与 `prompt_failed`/`prompt_completed`。`subagent_child` 会话**不**进主列表，只作为派生索引行处理。
- **错误语义**：`captureGenerationGuard()` 返回的闭包在每次写入前校验「workspace 仍 live 且 ingest generation 未变」，失效即停写（不写入过期代际的数据）。repo 抛错向上传播，由 ingest 的 recovery 处理，不吞成成功。
- **时序与并发**：写入按帧到达顺序串行 `await`；每批 identity 回查（B51）在批间与每条命中后都检查 guard。
- **幂等**：同一 snapshot 重复投影收敛到同一行状态；delta 按 `toSeq` 单调推进（由 B66 的 ingest 保证）。**资源释放**：无长驻句柄。
- **平台差异**：无。**状态所有者**：`taskIndexRepo`（`tasks-index.sqlite`）。**日志**：`task-index` scope，失败走 warn。
- **测试**：`tests/task-index-syncer.test.mjs` · `A75 会话帧投影与终态分流`

### B66 Topic 摄入类型契约与订阅代际（`agent/task-index-ingestion/topicTypes.ts`）

- **输入**：`TopicIngest`（`generation`、`nextExpiryAt`、`receive(wire)`、`expire(now)`、`subscribe(reason, unsubscribeActive)`、`reset(unsubscribeActive)`）、`TopicOwnership`（`generation`/`subscription`/`epoch`/`sequence`/`hasBase`/`flight`）、`TopicPorts<F>`、`RecoveryFlight`、`LogicalTopicFrame`，以及联合类型 `Delivery = "initial" | "online" | "recovery"`、`TopicKind = "sessions-index" | "workspace-config"`、`SubscriptionReason`（`initial`/`runtime-restart`/`snapshot-recovery-gap`/`recovery-frame-timeout`/`resync-ack-mismatch`/`resync-failed`/`force-recovery-gap`/`pre-ack-overflow`/`provider-not-ready-wait`/`retry`）。
- **输出**：这些类型是 `taskIndexSyncer`（B64）与两条 topic ingest 之间**唯一**的契约面：`generation` 单调递增，每次 `subscribe` 前自增；`subscription` 为 `null` 表示「尚未拿到 ACK」；`hasBase` 为 false 时任何 delta 都进 recovery 而不是被投影。`Delivery` 决定同一帧的投影语义：`online` 在已有 base 且 `toSeq <= sequence` 时被丢弃，`recovery` 则视为可接受的重放。
- **错误语义**：类型面本身不抛错；语义由实现方保证——`SubscriptionReason` 的取值是日志与恢复路径的唯一分流键，新增取值必须同时改这里与 `taskIndexSyncer` 的调用点，否则编译失败。
- **时序与并发**：`nextExpiryAt` 是「装配器里最早到期的物理帧」的绝对毫秒时间戳，`taskIndexSyncer` 用它起一个 `unref()` 定时器驱动 `expire(now)`；`generation` 的变化是唯一的「旧回调作废」信号。
- **幂等**：`receive` 对 `topic` 不匹配或 `subscriptionId` 不匹配的帧是 no-op；`expire` 对同一时刻重复调用无副作用。**资源释放**：类型面不持有资源，定时器与订阅由 `reset(unsubscribeActive)` 的调用方负责。
- **平台差异**：无。**状态所有者**：实现方（每个实例独占一个 workspace 的一个 topic）。**日志**：`IngestLogger = ReturnType<typeof createServiceLogger>`，由实现方注入。
- **测试**：`tests/task-index-syncer.test.mjs` · `两条 topic 的 ACK 互不阻塞：config 慢不影响 index 的初始帧`、`runtime-restart 换 subscriptionId 后，旧订阅号的帧被丢弃`

### B67 快照投影与模型写回（`agent/task-index-ingestion/snapshotProjection.ts`）

- **输入**：`projectSnapshotMeta(snapshot, options)`、`projectSnapshotSearchText(snapshot)`、`createSnapshotProjection(repo, emit, logger)` 的 `sync(snapshot, options)` 与 `model(target, model)`。
- **输出**：`projectSnapshotMeta` 把会话快照投影成 `KnorviaTaskMeta`（`taskId` 取 `session.sessionId`、`traceId` 缺省用 `generateTraceId(sessionId)`、标题经 `resolveKnorviaVisibleSessionTitle`、`model` 优先用 `options.modelOverride?.trim()` 否则 `formatTaskMetaModelSelectionFromSnapshot`、`thoughtLevel` 同理）；`projectSnapshotSearchText` 只收用户可见消息、按换行连接、总长上限 200 000 字符（先累计正文长度再截断最终值）。`sync` 在 `subagent_child` 上**只**返回 meta、不写 repo 不广播；`moveGroupedTaskToTop` 时走 `syncTaskMetaAtGroupedTop` 并据 `initializedGroupedOrder` 把广播 reason 改成 `task_created`；不可见快照仍入库，但只在 `initializedGroupedOrder` 时发一条 `task_created`（不带 meta）。
- **错误语义**：`model(target, model)` 对空串返回 `null` 不写盘；repo 同步抛错与异步 reject 都走同一个 `decline` 分支，记 warn 后返回 `null`（模型同步失败不阻断会话流程）。
- **时序与并发**：`sync` 串行 await repo；`model` 只发单字段 patch，不进入快照/广播写入路径。**幂等**：同一快照重复 `sync` 收敛到同一行；同一 model 重复写等价。
- **资源释放**：无。**平台差异**：无。**状态所有者**：`taskIndexRepo`。**日志**：`task-index` scope，模型同步失败 warn。
- **测试**：`tests/task-index-syncer.test.mjs` · `A78 快照投影、搜索文本预算与模型写回`

---

## 八之二、能力探测、广播与 CUA 运行时（B68–B73）

### B68 Agent 参数族与能力探测（`agent/agentPluginParams.ts`、`agent/agentWorkflowParams.ts`、`agent/independentPlanSupport.ts`、`agent/pluginReferenceCatalogRequest.ts`）

- **输入**：`agentPluginParams.ts` 的 `KnorviaAgentPluginTarget`/`KnorviaAgentWorkspaceTarget` 等纯类型族；`agentWorkflowParams.ts` 的 saved-workflow 目标 union；`probeIndependentPlanSupport(client)`；`requestPluginReferenceCatalog(client, params)`。
- **输出**：两个参数族模块**没有运行时导出**（只有 `export type`/`export interface`），只在类型层贡献声明；它们的值只在调用方按「字段存在才透传」的方式组装请求时出现——`workspaceIdentity`/`remoteSessionId` 为 `undefined` 时该键**缺席**而不是传 `undefined`。`probeIndependentPlanSupport` 对同一 client 只发一次 `runtime/capabilities`，成功判定与 client 收到的 schema 同源；执行端未确认 Plan 能力时清缓存，下一次调用重新探测。`requestPluginReferenceCatalog` 先走新入口，只有 `-32601` 才回落旧入口，两次共用同一严格 schema。
- **错误语义**：`probeIndependentPlanSupport` 的失败带 `cause` 上抛；`requestPluginReferenceCatalog` 对非 `-32601` 的错误原样抛出，不吞成空目录。
- **时序与并发**：能力探测按 client 去重（并发调用共享同一在飞 promise），失败后清缓存。**幂等**：探测成功后可无限次复用；catalog 回落对同一参数确定。
- **资源释放**：无长驻句柄。**平台差异**：无。**状态所有者**：探测结果缓存在模块级 WeakMap（按 client 实例）。**日志**：无。
- **测试**：`tests/agent-surface.test.mjs` · `A15 workspace 目标参数族（agent/agentPluginParams.ts）`、`A16 saved-workflow 目标 union（agent/agentWorkflowParams.ts）`、`A22 独立 Plan 支持探测（agent/independentPlanSupport.ts）`、`A30 plugin 引用 catalog 回落（agent/pluginReferenceCatalogRequest.ts）`

### B69 浏览器 ambient 只读采集（`agent/agentBrowserAmbientContext.ts`）

- **输入**：`collectBrowserAmbientContext(executor | undefined, target)`；`target` 含 `sessionId`、`workspacePath`、可选 `workspaceIdentity`/`remoteSessionId`/`clientMode`。
- **输出**：回 `{tabCount, currentUrl?}` 或 `undefined`。`executor` 缺失直接 `undefined`（不构造请求）；没有 `iab` 后端时**不执行任何命令**；受控 tab 与用户 tab 按 id 去重计数，`currentUrl` 按「活跃受控 tab → 用户首个 tab → 受控最后一个 tab」取值；`workspaceKey` 用 `identity?.trim() || workspacePath`；每个 `requestId` 都是新 `randomUUID()`。
- **错误语义**：任何异常（`list` 抛错、schema 解析失败、命令 `ok:false`）都收敛成 `undefined`，**不**让浏览器 UI 状态阻断真实 prompt；单侧 `execute` 失败不影响另一侧（`Promise.allSettled`）。
- **时序与并发**：`list` 先串行完成，再并行发 `list` 与 `listUserTabs` 两条命令。**幂等**：只读，无副作用。
- **资源释放**：无。**平台差异**：`about:`/`http:`/`https:` 之外的协议一律丢弃 `currentUrl`。**状态所有者**：无（不缓存）。**日志**：无。
- **测试**：`tests/agent-surface.test.mjs` · `A26 浏览器 ambient 只读采集（agent/agentBrowserAmbientContext.ts）`

### B70 automation 工具策略（`agent/automationToolPolicy.ts`）

- **输入**：`mergeAutomationToolDenylist(...)` 与按轮次给出 denylist 的入口（普通轮 / 闲时轮）。
- **输出**：合并后的 denylist：保留调用方条目、去重、**不改写输入数组**；闲时轮只 deny `OffPeakCreate`，cron 名单不与之互相污染；普通轮保留 automation 工具。
- **错误语义**：无（纯函数）。**时序与并发**：无。**幂等**：同一输入重复调用结果一致且输入数组不变。
- **资源释放**：无。**平台差异**：无。**状态所有者**：无。**日志**：无。
- **测试**：`tests/agent-surface.test.mjs` · `A20 automation 工具策略（agent/automationToolPolicy.ts）`

### B71 广播服务描述符与本地 claim 表（`broadcast/broadcast.ts`）

- **输入**：`IBroadcastService` 描述符与 `createBroadcastService()`。
- **输出**：`IBroadcastService` 在 `ServiceChannels.Broadcast` 上唯一铸造，`channelName` 冻结为 `broadcast`；无 `parentPort` 的实例提供六个方法与本地 claim 表（`claim`/`commit`/`release` 等）。
- **错误语义**：入站 envelope 不合 schema 时不投递（不抛错）；越界字段被剥离；`claim` 在预算内无响应时回 `unavailable`，畸形响应不提前定论。
- **时序与并发**：本地回声早于上行 `post`（重入顺序）；同步重入的响应（`postMessage` 内直接回信）能正常定论，重复响应不再动作。**幂等**：`release` 用正确 token 才归还名额；`commit` 后 `release` 是 no-op 并进入 committed 终态。
- **资源释放**：无长驻句柄；claim 表按最早占用挤出（有界保留）。**平台差异**：无。**状态所有者**：`broadcast`（本地 claim 表）。**日志**：无。
- **测试**：`tests/credential-broadcast-2.test.mjs` · `S20 广播 descriptor 与服务面（broadcast/broadcast.ts）`、`S21 send 上行（broadcast/broadcastService.ts）`、`S24 本地 claim 表的有界保留（broadcast/broadcastService.ts）`

### B72 工作区文件搜索打分（`file/workspaceFileSearch.ts`）

- **输入**：`buildHostFileSearchCandidates(packed, rootPath)`、`searchHostFileCandidates(candidates, query, limit)`。
- **输出**：候选按 128 000 字符边界分块解码（每块后 `setImmediate` 让出）；搜索按名字 / 相对路径 / 绝对路径三档打分，同分保持原索引顺序；结果只保留 `{name, path, relativePath, type}` 四键。
- **错误语义**：`limit` 已由 B27 在入口夹紧，这里不再二次校验；空 query 返回全部候选（不做「空即空结果」）。
- **时序与并发**：top-K 按 2048 条一批合并，批间 `setImmediate`，不阻塞事件循环。**幂等**：纯函数，同一候选表与 query 输出稳定。
- **资源释放**：无。**平台差异**：无。**状态所有者**：无（候选表由 B27 的索引缓存持有）。**日志**：无。
- **测试**：`tests/file-service.test.mjs` · `S42 工作区文件搜索索引与忽略规则（source）`

### B73 CUA PiP 会话与 Windows 运行时装配（`cua-permission-broker/cuaPipSession.ts`、`windowsCuaHelperHostSupport.ts`、`windowsCuaDevRuntime.ts`）

- **输入**：`createCuaPipSessionOwner(ports)`；`parseReadyMessage`/`isExactHealthPid`/`asError` 等纯判定；`resolveWindowsCuaRuntime(options)`。
- **输出**：PiP 会话 owner 消费注入 ports（缺省 logger 由 `createLogger` 提供，日志上下文走 `eventLogContext`），对同一 `socketPath` 复用客户端、换 socket 先关旧再建；`enabled=false` 时不解析凭据也不建客户端。Helper 支持层把非本协议与未来新增类型判 `ignore`、非对象判 `null`，`ready`/`transport_ready` 必须带非空 `socketPath` 与正整数 `pid`，输出只保留四个字段；`isExactHealthPid` 只接受与子进程 PID 相同的正整数。`resolveWindowsCuaRuntime` 在非 `win32` 平台**触碰文件系统之前**就拒绝，显式开发根优先于安装资源，打包模式只读 `resources/tools/cua-helper` 并按清单逐字段校验 `sha256`。
- **错误语义**：`connect` 失败关闭客户端且**不抛出**；`version_mismatch` 隔离该 socket 直到换 pipe；`dispose` 落在凭据等待期间时在途投递仍完成，后续事件记 `service-disposed`。开发根配置成相对路径时 fail closed 而不回退资源目录；`package.json` 契约必须点名 `@knorvia/cua` 并给出 `entry`/`nativeAddon`，否则统一 `invalid-package`；越界或绝对写法判 `invalid-artifact-path`；产物字节与清单不符时按 `artifact-integrity-mismatch` 失败并指出是哪一项。
- **时序与并发**：PiP 的 `tail` 串行化——凭据未回时排队的事件按提交顺序落在同一客户端；`turn-started` 重放定时器 250 ms 后自行重投，超过 30 s 截止后过期丢弃并留 warn。**幂等**：`dispose` 重复调用才释放客户端（第一次只置标记）；同一 `socketPath` 重复解析复用同一客户端。
- **资源释放**：PiP owner 在 `dispose` 时释放客户端；Windows 主机在终止阶梯（shutdown → 超时 kill → 仍不退出则抛终止阻塞）后收口。**平台差异**：Windows 专用路径与 `C:\` 形式开发根；非 Windows 主机也接受按 Windows 路径语义解析产物。
- **状态所有者**：`cuaPipSession`（按 socketPath 的客户端表与 pending 重放队列）；`windowsCuaHelperHostSupport`（无状态纯函数）。**日志**：`eventLogContext` 承载事件上下文，诊断按级别分流（warn/error 各归其位）。
- **测试**：`tests/cua-permission-broker.test.mjs` · `S47 createCuaPipSessionOwner 消费注入 ports：缺省 logger 由 createLogger 提供，日志上下文走 eventLogContext`、`S48 重放定时器在 250ms 后自行重投挂起的 turn-started`；`tests/cua-permission-broker-2.test.mjs` · `S49 parseReadyMessage 把非本协议与未来新增类型判为 ignore，非对象判为 null`、`S54 非 win32 平台在触碰文件系统前就拒绝，Linux/darwin 走同一诊断`、`S55 产物字节与清单 sha256 不符时按 artifact-integrity-mismatch 失败并指出是哪一项`

---

## 九、语义常量与错误码冻结表

| 标识符 / 常量                                          | 冻结值                                        | 所属模块                                           | 说明                       |
| :----------------------------------------------------- | :-------------------------------------------- | :------------------------------------------------- | :------------------------- |
| `KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE`               | `"KNORVIA_AGENT_RUNTIME_UNAVAILABLE"`         | `agent/agent.ts`                                   | Agent 运行时不可用错误码   |
| `KNORVIA_AGENT_MCP_STATUS_MODE_UNSUPPORTED_ERROR_CODE` | `"KNORVIA_AGENT_MCP_STATUS_MODE_UNSUPPORTED"` | `agent/agentErrors.ts`                             | MCP status-only 缺失错误码 |
| `ENCRYPTED_VALUE_PREFIX`                               | `"enc:v1:"`                                   | `credential/providers/credentialCipherProvider.ts` | 凭据密文版本前缀（模块内） |
| `BROKER_SOCKET_ENV`                                    | `"KNORVIA_CUA_PERMISSION_BROKER_SOCKET"`      | `cua-permission-broker/index.ts`                   | CUA Broker 通信环境变量    |
| `BROKER_UNAVAILABLE_ENV`                               | `"KNORVIA_CUA_PERMISSION_BROKER_UNAVAILABLE"` | `cua-permission-broker/index.ts`                   | CUA Broker 不可用标记变量  |
| `MODEL_CONFIG_ID` / `MODE_CONFIG_ID`                   | `"model"` / `"mode"`                          | `agent/configOptions.ts`                           | 模型与模式配置项标识       |
| `THOUGHT_LEVEL_CONFIG_ID`                              | `"thought_level"`                             | `agent/configOptions.ts`                           | 思考档位配置项标识         |
| `EXIT_STDERR_DRAIN_MS`                                 | `250`                                         | `agent/agentStderrCollector.ts`                    | 退出时 stderr 排空上限毫秒 |
