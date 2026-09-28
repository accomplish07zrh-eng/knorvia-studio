<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 工作区钩子信任持久存储的独立实现

2026-09-29。此仓内规格汇集先于候选编写的外部行为合同、锁身份补充和已实测的兼容反馈，原始输入及摘要保留。旧目标 `workspace-hook-trust-store.ts` 共 559 行，SHA-256 `8bc1e0826c0f50c594805bfa303fb2b4f914c66d85b87cc30fc7be3a37cbfaa5`。遵循[独立实现总规格](knorvia-independent-implementation.md)，不改功能、数据或 UI。

## 范围与结构

保留四个运行时导出、五类公开类型及 load/grant/revoke/touch/compact 五方法。唯一 Store 持有实例队列；目录和文件读写、跨进程锁、进程识别、路径解析各有内部 owner；中性类型模块供原公开入口重导出，不产生反向类型环。每个源文件按正常格式、包含注释和空行不超过 400 行。

继续使用 contracts/shared 已有的 v1 schema、记录字段与数据根函数；不复制 schema、增加数据库/缓存/授权规则，或执行信任记录中的命令。公共协议、共享路径根、审批流程、其他存储与历史迁移不属于本批许可决定。

每个读写操作按调用顺序进入同一实例队列，准备父目录，取得文件锁后重新读取。失败不阻塞下一项；load 也必须加锁，不返回缓存。文件是唯一持久状态。

```text
公开操作 → 实例队列 → 准备目录 → 文件锁
  → 完整文件读取与 schema → 记录变更与整文件复核
  → 独占临时文件、fsync、关闭 → 发布 → 释放自己仍持有的锁
```

## 记录与调用时机

- grant 在调用时逐记录 schema 验证和复制；同 workspaceIdentity 与摘要的输入后值覆盖前值，保留原有位置，新身份按首次出现顺序追加。空数组也完整写入。复合身份不能存在分隔歧义。
- revoke 未给摘要列表时撤销整个 workspace，非空列表精确撤销；运行时 null 沿用省略行为而不扩大公开类型。显式空数组立即返回拒绝 Promise、没有 IO，文案保持 `hookDeclarationDigests must be undefined or non-empty`。摘要集合立即获取，workspaceIdentity 在队列执行时读取，不额外 trim。
- touch 立即获取摘要集合和 usedAt；缺省取业务 now 的 ISO。允许时间回退；未命中仍写入，但不提前验证无用的非法 usedAt。命中后的整文件 schema 可拒绝。workspaceIdentity 的取得时机同 revoke。
- compact 立即验证 maxAgeMs 有限非负、maxRecords 为正整数；保留原错误文案和同步抛出。立即获取 current 身份及 now，执行时读取 age/limit。current 按存储顺序无条件保留，即使超龄或超过上限；其他记录按 lastUsedAt 否则 grantedAt，年龄包含等号及未来时间，再按新到旧稳定排序填充剩余名额。
- grant 的输入 schema 错误、compact 参数错误、touch 非法时钟可同步抛；队列内故障异步拒绝，不能统一包装成 async 改变时序。构造和普通工厂同步且无 IO；默认工厂和路径解析为 Promise。返回对象不成为下一次操作的缓存。

## 路径与文件合同

实例在构造时按当时 cwd 解析绝对 filePath，锁路径追加 `.lock`。路径解析的 home 使用 nullish 选择再 resolve，而私有根按 homeDir 的 truthiness 决定显式 home/.knorvia-studio 或现有数据根；空字符串的两个判断不合并。

配置位置为显式路径或私有根/cli/config.json。portable 开关也不能跳过配置读取。ENOENT 等价空配置；合法非对象 JSON 等价空配置；坏 JSON 或其他读错包装既有路径文案并保留 cause。storage.dir 只接受对象内字符串并 trim；原始 portable 环境值 truthy 时忽略该目录，包括空白值，不擅自统一其他层的 trim 行为。

`~/` 连接到所选 home，额外斜线不能重置到磁盘根；绝对值 resolve，其他相对值绑定 home，不展开其他 shell 语法。最后追加 security/workspace-hook-trust-v1.json。默认工厂在等待路径解析前浅快照构造 options；不深复制嵌套值或改变路径参数读取。

每操作 mkdir recursive0700 后 chmod0700，目录 chmod 失败拒绝。load 缺文件返回 missing+空记录，不创建 trust 文件；合法文件整体验证后返回 ok，纠正其 mode0600 失败可忽略。其余读错原样拒绝。

