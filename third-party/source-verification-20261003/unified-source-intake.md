# 四路源码及 cleanup 修复接收与集中验收输入

2026-10-03。main 稳定基线为 `345a5a8698efec4f216e4118275214f25fdbd96b`。
唯一整合分支 `integration/backlog-20261003` 以普通 merge 保留下面所有提交。
源码合流 checkpoint 为 `46c8c2bb06ccd6302299247b9849699cdbf438d2`；随后应用测试登记、
格式修正和真实来源/证据投影。最终打包与 GUI 复验必须取实际推送的统一 head。

| 输入                                | 确切交付 head                              | 整合 merge                                 |
| ----------------------------------- | ------------------------------------------ | ------------------------------------------ |
| PR20 services                       | `62b6b1c589becea5f371f7a0e8ed022728539f3d` | `8c27aa631acf4702e43114fa2b9a5cdbcb8071c2` |
| PR21 native                         | `8123d33cdfbe273449be0ffd4cd8992eecf837dd` | `318051c1d68e7689cf6607aeac5d82508445a543` |
| PR22 UI                             | `e229f601267a5a41b37d0e25391a186215cf2c46` | `ddf00d6ef0de38d274635a3f7f3b4e224c75dc3a` |
| PR23 CLI                            | `b45a16770626c6b5803612b749f018cf61e38881` | `46c8c2bb06ccd6302299247b9849699cdbf438d2` |
| Web/HTTP controller 与公开 homepage | `e23ea3328716cbb3e5109e3f2d0082aca46de200` | 四路合流的既有第一父链                     |
| PR20 Linux zombie cleanup 追加      | `e16a51911b0a41f8fdee04199949bc278ef2332f` | `0b0f92fd7c3cb12b140135ff1d543bacb8554731` |

各路生产源逐字节接收，无 merge 冲突。CLI 提供的
`docs/evidence/backlog-cli-20261003/integrator-cli-test-registration-20261003.patch`
已应用六行入口：resident pool、script child contract/consumer、custom command
contract/consumer、SEA runtime surface。它们是统一回归的实际输入，不以已登记代替通过。

## 实际来源与证据边界

- 11 个既定继承模块交付了实质实现候选：UI4、native4、CLI3。services 同时接收
  条件 draft close、projection effects 与 startup lock driver 的有界替换；CLI Registry
  消息投影器和 CUA collector 修复也来自上述确切 source。完整文件与保留表达以各路
  source bindings/spec 为准，不把新增入口、普通语法或测试成功当作整文件原创证明。
- Desktop controller 的三份实现下移至 services 专用 Node 入口，旧 Desktop 入口
  继续转发。原实现函数体保持相同字节，是共享装配调整，不是新增独立替换成果。
- `licensing/current-files.json` 从旧 checkpoint 的未变更 descriptor 与实际改动文件
  的当前字节增量重建。上游 pin、reviews、第三方材料/依赖记录和原许可通知不变；
  services manifest 新增共享 Node 入口，单独同步该 manifest 的真实输入摘要；不新增授权、
  不推广独立性分类，不因 source-exposed 合同证据声称 clean room 或全仓原创。
- 四路初次 frozen evidence 实际新增 **73** 份：services11、native37、UI19、CLI6。此前的
  5716 个登记对象、baseline 与所有原证据字节保留；新记录绑定含实际字节的源提交。
  登记用于证明原始材料完整，不把失败、跳过或局部结果改为通过。
- Native AppImage 六组旧验收仅绑定 `ede8382435ed91e9d62300599e925f6fb90532c0`。
  新 browser/crash 四文件与 CUA collector 必须用统一新 source 重建复验；不沿用旧
  artifact 的通过结论。公开维护邮箱尚待用户提供，Linux 全 target 因此保留阻塞。
- 组合 GUI 仍需复验 controller 的 tasks/workspaces 订阅与全局 pinned/grouped
  查询。原 UI 已修复 onboarding hook 顺序，但该路历史 Web 证据没有包含本次共享
  controller 装配。缺 Agent 产物与实际 zombie cleanup 缺陷分别跟踪；后者的源码修复
  已接收，仍需按新的统一 head 重放完整 Host 退出场景。
- 真实 Windows GUI/安装升级/Computer Use 与 macOS 能力缺口照实保留；Linux
  源码浏览器或本机离线测试不能覆盖这些环境。

本文件记录源码接收与验收输入。集中检查、两平台 CI、GUI 和实际发行归档的结果
分别按实际 checked/delivered SHA 报告；本文件不预先宣称通过。main 保持旧稳版，
待必要集中检查通过后按既有授权正常合并，保留 Apache-2.0 与各文件/组件真实许可。

