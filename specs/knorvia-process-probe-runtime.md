<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# CLI 进程资源探针重实现

2026-09-30。替换 adapters/device 的 process-probe、shared、linux、darwin、windows 五模块，保留全部现有导出及公共声明。设备身份 state、遥测 tracker、MCP/Bash 生命周期、窗口与用户数据均不属于本批。

## 来源与行为边界

公开 dist 声明及旧版注入调用是合同输入；不使用旧实现正文作为编写模板。原环境设备候选及其 43 项载荷未转移，本批从当前受控源码/实际 dist 重新冻结行为，不继承历史静态或行为结论。单一作者编写测试和候选，不能称全流程 clean-room；逐文件来源、原许可义务与材料限制仍须独立记录。

```text
MCP/Bash caller → probe 实例的连续失败计数
                    → 每个 sample 自有 1000ms 截止与 expired 标记
                    → Linux /proc 两阶段读取 或 Darwin ps / Windows tasklist 一次
                    → 有效结果清失败计数；失败返回 undefined；连续三次停用
reset → 清计数；不取消已有采样，不改变其他 probe 或上报窗口业务状态
```

## 兼容规则

- 保留每个模块的公共函数与类型。Shared 的正整数 PID 判定保留 Number.isInteger 口径，不新增 safe-integer 门；树分组本身不滤 PID。Shared/Linux 根按请求顺序，成员按输入子序 DFS，防重复/环；重复 PID 的最终行提供样本数据。Windows factory 的 Map 顺序采用 tasklist 输出顺序。CPU 字段只有非 undefined 时存在。
- command wrapper 采用 encoding=utf8、maxBuffer=8388608、timeout=1000，保留允许的 extraOptions 合并及 executor receiver 语义；非零/null 状态或 error 为失败，原 stdout 字节字符串成功原样返回。executor 原错误不包装；失败诊断沿用已冻结公共消息。
- Darwin 仅执行 ps，一次树查询用 `-eo pid=,ppid=,rss=,cputime=`，一次组查询用 `-o pid=,rss=,cputime= -g <id>`；Windows 仅 tasklist `/FO CSV /NH`、windowsHide=true，只返回请求直连 PID 的 RSS，无 CPU/父关系字段。不得改为脚本宿主或增加命令、重试、队列。
- Linux 不启动进程。先按目录顺序读取 stat 关系与 CPU（已有 100Hz/10ms tick 口径），只为目标树/组读取 status VmRSS。进程消失、坏单行或缺少有效 RSS 跳过；已存在但没有可读样本的树根保留空数组。PID 名称、括号内命令、父/组 id 与 CPU 字段用旧版黑盒边界冻结。
- 各实例独立连续失败预算，成功重置，失败诊断 callback 的异常不逃出；invalid/空 roots 早退空 Map，Windows group 早退 undefined，不产生外部命令。支持当前并发的独立采样调用，不新增 single-flight/排队。截止后本次余下 Linux 读取停止，晚返回不再成为成功结果；不启动取消/重试机制。

## 验收

实现前冻结旧 source/dist 的有效输出、调用轨迹、错误类型/文本、失败预算及 reset，使用自有注入 executor/proc/timer 闸门。实现后在同一载荷中对候选 source、构建 dist 与 CLI map 验证。不删除旧门失败、平台跳过或未解释差异；失败先归因于合同、加载器、平台或候选。

验收包括树顺序、环/重复、optional 字段、命令失败、CPU 时间格式、CSV/RSS、/proc 两阶段与进程消失、超时/晚结果、失败隔离与并发、MCP/Bash 调用者，以及允许平台的本机自身 PID。根/CLI 类型和 lint、架构、CLI 构建、全量离线、Web/Desktop 静态构建与同提交 CI 按实际结果记录；Linux/Windows 的离线/本机探针不能替代 macOS 原生或 Electron UI 验收。

初次未知 platform 观察两次忽略 reader 注入，读取了当前云机器的 `/proc` 并执行其回退 ps；不访问外部服务器，但不能记为模拟隔离测试。后续默认 OS 入口必须由测试加载器封住，而不是只依赖 options 注入。另一次超时观察因旧 timer unref 导致 top-level await 退出码13，未取得有效超时结论；使用自有保活句柄后观察到既有截止消息。原失败保留，不把加载器或隔离缺口伪装为产品缺陷。

