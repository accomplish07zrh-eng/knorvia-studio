# 设备身份与 Node 文件系统独立实现合同

2026-09-30，基线 `ab713db03e43bdf1890479158d2d8e18c2dd4224`。本组为四个逻辑模块：`device/cli-device-mid.ts`、`fs/index.ts`、`fs/text-metadata.ts`、`fs/text-range-reader.ts`。既有 `FileSystemPort` 与公开声明是边界；1889 行文件系统门面按职责拆分时不增加能力或改变调用出口。先逐字节保存旧 source、实际 dist 与声明，再用受控世界验证合同，生产替换在冻结门通过后进行。旧正文用于提取合同，作者已有源码暴露，不能声明 clean-room 或据测试成功自动授予 MIT。

## 所有权与数据

```text
provider 请求 → 每 stateFile 一个进程内 Promise → 已有 deviceMid 优先
                                              → 独占 lock → 锁内再读 → 合并原字段
                                              → 同目录临时写入 → rename → 释放锁
读写工具 → 唯一 FileSystemPort → 绝对路径/错误边界 → Node I/O
                              → 编码/行扫描 → 原 result/revision 结构
```

本组不转换用户数据，不访问真实用户身份文件，不修改 UI、MCP/Bash 采样、workspace isolation、审批/停止/恢复或数据库。测试只使用自有临时目录或完全合成读写端口。未确认的 27 项第三方材料和原许可声明继续保留。

## 设备身份合同

- 路径仍为解析后 baseDir 的 `.knorvia-studio/v2/telemetry-state.json`。显式 `baseDir` 优于 `KNORVIA_DATA_BASE_DIR`（环境值 trim），再用 homedir；空字符串回退 homedir。仅 `~` 与 `~/` 作原有展开，其他路径按当前平台 resolve。
- 已有非空 string `deviceMid` 原样接受，包括空白；非 record、数组、无效 JSON 或读取异常视为无记录。原对象其他字段保持。锁内必须再次读取，不以锁外旧值覆盖竞争者。
- 同状态路径缓存同一个 Promise，成功和 fallback 以后不重新读取。按需要惰性生成一次 ID；I/O 异常回退该 ID，不改变 provider header 与 session 字段。自定义生成器异常不伪装为文件系统成功。
- 同目录 `telemetry-state.lock` 以 `wx` 获取，记录数值 createdAt/pid。EEXIST 才允许重试；每次 10ms、最多 200 次。mtime 年龄达到 5 分钟可移除；较新锁只在具有有效数值 owner 且 PID 非正整数或已死亡时移除，EPERM 仍表示存活。缺失、损坏、无权限的 owner/metadata 不擅自认定可抢占。
- 失败清理临时文件和锁，保留原状态字节，锁 handle 关闭的错误传播与既有 fallback 相同。不得增加身份重置、迁移或凭据读取。

## 文本元数据合同

- BOM 优先：UTF-8 / UTF-16LE；否则 NUL 或控制字节比例严格大于 0.3 为 unsupported。有效完整 UTF-8 优先，其次 gb2312、gbk、gb18030，允许为检测截去最多三个末尾字节，但不接受空候选。使用现有 iconv-lite，保留其第三方许可。
- 显式 encoding 不进行自动检测；原字段别名原样返回。Buffer 内建编码与中文 legacy 编码保持实际平台语义，UTF BOM 不擅自删除。legacy 写入必须完整 decode/encode 往返，无法表达的内容返回原 `FileSystemPortError` unsupported/path/message。
- streaming decoder 保留跨 chunk 的多字节状态及 end flush。base64/base64url/hex 不归一换行；CRLF 主导必须严格多于独立 LF，平局选 LF。只归一 CRLF，不改孤立 CR；未请求换行写法时保留原字符串。

## 范围读取合同

- 总 stat 大小 maxBytes 只作失败门槛，不截断。10MiB（含）走完整读；超过走 streaming，自动编码先读最多 4096 字节并关闭 head handle。必须消费全文以报告 totalLines 和主导换行，即使 limit 为零或 offset 超出范围。
- offset/limit 使用原有 `Math.max(0, Math.trunc(...))` 数值语义，保留零基 offset、一基 startLine、尾随换行的最后空行和空文件 totalLines=0；不自行收紧非有限数值的原边界。
- fast 返回整块 bytesRead，stream 返回实际 chunk 字节累计；sizeBytes 与 revision 保持传入 stat。revision ID 仍为 `mtime:${Math.trunc(mtimeMs)}:size:${sizeBytes}`。
- 保留 fast/stream 在末尾孤立 CR 和非有限 offset/limit 的既有差异；这些不能在兼容替换时暗中统一。stream 的 CRLF 可跨 chunk，decoder flush 参与末行；终止不残留 abort listener。
- 预先 abort 返回原 AbortError 文本，stream abort 销毁自有 stream；底层读取错误保留，门面再作原有 FileSystemPortError 转换。不得提高超时或删掉反例。
- 新行扫描器按 chunk 推进，只保留选中行的片段；未选中长行只维护尾字符与计数，不重复拼接此前全文。先用 64MiB 单行、64KiB chunk、limit=0 观察旧实现，候选须保持全部输出且额外保留的 JS heap 小于 32MiB。独立子进程在加载后 GC，再于每 128 个 chunk 后 GC 并采样（包括最后一块）；这验证遗漏行不会占用全文缓存，避免将 GC 调度不同造成的暂态分配当作持久缓存，不用机器耗时阈值代替正确性。decoder end 的内容按原合同并入末行，不额外分割。