统一阶段的本地定向 HTTP/WebSocket/RPC controller 合同实际为 **3 pass / 0 fail /
0 skip**，使用 Node 24.14.0、合成 task source 与隔离 `/tmp` 数据目录。覆盖 channel
注册、source 写入与身份拒绝、共享投影和连接订阅清理；不是全 GUI 或实际 Agent 验收。
frozen integrity 实际通过 **5789 文件 / 65864506 字节**。本地最初调用系统 pnpm11
时因 `/home/agent` 路径不可用失败；改用既有的固定 Node24.14.0/pnpm10.33.2 工具，
未改 HOME 或 lockfile。完整类型、lint、格式、架构、CLI 构建和离线回归由统一 PR 的
两平台 CI 按确切受检 SHA 执行，当前仍待结果。

首轮 CI `37122670035` 的两平台均在来源 gate 失败：整合者新增 services 公共入口后，
漏同步 `third-party/inventory.json.inputs["packages/services/package.json"]`。
该 manifest 实际只有 exports 变化，依赖与其余字段不变。本次只补此输入的真实摘要，
第三方材料/许可及 checker 不改；原 CI 后续类型/lint/构建/回归均 skipped，不写成通过。

## Linux zombie cleanup 追加接收

PR20 新 head `e16a51911b0a41f8fdee04199949bc278ef2332f` 通过普通 merge
`0b0f92fd7c3cb12b140135ff1d543bacb8554731` 无冲突接收。三个生产文件
`processTreeSnapshot.ts`、`processTreeTypes.ts`、`processTreeWaiter.ts` 的当前字节
均与生产提交 `21bbcf1ea6fb807197914089494d366ba6c338ab` 完全一致，七份冻结
fixture 的原始 Git blob、SHA-256 与字节数也逐一核对。此前四路与 Web 修复继续保留。

Linux waiter 读取当前 proc state，将实际 Z 从 remaining 中排除，仍用 startTime/PGID
排除复用后的身份，重挂父进程不会排除仍活跃的子进程；不可读 stat 与权限错误保持
保守处理。stdio 的非空 remaining 异常没有被吞掉。新增可选 state 不作为身份键，
未更改 ownership、signal target、UI、数据格式或其他平台的原有退出策略。

作者原始证据见 `docs/evidence/services-linux-zombie-cleanup-20261003/README.md`。
相同七份 fixture 下，修复前实际为 **20 pass / 13 fail / 0 skip**，修复后实际为
**33 pass / 0 fail / 0 skip**；整合者本轮核验其源绑定与原始材料，没有重跑该组测试。
真实隔离进程证据包含未被回收的 zombie、仍被保留的 sleeping 子进程及 supervisor
最终回收。PPid1 与其他平台的合成边界不冒充完整 Host 或原生平台验收。

此次新增 **16** 份原始证据，前次 **5789** 个登记对象、baseline、roots 与原字节均
保留；当前合计 **5805 文件 / 65987579 字节**，相对稳定 main 累计新增 **89** 份。
所有登记文件的实际 SHA-256/字节数及完整目录覆盖已核对。新记录绑定实际包含该字节
的提交。来源投影只刷新真实变化，不变更 reviews、上游 pin 或许可/权利决定。

新的统一源码必须重新取得两平台 CI 结果，并交给 UI 复验完整 Agent runtime 下的
Host 退出及组合 controller、交给 native 重建最终 AppImage/归档。旧
`ad712690b3eb1501574c1d29361dc801c1414373` 的检查不转记为新修复的通过。
main 继续保持稳定基线。Linux 全目标的公开邮箱及真实 Windows/macOS 环境缺口照实保留。

## HTTP retained fixture 修正

fixture/spec 修复 `bf86b79ac819ac7f53e0afa36ec18cf9e7c1c9ac` 补齐 VM 的
`./httpWindowController.js` 装配端口与 server close 事件；生产 HTTP/controller 源码
不变。原 46 条 assert、六个用例与未知依赖报错策略完全保留，新增两项参数检查。
agent-only 夹具没有 task service，注入明确的无 controller 结果；真实装配另由生产
HTTP/WebSocket/RPC 的三项合同执行，不以注入替代其契约。

