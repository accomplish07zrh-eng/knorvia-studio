<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP连接池与租约

2026-09-29。按批准行为与公开声明替换连接池实现，保留createMcpConnectionPool及公开context/options/pool接口。合同准备者与根完整读过旧464行正文，根核对完整合同与有限McpPort、Logger、TraceContext及telemetry声明后，向独立源作者和测试作者分别提供批准材料。此规格不是运行验收，也不宣称全流程clean-room。

```text
调用者 → pool分配lease → 根据server/scope/config复用或创建adapter
                    → 同连接显式探活合并 → 绑定/引用与owner通知
                    → status/tool快照 → 首次startup事实
释放lease → 减引用 → idle timer或立即开始adapter.close
pool.close → 禁止新lease并清池 → 并行关闭当前连接
```

pool唯一管理可复用连接、引用、同连接探活、idle安排与lease序号；lease管理服务绑定、最近批量配置及一次性startup/close标记。adapter负责实际握手、工具调用和传输，telemetry/logger保留各自事实与日志。不存在新增缓存、进程、网络、回滚、取消或重试系统。CLI尚非受控模块，需另审公开依赖与状态owner。

工厂依次捕获idleGraceMs的nullish默认30000及logger.child({module:"adapters.mcp.pool"})；其他操作仍读取live options.createAdapter/telemetry。方法调用保持options、adapter、telemetry及child logger各自receiver，不await void回调。pool返回普通对象；acquireLease无必需形参，先拒绝closed，再递增序号形成唯一owner后缀，sessionId trim为空视undefined。返回的async端口不依赖自身this。

连接等价由serverName、scope、稳定配置文本依次以U+0000组成。只有精确workspace隔离才用trim workspaceIdentity或trim workingDirectory的truthy fallback，无值为""；其他隔离用该lease owner。工作区不解析路径/大小写。对象配置按own enumerable字符串key排序、排除undefined值并递归；数组保持顺序与稀疏空位；非object用原生JSON.stringify，undefined结果文字null；不调用对象toJSON，不新增cycle/BigInt验证。config所有被编码字段参与；connectOptions中其余timeout/signal/revalidate等不参与复用身份。验收通过adapter复用效果观察，不查看私有key。

新连接先计算上下文、native UUID、可选工作区和仅session隔离的sessionId，依次register telemetry、调用adapter factory、同步取得connectServer Promise，再安装pool记录和新引用/created日志。context/config/connectOptions保留原引用，factory的workingDirectory字段始终存在且使用未trim原值。前置失败不补偿注册；握手拒绝不自动删除连接/引用。

复用先取消idle安排并加入owner，truthy revalidate才等待同连接探活。完成后才释放不同旧绑定、写新绑定、必要acquireOwner及acquired日志，最后等待此时保存的握手Promise。新获取在旧释放前，异常不回滚。重复相同lease/server不重复owner通知。操作没有全局串行队列或代际fence。

探活共享一轮工作但不要求同一Promise对象：先等待原握手settle，fulfilled才读adapter.status；connecting/disabled/untrusted直接保留；connected时optional ping，方法缺席/nullish视true，truthy发revalidated日志。其他状态或false ping写stale日志并进行一次重连，用发起者原config/options，替换连接Promise。旧握手reject不直接传播；新重连reject由最终acquire等待表达；status/ping/日志同步或异步失败原样传播，不改成重试。标记finally清除。pool/lease关闭不取消这些工作。

release先删lease绑定、再删pool引用，只有真实删掉owner才依次通知、日志并安排idle关闭。idle已有truthy timer不重复；delay<=0直接发起不等待的关闭，否则存native timeout再unref；timer回调先清安排，仅无owner时开始关闭。timer/取消/unref失败不补后备。关闭前取Date.now、取消timer、移除仍对应的pool记录在try外；try内await adapter.close后写成功日志，失败转warn；finally live unregister。warn/unregister异常可传播或覆盖，关闭没有once锁，也不自动等待握手。

lease.close先置标记再依序release，只对close自身幂等，不等待实际adapter关闭；第一次中途失败也不重试余项。其他lease方法没有closed guard。pool.close每次先标closed、复制当前连接并清池，再并行close；只阻止新acquireLease，不阻止旧端口重建/在途操作。既有限制保留，不把替换当成自动修复。

批量connect先更新最近配置原引用、释放不再出现的服务，再Promise.all启动所有配置（含disabled）并在全成功后快照。失败不取消已启动项或回滚；单server connect不更新最近批量配置。快照以live绑定迭代，每连接串行status→listTools，忽略缺失连接，不先等握手或ping，不筛选/去重工具，不深克隆对象；statuses保持普通对象。status/listTools都执行完整快照。

首次truthy sessionId的快照先消费startup标记，再始终计算enabled配置选择及connectedCount，即使telemetry缺席。随后才读取live telemetry并按可选调用决定是否构造参数：configuredCount、connectedCount、failedCount、processCount、sessionId。processCount的stdio/connected过滤只在telemetry存在时执行；标记不会因计算/回调失败、缺席或后续配置而复位。此求值范围已作为作者提问后的补充合同单独留档。

callTool找当前lease/pool记录并转交原request/options，不查状态；缺失按固定not-leased错误reject。ping不存在连接返回false、缺方法/nullish结果true；disconnect先await status，成功后release，再返回浅拷贝disconnected/toolCount0/当前ISO时间，不调用adapter.disconnectServer。stats只同步返回池大小和无引用连接数，不探活。

日志保持created/acquired/released/revalidated/stale/closed/close.failed的现有结构、精确消息及context展开顺序；不记录配置正文。optional logger/telemetry缺席时不提前计算其参数专用字段或关闭日志的额外时钟。回调错误的try范围、原错误对象与已发生状态修改均按批准合同，不新增通用catch。

先按批准合同独立写公开行为测试，根先跑冻结旧源，再审候选并用同断言验证源码与实际CLI可达dist。使用自有adapter/logger/telemetry/Date/timer和明确门闩；native crypto保留，不连接真实MCP、OAuth或进程。重点验证共享/隔离、配置等价、重验并发、idle与close差异、快照/startup及receiver/错误边界。不以有限测试证明任意原生timer调度、跨进程网络或所有声明外getter。

根接触旧源，作者保留既有上下文且只读取批准材料，目录并非OS沙箱。旧实现之外的依赖和公开协议权利保持；头注、改名、标准语法、接口字段及测试通过都不能单独证明原创。根Apache与preview身份保持，全量独立替换、整仓MIT和最终稳定发布尚未完成。
