# TaskOutput 有界文件窗口

2026-10-01，基线 `0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`。仅替换 TaskOutput 的两份有界文件读取循环，统一为一个内部文件 IO 边界。任务投影、文件选择、结果字段、通知所有者与模型文本格式保持。

## 读取合同

- 通用任务输出读取最后 8 MiB；运行中 local_bash 读取前 30000 字节（调用者原选值）。这是字节窗口，不按字符截取，不重新对齐 UTF-8；截断处的替换字符按现有 Buffer 解码保留。
- 未给路径立即返回 unavailable/空内容/未截断，不先检查取消、不打开文件。给路径后先检查取消，再 open(path,r)、stat、一次分配有界 buffer。
- 尾部读取起点为 size-windowSize；头部为 0。每次 partial read 后推进 buffer offset 和文件 position；read 返回 0 即停，不忙循环。一次打开和一次关闭，不额外 stat、readFile、重试或缓存。
- size=0 直接返回 available/空/未截断，但仍关闭文件，不新增末尾取消检查。非空读完后检查取消。close 位于 finally，close 拒绝可覆盖原结果/错误，与现有语义一致。
- 通用尾部：omittedBytes=size-实际读到字节；正数时保留精确 `[NKB of earlier output omitted]` 行，N=Math.round(omittedBytes/1024)。短读也按该原语义标记。头部不加省略行，只置 truncated。
- 捕获失败后，若 signal 已取消抛标准 DOMException("Task output wait aborted","AbortError")；否则 Error 且 name=AbortError 原对象重抛；其他 IO/关闭/分配错误返回 unavailable/空/未截断。取消和其他错误的优先级保持。

## 边界

原有异步文件 IO 仍只用于选定的任务输出路径，不新增目录枚举、权限、读取范围或状态。统一 helper 负责打开/有界读取/释放，projection/Bash helper 只选择头尾策略。取消 helper 与两个消费者共用，避免循环引用。RuntimeTaskRegistry 和既有执行端口仍分别拥有任务状态和 Bash 快照。

## 验收

替换前对 source/emitted 两个真实投影入口冻结合同，使用自有文件句柄模型观察路径、字节偏移、partial/zero read、打开/stat/read/close 异常和取消顺序；未匹配的原生 IO 原样转发。另以自有临时真实文件覆盖 UTF-8 和超过窗口大小的头/尾读取。替换后原合同复跑，不能只测 helper。完整 CLI/根类型、lint、构建、格式、架构、来源与全量离线回归，最后核对原生双平台 CI。该批不证明整个 TaskOutput 独立完成，不改变适用许可或27项材料义务。
