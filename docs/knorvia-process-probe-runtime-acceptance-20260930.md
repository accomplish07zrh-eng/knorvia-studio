# 设备进程采样五模块验收

本批基于 `76c233875181793a340b1e41da99f18b4f8e279f` 的公开声明及受控观察，重实现 `apps/cli/packages/adapters/src/device/process-probe{,-shared,-linux,-darwin,-windows}.ts`。规格先于合同和生产实现：[采样合同](../specs/knorvia-process-probe-runtime.md)。已有设备身份所有者 `cli-device-mid.ts`、MCP/Bash sampler/tracker、UI、数据库和数据目录均不修改。

## 实现与兼容

新实现使用独立编写的关系边索引和迭代 DFS、最多 64 份并行 stat 的有界扫描、按目标去重的第二阶段 RSS 读取、平台格式解析以及每实例连续失败预算/每调用截止。保留公开函数和类型、根/子进程序、重复 PID 的原边与最新样本、可选 CPU 字段、原错误文本、三次失败停用、reset 和原有并发语义。Linux 不执行命令；macOS/未知平台仅 ps，Windows 仅 tasklist。

固定旧 source 和实际旧 dist 的五份缓存先逐字节与基线核对。实现前永久旧门各 48/48，包含 53 组受控解析边界输入；后补两项实际 MCP/Bash 调用方消费与共享 schema 检查，source/dist 门各 50/50。旧、新、再旧的真实消费输出经 JSON 往返后相同；随机标识先验 schema，再从确定性比较中剔除。采样组件自身没有持久化状态，不把该测试称为用户数据库迁移。

测试 loader 封住目标 fs/promises、child_process、默认回退及计时器；仅 loader 可读取五份源码并写临时编译文件。测试所有 PID 和命令输出均为合成值，不输出本机进程表。早期 provisional 观察曾未封住默认平台入口，未用作永久冻结证据；实际永久门只使用新的隔离加载器。

## 原失败和来源限制

初次永久旧门 42 项中六项错误反映合同假设，而非产品缺陷：Windows 低层不负责 factory 的早退/正整数验证；未知 platform 回退 ps；Linux 目录错误有包装，截止在已进入的批次后生效。先按受控观察纠正合同、加入批次反例，才冻结成功和编写候选。loader banner 重名、共享 TS 模块缺少 tsx 接线及虚构 MCP ID 未通过 schema 的集成准备失败也保留记录。

本作者曾接触旧源码，不能声明 clean-room。本轮不使用旧正文作实现模板，但有限公开行为/算法重写证据不能直接决定整个文件的版权资格。五份生产文件保留 Apache-2.0 与原上游历史；不新增其 MIT review。新合同、测试和验收表达单列 MIT。材料严格门仍保留 27 项，与本采样批次无关的原声明和八份彩色素材不删除。

## 已执行与待完成验证

- 新 source/dist 各 50/50；公开 value/type 的冻结语义投影一致。原门 48 项全部保留，未减少断言或放宽时间预算。
- 根与 CLI 类型检查/lint 通过；CLI 构建 17/17，五份实际 CLI sourcemap sourcesContent 与已测试 dist 字节完全一致。
- Linux 本机自身 PID 的实际 source/dist 默认采样通过，仅记录样本存在及 RSS/CPU 有限值的布尔结果，不公布 PID/进程表。此项不代替其他平台原生精度验证。
- 全量离线 3872 项：3865 通过、7 项平台跳过、0 失败；Web 与 Desktop 静态构建通过（保留已有大 chunk/动态导入警告）。格式、架构（0 违规）与来源新鲜度通过；严格材料门仍按预期拒绝 27 项。最终提交 CI 单独记录，不把基线 CI #189 归给新提交。
- 原生 Windows/macOS 探针精度与 Electron UI 未执行；独立 QA 的 sandbox helper 所有权阻塞仍需正确配置的受支持 runner，不关闭 sandbox。静态 build:no-runtime-assets 不等于安装包或实际 release payload 验收。

逐文件前后摘要、产物、合同、检查及原失败记录见[来源证据](../licensing/evidence/process-probe-runtime-20260930.json)。可独立 revert 本批恢复旧五模块；不删除用户目录或转换数据。后续继续审查 `cli-device-mid.ts`、文件系统门面/元数据/范围读取，以及更广的 runtime/tool/协议/Studio/UI/Desktop 来源，不重复声称未转移的历史 harness 已完成。

CI #190：Linux 全量成功；Windows 3872 项中 3870 通过、2 失败。两个新 wrapper 均由 fixture 裸 Windows 盘符动态 import 导致 `ERR_UNSUPPORTED_ESM_URL_SCHEME`，两项消费用例尚未加载；不是五模块采样失败。fixture 改用标准 file URL，保留实际共享 schema、50 项及全部超时/断言，重新运行旧/新 source/dist 门，最终 Windows CI 需独立确认。原生 Windows 探针精度仍不由合成门证明。

## 独立 QA 后补反例与修复

`8e8f631` 的 50 项门均通过，仍遗漏四项可复现差异：事件循环同步阻塞 1100ms 时 timer 尚未触发，候选继续进入下一轮 /proc I/O；1000 个相同根在 100 节点树重复 DFS；0.01+0.01 tick 未保留取整；`VmRSS:\t12kB` 无单位前空格被拒绝。独立 QA 新增 source/dist 八例在原候选全部失败，`ffe064c275de5659fa5314ab81db63f812c01377` 修后全部通过。整合为 `fe908b9`，保留每调用绝对截止、根入口去重及原 parser 运算/语法，无 timeout 放宽或断言删除。此前 50 项通过只证明当时覆盖，不能覆盖新增反例。

新增证据在原 JSON 的 `qaCounterexampleRepair`，保留初始失败及历史源/产物摘要，另附当前两份修改 dist 与真实 CLI sourcemap 精确匹配。它不授予 MIT，不改变 UI、数据格式、采样超时预算或原声明。整合最新 SHA CI 另验，不复用旧 #191/#192 绿灯。
