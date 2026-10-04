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

最终输入 bcb82c18 的 CI37127601364 两平台实际失败于两份 CLI 文档的 fmt：
`docs/lane-cli-20261003.md` 与 `specs/knorvia-cli-tui-esm-builtins-20261003.md`。
来源、types、lint 实际通过，后续架构/build/离线回归均未执行。只格式化这两份
文档并刷新真实来源投影；不改生产、根 smoke、原始证据字节或质量 checker。
新的统一 head 必须取得自身完整 CI，旧失败不转为通过。若 native 正在构建 bcb 的
物理归档，其实际 source stamp 继续是 bcb，文档变更与产品输入的字节关系另行核对，
不擅自改标为新提交产物，也不因此要求各路重复全量验证。

## 最终完整归档与 Linux 原生实测证据接收

PR27 的证据 head `1d201988cdbcfeda54bc2fa80119e78cd15901e0` 已以普通 merge
`e38c01bb5f34835c3ac97c300c39ea6611865486` 接收，无冲突、无生产改动。
实际产品输入继续是 `bcb82c184de740c2cd9571c115eafa3bd04480cf`，tree
`3c10f3a238fd6f7b82e3e139cb81a1c648f90b7d`。二十四个具名输入的 Git blob、
bytes/SHA256 与当前整合输入相同；原根 smoke 摘要与九个 assert 文本也逐项相同。
文档和来源投影更新不改变实际产品 stamp，不把 bcb 产物改标为证据或整合提交。

新完整 CLI/TUI/server/Web 归档为 **90495472 字节**，SHA256
`75a77e374b9c12b40e49a35e8867405a7a3fe96751d0dbf25b5ff0595da06f11`。
原 `scripts/distribution-smoke.mjs` 实际 exit0，保留九个 assert 调用、无跳过：
help/version、原生 TUI import/initialized render/键盘退出0，真实 Web server-info/
workspace、HTML200、artifact-resolved WebSocket 和 SIGTERM 退出0均完成。
接收的是作者的完整实际命令、原日志和结果绑定，整合者没有重跑包或全套源码检查；
大产物位于 native 任务环境，本整合环境没有物理产物，因此没有声称重新计算其文件摘要。

新 Linux x64 AppImage 为 **188674891 字节**，SHA256
`f63774b7aeaff27e18df68e7f86e3061f9188214871519829b95ee1c39cb1175`。
实际提取的可执行文件、ASAR、CLI、PTY 与新目录包的摘要一致；未改的 canonical probe
六组实测 exit0，包括 Electron Node 中的 CLI、真实 PTY、SQLite sentinel 的两次
正常 storage preparation 保留，以及 Unicode/spaced 路径上的实际 rg/ugrep/bfs。
既有安装 probe 只改报告的 inputSha 字面量，原命令和断言字节相同；两次实际 loopback
下载、隔离安装/重装、launcher/version/help/安装字节与同一合成 profile sentinel 通过。
安装器自身没有校验 sha256.txt，报告中的 checksum 对比来自外部 probe，二者不混称。

原材料见 `docs/evidence/native-final-package-bcb82c18-20261003/README.md`。
二十七份材料实际 bytes/hash 与二十六项交付 checksum 已核对；新登记 **339703 字节**。
旧 **5916** 个对象及原始字节、baseline/roots 保留，当前冻结登记为
**5943 文件 / 67853494 字节**，相对稳定 main 新增 **227** 份。根 Apache-2.0、
逐文件/组件许可、NOTICE、来源历史及未解决权利义务不改；用户已取消 MIT 迁移。

bcb 的 CI37127601364 两平台文档格式失败仍保留；修正后的 d555 在 CI37127960564
两平台已实际通过。共同受检 SHA `f814b4fe7cd42bcb8ea9fa3bee93f17ed380d5b1` 的
Git tree 与 d555 相同：Linux **8264 tests / 8256 pass / 0 fail / 8 skip**，Windows
**8264 tests / 8262 pass / 0 fail / 2 skip**。本次只接收证据/文档及准确来源登记，
最终合并使用该登记后 head 的实际必需 CI，不把此前受检 SHA 的通过转记为新 head
已检查。Native 原始交付中的旧 CI 指针保留为交付时的记录，本说明给出当前跟踪状态。

