# 最终集成接口、顺序与 HOLD 清单

本次是发布证据与 Git 树元数据核对。最终集成仍须等所有实现完成；本次没有组合分支、导入其他 lane 的源码、运行项目检查或修改全局许可/清单。saved E 环境、origin 与分支已核实，核对前 HEAD 为 `d0e405bda73cfcafc09c117ef52e2fca4d1aa6fe`。Sol/high/Fast 既有记录与限制保持原样，本次无新 author。

## 三处真实版本碰撞

各 PR 使用自身 merge-base，而不是当前 base tip。发布 head：PR8 `d0e405b`，PR9 `6470e414`，PR10 **`e22d2bc`**，PR11 `0a36f716`，PR12 `dd963aae`；均 open/draft、未合并。精确完整 head、merge-base、路径与 Git blob 见 [published-path-collisions.json](published-path-collisions.json)。PR8 从上一份进度快照至当前 head 只有证据改动，源码树等价。

| 同路径 owner | PR8 Git blob | PR11 Git blob | 需要裁决的版本关系 |
| --- | --- | --- | --- |
| scheduler/collection-planner.ts | `a6211db6991fc82f97e62cc67a47f499f9405288` | `3d32f332462b3aac0a3037161c19340e2b6928fd` | E 后续完整 v2 与 A 早期已修复的 mixed 候选 |
| scheduler/node-runner.ts | `917b25ccda3614cad553961e050fd82ea7a89a6b` | `18523fd43ef142e2fad73f5869dc1f6ea312b673` | E 完整 owner 与 A corrected cf1cfe00 的 runner/outcome 拆分 |
| scheduler/planner-expansion.ts | `c2243ba5a4df70c90771860b492f94a50135e000` | `6303688f0a2ff55f6e6c2f13737bd85c3c49cc32` | E 完整 v2 与 A 早期 mixed expansion 候选 |

这证明需要显式选择最终版本，不证明存在新行为冲突，也不是 A 最近改动重新侵入 E 的结论。PR11 后续 expert/runtime 记录声明保留 scheduler 不动；其分支仍携带这些早期版本。包内 TS/JS 与 JSON 配置的扩大路径筛选仍仅发现这三处不同 blob，其他九个 PR 对在此筛选下无重叠。筛选排除了测试/文档/evidence，不涵盖所有二进制、lockfile 或受限目录；无同路径碰撞不能证明跨文件接口兼容。

已有精确 E owner 绑定：collection `32ffd9142ec2d13db5589fa520222c68dbd15e8da2d248efb3b72377620de3af`；expansion `fa55221d297c30564d8960ba3e91e50fb6e9de14e7c915025f5dbcc4c736fb73`；node runner `61e6c3ea17edf02e748469e21dd8d2e3f22b26ead2f3a27169a30c197252dc27`。完整 frozen source/receipt 先于安装，当前没有 integration correction。选择 E 后续完整 owner 是可审查的候选路线，最终选择和对应直接消费者验收归 root。

## 实现完成后执行的集成顺序

1. **冻结所有 lane 最终发布 head。** 纳入 B 尚未发布的 UI/workspace/grouped-task 实现；公开 PR8–12 不能代替 B 的待提交范围。A mcp/config、G 新 desktop Playwright 三 owner、root network/environment 和 D 后续 permission owner 以实际发布证据为准，当前进行中项不能视为交付。todo/tool-perf 尚未分配，不因短文件或缺 receipt 推断为纯投影。任何 head 变化先更新元数据交集，再推进。
2. **确定一个最终 source owner 表与三处 scheduler 版本。** 记录 chosen source SHA256、Git blob、输入/draft/receipt/修复 descendant，以及保留/停用的 helper。E complete planner 不依赖 A 的 collection-planner-admission；E complete node runner 不依赖 A 的 node-runner-outcome。不能为了通过旧 selector 恢复旧 helper 调用，或把新版本标成旧冻结摘要。保留历史失败/oracle 与许可声明，更新的是最终 current selector。
3. **先核对共享 schema/公开入口，再核对直接调用方。** A 的 scheduler/state/expert/runtime、E 的 workflow 定义/graph/prompt/event/hydration、G 的 shared/RPC/adapter 与 D 的 service 消费者须绑定到同一最终树。验证公开导出、类型及运行时 schema/function identity、value/type import 边界与循环；重导出/拆文件不能自动算新的独立实现。workflow graph/summary 等 root 已接受但 E 本地较旧的版本须先裁决。
4. **按下表验证接口与事件顺序。** 只为最终 chosen artifact 建立 current source/emitted/declaration/consumer selectors，带 wrong/missing artifact 拒绝控制。旧 successful receipt 不能视为新组合通过。保留旧红证据与明确的运行环境限制。
5. **修复全局清单新鲜度门禁，再做最终项目验证。** root 在获授权的最终组合树上更新逐文件事实与摘要，先裁决过期/冲突 review，保留 mixed/third-party/NOASSERTION，不从候选技术通过自动转成 MIT。随后刷新 current-files 并执行 provenance:check；通过只表示清单新鲜。当前用户要求不在中途集成，本次未执行这些动作。
6. **完成最终编译/消费者/离线与平台验收。** 清单门禁通过后按 root/CLI AGENTS 运行对应 typecheck、lint、format、architecture、CLI build 与 studio offline 测试；对相关平台/界面补实际验收。合并、生产操作、发布和全局许可决策仍须各自满足授权与证据条件。

