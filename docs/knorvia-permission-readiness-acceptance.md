<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 审批就绪边界验收

2026-09-28，依据 specs/knorvia-permission-readiness.md。此批在已独立实现的权限计划上增加强制两阶段 broker 端口，改善明确的时序缺陷；不改变根 Apache-2.0、预览版本、UI、用户数据、安装/便携目录或官网。

## 实现与来源

preparePermission 完成静默登记后，core 才发布 Requested；发布成功再激活客户端和 Hook。PermissionPreparation 单独拥有结果、取消监听与结束状态，pending map 只索引同一对象；PermissionPublication 只拥有发布状态与 Hook 放行，不缓存答案。旧 requestPermission 保留为同一生命周期的便利入口，生产 core 不再回退使用它。

Deny、Manual、Protocol 的 permission/question/plan 分支、TUI、CLI 转发、headless 及子代理均已适配。TUI 队列只拥有显示控件，CLI 在准备时绑定 handler；workflow 两项确认例外不生成持久授权；Computer Use 的用户本次授权要求保留。Hook 修改输入复核仍使用同 ID，前一句柄先结束再登记下一次。

registry 继续拥有原路由、队列和自动继续事实。未激活条目不计时，不发自动继续更新；旧回调不能影响同 ID 新登记，替换时关闭旧 RPC。恢复条目晋升队首后重新检查其期限；过期微任务也核对暂停与计时资格。跨 session 替换会移走旧队列项。

已访问旧源码，不作无接触声明。独立实现的许可决定只覆盖新生命周期、发布屏障、broker 调度适配和新测试/规格的逐文件摘要；固定数据类型、文案和协议行为不被宣称为原创。interaction-options、interaction-auto-resolution、interaction-permission-response、interaction-question-response 是已有内容的提取，仍保留原来源及许可，不因拆分计为独立实现。公共合同、registry、子代理包装、输入复核等继承部分仍待后续逐文件替换。

## 已执行验证

- 先行两例在旧实现失败：异步恢复时首次可见答复丢失；过期恢复的旧微任务回答同 ID 新登记。
- 生命周期 8 例先因缺新端口失败，适配后通过。TUI/headless 新例先因缺端口失败；队首恢复、暂停微任务、旧句柄激活、发布取消与跨 session 队列缺陷均先以失败用例确认，再修复。
- 117 项关联测试通过，0 失败/跳过，包含既有 Invocation、权限、Computer Use 回归。此结果是离线端口级验收，不是设备或模型实测。
- 根/CLI lint 与 31 份变更文件严格 lint 均为 0 警告/错误。
- 首次 CLI 类型检查发现拆分帮助函数缺 PermissionBrokerResult 类型导入，已补齐。随后发现 TUI 的已编译声明仍为旧接口，已启动完整 CLI 重建；后续最终结果见下方完成记录，不能将这些失败写成通过。

## 最终本机验证

最终根与 CLI 类型检查通过，中英文 5,422 键一致。新测试首次独立类型检查发现 assert.deepEqual(array, []) 使可变数组被收窄为 never[]；改用等价的 length === 0 断言后通过，没有放宽产品类型。后补的发布取消组合测试也单独通过类型检查。

最终 CLI 构建 17/17 成功，6 项缓存，42.64 秒；既有 import 第二参数构建提示保留。实际编译权限入口的允许/拒绝/修改/存储失败/Hook 复核共 5 场景和 Invocation 2 场景通过；编译 Manual、Deny、Protocol permission/plan/question 与 TUI 共 6 条 broker 路径、真实编译 core 的首次可见应答和监听清理通过。CLI source map 确认 5 个新生命周期/适配模块在包中，headless 源码路径另由离线测试覆盖。

最终完整离线回归 1,618/1,618 通过，0 失败/跳过，258.56 秒。根/CLI lint 和 31 份变更文件严格 lint 均为 0 警告/错误；变更架构 0 违规。22 份变更源码合计 3,533 行，原对应文件 3,203 行，净增 330；最大文件 390 行。

只读复核确认提取的 18 个映射/归一化/恢复函数体 token 与上一提交一致。复核提出的终端同步应答 Hook 启动差异已补失败测试并修正：activate 返回是否接纳激活，默认拒绝/CLI 确认例外仍保留原 Hook 启动；激活前已答/取消/失效句柄保持不启动。另一组合场景“发布中先答 allow → 父取消 → 发布迟到 reject”已加入永久回归，结果为 ToolCancelled，无通知/Hook/残留登记/虚构 Resolved。

来源清单 7,687 项：181 独立替换、124 自有新增、1,806 第三方、2,161 上游原样、2,373 上游修改、1,039 待复核、2 项仅性质已审、1 生成报告。复核问题和缺失为 0，4 配置/1 许可正文性质统计与分类重叠。待复核增加包括拆出的继承帮助函数，不能通过移动文件减少真实待迁移范围。

提交前继续执行全量格式、来源新鲜度和暂存密钥扫描，实际结果随提交记录报告；提交后两平台 CI 另记，不能用本机通过替代云端结果。本机未调用真实模型、设备、用户数据库或远端服务器。取消不能撤回事件端口已发生的写入；迟到完成被观察且不得重新激活，终止呈现依赖原工具/回合取消事实。

全量独立实现、根 MIT、稳定版安装包与便携包、最终官网发布仍未完成。