固定 Node24.14.0、隔离临时数据下，原 lifecycle 六项加真实 controller 三项实际为
**9 tests / 9 pass / 0 fail / 0 skip**。先前定向复现为 5 pass/1 fail、缺装配端口，
不是生产 controller 断言失败；原始 CI 仍保留。未知 source 的 mutation 拒绝会按
原行为写 RPC FAIL 日志且被断言拒绝，不宣称 console-clean。scoped lint/format 与
改动架构检查实际通过；本轮未重复 root typecheck/build/完整离线回归。

原始结果见 `docs/evidence/integration-http-fixture-20261003/README.md`，三份原材料
绑定提交 `87683f15`（完整提交由 frozen evidence sourceCommit 登记）。旧 5805 行
不变，当前 **5808 文件 / 65998810 字节**，相对稳定 main 累计新增 **92** 份，
全部实际 hash/bytes 与目录覆盖已核对。Windows Chrome policy 另两项由原 native
任务修复；收到确切提交后继续普通 merge，不降低断言，不把旧 CI 失败改为通过。

## Native policy 夹具与中间产物记录接收

native 交付 `598e1f117ebd1793620c6df4b926affd1be8a458` 以普通 merge
`77e9342c3cda6258ac6c32af22800efbe5ec8240` 无冲突接收。两个 registry 输入
原来硬编码 `/`，却与平台 `join` 的期望值比较；现在只令输入与原期望采用同一拼写，
原生产策略仍保留原始展开文本。原断言及其他 22 个场景体保留，新场景严格比较混合
分隔符、完整 source 字段、未知变量、HKCU/HKLM 顺序和合成 cookie 字节。

四个生产文件不变；Windows 实际旧 CI checkout
`7bd43bfd70486ef0e9b90bc3e2174cd81130404d`、旧 trigger ad712690 与新输入902e35c6
的五组源绑定逐一核对。当前 fixture 字节也与作者交付一致。作者 Linux 原两场景
本就通过，修复后含新增场景为 **3 pass / 0 fail / 0 skip**；这不等于在 Linux 复现
或修好了实际 Windows 环境，matching Windows CI 仍须通过。

两组新 raw 分别为 Chrome policy **16** 份和旧 ad712690 包装 **28** 份，各自
SHA256SUMS 的 15/27 项实际核对。旧 **5808** 个冻结对象和原字节保留，当前
**5852 文件 / 66380266 字节**，相对稳定 main 累计新增 **136** 份；目录覆盖和
全部实际 hash/bytes 再次核对。作者提交 raw 后的 root lint 实际因未登记 evidence
前置条件退出1，lint 本身未执行；该失败日志保留，由整合者补真实登记，checker 不改。

`native-packaged-retest-ad712690-20261003` 只记录旧确切 source 的中间产物。
其中 AppImage/native 六组与隔离安装/Web 探测通过，不能转记为新统一 source 的最终
验收。完整发行归档的原 smoke 实际退出1：TUI bundled YAML 报
`Dynamic require of "process" is not supported`，真实 TUI 及后续 Web smoke 未到达。
CLI ESM runtime/build owner 需修复此已证实问题，再用统一新 head 重建归档复验。
最终包装、组合 GUI/Host 退出、Windows/macOS 缺口与公开维护邮箱条件继续照实跟踪。

旧 source902e35c6 的 Linux CI37123988720 已完成：来源/types/lint/fmt/架构/CLI
构建通过；离线回归 **8260 tests / 8251 pass / 1 fail / 8 skip**，唯一失败为已接收
HTTP 端口夹具缺口。该旧失败保留，完整新修复树的两平台结论按新受检 SHA 报告。

## 实际 Web 组合与 owned Host 退出接收

UI 仅证据交付 `b7f3c26d9e42b32f326adee1b8cf4cc1d4d4a98b` 已普通 merge 接收，
没有新增生产源码。原材料见
`docs/evidence/backlog-ui-20261003/combined-gui-20261003/README.md`。
受测最新 source 为 `902e35c6dbcfa4b829270352fecf03ebc07b219f`；31 个具名 source
的实际字节与绑定、59 项交付 checksum 核对。旧 ad712690 的相关 UI/数据库/CLI 源
保持相同，三个 process-tree 文件不同；旧组合验收不重新标为新 source 执行。

实际生产 Chromium Web 的六个不同场景接受：冷启动/workspace/reload 独立草稿，
live file create/preview/rename/delete 的持续搜索，真实 Controller pin/reload/unpin，
群定义/目标/草稿恢复及菜单双 pane 等。hook/caught-boundary/pageerror 均零；
第一轮实际五过一 locator strict-mode 失败，私有定位器单项修正复核后才接受第六项，
原失败 JSON 保留。large chunk/Office 动态拆包警告与 lazy GitHub chunk ERR_ABORTED
保留，只接受已测资源基础，不推广完整主题/Office 表现。

