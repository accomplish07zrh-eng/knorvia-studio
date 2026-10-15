# shared-01 行为规格（v1）

范围：`packages/shared/src/node/**`（6 个继承文件）与 `packages/shared/src/protocol-v4/**`（21 个继承文件），
共 **27 个继承文件**（清单见 `scope-files.json`）。编号发布后不重用；每条行为在 README 的「条目 → 测试」
对照表里至少有一个断言。

黑盒入口只有两个（`packages/shared/package.json` exports）：

| 入口                          | 源文件                                     | dist 文件（`tsc -b packages/shared` 产物）  |
| ----------------------------- | ------------------------------------------ | ------------------------------------------- |
| `@knorvia/shared/node`        | `packages/shared/src/node.ts`              | `packages/shared/dist/node.js`              |
| `@knorvia/shared/protocol-v4` | `packages/shared/src/protocol-v4/index.ts` | `packages/shared/dist/protocol-v4/index.js` |

通用约定（适用于所有条目，条目内不再重复）：

- **时序与并发**：全部为纯函数或短 IO，没有长驻定时器、没有后台任务；异步只发生在单次文件系统调用内。
- **幂等**：纯函数天然幂等；文件改写类条目单独写明「再跑一次」的结果。
- **资源释放**：无句柄、无监听器、无连接需要释放；文件锁与临时文件的释放写在对应条目。
- **日志级别**：本包**不写日志**（无 logger 调用），需要观测的错误一律以返回值或抛错交给调用方；这是全包统一口径。
- **平台差异**：涉及路径的条目必须在 Windows 与 POSIX 同时成立（分隔符、大小写、换行、权限位的差异写在条目里）。
- **状态所有者**：除非条目另有说明，模块是**无状态**的：状态归调用方（会话投影、CLI 服务、renderer store）所有，本包只做换算/校验/编解码。

---

## 一、node：文件锁与私有文件持久化（B1–B7）

**B1 文件锁：获取、所有权校验与释放**（`node/atomicFileLock.ts`）
输入：`acquireFileLock(filePath, retryDelaysMs, ownerlessGraceMs, maxWaitMs)`。
输出：成功时返回 `() => Promise<void>` 释放函数；锁实体是目录 `<filePath>.lock`，内含唯一
`owner-<token>.json`（JSON 行：`pid`、`createdAt`、`token`，尾随换行）。释放函数先删 owner 文件再删锁目录。
错误语义：创建锁目录后若锁目录实例（dev/ino）或 owner 列表变化（并发竞争），按「未取得」处理并进入等待重试；
`mkdir`/`writeFile` 的非 `EEXIST`、非「自己刚建的锁又丢了」错误原样抛出。
时序与并发：同一路径互斥；等待期间按 `retryDelaysMs` 逐次退避（超出数组长度后重复末项）。
幂等：释放函数可重复调用，第二次安静无副作用。
资源释放：释放后锁目录与 owner 文件均不存在；异常路径也保证不遗留自己创建的锁。
平台差异：锁目录与 owner 文件命名规则两平台一致；`process.kill(pid, 0)` 探活在两平台都按 `ESRCH` 判死。
状态所有者：锁实体在文件系统，进程内不持有跨调用状态。

**B2 文件锁：互斥等待与超时错误形态**（`node/atomicFileLock.ts`）
输入：锁被占用时再次 `acquireFileLock`，`maxWaitMs` 到点仍未取得。
输出：抛出 `Error`，`message` 为 `Timed out after <已等毫秒>ms waiting for the Knorvia Studio file lock: <锁路径>`；
`code = "KNORVIA_FILE_LOCK_TIMEOUT"`、`path = filePath`、`syscall = "mkdir"`、`cause` 为最后一次获取失败的错误。
错误语义：最近一次**清理尝试**的错误若是 `EACCES`/`EPERM`，改为抛那个权限错误本身（不包装）。
时序与并发：`elapsed >= maxWaitMs` 才放弃；等待次数不限，退避序列见 B1。
幂等：超时抛错后不留锁（自己建的锁已回滚）。
资源释放：同 B1。
平台差异：错误 `code`/`path`/`syscall` 字段在两平台一致（Windows 上 EPERM 语义相同）。
状态所有者：无。

**B3 文件锁：遗弃锁回收**（`node/atomicFileLock.ts`）
输入：锁目录/锁文件已存在且不可获取时的回收判定；owner 元数据 `pid`、`createdAt`，回收等待 `ownerlessGraceMs`（实际生效值被钳到 `min(ownerlessGraceMs, floor(maxWaitMs/2))` 且不小于 0）。
输出：可回收时删除遗弃锁并重试获取；不可回收时继续等待。锁实体两种形态都支持：**目录**（含 0..n 个 `owner-*.json`）与**普通文件**（内容即 owner 元数据）。
错误语义：删除过程中 `ENOENT`/`ENOTEMPTY` 视作「没删成、不报错」；其他错误记为清理错误（可能在超时点抛出）。
时序与并发：owner 元数据 `pid` 为正整数且该进程已死（`process.kill` 报 `ESRCH`）→ 可回收；`pid` 缺失/非法 → 按「无主」处理，只有当观测时间 − 建锁时间 ≥ 生效 grace 才可回收；单 owner 目录只回收该 owner，多 owner 目录要求目录本身过期且**每个** owner 都可回收才整体删除。普通文件形态删除前复读内容，内容变了则放弃（防与新持有者竞争）。
幂等：回收判定不修改不可回收的锁。
资源释放：回收后锁目录/文件与 owner 文件全部消失。
平台差异：`mtimeMs`/`ino`/`dev` 取值两平台均可用于同一判定；路径含空格/非 ASCII 时同样成立。
状态所有者：锁实体在文件系统。

