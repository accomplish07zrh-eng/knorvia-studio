<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 创作运行截止与真实IO计时验收

2026-09-29。按[先行合同](../specs/knorvia-creation-polish.md)增加可信内部调度依赖，只接管CreationService原有运行看门狗。默认仍用原生setTimeout/unref/clearTimeout；安排在原try之前，取消在原finally，任务状态与写入仍由controllers/mutate持有。三个协议组合用例改为本地手动截止时钟，存储退避、供应商轮询、终态轮询与Date保持真实。

原始Windows run36525198142的openai-images已知失败阶段1000ms后仍running，实际首因仍未确定。独立机制调查向自有failed-terminal rename注入一次EPERM：全局冻结setTimeout使25ms存储退避不前进，真实1000ms先超时；随后单独推进25ms才保存failed/400。真实时钟对照正常。该受控机制不证明云端当次存在EPERM或真实文件锁，也不把异步JSON其他历史失败合并成同一首因。

隔离候选新增三项先行验收：首轮0通过3失败，其中两项是旧服务未提供调度依赖，第三项保留旧全局冻结接线，1004ms仍running且只发生一次目标rename。最终接线改为明确业务端口后，候选相关17/17；单次EPERM在78ms读到failed/400、提交1、注入1、目标rename2，业务时钟0。这里改变了测试接线，不能声称仅加入产品选项就让旧全局冻结测试自动通过。首轮两新测试格式未过，排版后通过；原始结果和首稿保留。

根全文审核报告、补丁和候选，验证原文件摘要后先整合规格及测试。最终窄时钟测试在主仓旧服务 **1通过2失败**，1942.7688ms；EPERM测试此时没有全局冻结，原生IO正常，缺失的是显式调度依赖的两个契约。整合候选后 **17/17**，6867.7407ms，单次EPERM75ms完成。

首轮根类型、lint及严格测试类型通过，但架构因creationService406行超过400上限失败，尚未执行其后的格式/构建阶段。根将完全相同的默认原生调度提到同模块私有creationRunDeadline，移动原因注释；服务399个物理行（检查器计400），helper6行，不增加状态或运行路径。此后相关 **17/17**，6857.7905ms，单次EPERM78ms，取消函数归还1次、pending0，业务时钟仍0。新测试只追加MIT头，已有服务/测试候选保留原来源；该helper是提取的原生调度，未计为独立替换。

最后根类型（desktop main及5422中英文键）、根lint2784文件0警告0错误、三测试strict ES2025、五文件94规则lint、架构0违例和七文件格式通过。CLI构建 **17/17**、16缓存、1.585秒，使用已核验本地驱动归档。构建后完整离线 **3,280/3,280**、0失败/跳过/取消，513020.0953ms，Node24.14.0、真实Python绝对路径、关闭编译缓存。

三协议仍断言HTTP400/提交1、幂等重试成功/提交2、确认供应商到达后推进原500ms得到interrupted、用户取消且总提交4，以及不确定结果不可一键重试。终态1000ms/10ms预算保持；新边界另测499+1截止和finally取消，原默认调度的三处持久化用例继续通过。故障只匹配本例唯一绝对jobs路径、同目录临时文件和本任务failed/400；其余rename走原生函数。没有真实锁、真实供应商请求、用户数据或CI重跑。

| 根最终文件                             | 行数 | SHA-256                                                          |
| -------------------------------------- | ---: | ---------------------------------------------------------------- |
| creationService.ts                     |  399 | 7e68b8a345a3d88d38b060a0be0b57642b72a0d79a221dc7d1d6c6cdafdd8ffd |
| creationRunDeadline.ts                 |    6 | b6b569e75865a12f4ac48d895c62d67731ae8e77654dc3954585dfb17daed1d7 |
| creation-polish.test.ts                |  835 | f92552531bfa5e8aa855d37d8e7e50096ff3d7e71566b5a285af67ec61507243 |
| creation-run-deadline-clock-fixture.ts |   41 | 9c4c20ada5dccc1e87c901e84cb3bbf52a3a479b9cf63e7bdf74d66a0386edf3 |
| creation-run-deadline-clock.test.ts    |  270 | 9193ef7e9dfc834f0db0730e9979ec00781300a959cb3e00c3ee62b459bd6e91 |

隔离报告SHA-256为ce1838512c04f2b7f76389a0c79ad5d7fb1671d14b5a9022a9191b651719f13d；补丁d525bb158ce6200a6235ff8f121a64cc07634824486281a2730a25bd6eb11046；最终文件清单及首轮日志保存在仓外creation-deadline-clock-rebuild目录。根主仓old/new/split三份结果和架构首次失败单独保留。

来源仅为两份新测试支撑及本文作逐内容判断；原服务、提取的原生helper、既有测试及规格继续未审分类，不因功能修补扩大MIT。仍有其他旧测试使用全局虚拟计时，本批不宣称消除了所有此类风险。未验证任意重试/慢盘均能在1000ms完成、历史CI首因、桌面包或真实生成服务。根Apache、保留权利与preview身份保持，全量独立发行目标继续。

原始GitHub run [36529205282](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36529205282)，受检cad534f：Windows **3,277/3,277**、0失败/取消/跳过，400279.4268ms；Linux **3,270通过、7平台跳过、0失败/取消**，232406.864823ms。两平台来源、类型、lint、格式、架构、构建和完整离线步骤均成功；72项OAuth新用例通过。没有重跑既往失败，云端本次成功不代替历史首因证据。

本批来源清单 **8,004项、281独立替换、394自有新增、2,486条摘要复核**，问题与缺失0；新增的原生调度提取仍列未审，未审总数1,036，未据此次修补扩大许可。
