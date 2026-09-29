<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP 客户端验收

2026-09-29。根代理按批准合同亲自完成十三份生产源码，替换 MCP 客户端工厂与生命周期。独立测试在旧实现先通过81项，再对候选、主仓源码及确切CLI可达编译产物各通过相同81项；整仓离线 **3693/3693**，0失败/跳过/取消，466740.5407ms。真实服务、授权网站、系统进程和安装程序不在本批验证范围。

## 实现边界与状态所有者

原入口77649字节被十三文件56504字节替换；单源最大274物理行。连接上下文是唯一活动状态所有者，连接池保留lease所有权；API、认证、连接、等待、工具调用、生命周期、官方请求和清理分别消费同一上下文，不添加平行持久状态。公共工厂、McpPort、传输/权限/配置接口均保持；详细合同见[规格](../specs/knorvia-mcp-client.md)。

候选最终冻结在独立测试正文曝光和任何候选运行之前。整合时十三源与冻结逐字节一致；候选首次行为验收和主仓验收之后没有生产逻辑修补。独立作者编写测试，另一代理执行旧版优先与候选验收，根复核完整报告及累计差异。

## 保留的首次失败与修正

没有将夹具修正过程记作全部首次通过：

| 阶段                  | 实际结果与原因                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 首次 Windows launcher | preload使用盘符路径而非file URL，10个文件wrapper失败；未执行80个行为用例                                             |
| 改为file URL          | 0/80；metafile相对路径错误地按被替换的process.cwd解析，夹具拒绝目标本身                                              |
| 固定审计根            | 26通过/54失败；fetch函数被夹具invoke提前调用，官方stdio provider预期遗漏、脱敏字段和清空调用记录后取client等夹具问题 |
| 四项夹具修正          | 77通过/3失败；Node原生abort默认原因、官方fetch函数身份、reconnect fulfilled/rejected两条合同需区分                   |
| 合同与Node修正        | 81个行为用例通过，但新增rejected-wait测试留下后台promise使文件wrapper失败                                            |
| 排空该测试promise     | 旧版81/81，exit0，5900ms                                                                                             |
| 候选首次运行          | 相同81/81，exit0，7001ms                                                                                             |

原80用例全部保留；另增一项真正的rejected-wait回连日志断言。fulfilled failed-status分支按合同不要求失败日志；rejected分支必须记录并保留原工具错误。脱敏输入采用批准的access_key，未改生产脱敏规则。官方fetch使用调用即抛出的哨兵并断言函数引用。清空日志前捕获SDK对象、仅在断言后排空夹具后台promise。没有放宽超时或依赖白名单，也没有删掉失败用例。

每轮完整TAP、脚本与增量收据均在仓外保留。接受测试与冻结测试的累计patch绑定[来源依据](../licensing/evidence/mcp-client.md)。验收代理在旧版门槛前枚举了候选文件名/大小/摘要，未读正文；不得描述为零元数据曝光。

源码静态过程也保留了最初checker访问未导出的SDK package.json、TypeScript baseUrl配置、OAuth公开union类型、一个多余正则转义lint警告和格式差异。checker/类型/格式修正及两项先行诊断澄清在任何候选行为运行前完成。最终严格类型0诊断、94规则lint0警告0错误、格式通过；受限读取337项未越过批准边界。输入摘要捕获晚于部分首次阅读，不能冒充读前封存证明。

## 主仓整合与实际产物

十九测试文件只有标准MIT头、可移植导入和显式加载器调整：十suite置于test根以被现有非递归回归收集器发现；九harness置于mcp-client-harness。加载器固定absWorkingDir并先审计metafile，只接纳明确入口、同目录同扩展名client-\*与有限依赖映射；未知import拒绝。write:false和内存data URL避免多进程共享生成文件。没有用shim替代十三份待测实现。

其余十八测试文件经过导入路径规范化和类型擦除后生成JavaScript一致。首次等价checker因esbuild保留import换行报告差异；加双方同样的minifyWhitespace后相同。保留首次失败元数据；完整最初assert差异只有工具输出，未另存独立全日志，不虚构该文件。加载器例外单独完整复核，未称为字节等价。

| 对象          | 结果                       |      耗时ms |
| ------------- | -------------------------- | ----------: |
| main-source   | 81/81，0失败/跳过/取消     |    6009.284 |
| main-compiled | 81/81，0失败/跳过/取消     |   5451.8544 |
| 完整离线回归  | 3693/3693，0失败/跳过/取消 | 466740.5407 |

十三份实际dist JavaScript全部与CLI knorvia.cjs sourcemap中的sourcesContent逐字节一致，然后由同81项直接验收，未把类型检查当作运行证明。定向运行使用Node24.14.0、tsx file URL、concurrency1、20秒runner截止、禁用缓存、清理继承凭据环境；SDK/fetch/OAuth/凭据/进程/时钟/telemetry均为owned seams。全仓回归使用pnpm10.33.2和本地CUA驱动归档；回归期间生产源码和测试未改变。

十九测试strict/exactOptional/noUnchecked类型检查通过；三十二文件94规则lint0警告0错误；三十三目标格式通过。根typecheck含desktop main与5422中英文键；根lint2784文件和CLI lint97文件均0警告0错误；CLI类型、architecture changed 0违例通过。CLI构建17/17、12缓存、26.942秒，原有动态import提示保留。CLI不属受控架构模块，根另行核对公开边界、单一owner和依赖方向。

这一轮全量对应完整子系统切换；后续文档及摘要修正不重复整仓测试。本批当前远端CI和打包未验证；适用依赖声明、根Apache及preview保持，全量替换与稳定发行仍在进行。