这是有边界的 Linux 产品实测，未接受 Electron GUI、真实 Windows/macOS 安装/GUI、
完整旧用户数据迁移或活动 tool/MCP 后代关闭，也未新增 SSH/WSL 验收。指定 deb/rpm/
pacman 仍缺事实公开维护邮箱，原 targets 保留；不从 Git 作者推断邮箱。它们不阻塞
已完成的 AppImage/归档或正常源码 main 合并。新 CI 通过后按既有授权正常合 PR24，
保留各输入祖先、原始失败和来源分支，不宣称100%全支持或全仓独立权利接受。

## Linux maintainer metadata and installer release intake

User-authorized public maintainer email `accomplish07zrh@gmail.com` supersedes
the earlier packaging hold. Native head `5c3120f0abfd4031a9c69b5b8a6d2082721ef57d`
was normally merged from main `b3b2fc5f51d2e76ff76c20aff44eb2b1d562c687`.
Forty-four raw files (277567 bytes), forty-three delivery checksum entries and
seventeen named source-input bindings match their committed bytes. The previous
5943 frozen records remain unchanged; cumulative registration is 5987 files /
68131061 bytes. Registration preserves sourceCommit, baseline and roots.

Native's actual Linux products remain preview.3 built from
`b5fbc3d89c34c45d6d9f7e16183bbdaec79d75f8`, tree
`43b342a85478c77f148ffec6fd8f90cc43e1013b`, not this integration commit. The
packet records real successful AppImage/deb/rpm/pacman generation, metadata,
extracted payload equality and bounded native-runtime acceptance. The initial
rejected builder schema, corrected metadata probe and other actual failures
remain frozen. The integrator verified committed evidence and source bindings;
large product bytes remain in the native environment and were not rehashed
here. These preview.3 products will not be relabeled as preview.4 or overwrite
the existing release. Final release products must be built from the final exact
source commit, with fresh checksums and package acceptance.

The new preview.4 release keeps root Apache-2.0, NOTICE, all historical source
records and unresolved per-material obligations. Release automation/acceptance
utilities adapt explicitly identified prior probe behavior where needed; this
is not a new originality claim. No repeated local full suite was run during
this evidence intake. Required new-source and actual package checks are pending
the final release candidate.

UI PR28 head `1a0febaf9b362b5bcd578d396ec566bf98a33e51` was normally merged.
Its 19 delivery checksums were verified against the exact committed files; 17
new raw files / 435296 bytes were registered, preserving the previous 5987
records. Frozen registration is now 6004 files / 68566357 bytes. The two BMP
files and source icon retain their actual hashes. Static HTML/PNG previews are
design evidence only, not native Windows installer screenshots. The production
asset `sources.json` has a genuine targeted formatting failure; UI correction
is pending. Native owns the actual bitmap/LangString/installation integration.

The integration release helper tests have three real passes; changed-file lint
and architecture checks pass. These do not stand in for final source CI or
actual release-package acceptance, which remain pending. New probe helpers
adapt the frozen canonical native probe and Linux metadata probe without
editing the original files or their failure history. No source-origin claim
is promoted merely because a new packaging helper passes a check.

## Native guided installation, portable variants and format correction

Native heads `1836f419aa2ac41117e21b1ba01e196d66227a2a` and
`b03bb9d25b71ac07b7c8d510c4fc2d34ac966ff7` were normally merged from their
retained branch. They add the actual bitmap/shortcuts integration, separate
portable targets and stable launcher-origin profile selection, and limit both
upgrade and ordinary uninstall cleanup to owned program files. Source fixtures
are authored but were not executed in that implementation lane. Earlier b5fbc3d8
Linux product results remain bound to that older input; they do not validate
these later runtime/installer changes. Integration's fresh release matrix covers
both platform/variant combinations and requires actual package acceptance.

