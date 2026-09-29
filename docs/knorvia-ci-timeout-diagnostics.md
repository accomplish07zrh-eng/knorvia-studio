<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# CI超时的阶段与原始结果诊断

2026-09-29。此批只修改两份既有测试及规格，生产服务、工作流、执行预算和失败判定不变。补足旧日志缺失的阶段信息，不能据此把历史CI故障宣称已修复。

## 保留的原始失败

- run36520626246的Windows异步JSON映射用例，1000ms后仍running，queued@1ms → running@10ms；旧日志未标出good/failure/pending/invalid哪一分支。
- run36522980492的同一用例，1000ms后仍queued，仅queued@0ms；同轮office资源测试在指定Python3.13.15绝对路径执行--version时ETIMEDOUT，10s探测失败，未进入资源脚本。指定路径来自setup-python，不能把超时断定为缺少Python或Store占位。
- 原始GitHub run [36525198142](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36525198142)，受检16d6ebb：Linux **3,194通过、7平台跳过、0失败/取消**，153393.315144ms；Windows **3,200通过、1失败、0跳过/取消**，376910.1344ms。来源、类型、lint、格式、架构和构建步骤成功，新增71项MCP描述符/截止用例通过。Windows失败为openai-images的已知失败/重试/超时/取消组合，用例1011.4841ms，在第一个failed等待（原测试709行）1000ms后仍running，queued@1ms → running@11ms。该原始失败保留，不因其他用例或本机通过而改记为成功；尚未确认该次实际磁盘或计时原因。

对异步JSON做过有限自有注入：既有存储rename退避可累计超过1s；向checkpoint/终态写入注入7次EPERM，分别在四种模拟结果中重现1000ms等待未终态、之后落盘正确且仅一次提交。这只能证明一条可发生的机制，不能还原原CI的具体原因。新的known-failure失败正在另行核查，未用本批扩大范围改变其业务时序。

## 改动与所有权

创作测试继续由真实CreationService执行真实临时文件IO。模拟供应商只记submit/poll进入和返回计数，每个固定prompt最多16个单调时间事件；terminal超时另报已完成getJob读取数和最长耗时。进入poll只见证前置checkpoint await完成；未见poll明确为unobserved，不推断未写盘，不额外读取私有文件。诊断上下文只读内存且不能覆盖原始超时错误。原35ms供应商截止、2ms供应商轮询、1000ms终态预算、10ms终态轮询及四分支状态断言均保留。

Python仍由同一解析器一次探测显式路径，成功后才运行真实office脚本。失败补充阶段、10s预算、单次spawnSync的单调耗时、命令/参数和固定白名单字段。字符串512码元、参数8项，明确省略并区分undefined/null/0/空串，不遍历环境或任意错误扩展对象。ETIMEDOUT、ENOENT、9009及其他静默非零失败分别表述；9009只是可能的Store特征。无新执行钩子、重试、预热、回退、skip或工作流修改，10s/30s/120s预算保持。

## 实际验收

- Python新增4项在旧副本先红：1通过4失败；候选纯测试5/5，首轮lint0/0。首次格式未通过，格式化后的检查通过，首轮记录保留；隔离作者未启动真实Python。
- 创作诊断候选首轮聚焦2/2、相关文件11/11；独立严格类型命令最初误选ES2023而缺少既有Promise.withResolvers，改为仓库ES2025后通过，未因此改候选逻辑。
- 根逐项读diff和隔离报告，核对原源码摘要再按字节整合。主仓相关回归 **17/17**，0失败/取消/跳过，3187.9936ms，包含真实Python资源脚本及11项创作场景。
- 根类型含desktop main与5422中英文键通过；根lint2781文件0警告0错误；创作测试strict ES2025通过；改动架构0违例；四文件格式通过。
- CLI构建 **17/17**，16缓存，1.638秒，使用已核验本地Cua归档。构建后完整离线 **3,205/3,205**，0失败/取消/跳过，510775.7846ms。Node24.14.0，真实Python绝对路径，关闭编译缓存。上述本机通过不代替原云端失败。

创作测试候选SHA-256：a7331407eb944445f227a27715bd317cfe6e80d7ce0ba14d3018e16aeddecd1f；Python测试：8c8ec1cabb02339f98176ed26b303813e3a3b335b935acdcd12b490156d1a952。首次副本、定向日志和原始CI完整日志保留在仓外诊断目录。根误猜创作报告文件名的读取未找到，改用实际report.md读取；没有将其当成检查成功。

两份既有测试与既有规格继续保持未完成来源复核的分类，本次诊断修订不自动赋予MIT。仅本文的新事实记录按其内容审阅；仍适用的根Apache、第三方声明及preview身份不变。真实联网推理、桌面包和CI超时首因未验证，不满足最终独立发行完成条件。

原始GitHub run [36527276423](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36527276423)，受检afb483b：Windows **3,205/3,205**、0失败/取消/跳过，374624.1268ms；Linux **3,198通过、7平台跳过、0失败/取消**，241050.923651ms。两平台来源、类型、lint、格式、架构、构建与完整离线步骤成功。这是该提交的首次运行结果，没有重跑历史失败；本轮通过不证明此前Windows超时首因或全局模拟计时器风险已经消失。

已完成业务截止与IO时钟的有限修补，见[单独验收](knorvia-creation-run-clock-acceptance.md)。一次自有EPERM证明全局setTimeout冻结机制；历史Windows当次首因仍未确认。默认产品时间与终态预算保持。
