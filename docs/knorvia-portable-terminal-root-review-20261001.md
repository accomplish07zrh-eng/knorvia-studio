# 终端配置便携解析：root 复核

接入服务线 `be96657` 的三个提交，先读规格与四份生产文件，核对旧版候选路径、平台 eligibility、首次有效值、空 Kitty 结果、错误传播、既有字体回退和 macOS 工厂边界。macOS 实现与公开类型保持原样，本批只涉及便携解析。

root 重跑源码与严格 emitted 各 60 项，含实际 terminalService 消费者、伪 PTY/命令端口及自有临时配置，两者全部通过。额外使用精确 `79e5eab` 基线的三个纯 JSONC 函数，在仓外临时模块做 60000 组种子 22318 的标点/引号/注释/不完整输入对照；源码与 emitted 各 60000 组均无差异。驱动为 `packages/services/test/terminal-profile-jsonc-root-differential.mts`，第一个参数是临时旧版 parseJsonc 模块绝对路径；用既有测试变量 `KNORVIA_TERMINAL_PROFILE_TARGET=dist` 选择 emitted。不把旧实现放进产品或仓库作为运行时 fallback。

完整本地离线回归 6317 项，6251 通过、59 失败、7 跳过、0 取消。失败事件与此前 listen EPERM 基线的多重集合完全一致。类型、lint、格式和架构通过；实际桌面 `build:no-runtime-assets` 通过，生成 host 中可见三个新边界函数。该构建保留现有警告且不准备所有 runtime assets，不能当作安装包或原生 GUI 验收。

同时归档首批精确提交 `08255ec` 的 CI211：Linux 6161 通过、Windows 6168 通过，均 0 失败；总数各 6169，跳过各 8/1。检查 merge 与源 head 树均为 `ca5494e995c07a5da67d5bb24643fd6cdbeb0be1`。这份已通过的 CI 只覆盖首批，不冒充本批已发布。

本批来源暴露与保留表达、全部旧许可、27 项材料义务和原生 Windows/macOS/实际用户数据/GUI 验收缺口仍在。具体日志摘要与判断范围见同名机器证据；不作整仓 MIT 或整体完成声明。