| 接口组合 | 必须保持的观察与顺序 | 当前证据范围/风险 |
| --- | --- | --- |
| A scheduler/expert → E node runner → E event-log/graph | main 与 started 为原生 distinct promises；启动 persist → set → active journal/event 后才 resolve started；启动失败 main 原值拒绝、started pending；成功 publication 错误进入 failure 一次，failure publication 错误直接逸出；回调 receiver/live snapshot/phase、终态与 child-link cursor、捕获 attempts/status/error 事实保持 | E 静态 API/绑定与完整 author；A corrected runner 是 E behavior baseline。最终实际 scheduler 消费者与 emitted closure 尚未验收。见 [node integration](../../knorvia-node-runner-author-integration-20261003.md)。 |
| collection planner → expansion → graph/events/prompts | 串行 admission/sweep；activation gates 在 recoverable region 外；child-link snapshot 不被 terminal projection 覆盖；失败原始 numeric errorCount/boolean exhausted 在可变 publication port 前捕获；phase 在 await 后按 live options 观察；200,000 IDs 顺序聚合无参数数量限制；collectionId/public record identity 与 ordered explicit-before-inferred edges 保持 | E 两个完整 v2 有静态绑定与历史两组受控反例；A 早期有 mutation/consumer/source/emitted 修复证据。不能把 A selector pins 或旧 API 通过直接算 E 最终组合通过。见 [planner integration](../../knorvia-planner-owner-integration-20261002.md)。 |
| A model/turn/runtime/MCP → E attachment/hydration/history/context | 字节/引用身份、await 后 current history/read-state、tool-result/image visibility、上下文顺序、权限/tool 可见性与 trace 传递保持；保留 tool-allowlist/grant-resume adapter 原系谱 | 两 lane 的 protected source hashes 是各自分支事实，不能保证最终组合。E read-state 与 root accepted hash 不同仍 HOLD。 |
| G transport/RPC/Host/preload → D services → root Host/main IPC | hello/ack、backpressure/close replay；CommandInbox admission、owner/lease/stale run；workspaceIdentity 与 remoteSessionId；desktop continuous 与 web replayable；43 registrations 的顺序/arity、once/on cleanup、captured Host、null bootstrap/absent browser microtask 及 dispose 两集合保持 | 独立 scoped pass 不消除跨包 21 RPC 诊断/消费者差异；root semantic closure 仍有反馈流与 node-forge 阻塞。无原生实际 IPC/进程验证。 |
| D CUA/permissions → root platform/Host → G desktop browser | authority/session/lifetime、permission 原策略、PiP event/credential boundary、进程取消和窗口生命周期、浏览器 resolver attach-time 观察保持 | PR10 e22d2bc 已消除新增两个导入诊断，类型仍 BLOCKED6/15；新 permission/Playwright owner 须等发布并绑定。 |
| G deployment/assets → root cache/network/environment | manifest identity、ready/partial failed force-download 保留旧 cache、refresh sharing/legacy/pre-fetch 顺序；env/CLI/config 优先级、proxy/TLS/custom CA/路径平台语义保持 | root network/environment 尚无本次最终发布证据；只使用已发布材料，禁止补取私有 checkpoint/Library403 或真实配置/凭据。 |
| B UI → services/shared/platform | schema、workspace/session identity、optimistic pending 与 server-owned 状态、同步与 replay 区别、桌面/手机交互和现有视觉数据保持 | B 6+ 本地未发布项无法审计；保留显式缺口，无替代恢复、界面删改或进度计入。 |