## 文件系统门面合同

保留 createDirectory、stat、readTextFile、readBinaryFile、readTextFileRange、writeTextFile、removeFile、listDirectory、searchFiles、searchText 和两个 ripgrep 测试工厂控制。绝对路径归一、revision/hash、文本截断与二进制总量拒绝、原子写入/期望版本、防增长有界读取、fault-injection 边界、目录排序、VCS 排除、glob 及 JavaScript/ripgrep 全部输出模式、runtime fallback 与取消均进入冻结合同。搜索和错误的进一步受控观察在实现前补入本文件，不能以缩减能力完成替换。

### 身份与门面的下一切片

以保存的旧 source/dist 33 项身份、50 项 I/O 完整观察为永久门的输入；原始观察摘要保留在验收证据，不覆盖缓存原件。I/O 数值 open flags 按当前平台 Node constants 核对，再以 flag 名字比较跨平台观察。POSIX 的 `~\\child` 是含反斜杠文件名，Windows 是路径分隔，分别保留原行为，不以统一路径手写转换生产逻辑。先旧版通过，再替换。真实 Anthropic 请求 metadata 与 Core Read/Grep/Glob 消费使用当前公开 contracts，不能用宽松副本替代。

- 写入保持 stat revision ID 的原比较顺序；文本截断仅一次读取，二进制 max+1 的防增长读取则需消费短读。原子写入保持原权限、temp 独占、同步/关闭/rename，失败后清理 temp 并执行原 direct fallback；symlink 拒绝与关闭错误不得暗改。取消与普通 Node 错误由门面单一转换，不重复缓存 accepted 状态。
- 搜索模式仍是 files_with_matches/content/count；pattern trim，glob 支持原有星号/双星号/问号/字面 brace alternatives，文件类型取既有映射。遍历只跟随 Dirent 标明的目录/常规文件，排除六个 VCS 目录，不跟随 symlink；保留逐目录/逐文件 I/O 顺序和错误。文件输出按 mtime 降序再按路径，内容/计数 entries 保留搜索顺序；headLimit=0 为不限，offset/headLimit 的原 slice 数值语义不收紧。
- JavaScript 搜索读取 UTF-8、NUL 跳过；逐行匹配计命中行，multiline 计 match，onlyMatching 保留空 match、孤立 CR 和跨行空片段的原区别。context 合并、行号、末尾换行、零长度 regex、无匹配与 invalid regex 都需旧版反例。multiline 不带 onlyMatching 时原忽略 context 的行为保留。
- multiline 行号以单次建立的行首索引定位，避免每一个 match 重扫从文件开头的所有字符。先以 10000 个 `hit\n` 观察旧版真实结果和查找次数；候选保留 10000 个 match/entry/行号，显式字符/换行查找预算不超过输入字符数加两倍 match 数。受控 string-compatible 端口只计数实际查找，不用固定毫秒门槛。索引不得因尾随 LF、空 match 或孤立 CR 改变原结果。
- 默认 ripgrep 继续自有 Worker，不占主线程。原参数/preopens、JSON/count 输出解析、路径/type/glob 二次过滤、stderr 错误分类、超时和 abort/terminate 单次 settle、恢复测试 factory 的语义保持。只有 runtime failure 回退 JavaScript；超时、取消、正常 code=2/异常 exit 与解析失败不当作 runtime fallback。外部 timer、worker、fs 未配置时测试立即失败，不能触发真实搜索或杀进程。

新门面只负责编排公开端口；有界读写、路径/错误、遍历/glob、JS 匹配与结果投影、ripgrep plan/worker/解析分别由高内聚模块负责。不是将旧文件按行拆分后重新标记来源：先从固定输出反例推导新算法，再核对 I/O 和错误边界。原源码暴露与许可继续保留；每文件小于 400 行。

## 验收与来源边界

旧 source/dist 与候选 source/dist 同门；先有数值/字节/错误反例，再编写新实现。实际 provider metadata 消费和文件读取工具消费保持，同组以合成旧→新→旧状态/编码字节验证，不将其称为真实用户数据迁移。既有 MCP/Bash 50 项门只在需要的最终整合检查运行，不重建历史六项 harness。

测试专用 `KNORVIA_DEVICE_FS_CONTRACT_ROOT` 指定旧缓存或候选 adapters src/dist 根，`KNORVIA_DEVICE_FS_CONTRACT_MODE` 仅接受 source/dist；生产不读取它们。loader 封住 fs、默认 homedir/env/process kill、worker、计时及随机临时名端口，未配置 I/O 必须失败。公开 contracts 错误类型和 iconv-lite 仍用实际依赖，schema 不替换为宽松副本。

每个可验收切片单独提交，同草稿 PR。根与 CLI 类型/lint、格式、架构、来源清单、CLI 构建及必要完整离线检查按实际结果记录；最终 SHA 的 Linux/Windows CI 独立确认。原生 Windows/macOS 精度、Electron UI/安装包/实际 release payload 未运行时明确保留，不关闭 sandbox。根 Apache 与第三方声明不据重构或文件拆分撤销。
