<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 工具结果预算、保存与追加上下文

2026-09-28。按独立实现规格替换工具结果序列化、内容投影和保存预览三个入口，保留现有调用协议。已读取旧实现，不作无源码接触声明；公开标签、提示文案及字段属于兼容要求，不是独立实现的证明。Artifact Store、Hook 执行、model 内容协议、CUA authority 和结果 UI 不在本批许可决定内。

## 所有者和设计

每次序列化独占输出事实和返回结果，没有共享缓存。实现分为 UTF-8 配额分配、结构化内容策略、保存适配和最终输出决策；公开入口只安排这些阶段。保存 IO 只通过已有 ToolArtifactStorePort，追加上下文不再写入原始 artifact。

```text
handler 输出 → 模型格式化 → 本次文本/预算事实 → 可选保存端口（await）
                                                    ↓
            空结果 / 受保护帧 / 原文 / 保存预览 / 截断 → 同一结果 envelope
                                                    ↓
               已完成 Hook 上下文 → 过滤与配额 → 新结果（不改原对象）
```

调用方仍拥有 session、turn、工具执行和取消。保存携带原 trace 和 AbortSignal，不自行重试；端口拒绝（含取消）沿用已有保存失败回退，不把一次成功工具结果变为存储错误。桌面/手机通过同一序列化结果继续各自的 continuous/replay 链路，不引入队列、owner 或事件改变。

## 序列化契约

- 工具 formatModelContent 优先并保留 receiver；否则字符串原样、undefined 为空、其他输出 JSON.stringify，编码抛错才用 String。格式器异常继续传播。结构化文本沿用 contracts 的模型内容转换，不能用 JSON.stringify 替代。没有保存时不增加 await；保存期间模型块可能变动，原文分支的文本仍保留保存前快照，模型内容引用沿用原约定。稀疏数组按既有数组方法跳过空槽。
- 空白字符串、空数组及仅包含空白 text 的数组返回 `(工具名 completed with no output)`；originalBytes 仍计原始转换文本，returnedBytes 计占位文本，truncated=false，不保存 artifact。包含非 text 块即不算空，即使可见文本为空。
- 缺省预算为 inline/model 各 100,000 字节、truncate、head；有效文本上限为 max(0, min(model, inline))。UTF-8 字节与 maxModelChars 的 UTF-16 字符阈值分别判断，都是严格大于才超限。无意改变既有 inline 策略超限也截断的行为。
- 仅 artifact 策略且 artifact.enabled 严格 true、至少一个阈值超限时尝试保存。请求包含 sessionId、trace.turnId ?? deps.turnId、工具身份、原始转换文本、显式 MIME 或按原 handler 输出是否字符串选择 text/plain/application/json、retention ?? session 及原 trace；一次调用最多写一次。
- artifact 路径优先写入结果的 path ?? uri，然后原输出对象中首个非空字符串 persistedOutputPath/rawOutputPath/artifactPath/outputPath；空白路径不 trim，空的写入 path 阻挡 uri。普通数组不是路径对象。
- 保存阶段在受保护帧判断之前。普通内容未超任何阈值时保留原模型内容引用。字符超限且本次应该保存、但无 store 或保存失败时，保留完整原文，即使字节也超限；仅字节超限保存失败继续截断。
- 保存成功且路径非空时，工具 formatPersistedModelContent 优先，只有 undefined 才采用通用预览；其异常传播，空字符串和空数组都有效。保存预览使用独立的 2,000 UTF-16 字符预算，可大于触发保存的文本预算。返回 truncated=true。
- 其余超限输出按方向裁正文，优先保留 resultBudget 截断后缀；后缀过长也裁至预算。UTF-8 裁剪按 Unicode 码点边界，支持 head/tail、组合字符、孤立代理项、零/负数/小数预算；不将截断正文伪装为完整输出。公开文本、字段顺序、缺省字段省略/存在性及计数保持。

## 保存预览

保留 persisted-output 的标签与行序。预览超过字符预算时，若预算内最后换行严格位于后半段则在该换行前截断，否则按字符数截断；不 trim，不改为字节裁剪，省略号单独一行。显示尺寸按十进制 B/KB/MB/GB 和 Math.round，定制 formatBytes 分别接收原字节数及预览字符数。识别器要求开标签在开头且正文包含闭标签，允许闭标签后的文本。

通用预览只读取已声明的输入字段，不展开额外属性。公开 helper 沿用负字符数的既有 slice 结果；当前产品调用使用固定正数，保留此边界不代表建议负配额。结构化 Hook 的 text 采样与媒体筛选、原结果展开与模型投影、受保护帧文本转换与媒体计量都保持原有先后阶段，避免有限 getter 更新改变可见内容。

## 结构化结果和 Hook

- CUA protection 必须由注册侧提供，不能按工具名、图片或正文猜测。只有合同返回已认可 image/image_ref 对时才启用原子保留；对不在索引 0/1 的认可帧抛既有专用错误。序列化边界仅将此错误转为可恢复 CoreError，并记录稳定 code/工具身份/trace，不记录栅格或原始 authority。
- 原子对保留对象引用及顺序；之后只保留非空 text，其他结构化块被移除时标记 truncated。文本足够且没有其他结构化块时不截断。超限先保留原子对，再为截断提示和两次分隔符预留配额，最后按方向放正文；原子对本身可以超过通用文本预算，媒体仍受上游独立大小限制。
- 受保护投影的 returnedBytes 为转换文本字节加 image.dataUrl 和无 text 的 file.dataUrl 字节；普通结果沿用现有文本计量，不擅自声称所有媒体已采用同一计量。
- 空 Hook 数组返回同一 serialization。只有受保护策略过滤合同认定的 authority 文本；全被过滤时仅复制并标 truncated，不能把过滤内容放回其他路径。当前产品合同不授予这类 authority，相关分支用隔离模拟合同验收，真实驱动能力另列未验证。
- 受保护、含 image 的结果只在原有块后追加可容纳的 Hook text，不重排、不替换图片；文本剩余预算不含已计入 returnedBytes 的媒体，追加只增加实际新增文本字节。其他路径保持 Hook 标头及从 1 起的编号。
- 已持久化且截断、有非空 artifactPath、正文被标签识别器认可的预览不再截断原预览；Hook 独享正常文本预算。普通字符串正文与 Hook 共同限长，优先保留 Hook 后缀。
- 普通结构化内容未截断时在末尾加 Hook；截断时保留非 text 块（带非空 text 的 file 例外），按原顺序放前面，再接预算化 text/file.text 与 Hook。不新增媒体授权，保留输入对象及原始结果不变，原 truncated 一旦为 true 不撤销。

## 验收

先在旧实现运行固定期望测试：文本/空值/格式器、UTF-8 与字符预算、保存参数及失败、预览、Hook 顺序/配额、模拟原子帧拒绝和计量。替换以阶段化结果决策和按码点单次扫描分配为依据，不把拆文件或变量改名当作原创。有限差分排除真实设备、网络和时钟，不主张穷尽恶意 Proxy 或全局对象改写。

执行根/CLI 类型与 lint、变更严格 lint、架构/格式/来源、真实 CLI 构建产物和完整离线测试。MIT 决定逐文件绑定新的实现和测试摘要；根 Apache 许可、现有预览发行及未替换模块保持原范围。
