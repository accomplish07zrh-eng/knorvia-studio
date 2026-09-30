# 文件系统文本切片验收

本切片基于 `ab713db03e43bdf1890479158d2d8e18c2dd4224`，完成本组四个逻辑模块中的 `fs/text-metadata.ts` 和 `fs/text-range-reader.ts`，新增内部行窗口所有者 `fs/text-line-window.ts`。`cli-device-mid.ts` 与 1889 行文件系统门面尚未重写，不能将本切片报告为全组或全库完成。基线 CI #191 的 Linux/Windows 已成功；它只验证旧提交。

[合同](../specs/knorvia-device-filesystem-runtime.md)先于测试和生产替换。旧四模块 source、实际 dist、声明均逐字节保存并与 Git 基线核对。旧正文用于提取合同，作者已有来源暴露，**不声明 clean-room**。新实现的 codec 选择边界统一完整读取/写入/流式解码；新行窗口逐 chunk 扫描，只保留选中行片段，不重复拼接遗漏的长行。两份原文件与新增生产 helper 保留 Apache-2.0 和原来源声明，未新增 MIT 原创 review。测试、规格和验收文本的授权不改变生产版权判断。

## 冻结与实际修复

实现前旧 source/dist 各 186/186：112 项编码/换行观察、实际公开错误类反例和 73 项范围边界，记录所有结果和 Node I/O 顺序。保留 BOM/二进制判断、中文字符截尾检测、多字节 chunk、原 revision/stat 元数据、完整文件行数、取消/关闭错误，以及 fast/stream 在末尾孤立 CR、NaN offset/limit 的既有差异。没有删断言或提高既有产品超时。

旧 carry+chunk 的长行拼接会反复复制已读全文。64MiB 单行、64KiB chunk、limit=0 的隔离探针，旧 source/dist 的暂态 heap 峰值分别 648128472/630669016 字节。第一次候选暂态测试 33680128 字节略高于 32MiB；这受 V8 GC 调度影响，不能等同仍保留的遗漏行。采样改为固定每 128 块及末块 GC 后测仍保留的 heap，**门槛仍为 32MiB**；旧 source 为 66096240 字节，候选 source 为 348408 字节，输出字节数/行数/换行不变。永久回归在 source/dist 分别执行独立子进程，不以耗时门槛掩盖缺陷。

后补四项真实消费检查在旧 source/dist 上均通过：真实 Core Read handler 的行号/回调与实际 `NodeFileSystemAdapter`，legacy 字节读写、stream abort listener 清理/公开 cancelled cause 和 unsupported 错误类。它们属于替换后的集成补验，不能称为实现前冻结。四种合成编码文件经旧→新→旧，原字节与完整结果不变；不用真实用户目录，不作数据库迁移。

测试只读目标模块，封住目标 fs、homedir/env/process/worker/计时随机入口；actual contracts/iconv-lite 与 Read 的共享 token 常量保持真实依赖。准备阶段的 loader banner 重名、错误构造器名称、API checker 的旧 lib target、中文编码联合类型未收窄、从 CLI 子 workspace 调用不可用 turbo 的命令错误均已纠正，不作为产品回归或成功隐去。

## 验证和剩余范围

- 候选 source/dist 各 191/191；186 冻结边界 + 4 实际消费 + 1 内存回归。公开类型与旧声明一致。
- CLI 构建 17/17（12 缓存）；三份实际 dist 与 CLI bundle sourcemap sourcesContent 完全相同。
- 根与 CLI typecheck/lint、格式、架构（0 新违规）、diff whitespace 检查通过。
- 整仓离线回归 3874 项：3867 通过、7 平台跳过、0 失败，264586.64393ms；source/dist 各 191 内部用例由两个 wrapper 计入整仓总数，不重复累加。来源新鲜度通过、reviewProblems=0，严格材料门实际拒绝同一 27 项。本提交 CI 在推送后按新 SHA 独立核验；前次 Web/Desktop 静态验证仅覆盖不变的 UI，本次 CLI 产物另验，不声明 Electron GUI/安装包/release payload 已验收。逐项产物和检查见[证据](../licensing/evidence/filesystem-text-20260930.json)。

材料严格门保持 27 项：15 npm 例外、八份彩色 Material 图标、React skill 完整授权、canvas/Skia 静态链接闭包、QuickJS/WASI/extensions 闭包、native-search Rust stdlib 来源。用户“下排”原创声明只覆盖四份黑白插件图标，未据此解除彩色素材问题。原生 Windows/macOS 精度与 Electron sandbox 所有权仍待受支持 runner；旧 ComfyUI 1000ms 超时根因仍未被后续绿灯证明解决。

本切片无新增依赖、公开 API、UI、数据库格式或数据目录变化。可单独 revert 恢复原两个模块并移除内部 helper；无用户数据清理或转换。下一切片继续身份锁缓存与完整文件系统门面/搜索合同，不能用模块拆分或通过测试来代替全库来源审查。