CI37136506776 at PR29 head 162477ddabc04dbb4df0606578ddbf98a9e6da2b really
failed both platforms at the UI production sources.json formatting rule.
Provenance, types and lint passed; architecture/build/offline regression did not
run. The targeted formatter changed only JSON layout, with identical values and
unchanged bitmaps. Five new raw records (5827 bytes) retain original/formatted
bytes and their exact relationship in docs/evidence/installer-branding-format-20261003.
The historical UI packet/checksum stays unchanged and continues to describe
its original exact commit. No original failure was replaced with a success.
All 6004 previous frozen rows remain; current registration is 6009 files /
68572184 bytes. These formatting records were created by integration, not
falsely attributed as files committed at the UI source head.

Native's final source-only packet at
`54af931e1a17f13bf39c67d48291e8b03fc42d9e` was normally merged. Its 23
explicit source/blob/hash bindings were verified at their own recorded source
commits, including the separate UI resource sourceCommit. Three raw files /
14182 bytes were appended exactly; frozen registration is 6012 files /
68586366 bytes. Native's authored tests remain described as unrun in that packet.
The temporary intake reader first looked up UI resource rows at the native
commit, then resolved a packet-relative README checksum at the repo root; both
failed before registration and were corrected using explicit row sourceCommit
and packet-relative paths. These were metadata reader failures, not product
checks. Four native production/spec/fixture files received formatter-only
layout corrections after a genuine targeted format failure; their original
bytes remain at b03 and in the unchanged source binding. Source semantics and
all existing raw evidence are retained.

The packet also preserves that native's own draft PR creation was rejected by
automatic approval review because its delegated context did not establish
direct trusted authorization to disclose the maintainer address. Native created
no PR and did not bypass its rejection. This historical operation remains a
failure; it is not changed by integration intake or the existing public branch.
Integration publication must follow the authorization and actual write result
of this task, without fabricating approval, signatures or disclosure authority.

The integration lane subsequently ran the three focused native unit files once
on Linux with pinned Node 24.14.0: 17 tests passed, zero failed/cancelled/skipped,
covering the ten new scenarios plus seven retained scenarios. The input was
local HEAD 7583d1a2e51291445b8bfe78c9476dc8ab5604fb with its explicitly dirty
integration working tree; this is not final source CI or packaged Windows proof.
The four Windows NSIS cleanup scenarios and fresh actual release packages
remain unrun. The original native packet remains unchanged and describes only
its own earlier source-only operation.

After one direct-authorization evidence retry, native's PR creation was again
rejected because review still saw delegated context. The parent is waiting
for the end user's direct public-email authorization. Integration preserves
all prepared local source and receipts, and pauses public pushes, related PR
writes, tags and Release publication. Existing public history does not grant
permission to bypass this rejection. No v0.8.0-preview.4 publication occurred.

The five integration-created formatting records were first committed locally
at c0b6ff599063b11b2dd8bb8be899b9c4ba64519b. Their frozen rows now bind to
that actual commit after verifying each committed blob's SHA-256 and byte size;
they are not attributed to the UI source commit. All earlier frozen rows and
their committed source relationships remain unchanged. This local checkpoint
does not imply a push, final source CI or public-email approval.

## Direct disclosure authorization and release resumption on 2026-10-04

At 00:34 UTC the end user directly answered "允许" to the explicit question
permitting accomplish07zrh@gmail.com in Knorvia Studio public GitHub PRs and
Release packages as the maintainer contact. The parent supplied the original
question/answer and successful direct-message lookup, then authorized resuming
the existing 0.8.0-preview.4 release. This applies to future writes within that
scope; it does not change the earlier refusal results into successes. A new
approval rejection still blocks its action and must not be bypassed.

The saved local input 49b05dd12f0eee314cd6b6d9f03baece46e8e9e2 was intact
with a clean worktree. Remote integration remained 162477ddabc04dbb4df0606578ddbf98a9e6da2b,
main b3b2fc5f51d2e76ff76c20aff44eb2b1d562c687, native
54af931e1a17f13bf39c67d48291e8b03fc42d9e and UI
1a0febaf9b362b5bcd578d396ec566bf98a33e51. No preview.4 tag/Release existed
at resumption. Existing raw packets, prior 17 focused unit passes, historical
CI failure and old preview.3 products keep their original input bindings.
Final candidate/package checks are still pending at this checkpoint; publication
will use fresh packages built from the eventual exact normal main merge SHA.

