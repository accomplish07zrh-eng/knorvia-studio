<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP进程与资源遥测验收

2026-09-29。依照[先行规格](../specs/knorvia-mcp-process-telemetry.md)独立替换tracker和资源sampler。tracker唯一管理registration、owner与当前process；sampler唯一管理timer、inFlight、generation及前一CPU窗口，保留probe负责OS观察。行为保留原有进程/孤儿事实、native ID、全局PID去重与资源通知，不新增传输、持久化、重试或UI改动。

合同准备者与根均完整读过两份旧源（331+169行）及公开声明；根复核完整合同、五份最小声明，并直接核对shared公开事件/资源schema。源作者和测试作者分别只在隔离目录使用九份批准输入，各自设计先于代码，不互读候选或测试。根完整审阅四份先行测试、设计与报告后，先跑冻结旧源，再完整审阅候选两源、设计及报告。没有候选运行反馈改稿或放宽断言。

同组25项：冻结旧源 **25/25**，1482.989ms；候选 **25/25**，1555.6275ms；主仓测试配旧源 **25/25**，1465.6778ms；主仓新源 **25/25**，1458.191ms；实际CLI可达两份dist **25/25**，1475.3895ms。每次0失败/跳过/取消。主仓接入仅补MIT头、相对目标URL/import.meta.resolve工具绑定及格式，不改原断言。

tracker10项、sampler12项、两模块组合3项：覆盖builtin UTF-8/冒号/孤立surrogate编码、native HMAC、owner与session去重、重启/注销/孤儿阈值、捕获身份、空树/缺失树、资源全局PID首次贡献、CPU下降/缺失/换实例、stop与进行中探针、前try错误及同步通知失败。两个模块共用自有probe的组合证明局部memory事件与全局去重资源统计不同、await中进程替换失效、注销后活进程仍可观察。

crypto和Buffer保持原生；OS元信息、process平台、Date、bare/globalThis/global timer、probe、callbacks全为自有端口。一次native randomUUID在计数wrapper后仍返回原生值；原生3秒watchdog仅约束测试门闩。没有运行真实process probe、实际进程枚举、网络或遥测发送。精确dist与CLI sourcemap逐字节匹配：tracker9265字节、SHA-256 315b9cdb8de9be1cbf0c171109d8f7332ba02b004076c6168b3221e1e5109526；sampler5540字节、SHA-256 6d0c58005a665869c4a873d7391c2e0e410dcd216a3bd2f55020bcf08f9a90e2。这不是整包执行或真实跨平台OS采样精度验证。

源作者在工具前保存初稿，此后仅formatter改变表达格式；首轮格式、Node24语法、strict/noUncheckedIndexedAccess/noEmit、94规则lint均通过。测试作者首轮strict与94规则lint通过，初次格式六目标失败，原日志保留；静态审阅补充captured clock/capacity、浅拷贝sink及observed失败副作用，并显式接管globalThis/global timer，均发生在任何产品运行之前。最终四文件94规则lint0/0、strict0诊断、六目标格式通过。没有将静态通过当作运行证据。

主仓根类型含desktop main和5422中英文键、根lint2784文件0/0、CLI类型与97文件lint0/0、四测试严格类型、六文件94规则lint、七文件格式及架构0违例，均首次通过。CLI构建 **17/17**，12缓存，26.493秒。固定Node24.14.0、缓存pnpm10.33.2及本地Cua归档；CLI未纳受控架构模块，另人工核对公开入口、类型依赖与副作用owner。

完整离线 **3,509/3,509**，0失败/跳过/取消，523661.565ms；Python绝对路径、关闭编译缓存，运行期间主仓源码/测试冻结。新两源307+205=512行、10604+6054=16658字节，旧500行18113字节；有效行287/183均低于400。行数与测试成功不能单独证明来源。

既有限制仍明确：采样时钟在标busy后、try前抛错会留下busy，stop也不复位；stop不取消probe且仅在await后核代际；void回调返回Promise不await；同步失败不会回滚已发生的tracker事实。本次维持兼容，未宣称这些问题已修复。未验证外部传输、真实OS probe/资源精度、付费模型、桌面安装/便携版。根Apache、保留依赖权利、preview身份不变；整仓MIT/独立替换与最终发布仍进行。连接池下一批仅在仓外编写，不计已合入。来源见[依据](../licensing/evidence/mcp-process-telemetry.md)。

前批交互授权提交92e5a4d的原始GitHub run [36545732896](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36545732896)，attempt1：Linux job109331546945为 **3,477通过、7平台跳过、0失败/取消**，244091.98537ms；Windows job109331547121为 **3,484/3,484通过、0失败/跳过/取消**，365524.1339ms。全部前置检查成功。这是前批提交的云端结果，不算当前遥测批次CI，也不抹去更早5e8d80a的Python启动超时失败。

前一提交 `492c4dbc5b3b6ee0616e67227e7b87e48fcffa3a` 的 [GitHub Actions 原运行 36547260847](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36547260847) attempt 1 已完成。Linux job `109336522877`：3,509 项中 3,502 通过、7 项平台跳过、0 失败/取消，183491.3806ms；Windows job `109336523052`：3,509/3,509，0 失败/跳过/取消，386886.4926ms。根核对原 jobs、受检 SHA、所有 steps 及下载日志末尾统计，两个 job 均 success。此为前一遥测替换提交的云端结果，不冒充本批连接池候选 CI；既往其他提交的 Python 超时失败记录仍保留。
