# 设备身份与完整文件系统切片验收

完成四模块组中剩余的 `device/cli-device-mid.ts`、`fs/index.ts`，接续已提交的文本元数据和范围读取；没有 UI、依赖、公开 API 或用户数据格式变化。旧正文用于合同提取，作者已暴露于旧源码；这是基于行为规格的兼容重实现，不能称为 clean-room，也不自动授予 MIT。生产原声明和 Apache 保留，新 helper 未新增 MIT review。

身份现在由每个状态路径的请求所有者处理 Promise、惰性 ID、锁内再读及原字段合并。门面将路径/错误、有界字节 I/O、遍历/glob、JS 匹配、结果投影、ripgrep 参数和 Worker 生命周期分为内部职责，公开 FileSystemPort 不变。每份生产源码少于 400 行。目录遍历使用显式帧；multiline 行号使用一次行首索引，避免重复扫描文件前缀。

实现前保存的身份 33、I/O 50 项旧 source/dist 观察已成为永久测试。搜索追加 106 项旧 source/dist 同结果观察：输出模式、onlyMatching/context/空片段、glob/type/非有限 slice、VCS/symlink、Worker protocol/退出/超时/取消/fallback。准备时发现初始目录夹具没有真实根条目，因而记录了错误响应；原错误夹具保存在仓外缓存，修正后重新从旧版提取有效结果，再替换门面，没有用候选结果改写黄金值。I/O 原数字 flags 同当前平台 Node constants 核对后用名字投影；原始保存摘要在证据中保留。

source/dist 各 **390/390**：375 冻结边界、7 个真实 Core Read/Grep/Glob/Anthropic 消费、5 个自有临时目录检查、1 个 hook 生命周期检查、2 个算法/内存回归。旧版 dist 的剩余 198 项全部通过；本组新增实际消费者和 native/lifecycle 属集成补验，不称为替换前冻结。公开声明语义与旧声明一致，constructor/factory 名称、参数与返回结构保持。

- 10000 个 `hit\n`：旧 source/dist 各 199980000 次显式字符查找；候选各 40000 次，match/entry 数量、首末行号和文本相同。永久门只约束算法查找次数，不提高超时或用机器耗时代替正确性。
- native fixture 仅在自有临时目录：三种实际编码原子读写字节往返、身份未知字段/同 Promise、真实默认 Worker bundled ripgrep 成功返回 `result`（明确没有使用 JS fallback）。Windows/macOS 对应运行结果以最终 SHA CI 为准，不是 Electron GUI 证明。
- 四种编码及身份经旧→新→新加载旧版，原子写字节、未知字段与保存的 identity 字节不变；合成 fixture 的 source/dist 输出完全一致。不访问用户目录，不作数据迁移。
- CLI 17/17 构建，12 缓存；13 个本组及已接受文本 dist 模块与实际 CLI sourcemap 内容逐字节相同。根/CLI typecheck、lint、架构 0 新违规通过。整仓 3874 项：3867 通过、7 平台跳过、0 失败，266063.865734ms。wrapper 内部用例不再次加到整仓总数。

QA 提出的文本 metadata 构建记录差异已复验：原 Turbo 缓存 `a1c3d4664865302a` 的 `7c6c06a0…` 及旧 CLI 缓存 `9385273e016cdfa7` 的 sourcemap 确实一致；当前锁定构建是 `eb73667e…`。差异仅一处 if 条件换行，TypeScript scanner token 全相同。原记录把最终格式化源码摘要与格式化前历史产物并列，不能断言该产物是最终源码的精确重建；原摘要保留，新增当前 source/编译器/命令/产物绑定。未用单纯刷新摘要代替调查。

最终整合 SHA 的 CI、siblings 和来源新鲜度另由 PR/checkpoint 记录。进程采样首次通过的门未涵盖 QA 新发现的四项回退；独立 QA 修复必须保留首次失败证据后接入，不能以此文件系统验收替代。

27 材料义务仍未决；原声明不删除。Electron UI、安装器、最终 release payload、原生平台精度和跨进程边界的未运行部分不能宣称通过。没有合并、部署或发布。回滚只需 revert 该代码切片并刷新来源清单；不转换或清理用户数据。