The user then directly authorized accomplish07zrh@gmail.com for public project
PRs and Release packages in this original integration task and requested merge
and publication. The prior review refusals/cancelled candidate stay unchanged.
PR CI37165480921 passed both platforms at actual merge SHA
5797668baa93ceb9f4940c832788b1553d4b50aa, tree
284526d6b32d788ac1fa739ca5828edf64558497, equal to candidate 52f337f1.
Linux: 8277 tests / 8269 pass / 8 skip; Windows: 8277 / 8275 / 2;
both zero failures/cancellations. No real packages were accepted by that CI.
At resumption the workflow's runtime mirror variable was found to be overwritten
by bundle.mjs, which reads ELECTRON_MIRROR. The workflow now explicitly supplies
that actual input with the official URL. This changes download configuration,
not product code, licensing or historical package input bindings.

## First preview.4 actual candidate outcomes

Run 37169792546 checked exact adbef7586541c6a58d58eff83f28a8aeafd15a6b.
Both source quality jobs passed. Linux installed job 111343286037 passed actual
four-format metadata/payload and packaged-runtime acceptance. Three other jobs
built their artifacts but failed acceptance: Windows installed 111343286092
passed all four actual makensis ownership fixtures, then the probe supplied a
POSIX nested ASAR path to Windows's host-separator lookup; portable Linux
111343286088 lacked a global require in Main inspector, while Windows portable
111343286075's inspector-console require could not resolve electron. Required
validate-release and publish were skipped after these failures; no preview.4
publication occurred. Read-only gh artifact download encountered HTTP403;
completed decoded job logs independently provided the actual failures.

Integration fixes only the ASAR host path and the inspector loader rooted in
the actual packaged ASAR. No product code, assertions, raw source packets or
rights decisions are changed. All package acceptance must rerun on the new
exact source before normal main merge and final fresh publication.

## Candidate 80a actual acceptance and diagnostics

Run37171834106 at exact80a12016b865881ca500d23508ec0aed906b0f46:
Linux8277/8269pass/8skip; Windows attempt18277/8274pass/1fail/2skip
had final creation records.write pending after1000ms. The original budget and
all assertions remain; rerun only the failed jobs and blocked descendants.
Attempt2 Windows8277/8275pass/0fail/2skip and reused Linux success. Same-head
PR source CI also passed both platforms. A later pass does not fix or erase
the original creation IO delay.

All four candidate variants built. Linux installed job111352516511 passed
actual acceptance. Linux portable111352516480 failed inspector Promise was
collected before any launch acceptance. Windows portable111352516503 attached
before Node assigned getBuiltinModule. Windows installed111352516476 passed
all four actual NSIS cases and metadata/legal/CLI/storage initialization, then
a SQLite/PTY native child command exited; its wrapper omitted exit code, so
the native root cause remains unresolved. No candidate publication occurred.

Integration changes only synchronous inspector evaluation, explicit bootstrap
markers and bounded child-command diagnostics. PTY/window/profile/persistence
assertions and product sources are retained. Raw acceptance JSON remains bound
to80a; no source records or rights classifications are promoted.

## Candidate b1 actual command evidence

Run37174700874 at exactb1af03e7956bfd2d7711079107cc31f04abfa7de passed
both source quality jobs (8277 each; Linux8269pass/8skip, Windows8275pass/2skip,
zero fail/cancel). All variants built; Linux installed111356660519 accepted.
Linux portable111356660498 failed synchronous inspector request timeout;
Windows portable111356660481 failed Node console-extension installation before
its expression. Explicit packaged loading needs no console extensions, which
are now disabled; the real owned Node ESM transport regression passed1/1 at
pinned Node24.14.0, including synchronous Promise-object return, absent require/
console helpers, exception rejection and normal process exit. This is not
Electron GUI/profile acceptance.