实际托管 Agent 完成 22 个 CLI 存储初始化迁移；存活 Agent 随公开工厂 Host 的
await-dispose 关闭，Host/Agent exit0、所观察 PID/Agent 进程组无残留。最初夹具
数据库路径 ENOENT 保留；随后只用受支持的隔离 session DB/storage 环境修正夹具，
未改 HOME 或生产实现。initialize 返回 provider_not_ready；未发模型任务，未接受
真实历史、执行/续接或活动 tool/MCP 后代关闭。Desktop/Electron、真实 Windows/
macOS 安装升级、移动布局缺口继续保留。

六十份材料保留源提交和实际字节。全局登记当前为 **5912 文件 / 67466748 字节**，
相对稳定 main 新增 **196** 份，旧 5852 行与原始字节不变。本批只刷新来源投影，
不增加权利或独立性判定。source80375ff6 的 Linux CI 实际通过，离线结果为
**8261 tests / 8253 pass / 0 fail / 8 skip**；Windows 尚待实际结果。
两平台 CI 按各自受检 SHA 报告，追加证据不改记已执行次数。

## TUI ESM 与启动退出修复接收

PR26 head `9fc26449845b3aa1910ee697964c58ab570165cf` 以普通 merge
`2880270543b5faae990a3498efb24b481de6f1a4` 无冲突接收，已合入的 UI b7f3c26d
仅证据提交继续保留。生产 ESM 上下文来自 `4ac5cc97734c7b84859dcad365a8f15164323304`，
启动退出归属来自 `45791a532b344719f4df661c9085db735d531985`，真实 smoke harness
checkpoint 为 `add7f37d2131587adf4a66e015edbad587110f11`。

TUI 生产构建给生成的 ESM 文件提供 Node 原生、模块局部的 require/filename/dirname，
保留 ESM、顶层 await、原 external/package 边界；没有在 smoke 或 globalThis 注入
loader，也没有改第三方版本。主界面接管后，已过期的 startup 键盘回调不再决定退出；
启动中取消仍为130，主界面原双 Ctrl-C guard 仍以0退出。没有改界面布局、数据格式、
公开协议或 Renderer 的原键盘规则。

作者三个真实生产构建合同通过；实际 Linux x64 的 staged runtime layout 原生导入、
完整 initialized render、双 Ctrl-C exit0 和 pending-startup 取消130均实际通过，
没有 prompt、模型或账号调用。此前 require-only 后暴露的 \_\_filename 故障、退出130
误归属与临时诊断/恢复记录均保留。该 layout 不是完整 Web/Desktop/发行归档或 SEA
验收，最终 archive 及根 distribution-smoke 仍须新统一 source 重建执行。

根三行 patch 已精确应用：统一入口增加 TUI 三合同文件；发行 smoke 增加两个既有
隔离存储环境字段。原 smoke 九个 assert 调用逐字保留，导入、渲染、键盘0退出、Web
HTML/workspace/WebSocket/SIGTERM退出等原条件不删、不宽、不跳过。无需改变用户
HOME、默认存储语义或 CI/checker。17 个具名输入的原 hash 与候选 Git blob 核对；
两个根脚本的声明绑定是 patch 前真实字节，补丁后的实际摘要另行登记，不伪称相同。

本批四份材料已登记；旧 **5912** 个对象及原字节、baseline/roots 不变，当前
**5916 文件 / 67513791 字节**，相对稳定 main 新增 **200** 份。全部实际 hash/bytes
与目录覆盖已核对，变更文件不属于 third-party inventory 输入集；依赖、材料和许可
条款不变。来源投影按实际变更更新，不新增权利/独立性决定，不修改历史失败。

前一基线 `80375ff62b3d9fc18c3d5b933d3d853802251d64` 的两平台完整 CI 实际通过，
共同受检 SHA `5c33a2569b3246a2a4e847e00e52c49359d67753`，Git tree 与803完全相同。
Linux **8261/8253 pass/0 fail/8 skip**，Windows **8261/8259 pass/0 fail/2 skip**。
这只接受前一修复树；本次 TUI 与最终包装必须绑定新的统一输入及其实际 CI/smoke。
根 Apache、各文件/组件许可、NOTICE、来源保留。公开维护邮箱仍仅影响指定 Linux
全 target；真实模型/tool 后代、Electron/Windows/macOS GUI 的未测边界不消失。