## 2026-09-30 永久合同的隔离与冻结

目标只通过 test-only `KNORVIA_PROCESS_PROBE_CONTRACT_ROOT`（明确 device 目录）和 `KNORVIA_PROCESS_PROBE_CONTRACT_MODE`（source/dist）选择，不能影响产品运行。esbuild 把五个模块装入自有临时 ESM，每个操作前绑定独立 world；node:fs/promises 与 node:child_process 仅允许到自有模拟端口，默认和未知 platform 也不例外。只有 loader 自己可读源码与写临时编译结果，不读真实 /proc、不运行真实 ps/tasklist。计时器在 bundle 内绑定自有时钟，不冻结测试 runner 或文件系统的全局时间。任何未接线 I/O 都显式失败，并检查不曾越过边界。

本批与 76c233875181793a340b1e41da99f18b4f8e279f 的 source 和现有 dist 逐字节核对五份缓存后才运行永久合同。provisional JSON 观察不作为冻结结论，也不提交曾包含本机进程的未知平台载荷。合同成功时记录源/产物与测试载荷摘要、固定假 PID 输入、调用轨迹和断言数量；测试不从候选代码生成期待值。

独立候选采用自己编写的关系索引/迭代遍历、平台格式解析及单次结算状态机，不复制旧正文或仅改结构/名字。同一作者以前接触过旧源码，生产文件保留已有 Apache-2.0 与原版权，不据测试通过直接授予 MIT。新合同和测试表达单独记录；严格 27 项来源材料保持开放。

进程样本不持久化于本组模块；验证包括样本 JSON 的字段缺席和 CPU/RSS 数值、既有 MCP/Bash telemetry 调用方，及固定合成旧→新→旧样本消费。不得改 schema、数据库、设备身份文件、审批/停止或 UI。

### 永久旧门纠正的合同假设

初次旧 source 永久合同 42 项有六项不符合既有行为，均为观察准备期的合同假设，不称产品回归：Windows 低层 reader 每次请求均执行一次命令且接受被请求的有限小数 PID，早退/正整数筛选由 factory 独占；未知 platform 树/组都回退 ps；Linux 目录错误包装为 `/proc 不可读: ${String(error)}`，stat 以最多 64 个并行读取组成批次，截止在已有批次完成后阻止下一批或 RSS 阶段。读取目录尚未返回时发生截止，已进入的扫描仍允许首批受控 stat 调用。无真实读取或系统命令，本批均由 sealed loader 冻结。之前 provisional 未知平台结果不能替代这里明确指定 platform 的结论。

这些兼容边界不被顺带“修复”为新的输入验证或取消策略；外层仍只返回一次 undefined/诊断。新增 64 并行反例检验后，按同一载荷重新冻结 source/dist。候选可以用新的有界扫描设计，不能从旧正文转写其实现。

48 项门在生产替换前于旧 source/dist 各自通过，含 53 组固定解析输入；后补两项真实 MCP/Bash 消费集成在同一旧/新 source/dist 门运行，总数 50。集成直接使用既有 sampler/tracker 与共享 schema，仅用自有 poller/performance 端口控制调度，保留全部数值、停止及回调断言。初次集成的 tsx 接线和虚构 MCP ID 不合 schema 的问题记录为测试准备失败，不称产品故障。JSON 旧→新→旧使用完全合成输出；随机 instance/completion 标识先验证真实 schema，再从确定性比较剔除。它证明样本字段/消费兼容，不是数据库升级或真实用户遥测证明。

原生平台测试加载器必须使用标准 ESM specifier：`require.resolve` 返回的文件系统路径先经 `pathToFileURL` 转换，不能把 Windows 盘符当作 URL 协议。CI #190 的两个新 wrapper 失败来自 fixture 的裸绝对路径动态 import；其余 3870 项通过。修复须保留真实共享 schema、两项消费验收、50 项计数及既有超时，不绕过平台或删除用例。
