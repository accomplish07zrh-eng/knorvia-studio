<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP令牌刷新协调器验收

2026-09-29。按[先行规格](../specs/knorvia-mcp-token-refresh.md)独立替换oauth-refresh.ts。保留一次共享锁、入口generation与锁内复查、discovery/resource选择、原refresh token捕获、canonical发布及exact-raw失效。保留锁/store/SDK分别拥有副作用，不新增网络、重试、缓存、配置、UI或真实数据改动。

根先完整阅读旧291行正文与公开声明，形成合同；合同审阅补齐发现结果投影的catch范围与refresh token捕获时间。源作者与测试作者在分开的仓外目录，只使用批准合同/声明，各自先设计后编写；根先完整审阅测试并运行旧源，再审阅候选设计、正文及报告。不称全流程clean-room，具体限制见[来源依据](../licensing/evidence/mcp-token-refresh.md)。

27项先行验收：冻结旧源 **27/27**、3218.0769ms；候选 **27/27**、3196.6793ms；主仓旧源 **27/27**、3208.1699ms；主仓新源 **27/27**、3196.6775ms；实际CLI可达dist **27/27**、3188.3013ms。均0失败/跳过/取消，没有运行反馈后修订候选或改变断言。主仓测试接入只补MIT头、平台无关的默认URL/临时目录绑定并格式化；同一断言用于全部源码/产物验收。

测试使用自有凭据/发现/刷新端口，实际SDK OAuthError/OAuthErrorCode与native path。一个有明确门闩的重叠用例在自有临时目录中调用真实共享锁：两次调用共享entry generation，首次exchange暂停至第二次lock请求，随后只发生一次exchange/publication，两次获得winner token、四次canonical load。不是任意跨进程、崩溃恢复或真实credential store测试。多数其他分支是端口测试，不冒充OAuth实网验证。

编译产物7649字节，SHA-256为a42cd1f5527d478a65770f4f263d457fa5f90d809e00d6b0b42b95b95d8f13ca；与实际CLI sourcemap的可达源内容逐字节一致。保留准确SDK错误类，未用同名code对象替代真实分类；覆盖cache nullish/falsy差异、proactive/reactive策略、CAS false/拒绝、publication/logger失败及timeout恢复。

源作者首稿严格类型失败1处：SDK resource选择要求provider类型而现有运行合同传fresh空对象；补仅编译期参数断言，运行对象不变。首次94规则lint失败2处冗余spread，改直接条件对象；首轮格式/语法通过，最终严格类型/lint/格式/语法均通过。测试作者首轮strict因metadata缺SDK必填字段失败，补固定字段；首轮默认93规则lint通过不算94规则，首轮格式四文件失败；最终strict/noUncheckedIndexedAccess、批准94规则和格式通过。类型输入审计助手首轮Windows D: ESM路径错误，改file:///后332项readFile输入、0诊断。上述首次结果与初稿均保留，未执行产品或测试的静态失败不冒充行为失败。

根类型含desktop main、5422中英文键，根lint2784文件0警告0错误，CLI类型及97文件lint0/0，四测试严格类型、五文件94规则lint、架构0违例、六文件格式均通过。CLI构建 **17/17**、12缓存、25.851秒。入口直接绑定Node24.14.0及缓存pnpm10.33.2，构建用本地已核验Cua归档；CLI目录尚非受控模块，另人工审阅shared/contracts公开入口与唯一依赖owner。

完整离线 **3,452/3,452**，0失败/跳过/取消，526749.22ms；指定Python绝对路径、关闭编译缓存，运行期间主仓源码/测试冻结。新源220行8232字节，旧291行10558字节，净减71行。不据有限行为测试保证任意微任务排程一致。

文档收尾时，来源清单生成与核验通过；全仓格式首轮在5,289文件中仅reviews.json未通过，保留首次日志后单独格式化并复核。此前六文件源码/测试格式检查通过不替代这次全仓结果。提交前首次远端新鲜度检查因GitHub TLS unexpected EOF未完成，未将其写成通过；后续结果以实际再次获取为准。

未验证实网OAuth、真实凭据、收费模型、桌面安装/便携包。本批未替换交互式授权、其余MCP宿主或保留SDK/存储；根Apache、适用第三方权利及preview身份保持。下一批交互式授权只在独立目录开始设计/编写，全量独立替换、稳定发行与官网仍未完成。

上批授权锁/provider提交b24b0af的原始GitHub run [36537075933](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36537075933)，attempt1：Linux job109303455163为 **3,418通过、7平台跳过、0失败/取消**，239998.472464ms；Windows job109303455354为 **3,425/3,425通过、0失败/跳过/取消**，402299.3907ms。全部前置检查成功。这不是当前refresh批次的云端验证，也不改写更早5e8d80a的Python启动超时失败。期间GitHub查询出现网络传输失败，随后已取回原始job结果与日志；查询失败不计为工作流失败。

前批令牌刷新提交9b941e1的原始GitHub run [36541180223](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36541180223)，attempt1：Linux job109316702520为 **3,445通过、7平台跳过、0失败/取消**，237705.587911ms；Windows job109316702673为 **3,452/3,452通过、0失败/跳过/取消**，397262.0277ms。全部前置检查成功。这是前批提交的云端结果，不算当前交互授权批次的CI，也不抹去更早5e8d80a的Python启动超时失败。