Windows installed111356660527 passed its four actual NSIS cases. Raw command
failure stdout proves actual packaged Electron41.0.3/Node24.14.0 PTY output and
PTY exitCode0, and completed SQLite sentinel. The probe process instead hit
its unchanged20s limit (code null, signalSIGTERM, killedtrue). Pinned node-pty
keeps its ConPTY connection/worker until explicit public cleanup. The owned
probe now requests kill cleanup after asserting the natural PTY exit/output;
there is no force-exit or timeout/assertion relaxation. Whole-process normal
exit and actual installer/portable acceptance remain required and unverified
for the new source. Prior failure outcomes, source packets and rights stay.

## Actual candidate54 outcome and targeted bootstrap diagnosis (2026-10-04)

Run37176247969, source54a777da441759f14e2c5c144defa85c885452a9, is terminal:
Linux source8278/8270pass/8skip and Windows8278/8276pass/2skip, no failures.
Actual Windows native portable and Linux installed acceptance passed. Windows
installed failed after its packaged CLI/SQLite/PTY probe passed: early Electron
app.isReady was unavailable; cleanup EPERM was secondary, retained raw JSON
preserves the primary. Linux portable failed an owned inspector RPC timeout.
Validate/publish skipped; no preview.4 tag or Release was created.

The raw desktop-bootstrap-20261004 packet distinguishes baseline3fail,
guarded3pass (redundant inserted guard) and exact-current1pass on official
Electron41.0.3 Linux runtime. This establishes the early loader re-entry cause
and bootstrap-boundary correction only, not complete Knorvia package acceptance.
No deadlines or successful normal-exit requirements were relaxed. Cleanup now
awaits only owned children and records secondary failures without masking the
primary or leaving an accepted manifest. Targeted same-owner workflow selection
requires explicit dry_run, marks diagnostics, skips source checks honestly and
cannot aggregate/publish. Final main release still builds all four groups afresh
with both exact-SHA reusable checks. New selection and diagnostic-rejection
regressions passed locally (3 cases); no repeated whole local suite/audit/build.
Source and license conclusions are unchanged; unresolved rights obligations
remain. The user explicitly authorizes accomplish07zrh@gmail.com as public
maintainer email in this project's GitHub PR and Release installation packages.

The eight new raw receipts first entered the repository at full source commit
58bba967abe008ea312253b2996083017a677a3b; only their new frozen rows are
annotated with that actual commit. All prior 6012 frozen rows remain unchanged.

## Targeted36 actual results and immutable payload reuse (2026-10-04)

Run37178918892 at36d944b4e6290175dafba9607c0031c8c2e39d3f built BOTH groups
successfully; both then failed acceptance. Windows installed111367339653 passed
actual ZIP two windows/profile/sentinels/normal exits plus CLI/storage/SQLite/PTY
and four NSIS fixtures. It next refused EEXIST at its late ordinary-profile
reservation; no existing profile was adopted or deleted. The reservation now
occurs exclusively before any owned launch, retaining the existing-data refusal.
Linux portable111367339673 still times out in owned inspector RPC before any
returned state; its cause remains unproven. No blind bootstrap-success claim.
The added guard fixed real Windows startup but is not established for Linux.

Actual failing raw reports:11295031446/11294826776. Actual built payloads:
Windows11294207714/565274413bytes, Linux11294771800/736053951bytes. The SDK
reader rejects Linux payload above512MiB; local gh artifact redirect read403 is
an evidence-reader limitation, not product failure. The same diagnostic workflow
can read retained artifacts on hosted runners without rebuilding, verifies their
prior report/package source, records package and current probe SHA separately,
and never sends reused/diagnostic bytes to aggregate/publication. Fresh final
source/package equality remains strict. Failure reports add phase/count/last
state and bounded stdout/stderr without extending RPC/startup/exit deadlines.
The new guard test preventing reuse in full Release passed1/1; no repeated
whole local suite/build/audit. Exact36 PR checks37178921758 completed both Linux
and Windows successfully. Existing historical source/rights evidence stays.

## Reused8c actual outcome; phased startup observation

