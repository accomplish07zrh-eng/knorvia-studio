<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP进程与资源遥测

2026-09-29。下一批独立替换telemetry.ts与resource-telemetry.ts的现有行为，保留createMcpTelemetryTracker、resolvePluginName、createMcpResourceTelemetry和原公开类型。此规格为root已核对旧500行正文及公开声明后整理的行为要求，不是运行验收记录。调用者管理连接生命周期，tracker管理内存registration/owner/process，sampler管理一个定时器、在途标志及前一窗口CPU基线，保留process probe负责OS观察。无新增传输、存储、重试、进程管理或校验机制。

```text
pool/transport生命周期 → tracker注册、owner及process identity
  → sampler取得当前process快照 → retained probe一次树采样
  → generation/identity核对 → tracker内存/孤儿事实
  → 按MCP ID聚合（跨全部分组PID去重）→ 资源通知
```

tracker按nullish默认依次捕获arch、now、platform、randomId，保留原options用于每次读取event sink与注册时idSalt。传给sampler新浅投影，覆盖resolved arch/platform/now和tracker getProcesses。sampler依次选择probe、logicalCpuCount、totalMemoryGb、native randomUUID instanceToken、timer；defaults仅nullish触发，显式0/负数/非有限值不新增归一化。instanceToken跨stop/start保持，无自动start或首次采样。

默认source：精确node*repl为builtin，精确plugin:前缀为plugin，其余custom；显式非nullish source优先。builtin ID去除一次plugin:，按冒号分段，native Buffer UTF-8编码，保留ASCII字母数字及.*~-，其余字节大写%HH，保持冒号和空段；孤立surrogate由UTF-8替换语义处理。其他source使用原serverName和idSalt的HMAC-SHA256前12位小写hex。resolvePluginName只检查精确前缀、取其后第一段并trim，truthy才返回，不要求后面有key。

注册同connectionId替换全部registration，保持native Map位置，不隐式发关闭事件。owner是有序map，undefined session仍算owner；计会话数时只排除undefined并Set去重，空字符串保留。release最后owner只记录now，不删除无process的registration。start仅接受已注册的正整数PID，先random再now，替换process；无owner且unownedAt nullish时记录时间，发start后返回新identity。crash先清process再now/事件，保留registration/owners；close清process，无owner才删registration。unregister先清owners，unownedAt nullish才取now，有process则保留用于孤儿观察。listProcesses返回新array/rows，仅PID和原serverName/source及truthy pluginName，无probe/时钟操作。

sample entry的isCurrent同时比较registration和process对象身份；重注册/替换/清process失效，unregister保留进程时仍为current。observed缺失tree时只清无owner记录，owned保留；空数组是有效tree，仍产生memoryKb=0。memory直接合计该tree RSS，不套资源分组全局去重。unowned时长max(0,采样时刻−unownedAt)，严格大于60000ms才疑似孤儿，会话数和秒数依既有规则。

事件为process_start、process_crash、session_startup、memory，保留字段/插入顺序、原nullable exitCode/signal、count等值，不在本模块执行shared schema parse。crash uptime为非负时间差。payload计算/状态变更在sink try外，读取/调用live options.onEvent在同步catch内；保持receiver，忽略返回值，不await，不把异步reject说成同步catch已处理。bootstrap目前过滤memory通知是调用者行为，不删除tracker的memory/孤儿事实。

采样已inFlight则立即resolve且不join；空process清基线/时间并返回。非空先标inFlight、捕获generation并取一次now，然后进入try：probe.reset，一次sampleProcessTrees按原process顺序传PID（可重复），await后只核generation一次。整体trees缺失清基线/时间且不逐项observed；空Map是有效结果，逐项缺根可清无主记录。

初次interval为300000，否则max(1, sampledAt−previousAt)。依process顺序，对current entry先observed，再跳过缺失/空tree。按mcpId分组，跨所有分组使用一个seen PID集合，首个PID贡献计数/RSS/CPU。CPU仅非undefined值进入该instance+PID的新基线；有旧值加max(0,new−old)，不除间隔/CPU数、不转百分比，倒退值仍成为下一基线。每个已处理entry保存自己的baseline，即使PID全被去重；uptimeMinutes取非负分钟floor最大值，已存在贡献group的重复entry仍参与uptime。只发正processCount的group，保留首次贡献顺序。

完成时先替换baseline/previousAt再通知，一次调用live options.onResourceSamples，保持receiver且不await。无group不通知，但成功空窗口仍推进previousAt；整体probe无结果不推进。通知/probe/observed等try内异常清基线/时间，finally清inFlight，已完成tracker变更/事件不回滚。getProcesses在try前抛错则reject但未标busy；now在标busy后、try前抛错会reject且busy保留，此既有限制不在本批暗改。

资源字段保留mcpId、instanceToken、sampledAt、intervalMs、processCount、RSS total/max、CPU delta、uptime minutes、platform/arch、logicalCpuCount和totalMemoryGb的顺序。platform/arch在group构造时从sampler options读取，CPU/内存容量和token在构造时捕获，不新增finite/PID/ID验证。

start对truthy handle幂等，按300000ms安排interval再调用可选unref；timer/unref同步错误忽略，但已保存handle不丢弃。无立即采样。stop每次增代、清基线/时间、先清owned handle再尝试clearInterval，清理异常忽略。stop不取消/await probe、不清inFlight、不禁手动sample、不换token；旧样本await后因generation失效，settle前仍阻止重叠。不能把一次代际核对扩大为所有callback后的新事务机制。

验收应先按合同独立写公开行为测试，再比较旧/候选/源码/CLI产物；使用native crypto/Buffer、自有probe/OS/timer及明确门闩。覆盖注册/owner/crash/restart/孤儿、ID/Unicode、缺失与空Map、global PID去重、CPU基线、stop/inFlight、前try异常和同步通知失败；两候选的小集成与单模块端口测试分开计证。不得以此宣称真实OS资源精度、跨平台probe或全应用数据传输验证。

合同准备者及root读过旧正文，独立作者仅读批准合同/声明并披露先前上下文，不称全流程clean-room。native/probe/shared schema等权利保持，有限来源/行为证据不能单独替代许可判断。根Apache与preview身份保持，整仓独立替换及稳定发行仍未完成。
