<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 日志重实现来源与许可状态

本批以 `bd0bb014c0974334557fa51814709d0b78f35f1d` 中的三个日志模块为行为基线。先写行为合同和 47 个案例，再在旧源码及旧实际 dist 上取得各 47/47；源码按上下文投影、输出端口、序列化、清理和工厂五个模块重新组织。对象脱敏通过显式工作表遍历，错误 cause 通过迭代投影，文件输出集中在独立 sink。后来静态复核的四个补充边界在保存的旧 source/dist 各通过 4/4，再进入当前永久门。

作者在合同准备阶段读过旧源码，也亲自写测试和实现，没有隔离作者角色。公开签名、字段顺序、消息和默认值保留以满足兼容合同；测试通过不能证明不存在旧表达的派生关系。因此五份生产源码本批均保持 Apache-2.0，带修改/复核状态说明，未在 reviews 中认定 `independent-replacement` 或授予 MIT。此阶段的行为验收完成与最终来源许可确认分开记录，不能计作已经收口的独立迁移文件。

新测试、类型探针、临时数据夹具、规格和本批说明由本轮编写，没有复制缺失的历史候选或其 44 案例载荷。这些新表达可按用户授权单列 MIT；标准兼容签名和功能事实不被单独宣称为原创成果。根 LICENSE、NOTICE、历史版本及第三方声明保持。

固定摘要见 [原始合同](logging-runtime-frozen-contract.json)、[最终测试和五模块构建输入](logging-runtime-inputs.json) 和 [旧→新→旧数据夹具](logging-upgrade-rollback.json)。CLI map 的 sourcesContent 与五个受检 dist 文件逐字节相同；其摘要只绑定这次构建输入，不证明全部产物或全库的来源独立。旧版输入复制仅在隔离执行目录用于验收，未引入生产或提交。

共享 `redactDiagnosticText`、数据根解析、运行环境解析、Logger 公共声明、文件故障注入端口及 Node 标准接口继续是依赖，本批没有改变它们的许可、实现或打包输入。没有新增 npm 依赖、素材、下载器或运行时 fallback。

许可依据核对 [Apache-2.0 第 4 节](https://www.apache.org/licenses/LICENSE-2.0) 与 [MIT 正文](https://opensource.org/license/mit)：保留仍适用的许可、归属和修改说明；新文件的 MIT 声明不撤销其他文件或依赖的义务，也不使应用整体成为 MIT。此记录不提供全库 MIT 可发行的保证。

剩余门槛：独立审阅现存表达与既有来源事实、逐文件确认可授权范围、剩余源/资产/依赖及产物复核。实装依赖许可工具本轮因缺少其他架构可选包 `@napi-rs/canvas-linux-arm64-musl@0.1.100` 中断，不算完整依赖许可审计通过；不要通过放宽 allowlist 或遗漏该包来获得成功。