Run37179923974 used actual36 packages and probe8c3744d4ac520d4000cd4ab6e0d950a377f01b3c.
Windows installed111370301972 passed complete existing acceptance, including the
four NSIS cases, ZIP windows/persistence and actual install/reinstall/uninstall;
its early exclusive ordinary-profile reservation correction is now demonstrated.
Linux portable111370301974 failed; raw11294512980 binds both exact SHAs and
reusedPayloads=true. It returned four startup states, correct original portable
root/profile and version, then request5 timed out while ready=false/windows0.
App stdout reached crash-capture configuration. This is after bootstrap, not
a repeat proof of bootstrap globals failure. The exact blocked native call
remains unestablished. All deadlines and exit/window/profile assertions stay.

State observation now calls only isReady and application data-root environment
until both are ready, postponing window/version/userData APIs. Early userData
query can create the default directory before application-owned profile setup.
The actual official Electron41.0.3 local synthetic fixture passed3/3 ready
windows and normal exits with this phased expression; fixture sets its own
synthetic data-owner environment, not a packaged portable override. This is
not Linux package acceptance. Next diagnostic reuses the same actual36 Linux
bytes only, without rebuilding; separate original AppImage/archive attachments
retain those exact bytes for local focused reads below the SDK's512MiB cap.
These are diagnostic-original artifacts, never new-source built identities or
Release-eligible assets. No claims about complete independence/rights changed.

## Linux phased observation did not solve the stall

Run37180216307 probeed8679e5bc551b5465c7f393dd964b1542cde143 reused actual36
bytes; Linux111371155521 failed request5 with last readiness/data-owner state
pending and crash-capture configured stdout. Thus postponing path/window queries
is not a proven Linux correction. Raw11294578611 retained; separate original
AppImage11294373706/188240291bytes and archive11294139417/179785706bytes are
available, below SDK512MiB, but local file transfer still rejects above32MiB
and direct attachment read403. These reader constraints are not product tests.
No new build is requested. Diagnostic-only existing probe will capture owned
Xvfb before child termination to reveal possible modal startup errors blocking
RPC; capture has separate2s command bounds and cannot mark acceptance passed.
The prior8c PR run37179926618 was automatically cancelled by the newer head;
not described as passed. No main merge or preview.4 publication occurred.

## Owned80 display result; native wait remains unproven

Run37180580898 probe80b5696f91264b6813f17e78844539579bec1e13 reused original36
packages, with no build. Linux111372219626 again timed out request5 pre-window;
raw acceptance and owned Xvfb PNG11295058471 were retrieved and inspected.
The1280x800 image is blank; no modal startup error was observed. Screenshot
capture worked, but is not acceptance. No false modal-cause or Linux-fix claim.
Next same-owner diagnostic adds strace process/lock/poll/connect/open events
only for reused Linux launches, preserving package bytes, profile and deadlines.
Tracing artifacts are diagnostic and cannot validate/publish. Full release does
not enable tracing. Source ed CI37180219878 auto-cancelled on newer head; prior
actual Windows acceptance/source successes remain precisely attributed.

## Actual single-instance temporary socket boundary identified

Raw3a trace and official Electron41.0.3 minimal experiments are frozen in
new desktop-linux-socket-20261004 packet. At matching95-byte TMPDIR, actual
requestSingleInstanceLock produces natural[null,SIGTRAP]; with only20-byte
owned TMPDIR it creates a ready window and exits0. Control95-byte without
single-instance request also creates window/exits0. Initial149-byte failed,
two20-byte cases passed. This identifies probe-generated temporary-directory
conditions at the Linux socket boundary. No application bytes/features change.
Only probe TMPDIR/TEMP/TMP move to exclusive short /tmp/knv-\*; portable data and
original launcher/spaced paths stay and all deadlines/assertions remain.
Cleanup errors fail; original primary error remains intact. New trace guard
regression1/1passed ensures full release cannot enable instrumentation. Latest
old-package confirmation explicitly runs diagnostic_trace=false, with no build.
Raw receipt integrity is not authorship/rights acceptance. Prior6020 frozen
rows remain unchanged; full final release still requires fresh main builds.

The11new Linux socket packet files first entered at full source commit
b50121aefbdad33c5d96242b9efdbdf6c58b7c0a; only their newly appended frozen
rows now pin that actual first source. Prior6020 rows remain unchanged.
