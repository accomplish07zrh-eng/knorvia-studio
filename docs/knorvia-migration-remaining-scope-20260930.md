# 全库迁移余量账本

这是 `8e8f631` 已提交来源清单的可计数快照，不是工作量百分比；[逐文件与 28 个包分组](../licensing/evidence/repository-migration-scope-20260930.json)列出精确选择规则、路径、摘要和下一审查决定。全库 8412 文件：439 independent-replacement、701 original、2300 third-party、8 reviewed-retained、1 generated-report、1646 upstream-unchanged、2255 upstream-modified、1062 unreviewed。分类不是产品功能完成证明。

限定产品 packages/CLI package/app 的 src，包含源码和 CSS、排测试/夹具，本账为 3997 文件，438 独立替换、1 原创。其余互斥分为：2921 上游关联且未落入第三方目录范围，需按行为边界与表达判断；527 缺来源 review，先查作者证据而非自动重写；110 带混合第三方范围，需核验出版者版本及本地部分，不能整目录认定可保留或需重写。90 个本地 copied-content 摘要仍匹配，仅说明登记新鲜，不证明出版者版权闭包。

另一路 4003 的生产统计与本账的范围并未完全统一，不能把不同分母混用。这里保留逐路径账本可作集合对照；CLI 的 prompt-trajectory 工具 11 文件在本账的产品分母外、仍在全库来源审查范围。UI 本账 1464 含两个 CSS，纯 TS/TSX 口径为 1462。独立 UI 研究发现 18 个别名、116 Studio feature 文件、AI Elements 版权证据；尚未收到逐路径材料时保留原状态，不自动计作新增原创或授权。

用户开始本恢复分支前已有 438 产品独立替换登记。本恢复分支在该快照之前新增行为重实现 12 个原逻辑模块：日志 5、设备进程采样 5、文本 2；当前身份/完整门面 2 个原逻辑模块完成本地验收。代码新写不直接增加 MIT 登记覆盖，source exposure 披露继续。并行 services/protocol 新模块和进程 QA 修复尚按独立提交审核/整合，不在此快照中冒记完成。

下一批可并行边界与依赖：

| 范围                         | 来源未闭合文件/总数 | 依赖与执行边界                                                                                                                             |
| ---------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| core                         | 449/604             | 已有 155 独立登记需保留；优先会话/agent loop/runtime、输入/工具调度、恢复与历史，依赖公开 shared/contracts，不重做已完成权限/工具/存储切片 |
| services                     | 334/334             | 含 149 未审核新文件，Studio Runtime/CreationService/数据库与 workspace isolation 先查来源；叶模块可并行，持久化格式及迁移需先冻结          |
| desktop                      | 256/256             | Host owner/lease、attachment、V4、IPC 与 renderer 平台端口；依赖 shared/protocol/services，需桌面 continuous 和移动 replay 契约            |
| bootstrap/CLI                | 299/308             | 启动、会话装配/协议入口；在 core/contracts 稳定后逐入口切换，保留 Bash/MCP 真消费者                                                        |
| shared/contracts             | 323/340             | 协议/类型/身份 3 包，来源审查与独立算法分开；公开 shape/线字节先冻结，协议并行路独占叶模块                                                 |
| UI                           | 1464/1464           | 原样行为/黑白视觉/状态/组件/i18n 保留；110 三方范围与 116 Studio 新功能先查证据，不将来源 0 已清当成全部必须重写                           |
| TUI                          | 90/91               | 不另起 shell；消费原 session/runtime 状态和审批/恢复合同                                                                                   |
| adapters                     | 54/286              | 232 已登记切片保留；当前身份/fs 完成实现但来源 review 不自动清除，后续 provider/config/network 原入口仍需分组                              |
| server/server-cli/web/client | 99/99               | pairing/relay、远程身份和转发，不引入第二 session owner；依赖 shared/host 契约                                                             |
| 其余包                       | 计数见 JSON         | workflow 99、provider 40、RPC 16、telemetry 10 等；标准类型/合法第三方/自有实现需分别分类，不能盲目重写                                    |

总体目标还含非产品源码：测试、文档、模板、素材、依赖和产物闭包。27 材料待决，其中八份彩色图标确需权属证据或经授权替代；用户“下排”自绘只覆盖四份黑白插件入口。其他来源缺口可继续从上游及可验证构建补证，但目前没有保证它们均可 MIT 的证据。Native Electron UI、安装/便携包、最终交付闭包尚未完成，发行/部署未在本执行任务授权内。

439/3997≈11% 仅为生产文件的已登记来源结论覆盖；无法据此给可靠的工作量总完成比例。最低补齐方式是每个上述边界登记真实消费者、代码/来源状态、验收矩阵与构建依赖，再给工作量权重。当前实现组按模块提交并验最新 SHA CI；不再用多次通过同一测试或资产匹配计数暗示全库接近完成。