## 当前 HOLD 与解除前提

| HOLD | 精确事实或来源 | 解除前提 |
| --- | --- | --- |
| root accepted / E local 版本差异 | format-roster local `c885fe9a8ab0` / root `d460e2237a50`；summary `b201973924df` / `59d19958a577`；graphFold `ed9f00051bde` / `89d83bcce026`；graphBounds `7c5da335dd06` / `df3076e726ed`；registry local `ac09ec1b` / accepted `12a18abd`；read-state `1b4a8d1acc99` / `5acb4ca49c0f`。全摘要与对应记录见 [既有 screen](../core-published-ownership-next-screen-20261003/screen-results.json) 和 PR8 hydration/registry 记录。 | root 选最终已接受版本并记录对应 source/receipt；本次不导入、不重写、不授 whole-file MIT。 |
| D startup/commitMessageFileScope | PR10 当前发布说明仍记 accepted-parent hash mismatch。 | 查明实际 accepted descendant 与当前源码关系，再绑定最终 source；不能用早期 acceptance 名称覆盖差异。 |
| D CUA 与其他类型阻塞 | e22d2bc 完成 relocation，owner6→8→6，consumer15→17→15；去除行列偏移后的 path/code/message 与原始相等，完整日志字节不同。新 owner diagnostics 已消除，原有 CUA 缺声明等保留。RPC、command-parser/croner/ignore/yazl/feedback/appCaCert 与 historical59listenEPERM 依旧按各自证据限定。 | 最终依赖与直接消费者编译；provisional creation/protocol-client origin 另待审查。无 install/link/stub/any/suppression 绕过。 |
| root semantic/full acceptance | PR12 dd963aae 报 feedbackLogArchive/ReadableStream.destroy TS2339、node-forge TS7016；局部最低 synthetic/API 通过，native/full builds/suites 未执行。 | 最终树修复或明确处理实际诊断，完成适用消费者与平台验收；本次未复跑。 |
| stale global inventory / CI | PR12 exact-head Actions [37080878699](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37080878699) 的发布说明：Linux/Windows 先失败于 file provenance inventory，install/typecheck/lint/format/architecture/build/offline 后续 skipped。不是运行时测试失败或通过。E local source ledger4002 与 root reported4077 的75项口径差异仍保留。 | 最终选择树上核对新增/删除/移动文件、helper/owner/receipt aliases、历史/当前 selectors、source/emitted/declaration bytes、review 过期或冲突与 retained notice；root 刷新事实清单。门禁不得跳过，不运行未变失败的重复检查。见 [licensing 约束](../../../licensing/README.md)。 |
| 未发布工作/受限材料 | B 未发布 UI gap；root private checkpoint 不可用/Library denied；A/G/root/D 当前新工作仅在最终发布后可纳入。 | 获得正常公开发布或用户重新提供的授权材料；不做替代提取、凭据操作或权限重试。 |
| 21 material obligations | 3 ARMS、is-node-process、strict-event-emitter、lazy-val、semaphore、unsafe-pointer、8 colored SVG、QuickJS/WASI/extension、React Best Practices full notice、Rust revision6a6eaca 的两个 Windows archive unavailable、Skia linked third-party。全部 OPEN；本次0关闭。 | exact source/version/digest/grant/notice 或 root 决策。保留原负搜索；黑白作者声明不能覆盖彩色，架构/技术通过不能建立材料授权。既有 root closed notices不重复。 |

公开新证据的 Git blob 与 SHA256 已核验，抽取事实见 [published-evidence-observations.json](published-evidence-observations.json)。PR10 的更长 repair receipt 包含历史源码片段；仅 curator 读取，未交给 author、未导入 production。历史 scheduler root red 记录不冒充后续 corrected 状态。来源/读取错误及快照摘要见 [snapshot-input-bindings.json](snapshot-input-bindings.json)；元数据读取错误已保留，不算进展。

本次仅证据；source-exposed curator、既有 wider exposure/已修复 scratch-write breach、instruction-only/shared executor/无 OS isolation 或独立 access audit 等限定持续有效。没有 clean-room、whole-file originality、整体 MIT、最终交付或新的 material closure 声明。先前18–25%实施草稿覆盖估计仍绑定先前 heads，本报告不计算新的百分比。