JSON/schema 损坏必须返回 corrupt+空记录，不能泄露部分授权；隔离路径追加 `.corrupt-${now()}`，使用真实 rename，不走发布注入。隔离 rename/chmod 失败仍返回该预期路径，不承诺备份存在；后续变更从空集合开始。

写入为两空格 JSON 加换行；同目录临时名保留 basename、PID、真实 Date.now、Math.random 十六进制片段及 tmp 模板。wx0600 创建、完整写入、fsync、关闭后调用 beforeRename，再发布及 chmod0600。仅 Error 的 EPERM/EBUSY/EACCES 按有限 delay 重试，默认 50/100/200/400/800ms；空列表、缺项、稀疏空槽或 undefined 都不提供下一次重试。保留原错误身份。

发布前失败尽力关句柄和清理临时路径；**只有自身成功创建的临时路径可删除**。这个额外改进是在原生碰撞实验证实旧实现误删既存文件后单独批准，不能冒称最初合同已明确批准。发布后 chmod 若失败仍拒绝，目标可能已经改变；不提供虚假的失败全原子或断电耐久保证，无目录 fsync。

## 锁身份与兼容

wx0600 创建锁并完成 metadata 后才能操作，metadata 包括 pid、不可预测 token、进程实例起始时间及新增内部字段 `startTimeBasis: "process"`。业务 now 不参与锁时钟。默认等待 5000ms、超龄 30000ms、争用间隔 10ms；预算不是所有 IO/系统探测的硬截止。

默认实例起点取稳定的进程时间能力，不能取系统 boot。先行真实任务子进程调查已确认旧 metadata 贴近系统 boot；受控 probe 返回同一活 owner 的真实起点时，第二 writer 错误进入，两项成功写最后丢失一项。该调查是默认 metadata 配公开注入 probe，不等同默认 OS probe 验收。

stale 判断 age <= 阈值保留。metadata 读取/解析失败等价无 owner；owner 识别仅按既有 truthy object、number pid、string token，不额外增加整数/正数/非空/自有属性校验。自己的 PID 一律保留；其他 PID signal0 成功或 EPERM 为活，否则为死。死或无 owner 的过期锁仍可回收。

活 PID 只有精确 process 标记、有限 stored start 和有限 probe 同时存在，且差值 **大于** 2000ms，才能按 PID 复用回收；等号保留。无标记、未知标记、缺失/非有限值或 probe null 保守保留。旧版本仍活 PID 的残留锁可能因此等到超时，优先保护活 writer，不以关闭所有回收替代实现。

取得锁中的 metadata 失败先尽力清理自身锁；Error/EEXIST 仍进入原争用流程，并非只有 open 的 EEXIST 才重试。活 owner 的公开 probe 拒绝 Error/ENOENT 时保留锁并继续原争用/预算判断；其他拒绝值原样传播。释放先尽力关句柄，仅仍匹配自身 token 时删除，清理失败不覆盖结果。

默认平台 probe 保留 Linux proc ticks 加 boot（ticks 率100）、macOS ps lstart、Windows PowerShell Get-Process StartTime；失败或不支持返回 null。参数独立传入，Windows helper 隐藏。实际 Windows 探测已对本任务子进程单独执行并核验；不因此声称 Linux/macOS 默认探测已实测。

## 验收与保留边界

作者只接收行为合同、公开签名及依赖声明；不读取旧正文、历史、bundle、测试或 probe/比较器。此前会话上下文及固定接口表达的限制如实披露，不宣称绝对 clean-room，也不以改名、拆文件、许可头或测试通过证明来源。

先旧后新，使用合成目录及任务自有子进程验证文件、队列、错误时序、真实存活/退出、公开注入和锁内互斥。子进程按 IPC 门闩协调、独立截止与有界清理；所有首次失败保留，作者只收行为反馈。整合后必须验证源码、实际编译入口、CLI 可达内容、根/CLI 类型与 lint、架构、来源和完整离线回归。

本批保留 token 检查与 unlink 间的竞态、metadata 创建失败清理的替换窗口、最终 chmod 可能已提交、系统 probe 无硬截止、portable 空白语义差异及断电耐久限制。不得把受控子进程与临时文件的成功扩展为真实用户授权文件或所有跨平台故障保证。根许可和预览身份在整体独立验收前保持。
