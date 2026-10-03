# 工作流事件投影第三小组

2026-09-30。基线 `bc36df98da36e56cda66051137b99d31f2184666`；分支
`parallel/protocol-workflow-projections-20260930-batch3`。前两组六个生产文件及交接材料不改。

## 所有权与设计价值

生产所有权仅为 shared/protocol-v4 下的 workflow-runs-concurrency.ts、
workflow-runs-phases.ts、workflow-runs-node-progress.ts。三者均为 upstream-unchanged，
review=null，历史仅初始快照。不是通过改路径或格式扩大独立完成数。

三个投影器分别建立并发事实的条件投影、阶段集合/并行邻接关系的有界归约、节点生命周期
与进度字段的更新策略。阶段邻接去重用稳定集合，更新只复制命中路径；节点读数采用显式
字段判读与缺席投影；并发配置与共享桶观测分开计算。由事件契约定义取舍，旧源码仅用于
对照，不能当作逐行改写模板。这些工程设计仍须来源复核才能作独立/MIT 判断。

模块不读取时钟、文件、网络或凭据，不新增持久状态。真实权威仍为现有引擎/journal；
主 workflow-runs-reducer 按既有事件顺序调用纯函数，TUI mirror 与 CLI product projection
消费同一公共协议。没有新 queue、owner、lease 或时钟；不修改 UI、services、CLI、schema、
wire、投递或恢复路径。

```text
已有 engine/journal → 原 envelope → 原 shared reducer → 三个纯投影函数
                                      ↓
                       同一权威 workflowRuns 状态
                     ↙                              ↘
          desktop continuous               mobile replayable / TUI 冷回放
```

## 实现前固定合同

- 保留所有 exports、签名、公开声明/注释、字段顺序、缺席键、引用复用/no-op、异常和输入不变性。
- 并发 next 必须为正整数，否则原 run；previous 非法回落 next，ceiling 取既有/previous/next 最大。
  key 不 trim、不截断，超 256 字符整键省略；limit 原样携带；idle_reset 清 cooldown，其他原因仅
  接受非负整数。run-started 仅接受 ceiling <=1024；配置 ceiling 单独记录，只有 limit<ceiling
  才创建/更新 concurrency.limit，保留共享 cap/key/cooldown 与单调 ceiling。终态清 cooldown，
  缺席时原引用返回。Number.isInteger 与公共 schema 的 safe-integer 边界差异按既有行为冻结。
- run-launched 只收字符串阶段名，UTF-16 裁到128，省空串、保空白/重复/声明顺序，最多32。
  phaseAlongside 的索引指向接受后的名字表；去自环、非法数、越界和重复，保首次顺序，补齐
  空行；完全为空时不写新键。旧 run 的键由对象展开继续携带，不偷偷清旧邻接表。
- phase-entered 同名仅更新第一条；ordinal 正整数否则1，rounds 单调 max。表满拒新名并标
  truncated，但 currentPhase 仍跟随事件；已有名照常更新。阶段/节点/actor 不互相重建。
- carryNodeProgress：node-queued 和 cached===true 的 node-settled 清旧计数；新 queued 只认
  本次 instructionsHead，其他事件缺头时可继承旧头。三个读数仅在非出生事件携带，保原 lastTool
  引用。摘要按240 UTF-16截断，不 trim、不加省略号。
- node-progress 仅匹配既有 (siteId,ordinal) 第一条。turn 正整数、toolCalls 非负整数；有效值
  后来覆盖，非法/缺席保旧。lastTool 仅对象非数组，name 非空按64截断，target 非空按120截断；
  name 无效整条不用。它不修改生命周期、usage、actor 或指令头；命中即复制 run/nodes/命中节点，
  未命中原引用。所有 payload/native 反例、JSON 和引用边界先在旧 source/dist 冻结。

## 验收与来源资格

先提交 spec、精确旧观察值、负例、引用/不变性及真实消费者测试，再实现。source/dist 使用同一
入口；公共 reducer 与原 TUI mirror 及 UI 工作流联接函数的只读消费者检查覆盖顺序、
重放、resume、并发冷却、部分读数、阶段上限和连续/回放同终态。正式 GUI、模型及设备不在本组。
声明字节核对、shared emission、相关 CLI 构建、根类型/lint、严格 scoped lint、格式、架构和
pre-push 按真实结果记录，不重复全套 CI。

契约准备时尝试打包原 CLI journal/launch 入口，其 core/REPL 传递依赖触发 ESM 的动态 fs
require 错误，未完成该入口验证；不修改调用方或用 stub 冒充它。消费者验收收窄到上述纯入口，
合成 accepted envelope 的重放只验证共享投影/TUI 语义，不声称测试了 journal 读取或铸造链。

源码总分母227，已接受且摘要匹配的独立记录12，来源待闭合215。本组完成行为验收后本轨
覆盖9/215，另有206未在三个小组替换；新增来源闭合与 MIT 授权仍须单独决定。源码暴露已
披露，保留 Apache/NOTICE；不修改 ledger/lockfile/global config，不提出虚假 clean-room。
来源闭合策略在 docs/knorvia-protocol-source-review-strategy-20260930.md，父任务协调实际复核、
清单与集成 CI。本组完成后先交接检查点，再选择其他 ownership。
