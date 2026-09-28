<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 工具依赖与安全分组规划

2026-09-28。独立替换 `core/src/tool/scheduler.ts`；批次执行驱动已另行替换。本批不修改异常输入策略、Runtime 元数据来源或工具行为。已读取旧源码，不作无接触声明；标准图算法、公开类型、固定字段与错误消息不声称为发明。

## 状态与设计

ToolScheduler 实例只保存构造时捕获的并发宽度和调用者的只读工具 Set 引用。每次 schedule 独占一份规划图：公开条目、按 ID 最后值的节点表、未释放依赖计数、反向依赖索引和 FIFO 游标。反向索引只用于查找受完成节点影响的后继，避免每次扫描所有剩余节点；图、排序结果和分组都不跨调用保留。

能力策略分两次读取：一份并行决定，一份公开元数据投影，不能用一次快照代替两者。层级与安全分组消费拓扑结果，不调用工具、不发事件、不持久化。公开入口和三个接口不变，内部纯模块属于现有 CLI，沿用工具合同，不新增跨模块边界。

```text
输入条目 → 能力决定/公开投影 → 每次调用的图
                                  ↓
              初始就绪 FIFO → 完成节点 → 反向索引释放计数
                                  ↓
                    稳定拓扑结果 → 依赖层级 → 安全/宽度分组
```

Runtime 仍从 registry 构造依赖，permission.sideEffectScope 优先于 metadata；只有只读且 scope 为 none 才传入 readOnly=true。Desktop continuous 与 Web replayable 继续使用同一 items、parallelGroups、executionOrder 事件/恢复结构。

## 输出与安全决定

- 保持 ToolScheduler、defaultToolScheduler、可变 READ_ONLY_TOOLS 和 ToolSchedule/ToolScheduleItem/ToolDependency 导出。默认并发数 10；传入 Set 保持引用，后续修改会生效。默认实例和新默认实例同样观察默认 Set。
- 输出 items 保持输入顺序和重复项；每项是新对象，dependencies 保留原 dependsOn 数组身份。字段顺序为 toolCallId、toolName、dependencies、canRunParallel、readOnly、destructive、concurrentSafe、sideEffectScope，缺省字段仍是 own undefined。
- 没有非空字符串名称、也没有任何安全元数据时并行；空白字符串算名称。元数据存在测试按 readOnly、destructive、concurrentSafe、sideEffectScope 惰性读取。
- 其余情况下先求显式 readOnly 或名称白名单回退，再依次：destructive truthy 禁止；concurrentSafe 严格 true 允许、严格 false 禁止；readOnly truthy 允许；最后 sideEffectScope 为 none 允许。
- readOnly=false 阻止白名单回退，但不阻止 scope=none。destructive 前已经求只读值；Set.has 保持集合 receiver。公开 readOnly 随后独立求显式值或 truthy 名称回退，其余公开元数据也再次读取。
- getter/集合方法原始异常同步透传，不包装为图错误。有限可观察 getter 顺序用测试锁定，不声称任意被篡改数组方法或全局对象都已等价验证。

## 图与顺序

公开 items 与执行节点表不同：节点表同 ID 最后项覆盖，映射位置由首次出现决定；初始就绪列表来自所有公开项中空依赖项，保留重复 ID。计数采用该 ID 最后项依赖数组长度，反向索引每个不同依赖只放一次释放边，不能以去重后的长度代替计数。

每次 FIFO 取出仍存在的节点就产出并移除；按节点表的稳定位置释放后继一次，计数刚好为零才入队。已移除 ID 的重复队列项忽略。不采用最小输入索引堆；例如 r0、r1、c1→r1、c0→r0，子层应为 c0、c1。

复核补充：普通数组的 own 元素若是 accessor，提前展开为 Set 会改变读取时间与值。元素描述符检查不触发 getter；只要本次图含此类动态依赖，后继查询就沿节点表位置、在完成节点时调用当前依赖 includes。没有就绪节点时不能读取依赖元素。两种查询共用同一个图、计数、FIFO 和验证路径，不建立第二个排序器。先补“b、a 根及先返 a 后返 b 的依赖”和“无根且 getter 抛错”两项失败测试，再修复此替换引入的回归；不扩展为任意 Proxy/全局原型兼容保证。

剩余节点非空时报原 InvalidStateTransition，消息 `Circular dependency detected in tool scheduling`，context.remaining 按剩余映射顺序，recoverable=false。缺失依赖和重复依赖当前也走此错误，不能静默变成成功或不同错误类型。

## 层级与分组

无依赖为第 0 层，否则为已知依赖层级最大值加 1，未找到的依赖层级按 0（涉及重复 ID 的既存边界）。层按数值升序，同层按拓扑次序；安全工具加入当前组，在加入前达到宽度就刷新，不安全工具独占并切断该层相邻安全组。该屏障不是跨层的全局输入顺序屏障。

保留宽度数值行为：2.5 最多三项，0/负数/0.5 单项，NaN/Infinity 不限制。不得复用批执行的 slice 分波来改变此行为。

最后验证同组依赖，错误保留具体消息及 context 的 toolId、dependency、group 字段顺序、recoverable=false。输出 executionOrder 为最终 groups.flat()，不要求 items 的排列等于它。

## 既存边界与验收

重复 ID 缺口已记录：a:[]、a:[b]、b:[a] 当前接受为 [[a],[b]]；a:[]、a:[a] 则触发同组错误。本批保留并建立回归，不把新增重复 ID 拒绝混入独立替换。生产工具标识应唯一；未来治理需另立行为修复规格。

先在旧版验证输出身份/字段、安全优先级、两组已观察 getter、可变白名单、FIFO、分层、安全屏障、宽度、缺失/重复/循环依赖、重复 ID 两类边界、异常后实例复用，以及真实 scheduleTools registry 范围优先级。再实现局部图与反向索引，进行有限随机图新旧差分、构建产物和完整离线验证。无模型、命令、浏览器或设备调用。

逐文件来源范围限此次规划入口、能力策略、图与分组、新测试和规格；标准算法、拆分和测试通过不单独构成独立依据。相邻 Runtime、合同、registry、事件与执行器其他文件保留各自许可；根许可、版本、旧发行、UI 和用户数据不改变，整体迁移未结束。