**B4 文件锁：元数据承认规则**（`node/atomicFileLock.ts`）
输入：owner 元数据 JSON（可能损坏、字段非法、时间戳超前）。
输出：`createdAt` 只承认「有限、非负、且不超过观测时刻 + 5 分钟」的时间戳，其余按缺席处理（回退到文件 mtime，再回退到「锁实例首次观测时刻」）；`pid` 只承认正的安全整数。
错误语义：JSON 解析失败的元数据按全缺席处理，不抛错。
时序与并发：锁实例被替换（dev/ino/birthtime/mtime 任一变化）后，「首次观测时刻」重新起算，不继承旧锁的等待时长。
幂等：纯读判定。
资源释放：不适用。
平台差异：非法时间戳判定与文件时间精度差异在两平台一致（按毫秒数比较，容许文件系统时间精度差异）。
状态所有者：锁实例观测表在单次 `acquireFileLock` 调用内，调用结束即丢弃。

**B5 文件锁包装：串行化与透传**（`node/privateFilePersistence.ts` 的 `withFileLock`）
输入：`withFileLock(filePath, operation, options?)`。
输出：`operation` 的返回值原样返回。
错误语义：`operation` 抛错原样向外抛；获取锁失败的错误按 B2 形态抛出。
时序与并发：**同一 `filePath` 的并发调用在进程内严格串行**——事件顺序恒为 `enter(1) → exit(1) → enter(2) → exit(2)`，两个 operation 的执行区间不重叠；不同路径互不影响。进入 operation 前递归创建 `dirname(filePath)`。
幂等：调用幂等由 `operation` 自己决定；包装层保证锁的获取/释放成对。
资源释放：无论 operation 成败，锁都会释放，进程内排队令牌随后继者接管并在尾部清理。
平台差异：`filePath` 用 `/` 或 `\` 分隔在两平台都能落到同一文件（Windows 两种分隔符都接受）。
状态所有者：进程内同路径排队表由 `withFileLock` 私有持有；跨进程互斥由 B1 的锁目录负责。

**B6 原子写：`atomicWritePrivateTextFile`**（`node/privateFilePersistence.ts`）
输入：`atomicWritePrivateTextFile(filePath, content, renameRetryDelaysMs?)`。
输出：写完后 `filePath` 的内容逐字节等于 `content`（utf-8）。
错误语义：写入或改名失败时删除临时文件后原样抛错；改名失败若是 `EPERM`/`EBUSY`/`EACCES` 按 `renameRetryDelaysMs` 重试（超出数组后不再重试、直接抛）。
时序与并发：先写 `.<basename>.<pid>.<毫秒>.<随机>.tmp` 临时文件再改名覆盖，读者永远看不到半截文件；目标目录递归创建。
幂等：同一 content 重复调用结果一致；失败后目录里没有残留 `.tmp`。
资源释放：临时文件在成功（改名走了）与失败（显式删除）两种路径下都不残留。
平台差异：POSIX 上新文件权限位为 `0600`；Windows 无 POSIX 权限位，行为是「仅当前用户可写」的默认 ACL，断言只在 POSIX 检查 mode。换行不做转换：写什么字节就是什么字节（`\n` 与 `\r\n` 都原样），两平台一致。
状态所有者：文件系统。

**B7 损坏文件备份：`backupCorruptFile`**（`node/privateFilePersistence.ts`）
输入：`backupCorruptFile(filePath)`。
输出：返回备份路径 `<filePath>.corrupt-<sha256(内容) 前 24 个 hex>.bak`；备份内容与原文件逐字节一致。
错误语义：原文件不存在/不可读时抛出底层 IO 错误；备份写入 `EEXIST` 被吞掉（备份已存在即成功），其他写错误抛出。
时序与并发：备份用 `wx` 独占创建，天然幂等——同一内容再调一次返回同一路径、不改写已有备份。
幂等：是（见上）。
资源释放：不适用。
平台差异：POSIX 上备份权限位补设 `0600`；Windows 走默认 ACL。备份名仅含 hex 与固定后缀，两平台文件名都合法。
状态所有者：文件系统。

## 二、node：迁移与缓存扫描（B8–B11）

**B8 子代理状态文件迁移：写回格式与往返**（`node/subagentMarkdownMigration.ts`）
输入：`migrateSubagentStateFile(path)`，目标是一个 JSON 对象文件（旧实现写的状态文件）。
输出：需要迁移时把 `importSubagentStateSelections` 的结果以 **2 空格缩进 JSON**（`JSON.stringify(next, null, 2)`）写回；变换结果与原文相同时**不写文件**。
错误语义：文件不存在（`ENOENT`）与 JSON 语法错误（`SyntaxError`）安静返回；其他错误原样抛出。
时序与并发：改写在 `withFileLock` 内进行（B5），并有「文件在改写期间被改动」的复核（inode/dev/目录真实路径/内容任一变化即抛 `Subagent file changed during migration`）。
幂等：**迁移一次后再次调用不再改写任何字节**（变换收敛）。
资源释放：临时文件 `<目录>/.<名字>.<uuid>.tmp` 无论成败都删除；目标文件权限位（`mode & 0o777`）被保留。
平台差异：只读文件（无写位）跳过不改；路径大小写按文件系统原生语义；换行统一写 `\n`（与旧实现一致），JSON 解析不受 CRLF 影响。
状态所有者：文件系统；进程内无缓存。
**存储往返（旧写→新读→新写→旧读）**：`fixtures/old-write/subagent-state.*` 记录旧实现写出的文件与迁移后的期望字节；测试按「旧写入的文件 → 本实现读取并迁移 → 再次迁移 → 用旧格式解析读回」四步断言。

**B9 子代理 Markdown 迁移：递归扫描与结果汇总**（`node/subagentMarkdownMigration.ts`）
输入：`migrateUserSubagentMarkdown(userRoot)`。
输出：`{ migrated: string[]; failures: Array<{ path; error }> }`——`migrated` 是**实际被改写**的 `.md`/`.markdown` 文件路径，`failures` 是扫描/改写中出错的路径与错误对象。
错误语义：根目录不存在（`ENOENT`）安静返回空结果；其他目录读取错误进 `failures` 不抛出；单文件改写错误进 `failures`，不影响其余文件。
时序与并发：深度优先逐目录、逐文件串行处理；每个文件的改写都在锁内（B5）。
幂等：第二次调用 `migrated` 为空（B8 的收敛性）。
资源释放：同 B8。
平台差异：扩展名匹配大小写不敏感（`.md`/`.MARKDOWN` 都算）；`userRoot` 下的路径分隔符按平台原生返回（测试用集合比较，不依赖分隔符）。
状态所有者：文件系统。

**B10 官方插件缓存扫描**（`node/officialPluginCache.ts`）
输入：`scanOfficialPluginCacheRoots(pluginStorageRoot)`，扫描 `<pluginStorageRoot>/cache/knorvia-plugins-bundled/<name>/<version>/`。
输出：`[{ name, versionRoots }]`——`name` 按字典序升序；每个 `versionRoots` 是**绝对目录路径**数组，版本目录名按**数字感知**降序（`2.10.0` 排在 `2.9.0` 前）；只收目录条目；一个插件没有任何版本目录时整个条目不出现。
错误语义：缓存根不存在/不可读返回 `[]`；单个插件目录不可读则跳过该插件，不抛错。
时序与并发：单次只读扫描，无副作用。
幂等：是（同一目录布局结果恒同）。
资源释放：不适用。
平台差异：跳过名单按名字子串判断（`.backup`、`.seed-lock`、`.tmp-`），与平台无关；返回路径用 `join` 拼接，两平台都是原生分隔符。
状态所有者：文件系统。

**B11 插件缓存临时条目跳过规则**（`node/officialPluginCache.ts`）
输入：版本目录名包含 `.backup` / `.seed-lock` / `.tmp-` 之一。
输出：该目录不进 `versionRoots`（备份、seed 锁、临时目录都不是可用版本）。
错误语义：不适用。
时序与并发 / 幂等 / 资源释放 / 状态所有者：同 B10。
平台差异：子串判断大小写敏感（与 CLI 的命名约定一致），两平台一致。

## 三、node：自采遥测换算（B12）

**B12 进程自采样器差分换算**（`node/nodeSelfResourceTelemetry.ts`）
输入：`createNodeSelfResourceSampler({ readCpuUsage?, readMonotonicTimeNs?, logicalCpuCount? })` 后反复 `sample(memoryUsage)`；换算用相邻两次读数之差。
输出：`{ cpuPercent, rssKb, heapUsedKb }`；`cpuPercent = round4((Δ(user+system)μs / Δ单调时间μs) / 逻辑核数 × 100)`，保留 4 位小数；`rssKb = round(rss/1024)`、`heapUsedKb = round(heapUsed/1024)`。
错误语义：读数抛错、时钟未前进（Δ≤0）、CPU 计数回退（Δ<0）都返回 `null`——只丢当前样本，不抛错、不中断后续采样。
时序与并发：**构造时即建立基线**，所以第一个 `sample` 就能出样本；每次 `sample` 顺带刷新基线。实例非线程安全、按调用顺序使用。
幂等：同样输入序列给出同样输出；单个 `sample` 不可重复调用（会推进基线）。
资源释放：无定时器、无句柄（调用方自己掌握节拍 `NODE_SELF_RESOURCE_SAMPLE_INTERVAL_MS = 60_000`）。
平台差异：纯算术，两平台一致；默认 `availableParallelism()` 在不同机器取值不同，测试注入固定核数。
状态所有者：基线在 sampler 实例内，由调用方持有实例。

## 四、protocol-v4：wire 帧编解码（B13–B19）

**B13 单帧编码（complete）**（`protocol-v4/wire-codec.ts`）
输入：`encodeTopicWireFrames(frame, options)`，`options.measurePhysicalFrameBytes(complete) ≤ maxPhysicalFrameBytes`。
输出：单元素数组，元素为 complete 帧：`wireVersion = 3`、`kind = "complete"`、`deliveryKind/logicalFrameId/logicalFrameOrdinal/topic/subscriptionId` 取自 options、`frame` 为入参对象。字段键集合与顺序固定（录制帧按 JSON 等价比较，允许时间戳与 ID 不同——本函数不产生任何时间戳/随机 ID，输入不变则输出逐字节相同）。
错误语义：限额参数非法（非有限正数）抛 `TopicWireFrameEncodingError("proto.invalidLimit.<field>")`。
时序与并发：纯函数，同步返回。
幂等：同输入同输出。
资源释放 / 平台差异（纯算术与 utf-8 编码，两平台一致）/ 状态所有者（无）：见通用约定。
**录制帧对比**：`fixtures/frames/encode-cases.json` 由旧实现录制；测试在新实现上重放同输入并断言等价帧。

**B14 分片编码（fragment）**（`protocol-v4/wire-codec.ts`）
输入：complete 帧物理尺寸超 `maxPhysicalFrameBytes`；逻辑 JSON 字节 ≤ `maxAssemblyBytes`。
输出：`fragmentCount = ceil(logicalBytes / 每片字节)` 个 fragment 帧，`fragmentIndex` 从 0 连续递增；`logicalBytes` 为逻辑 JSON 的 utf-8 字节数；`checksum = { algorithm: "crc32", value: 8 位小写 hex }` 对整段逻辑字节计算；`dataBase64` 为各片字节的 base64；各片 `dataBase64` 按序拼接解码后逐字节等于逻辑 JSON 字节。
错误语义：每片复核仍超限抛 `proto.frameEnvelopeTooLarge`；片数超过 1024 抛 `proto.frameFragmentCountExceeded`。
时序与并发：纯函数；「整数二分 + 最坏索引探测」的探测顺序是冻结合同的一部分（输出的分片边界必须与录制帧一致）。
幂等：同输入同输出（含分片边界）。
资源释放 / 平台差异 / 状态所有者：同 B13。

**B15 编码错误族**（`protocol-v4/wire-codec.ts`）
输入：超大逻辑帧 / 物理预算连一个 fragment 包络都放不下 / 片数超界 / 限额参数非法。
输出：抛 `TopicWireFrameEncodingError`（`name = "TopicWireFrameEncodingError"`，`message` 即 `reasonCode`，实例上可读 `reasonCode`）；reasonCode 取值族：`proto.invalidLimit.maxPhysicalFrameBytes`、`proto.invalidLimit.maxAssemblyBytes`、`proto.frameAssemblyTooLarge`、`proto.frameEnvelopeTooLarge`、`proto.frameFragmentCountExceeded`。
错误语义：任一错误都**不返回部分结果**（不返回已生成的前缀帧）。
时序与并发 / 幂等 / 资源释放 / 平台差异 / 状态所有者：同 B13。

**B16 三层承载计量**（`protocol-v4/wire-codec.ts`）
输入：`measureTopicNotificationEnvelopeBytes(wire)`，`wire` 为 topic 帧候选（任意可 JSON 序列化对象）。
输出：`{ cliNdjsonBytes, channelSocketBytes, mobileRelayBytes, maxBytes }`——CLI NDJSON 行（含尾随换行）、RPC 通道 socket 帧（含 13 字节 socket 头）、mobile relay 外层（固定信封 + base64 预算）三层字节数，`maxBytes` 为三者最大值。
错误语义：不可 JSON 序列化的输入抛底层 `JSON.stringify` 错误。
时序与并发 / 幂等 / 资源释放 / 平台差异 / 状态所有者：同 B13。
**录制帧对比**：`fixtures/frames/measure-cases.json` 记录旧实现的三层计量值，新实现必须逐字节同值。

**B17 wire 帧 schema：严格校验**（`protocol-v4/wire.ts` 的 `createTopicWireFrameSchema`）
输入：`createTopicWireFrameSchema(frameSchema)` 得到的 schema，parse complete/fragment 两种帧。
输出：合法帧 parse 通过；拒绝规则：未知键（`.strict()`）、`wireVersion ≠ 3`、`deliveryKind` 不在 `initial|online|recovery`、`logicalFrameId/topic/subscriptionId` 空串、`logicalFrameOrdinal` 非正整数或超 `Number.MAX_SAFE_INTEGER`、fragment 的 `fragmentIndex ≥ fragmentCount`、`fragmentCount > logicalBytes`、checksum 非 `crc32`+8 位 hex、`dataBase64` 非法、complete 帧内 `frame.topic`/`frame.subscriptionId` 与外层不一致。
错误语义：parse 抛 zod 错误；`safeParse` 的 issue 带对应 `path`（如 `["fragmentIndex"]`、`["topic"]`）与固定 message（如 `fragmentIndex must be smaller than fragmentCount`）。
时序与并发 / 幂等 / 资源释放 / 平台差异 / 状态所有者：同 B13。

**B18 wire 候选 schema：服务边界宽容校验**（`protocol-v4/wire.ts` 的 `topicWireFrameCandidateSchema`）
输入：服务路由边界收到的外层帧（可能缺 inner 字段）。
输出：只校验可安全路由/计量的外层形状——`wireVersion`/`kind`/`logicalFrameId`/`logicalFrameOrdinal`/`topic`/`subscriptionId`；`deliveryKind`、fragment 的 `fragmentIndex/fragmentCount/logicalBytes/checksum/dataBase64`、complete 的 `frame` 都是 `unknown` 可缺席；未知键保留（passthrough）。
错误语义：外层必备字段缺失/类型错时 `safeParse` 失败；inner 的坏数据**不在这里报错**（留给 ownership 过滤后的 assembler 出 typed fault）。
时序与并发 / 幂等 / 资源释放 / 平台差异 / 状态所有者：同 B13。

**B19 wire 词汇表常量**（`protocol-v4/wire.ts`）
输入：`topicWireChecksumSchema`、`topicFrameDeliveryKindSchema`、`V4_WIRE_PROTOCOL_VERSION`。
输出：checksum 只认 `{ algorithm: "crc32", value: /^[0-9a-f]{8}$/ }` 且 strict；deliveryKind 枚举 `initial|online|recovery`；`V4_WIRE_PROTOCOL_VERSION === 3`。
错误语义 / 时序与并发 / 幂等 / 资源释放 / 平台差异 / 状态所有者：同 B13。

## 五、protocol-v4：输入与配置 schema（B20–B26）

**B20 提交模式枚举**（`protocol-v4/submission.ts`）
输入：`submissionModeSchema`。输出：枚举 `build|edit|plan|yolo`；`auto` 是 Runtime 内部状态**不被接受**。错误语义：非法值 `safeParse` 失败。其余见通用约定。

**B21 共享上下文引用**（`protocol-v4/shared-context-ref.ts`）
输入：`sharedContextRefSchema`。输出：strict 对象 `{ kind: "shared_context_import", context_id }`；`context_id` 先 trim 再要求非空（`"  abc  "` 解析为 `"abc"`）。错误语义：未知键、`kind` 不符、trim 后空串都拒绝。其余见通用约定。

**B22 附件引用**（`protocol-v4/attachment-ref.ts`）
输入：`attachmentRefSchema`。输出：strict 对象 `{ ref, fileName, mime, bytes, previewRef? }`；`previewRef` 可缺席，其余必填（`bytes` 是任意 number，允许 0 与负数——只承载展示元信息）。错误语义：未知键拒绝。其余见通用约定。

**B23 稳定 fork 目标**（`protocol-v4/fork.ts`）
输入：`stableForkTargetSchema`。输出：strict 对象 `{ productTurnId, transcriptTurnId, orderedMessageIds, boundaryMessageId }`，四个 id 都非空、`orderedMessageIds` 至少 1 项。错误语义：`boundaryMessageId` 必须等于 `orderedMessageIds` 最后一项，否则拒绝（issue `path = ["boundaryMessageId"]`，message `boundaryMessageId must be the final orderedMessageId`）；`StableForkTargetResolution` 的失败态 reasonCode 取值族 `guard.forkAssistantOnly | guard.forkTargetNotStable | guard.forkTargetAmbiguous | guard.compactOperationLock`（本文件只定形状，判定在调用方）。其余见通用约定。

**B24 输入意图**（`protocol-v4/input-intent.ts`）
输入：`conversationInputIntentSchema`。输出：strict 对象；`attachments` 缺省补 `[]`；`kind ∈ sendText|sendGoalCommand|compact`；`delivery.requested ∈ auto|startNow|queue|guide`、`delivery.admitted ∈ startNow|queue|guide`；`order.admissionSeq` 为非负整数、`queuePosition` 可选非负整数；`steer.state ∈ notRequested|submitting|steering|guided|fellBack`；`dispatch.state ∈ admitted|queued|reserved|promoting|drained`；`sharedContextRefs` 最多 1 项；`provenance`/`modelSelection`/`mode`/`planEnabled` 可缺席（旧快照兼容）。错误语义：未知键、越枚举、`sourceCommandId/queueItemId/clientId` 空串、`admittedAt` 非数值时间戳都拒绝。其余见通用约定。

**B25 会话配置状态**（`protocol-v4/session-config.ts`）
输入：`sessionConfigStateSchema`、`sessionModelTransitionSchema`。输出：`thoughtLevels` 缺省补 `[]`、`mode` 缺省补 `"build"`（旧快照兼容）；`followupMode ∈ queue|guide`；`permissionGrant = { interactionId }`、`planTransition = { toolCallId, planEnabled }` 形态固定；`sessionModelTransitionSchema` 的 `origin` 必须是 `"registryFallback"` 且 `from/to` 各含 `provider/model` 字符串。错误语义：`permissionGrant.interactionId` 空串拒绝；未知键不拒绝（该对象非 strict，缺省值走默认）。其余见通用约定。

**B26 共享上下文导入状态**（`protocol-v4/shared-context-import.ts`）
输入：`sharedContextImportStateSchema`（v2 与 legacy 的并集）。输出：v2 形态 `{ contextId, title, shareUrl, status }`，`status ∈ pending|reserved|attached|discarded`，`shareUrl` 必须是 http(s) URL 且 pathname 严格匹配 `/cn/share/<code>`（无 query、无 hash）；legacy 形态只含 `title`（trim 非空）。错误语义：URL 形状不符（query/hash/英文站 `/share/` 路径）拒绝；两种形态都 strict。其余见通用约定。

## 六、protocol-v4：CUA 权限与 delta/profiles（B27–B30）

**B27 CUA 权限状态与需求推导**（`protocol-v4/cuaPermission.ts`）
输入：`cuaRequestAccessStatusSchema` 与 `requiredCuaPermissionsForRequestAccessStatus(status)`。输出：状态为 strict `{ schemaVersion: 1, platform: "darwin", grantOwner, accessibility ∈ granted|stale|denied, screenRecording ∈ granted|denied|unknown }`；需求列表按序返回：`accessibility` 为 `denied|stale` 时含 `"accessibility"`，`screenRecording === "denied"` 时含 `"screen_recording"`，其余（含 `unknown`）不加。错误语义：`schemaVersion ≠ 1`、`platform ≠ "darwin"`、枚举越界、未知键都拒绝；`cuaPermissionObservationSchema` 另要求 `eventId` 非空、`eventSeq` 非负整数、`occurredAt` 数值时间戳、`sessionId/toolCallId` 非空、`turnId` 可选。其余见通用约定。

**B28 会话增量的封闭操作集**（`protocol-v4/delta.ts`）
输入：`conversationDeltaSchema`。输出：判别联合只认五个 `op`：`row.appended`（带 `row`）、`row.upserted`（带 `row`）、`row.removed`（带 `fromRowId` number）、`row.delta`（带 `rowId`、`path ∈ text|inputText|output.text|summaryText`、`append` string）、`state.updated`（带 `patch`）。错误语义：第六种 op、缺必备字段都拒绝；**没有** `row.inserted`/`row.moved`/字段级 patch（封闭集合是契约）。其余见通用约定。

**B29 状态补丁：键级整体替换**（`protocol-v4/delta.ts` 的 `statePatchSchema`）
输入：`statePatchSchema`。输出：键集合封闭（`revision/control/sharedContextImport/availability/inputRouting/meta/config/modelTransition/usage/queue/pendingInteractions/pendingCommands/backgroundWorks/subagents/workflowRuns/goal/plan/workspaceHookAdmission`，共 18 键，`shape` 的键集合即契约）；语义是**键级整体替换**（键内不深合并）——解析结果里出现的键即整块替换值，缺省键不出现。错误语义：该对象**非 strict**，未知键不报错、被剥离（进不了 patch，以下游 `Object.assign` 视角仍是封闭集）；`revision` 在此是**任意数值**（不做非负或整数校验，与 `workflowRunsStateSchema.revision` 的非负整数不同，以旧实现为准），其余已知键按各自 schema 校验（如 `config` 内部字段）。

**B30 交付档案过滤**（`protocol-v4/profiles.ts`）
输入：`filterConversationRowsForProfile(rows, profile)` 与 `filterConversationDeltasForProfile(deltas, profile)`。
输出：前者返回**等长新数组**（当前无 profile 专属行，逐元素拷贝，不修改入参）；后者按 `profile.streamPaths[path]` 过滤 `row.delta`，其余 op 全保留，**顺序保持权威日志序**、不修改入参。
错误语义：不适用（纯函数，未知 op 不可能出现在类型内）。
时序与并发：纯函数；恢复回放与实时 flush 走同一函数（同输入同输出，重投递确定）。
幂等：是。平台差异 / 状态所有者 / 日志：见通用约定。

## 七、protocol-v4：workflow runs 状态面（B31–B37）

**B31 workflowRuns 限额常量表**（`protocol-v4/workflow-runs.ts` 的 `WORKFLOW_RUNS_LIMITS`）
输入：常量表。输出（数字即契约）：`maxRuns 8`、`maxActors 256`、`maxNodes 256`、`maxReports 64`、`maxReportPreviewLength 2048`、`maxResultPreviewLength 2048`、`maxErrorLength 2048`、`maxPendingQuestions 32`、`maxQuestionLength 2048`、`maxConcurrencyKeyLength 256`、`maxSubagentModelLength 256`、`maxConcurrencyCeiling 1024`、`maxActorNameLength 128`、`maxArtifacts 32`、`maxPhases 32`、`maxPhaseNameLength 128`、`maxInstructionsHeadLength 240`、`maxLastToolNameLength 64`、`maxLastToolTargetLength 120`。错误语义 / 其余：见通用约定。

**B32 run 状态 schema：退化规则**（`protocol-v4/workflow-runs.ts` 的 `workflowRunSchema`）
输入：最小 run 对象（`runId/status/usage/actors/nodes/lastEventSequence`）与带全可选键的完整对象。输出：`reports/pendingQuestions/concurrency/artifacts/phases/phaseNames/phaseAlongside/concurrencyCeiling/subagentModel/resumedFrom/supersededBy/error/resumable/resultPreview/toolCallId/stopReason/truncated/currentPhase` 全部可缺席——**旧 CLI 少发一个键是退化不是错误**；`resumable` 只能是字面 `true`（为真才在场）；`reports`/`pendingQuestions`/`artifacts`/`phases` 零条时调用方应整体省略键（schema 不强制，但键存在时数组元素仍要合法）。`workflowRunsStateSchema = { revision: 非负整数, runs: ≤ maxRuns }`。
错误语义：必备键缺失、数组超上限、元素非法都拒绝。其余见通用约定。

**B33 run 状态 schema：边界拒绝**（`protocol-v4/workflow-runs.ts`）
输入：越界值。输出（全部拒绝）：`runId/toolCallId/resumedFrom/supersededBy` 长度 >128、`error/resultPreview` 长度 >2048、`report.preview` >2048、`actor.name`/`pendingQuestion.actorName` >128、`qid` >128、`question/context` >2048、`node.instructionsHead` >240、`lastTool.name` >64、`lastTool.target` >120、`siteId` >64、`subagentModel` >256、`concurrencyCeiling` >1024 或非正、`status` 越 `pending|running|completed|errored|stopped`、`stopReason` 越 `user|model|provider|interrupted|superseded`、`node.phase` 越七相位、`node.outcome` 越 `ok|failed|cancelled`、`actor.status` 越 `waiting|running|completed`。
错误语义：`safeParse` 失败并给出对应 issue path。其余见通用约定。

**B34 run 设置调整命令**（`protocol-v4/workflow-run-settings-command.ts`）
输入：`amendWorkflowRunSettingsPayloadSchema`（三态：键缺席 = 沿用；`null` = 回默认；值 = 设定）、`amendWorkflowRunSettingsResultSchema`、`workflowRunSettingsRejectionReasonSchema`。
输出：payload `{ workId, subagentModel?, maxConcurrency? }`，`subagentModel` 为 1..256 字符串或 `null`，`maxConcurrency` 为 ≥1 整数或 `null`；result `{ type: "amendWorkflowRunSettings", runId, toolCallId, supersededRunId? }`；拒绝词表固定 8 项：`not_found/not_configurable/unchanged/script_missing/model_unavailable/compile_failed/missing_boundaries/start_failed`；fault 前缀常量 `fault.command.workflowRunSettingsRejected.`。
错误语义：`workId` 任意字符串（含空——身份等式由命令层校验）；`subagentModel` 空串或 >256、`maxConcurrency` 0/负数/非整数都拒绝。其余见通用约定。

**B35 `run-started` 归约：残影剥除与用量归零**（`protocol-v4/workflow-runs-started.ts`，经公开入口的 `reduceWorkflowRunsState` 观测）
输入：对已有 run（带 `error/resultPreview/pendingQuestions/resumable/stopReason` 等上一世结算残影、非零 `usage`、已有 `concurrency`）再次喂 `run-started` 事件。
输出：`status → "running"`；`usage → { spentTokens: 0, nodesUsed: 0 }`；`error/resultPreview/pendingQuestions/resumable/stopReason` 全部剥除；`resumedFrom` 从载荷搬运（载荷缺席则沿用已知值）；`subagentModel` 同理，载荷值超长（>256）按读不出处理、沿用已知值；`concurrency` 与 `subagentModel` **不**剥除（它们是本 run 的条件/现状，不是上一世残影）。
错误语义：不适用（坏载荷字段读作缺席，不整帧丢弃）。
时序与并发：事件顺序即状态转移顺序；同一 runId 的第二条 `run-started` 是合法的 resume 重臂。
幂等：同一事件重复喂入结果不变（JSON 可见等价时 reducer 返回 `null` 表示无变化）。
资源释放 / 平台差异 / 状态所有者（run 状态归会话权威投影，reducer 无副作用）：见通用约定。

**B36 `run-settled` 归约：停止原因白名单与 lineage**（`protocol-v4/workflow-runs-lineage.ts`，经 `reduceWorkflowRunsState` 观测）
输入：`run-settled` 载荷（`status`、`stopReason`、`supersededBy`、`error.message`、`resumable`）。
输出：`status` 落终态（`completed|errored|stopped`；不认识的 status 归 `errored` 并把提示语截到 2048）；`stopReason` 只承认白名单五词，**白名单外按载荷缺席处理、不覆盖已知值**（载荷无效且 run 上已有 stopReason 时，已知值保留；没有已知值时该键缺席，整帧不丢）；`supersededBy` 只在 `stopReason === "superseded"` 且 id 为非空字符串时写入，否则同样按载荷缺席处理、不产生新值。
错误语义：不适用。时序与并发：结算事件清空 `pendingQuestions`（停驻问题随终态消失）并摘除 `concurrency.cooldownMs`（cap/ceiling 保留）。
幂等：同 B35。其余见通用约定。

**B37 脚本产物序列化**（`protocol-v4/workflow-artifact.ts` 的 `serializeWorkflowArtifact`）
输入：任意脚本值。输出：`undefined` → `undefined`（调用方让字段整体缺席）；string 原样；其余 `JSON.stringify(v, null, 2)`；stringify 返回 `undefined`（function/symbol/undefined）或抛错（循环引用）时退 `String(v)`。产物形状不受约束（对象/数组/字符串/数字/null 都合法）；不设长度上限（截断属于各自的边界）。
错误语义：不抛错（循环引用退 `String`）。幂等：同输入同输出。其余见通用约定。

## 八、protocol-v4：会话索引与展示载荷（B38–B43）

**B38 sessions-index topic 键对偶**（`protocol-v4/sessions-index.ts`）
输入：`sessionsIndexTopic(workspaceId)` / `parseSessionsIndexTopic(topic)`。
输出：构造得 `sessions-index/<workspaceId>`；解析是它的逆——匹配前缀返回 `<workspaceId>`，否则 `null`；`workspaceId` 为空串时构造得 `sessions-index/`，解析该串返回 `null`（空 id 不算）。
错误语义：不适用（不抛错）。平台差异：topic 键恒用 `/`，与文件系统分隔符无关。其余见通用约定。

**B39 sessions-index 快照与增量**（`protocol-v4/sessions-index.ts`）
输入：`sessionSummarySchema`、`sessionsIndexSnapshotSchema`、`sessionsIndexDeltaSchema`、`sessionPendingInteractionSummarySchema`、`pendingInteractionSummarySchema`。
输出：summary 必备 `sessionId/workspaceId/title/phase/sessionEnded/hasBackgroundWork/lastActivityAt/createdAt`；`parentSessionId/titleSource/workflowActivity/pendingInteraction/pendingInteractionSummary/goalStatus/lastAssistantPreview` 可缺席（旧 frame 兼容）；`pendingInteraction.kind ∈ permission|userInput`、`pendingInteractionSummary = { permissionCount, userInputCount }` 非负整数；snapshot 为 `{ protocolVersion: 1, workspaceId, logEpoch, sessions }`；delta 是判别联合 `session.upserted`（带 `session`）/`session.removed`（带 `sessionId`）。
错误语义：`protocolVersion ≠ 1`、枚举越界、未知 op 都拒绝。其余见通用约定。

**B40 CreateWorkflow 工具卡 display**（`protocol-v4/create-workflow-display.ts`）
输入：`toolCallCreateWorkflowDisplaySchema`。输出：strict `{ kind: "create_workflow", ok, errorCount, diagnostics, causalityGraph?, truncated? }`；diagnostics ≤100 条、每条 `{ line, column, code, message }` 且 `message` 1..2048；因果图界限：`steps ≤ 64`、`lanes ≤ 32`、`participants ≤ 64`、`handoffs ≤ 256`、`phases ≤ 32`、`phaseEdges ≤ 128`、`exits ≤ 32`、`sink ≤ 64`；`namePattern` 为 strict `{ head?, tail? }`（各 1..128，至少一个在场由消费方判断）；边 `{ from, to, back? }` 的 `back` 只能是字面 `true`；`step.kind ∈ ask|world-read`、`step.repeat ∈ stack|serial`；`phases/phaseEdges/exits` 全有或全无（schema 不强制，产品约束记在此处）。
错误语义：未知键、越上限、空串 id/label 都拒绝。其余见通用约定。

**B41 工作区 transcript 词汇表**（`protocol-v4/workflow-workspace.ts`）
输入：`WORKFLOW_WORKSPACE_LIMITS`、节点 schema、两条 query schema。
输出（数字即契约）：`maxNodes 2000`、`maxOpLength 32`、`maxArgs 16`、`maxErrorMessageLength 2000`、`resultMaxBytes 32768`；节点行 strict `{ siteId, ordinal, kind ∈ world-read|world-run, op?, args?, inputTruncated?, status ∈ running|completed|failed, error?, summary?, createdAt, updatedAt }`，`error = { code(1..64), message(≤2000) }`、`summary = { resultBytes, resultCount?, exitCode?, stdoutBytes?, stderrBytes? }` 都 strict；query①参数 `{ sessionId, runId }`、结果 `{ nodes(≤2000), truncated? }`；query②参数含 `siteId(≤64)/ordinal/maxBytes?(1..32768)`、结果 `{ status, result?, error?, truncated, totalBytes }`（`truncated`/`totalBytes` 必备）。
错误语义：strict 拒绝未知键、越界拒绝。其余见通用约定。

**B42 workspace hook 审核**（`protocol-v4/workspace-hook-review.ts`）
输入：trust 枚举、review 决策、命令 target、审核请求、呈现 schema。
输出：`workspaceHookReviewTrustStateSchema` 七态 `not_applicable|pending_trust|trusted_persistent|blocked_untrusted|blocked_policy|revoked|stale_digest`；`workspaceHookReviewDecisionSchema` 为 `{ action: "trust_selected", reviewItemIds(≥1) }` 且 **reviewItemId 不得重复**；`bundleDigest/hookDeclarationDigests` 必须是 64 位小写 hex；`workspaceHookReviewRequestPayloadSchema` 的一致性校验：`deadlineAt ≥ createdAt`、`summary.hookCount === items.length`、`summary.eventCount === items 中不同 event 数`、`summary.pendingCount === items 中 trustState ∈ {pending_trust, revoked, stale_digest} 的条数`、`items[].reviewItemId` 唯一；item 的 `event ∈ SessionStart|UserPromptSubmit|PreToolUse|PermissionRequest|PostToolUse|PostToolUseFailure|Stop`、`type ∈ command|process`、`executionMode ∈ foreground|background`、`warningCode` 必须是字面 `workspace_hooks_execute_code`；`presentWorkspaceHookReviewRequestSchema` 的 `settingsSection === "hooks"`、`settingsScope === "workspace"`。
错误语义：重复 id 的 issue message 为 `review item ids must be unique`；三处计数不一致各给固定 message（`hookCount must match the immutable request items` 等）。其余见通用约定。

**B43 公开入口导出面**（两个入口桶）
输入：`import` 两个公开入口。输出：`@knorvia/shared/node` 恰好 13 个具名导出（`interface.md` 列表）；`@knorvia/shared/protocol-v4` 的具名导出集合与 `interface-appendix-protocol-v4.md` 的 571 项逐名一致（运行时值 + 类型再导出）。内部模块可任意重组，**入口的导出名/类型/运行时值一一对应不可变**。
错误语义：缺任一导出即违反合同。平台差异：源码入口（tsx）与 dist 入口（`tsc -b` 产物）必须给出同一导出集合。其余见通用约定。

**B44 模块路径兼容面**（`interface.md`）
输入：`interface.md` 列出的模块路径。输出：`packages/shared/src/node.ts` 与 `packages/shared/src/protocol-v4/index.ts` 在源码与 dist 两侧都存在；`scope-files.json` 里的 27 个模块路径在替换前存在、替换后由同名新实现或重导出提供。
错误语义：不适用。其余见通用约定。
