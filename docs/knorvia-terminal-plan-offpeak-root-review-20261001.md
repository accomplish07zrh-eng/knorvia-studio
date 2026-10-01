# 终端启动规划与闲时工具：root 复核

接续 `168d1ba`，接入服务线 `24aea53` 与内核线 `bf0cc48`。root 阅读两份规格及对应生产代码，核对公开契约、执行顺序、保留表达与既有未替换边界。

终端规划只重建 shell/cwd 候选、环境、Windows 元信息和 PTY 选项决策；实际探测及原生执行由既有 service 解释。检查原调用 receiver、惰性路径探测、优先级、ConPTY 特定错误重试、环境复制/locale/PATH 和参数顺序。实例生命周期、模块加载、helper 权限与诊断仍是旧实现，20 个受保护节点在此检查点不变。root 源码和严格 emitted 连同便携/macOS回归各 240 项全部通过；emitted 命令明确同时设置 PLAN、MACOS、PROFILE 三个测试选择变量。

OffPeak 的 create 保留闲时轮 guard 先于 schema，list 不增加该拒绝；普通 automation 轮仍按旧契约放行。root 核对注入的原 guard、按次调用计划、端口重读/receiver/session、分类失败及任务投影；源码和 emitted 各 23 项通过，精确旧基线的每模式 8192 次对照结果一致。所有端口与任务都是合成值，没有实际调度、账号或通知操作。

最终整仓回归 6539 项：6473 通过、59 失败、7 跳过、0 取消，失败事件与原本地 listen EPERM 基线多重集合一致。主工作区类型、CLI 构建/串行类型、根 lint、八份 CLI 显式 lint、格式、架构和桌面无 runtime-assets 构建通过。首次 OffPeak focused 调用漏 UI tsconfig 导致一个导入失败，补用已有配置后通过，未改测试断言。

本批另透明更正 root 旧 emitted 标签：首次 macOS 164 项命令只有 PROFILE 变量，未真正切换 macOS 用例。精确旧提交的补跑和本批全部选择变量的 240 项通过已另附证据；独立 worktree 的类型检查失败不冒充通过，原日志保留。此更正不改变产品代码或原生验收边界。

附带 CI213/214 的精确已发布提交回执，两个历史批次在 Linux 和 Windows 均零失败；不能当成本批已发布。来源暴露、仍适用的许可证、27 项材料义务及真实 PTY/系统偏好/账号/用户数据/原生视觉缺口继续保留，不作全面独立或最终 MIT 结论。
