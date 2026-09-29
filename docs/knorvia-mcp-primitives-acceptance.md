<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP描述符与等待截止验收

2026-09-29。按[先行合同](../specs/knorvia-mcp-primitives.md)分别独立重建值投影与单个等待者的截止边界。保留公开名称、参数个数、原始字段/引用、同步到期异常与原生回调竞争顺序；仅修正两类早退没有观察底层Promise拒绝的问题。连接/认证重试、底层任务取消、UI及用户数据均未改。

根在隔离原生进程做四项初始截止观察，加七项描述符观察；设计审阅指出timeoutMs返回值、schema复制和同轮仲裁需澄清。再做15项有限观察，确认期限保存规范化时长、own **proto**/symbol和键位、继承properties引用、同步abort相对微任务优先及0ms timer次序；两项迟到源拒绝同样证实早退缺口。普通pending取消、共享等待者隔离和监听器清理原已正常，不将其包装成新增修复。

五份新测试支撑含71项：28描述符、36日期/等待者、7原生子进程生命周期。原生子进程观察unhandledRejection计数、abort监听器和长timer释放后的自然退出；没有通过强制进程退出让活动资源泄漏冒充通过。

- 旧冻结两正文 **67通过、4失败**，4108.5203ms；四失败恰是已取消/已到期 × 已拒绝/迟到拒绝，各1个unhandled事件。
- 作者冻结首候选 **71/71**，4100.5449ms，无行为反馈后修订。
- 主仓旧源码 **67通过、同四失败**，3658.4098ms；主仓新源码 **71/71**，3668.2847ms。
- 实际CLI可达的两个dist **71/71**，3580.3335ms；两个模块均与CLI sourcemap对应内容逐字节相同。上述三次成功均0失败/跳过/取消。

覆盖fresh默认容器、普通record及非record、名字组件清理、caller决定official、schema浅层所有权/嵌套引用、四hint投影、Error/DOMException身份和非Error拒绝、期限floor/clamp/nonfinite、原始期限不重算、同同步栈和微任务竞速、取消/超时不终止共享源、独立消费者仍获得原拒绝及每种终态资源清理。只以普通平台对象/Promise为边界，未扩张到任意hostile Proxy或被替换的平台实现。

五测试strict类型及94规则lint首轮通过。根类型（含desktop main与5422个中英文键）、根lint2781文件0/0、CLI类型与lint97文件0/0、五测试strict类型、七文件94规则lint、架构0违例和八文件格式通过。CLI目录未托管，另人工核对公开contracts类型入口及每个等待者的单一状态所有权。

已有本地驱动归档下CLI构建 **17/17**、12缓存、26.064秒；保留原turbo/lockfile和动态import提示。descriptor dist SHA-256为 `dc2875cb34dffe022e33f14344c4c855fceae7b35b43ea57dd16dc0307846d71`；timeout为 `6461e4c50e423aae526ddd867697d571fc173ac18922016682d2785072f3a854`。导出及arity分别为normalizer4、错误类1与四函数1/2/4/4。

构建后完整离线回归 **3,201/3,201**，0失败/跳过/取消，617382.7997ms。实际使用Node24.14.0、Python3.13.14绝对路径、本地驱动归档并关闭编译缓存。descriptor新61行/旧59行，timeout新98行/旧99行，共159行，净增1行。精确输入和作者记录见[来源依据](../licensing/evidence/mcp-primitives.md)。没有验证真实外部MCP/OAuth服务、宿主负载或桌面包；根Apache-2.0、保留权利和preview身份继续有效，全量独立目标尚未完成。

原始GitHub run [36522980492](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36522980492)，提交1abf540：Linux **3,123通过、7平台跳过、0失败/取消**，230096.905928ms；Windows **3,128通过、2失败、0跳过/取消**，418719.4028ms。类型、lint、格式、架构、来源和构建步骤均成功，59项新增MCP网络用例通过。Windows的Office离线测试在指定Python3.13.15绝对路径的启动探测中ETIMEDOUT，用例10538.5588ms；异步JSON映射在1000ms预算后仍queued，只记录queued@0ms，用例1359.7667ms。两项原始失败保留，未重跑掩盖；它们不是MCP网络用例失败，也不能把整轮Windows记为通过。

此检查点时，创作与Python测试诊断仍在仓外；后续整合验收见[CI超时诊断](knorvia-ci-timeout-diagnostics.md)。诊断不改变原预算，也不证明历史Windows首因。

本批来源清单 **7,993项、279独立替换、384自有新增、2,474条摘要复核**，问题与缺失0；仍有2,155上游未改、2,331上游修改与1,035未审文件。只按已审具体内容确认许可，不扩大到其他MCP或SDK实现。

原始GitHub run [36525198142](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36525198142)，受检16d6ebb：Linux **3,194通过、7平台跳过、0失败/取消**，153393.315144ms；Windows **3,200通过、1失败、0跳过/取消**，376910.1344ms。来源、类型、lint、格式、架构和构建步骤成功，新增71项MCP描述符/截止用例通过。Windows失败为openai-images的已知失败/重试/超时/取消组合，用例1011.4841ms，在第一个failed等待（原测试709行）1000ms后仍running，queued@1ms → running@11ms。该原始失败保留，不因其他用例或本机通过而改记为成功；尚未确认该次实际磁盘或计时原因。
