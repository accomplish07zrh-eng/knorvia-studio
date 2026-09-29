<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP交互式授权验收

2026-09-29。依照[先行规格](../specs/knorvia-mcp-interactive-authorization.md)独立替换入口及事务provider。入口协调leader/follower、generation winner与清理顺序；私有伴随模块通过闭包持有一次授权所需的client、PKCE、discovery和issuer状态。SDK、共享锁、凭据/发现存储、localhost callback及timeout保持原有副作用所有权，不新增浏览器启动、全事务超时、重试或持久状态。

根完整阅读旧497行正文及公开声明后形成合同。源作者、测试作者分开依据批准合同和声明先设计后编写。根先完整审阅六份独立测试，运行旧31项，再审阅候选设计、正文和报告。原输入未表达callback的实际目录，作者和测试均猜测位于mcp；根在运行候选前发现并提供正确auth目录，源作者仅改两份import路径并保留原稿。原错误路径版本没有运行，不将其记为运行通过或行为失败。

独立原31项：冻结旧源 **31/31**，2438.423ms。根源码审阅补一项普通function提示hook的receiver检查，旧 **32/32**，2419.0285ms；路径修正版候选 **31通过、1失败**，2516.8388ms。原版leader使用SDK-facing provider作为this，新闭包最初直接调用hook；作者仅将两处调用改为call(provider,context)，参数、await及其余源码不变。此行为修订 **32/32**，2505.363ms，不能称候选首次运行全通过。

主仓接入后的同一组断言：冻结旧源 **32/32**，2478.0147ms；新源码 **32/32**，2529.9187ms；实际CLI可达的两份dist **32/32**，2528.8039ms。均0跳过/取消，最终版本0失败。产物逐字节匹配CLI sourcemap：入口7899字节，SHA-256 7804a3ed0b3d1a1eed83b064c3d003d36d19cf521969affab6e613442fc9c554；事务5272字节，SHA-256 0df0a805000e488bfae0924ea5e8f0601ade05e9626b5f022525c599288c244d。

测试使用自有SDK、lease、canonical/pending/discovery及timeout端口；crypto、URL保持原生。一个用例调用真实保留的源码localhost callback，在自有临时listener上经loopback HTTP验证code/state及关闭，不连接外部OAuth。重叠用例通过明确门闩证明code交换/publication等待期间lease保持，不是实际跨进程文件锁争用。compiled验收替换两份dist，callback仍为保留源码；未运行整个CLI bundle。取消与500ms轮询采用自有时钟，原生3秒watchdog只约束测试门闩。

主仓接入补MIT头、平台无关URL及正确callback依赖路径，不改原31项断言；第32项为根追加。首次主仓strict出现3条类型诊断：fixture用整个Timeout namespace作端口集合，真实模块额外导出的deadline函数/错误类不属于本测试端口。改为Pick指定withTimeout及两个discovery函数，仅缩窄测试类型。保留首次失败日志；修正后六测试strict/noUncheckedIndexedAccess、八文件94规则lint0/0、九文件格式通过，compiled32项与完整回归均使用修正后的fixture。

源作者在正式首次静态检查前仅补TTL的number注解以匹配公开声明，工具前原稿保留；正式源检查及路径/行为修订各次类型、94规则lint、语法和格式通过。测试作者初次严格类型/lint通过，初次格式八目标失败；静态审阅时改loopback主机断言接受localhost、IPv4及IPv6并避免重复close，最终检查通过。原作者计数一度写33项，实际独立测试31项，根明确修正；本批32项含根追加用例。静态准备、路径修正、实际行为失败与最终通过分别记录。

根类型（含desktop main与5422中英文键）、根lint2784文件0/0、CLI类型、CLI lint97文件0/0及架构0违例均通过。CLI构建 **17/17**、12缓存、26.316秒。固定Node24.14.0及缓存pnpm10.33.2，本地Cua归档；CLI尚非受控模块，另人工检查公开依赖路径、单一状态/副作用owner。

完整离线 **3,484/3,484**，0失败/跳过/取消，537732.2958ms；指定Python绝对路径、关闭编译缓存，运行期间主仓源码/测试冻结。新入口226行9008字节、伴随175行6074字节，共401行15082字节，旧497行20122字节，净减96行。字数变化和有限测试均不是原创性或任意调度一致性的证明。

未验证外部OAuth、真实用户凭据、付费模型及桌面安装/便携包。本批不替换所依赖SDK/存储或其余MCP宿主。根Apache、适用第三方权利与preview身份保持；整仓MIT、最终稳定发行及官网仍未完成。遥测下一批在仓外准备，不计入本批已替换项。具体来源证据见[依据](../licensing/evidence/mcp-interactive-authorization.md)。

前批令牌刷新提交9b941e1的原始GitHub run [36541180223](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36541180223)，attempt1：Linux job109316702520为 **3,445通过、7平台跳过、0失败/取消**，237705.587911ms；Windows job109316702673为 **3,452/3,452通过、0失败/跳过/取消**，397262.0277ms。全部前置检查成功。这是前批提交的云端结果，不算当前交互授权批次的CI，也不抹去更早5e8d80a的Python启动超时失败。

前批交互授权提交92e5a4d的原始GitHub run [36545732896](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36545732896)，attempt1：Linux job109331546945为 **3,477通过、7平台跳过、0失败/取消**，244091.98537ms；Windows job109331547121为 **3,484/3,484通过、0失败/跳过/取消**，365524.1339ms。全部前置检查成功。这是前批提交的云端结果，不算当前遥测批次CI，也不抹去更早5e8d80a的Python启动超时失败。
