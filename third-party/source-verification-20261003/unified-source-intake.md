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
