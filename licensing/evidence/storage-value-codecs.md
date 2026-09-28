<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 存储值编解码的实现来源

基线为本地 `da8f6e0`，上游关系仍由固定基线清单保留。本批来源判断只涉及 `apps/cli/packages/adapters/src/storage/session-store/` 下的 json.ts、codecs.ts、record-projection.ts 和 repositories/permission-full-access-payload.ts。四份新实现共 222 行，旧三份共 224 行；大小变化不是来源证据。

## 实现过程与接触边界

主代理先读取当前行为，与只读复核者列出值、字段顺序、错误优先级和模型选择策略，然后写 [规格](../../specs/knorvia-storage-value-codecs.md) 与先行测试。冻结旧版包仅供主代理做有限验收，不发给实现者。隔离任务从空的源码镜像目录开始，只获得行为规格、公共函数签名及两条行为补充：必需正文采用原生解析；可选单元保留运行时 falsy 缺席结果。

实现者被明确禁止读取旧目标三文件、dist、source map、Git 历史、冻结基线和其他实现任务；只在隔离目录写入四份新文件，报告内容可与实际交付对应。主代理在源测试通过后整合，生产代码仅再作格式处理。该记录说明任务分离方式，不是独立审计所有工具历史的证明；主代理与复核者已经读过旧源码，不能声称整个项目为无接触 clean-room。

实现者报告实际阅读：任务说明/规格、根和 CLI 的 AGENTS、架构技能，以及下列类型/公共合同：

- adapters 的 session-store/rows.ts；保留原文件，不复制或改标 MIT。
- contracts 的 src/index.ts、model/model.ts、interfaces/shared.ts、interfaces/session-store.port.ts、interfaces/session.port.ts 前 35 行、tools/todo.ts 前 38 行。
- shared 的 src/model-selection.ts、src/model-selection-types.ts。
- 公共目录符号搜索还显示 contracts 的 config/index.ts、hooks/index.ts、events 下四份事件文件、workflow/script.ts、interfaces/permission.port.ts、interfaces/session-mailbox.port.ts、tools/plan-mode.ts、tools/target.ts，以及 shared 的 protocol/index.ts、protocol-v4/command.ts、protocol-v4/session-config.ts、test-ids.ts 的匹配行；未打开这些搜索命中文件的函数体。

上述允许输入并非全部独立源码；公开名称、数据结构、标准平台语义作为兼容合同使用，不把它们一并改成 MIT。新实现通过公开 @knorvia/contracts 校验模型选择，不复制校验器。

## 逐文件判断

| 文件                                           | 本次表达与边界                                                                                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| json.ts                                        | 从合同编写可选 JSON 单元薄适配；原生 JSON 与空值条件的表达空间很小，不声称是新算法。保留声明与实际根函数/Symbol 结果不一致的既有边界。                                 |
| record-projection.ts                           | 本次共享有序投影，以 entries 过滤与 fromEntries 合成输出，服务成员移除、追加、身份覆盖和 intent 更新；无缓存或业务状态。属于常见技术组合，不以算法新颖性作为许可依据。 |
| codecs.ts                                      | 以共享投影组合各 JSON 文档策略；列映射与时间策略按合同实现。固定字段名、输出顺序、品牌类型和平台解析规则不计为原创发明。                                               |
| repositories/permission-full-access-payload.ts | 先收集修改的对象分支，再投影新输出；没有沿用此前的原地更新函数体。旧两字段名称和 yolo 值是已有合同，旧版本许可记录仍保留。                                             |

本批将四份当前表达记为 independent-replacement/MIT，依据隔离任务的输入约束、实际新表达与主代理复核；不是因为新增路径、改名、拆分、AI 生成或测试通过。对应摘要绑定在 reviews.json，字节变化需要重新复核。测试、先行规格与本批验收/证据文档记录为自有新增。

## 验收不等于许可保证

24 项先行合同在旧版通过；替换后结合既有 full-access 共 45 项通过。主代理 2,192 场景及只读复核者 65 场景只提供有限兼容证据，具体编译和完整回归见 [验收](../../docs/knorvia-storage-value-codecs-acceptance.md)。动态可变 getter 有明确差异，不能声称所有 JavaScript 输入完全等价。根 Apache-2.0、公共合同/schema、相邻仓储/迁移及历史发行继续保持适用许可，整仓 MIT 与稳定发行尚未完成。
