# PR #7–12 持续整合基线

2026-10-03。本轮用户授权先整合积压 PR，为父任务后续固定云端任务提供唯一基线；实现阶段不运行测试、lint、类型检查、构建或完整审计。代码阅读、冲突解决和远端提交确认继续进行。上述本轮要求优先于仓库/技能的中途验证命令。最终统一验收与合并 main 留待后续阶段。

## 唯一分支与初始输入

唯一整合分支为 `integration/backlog-20261003`，从 PR #7 的实际最新 head 建立。main 为 `bd0bb014c0974334557fa51814709d0b78f35f1d`。所有输入使用完整 SHA；不信任 PR 描述内较旧的 checkpoint，不强推、不改写源分支，不创建额外云端任务。

| PR  | 分支                                       | 固定 head                                |
| --- | ------------------------------------------ | ---------------------------------------- |
| #7  | recovery/independent-logging-20260930-0456 | f25b931164ee6287167e965e9da7a7586131b264 |
| #8  | parallel/material-closure-fast-20261002    | da2aae2e86e83f62ac9b8edd3496b408fcda2139 |
| #9  | recovery/server-lifecycle-20261002         | 2458655c2644c487bb66967800e000943b9678cf |
| #10 | independent/settings-lifecycle-20261002    | ea7aa6acf8e9b33c7446aa25a8ca16687e2f330e |
| #11 | parallel/cli-tools-fast-20261001           | e884311ee74df690cfe36e38d9bbe0eae86c791d |
| #12 | independent/root-remote-cache-20261003     | b84ab3a992f1df751661f6b64ee5f7e25d0ebdb8 |

#9、#10、#12 继承 #7 实际最新 head；#8 从 main 分叉，#11 从 #7 的较早祖先分叉。分别以真正 merge-base 枚举改动，不把较旧分支缺少的后续文件误判为有意删除。使用保留父提交的 merge，不重放已整合提交。发现 head 推进时另记新 SHA 和增量，仍维护此唯一分支。

## 冲突的版本选择

- 保留 #7 的 `read-text-orchestration.ts`、`read.ts`、Read consumer fixture/test 与 `specs/knorvia-read-orchestration.md`。#11 携带的较旧版本没有同步 generator 的完成时序修复，也缺少 PDF golden 的跨平台 UTF-8 字节校正。保留 #7 的源码、规格和原测试，不削弱 oracle；#11 后续其他成果照常合入。
- `workflow/scheduler/{collection-planner,node-runner,planner-expansion}.ts` 采用 #8 后续完整 E owner：planner `cf75d15f534f1d9855356fb9cb3a11b06a7c648d`、runner `dfae259be47287be6642ab8469009b008a01bdb2` 的实际 descendants。完整冻结稿与安装绑定先于本轮整合。#11 早期 mixed/corrected versions、额外 helper 和失败记录保留在提交历史及证据；不能把其旧 source/emitted selectors 写成 E 当前组合的通过证据。
- `session-context/read-session-context.ts` 是 #7/#8 另一处冲突：采用 #8 `b5152875cb5aa236e920af07779b05fe2b8b8752` 已安装的完整 E owner，并同时保留 #7 的 material-selection helper、原有测试和历史记录。保留公开 API、筛选/排序/预算/引用/可见性行为；本轮不声称执行验证或绑定旧 helper receipt 为新 owner 验收。
- 无冲突文件按 Git 三方合并保留；有冲突的文件逐一阅读并绑定选择来源，不用全局 ours/theirs 丢弃某一路成果。来源决定、LICENSE、NOTICE、第三方义务与历史失败不可为门禁修改。

## 业务与来源边界

本轮不增加产品行为、不改变 GUI、黑白视觉/玻璃/布局/快捷键/中英文，也不迁移或操作用户数据。保留 workspace identity、owner/lease、CommandInbox 串行 admission、stale run、桌面 continuous 与手机 replayable 的已有边界。

```text
固定 PR head → 三方合并 → 单一当前 source owner → 同一整合分支
                           └→ 历史来源/失败/冻结稿继续保留
后续固定任务 → 基于完整基线 SHA 的模块分支 → 此整合分支 → 最终统一验收 → main
```

#10 的 `sessionService` 与 `taskIndexSyncer` 仍为 UNALLOCATED / UNINSTALLED，保留 prior-root-allocation-and-origin-holds；其他 root/E accepted-hash HOLD 按精确路径与 descendant 查明，不能用本地缺 receipt 推断未分配。#8 的 todo/tool-perf 等询问仅作归属输入，不因文件短或 inventory 标签就重写。

## 本轮完成记录与后续验收

完成记录写入 `docs/knorvia-backlog-integration-20261003.md` 和同名独立整合证据目录：完整输入 SHA、merge commit、冲突选择与最终 blob、来源义务、后续模块文件归属、远端确认及未执行项。保留旧 PR open/draft 供活动分支继续提交；建立面向 main 的整合 draft PR，暂不合并 main。后续提交继续按 source head 记录，不修改历史通过/失败记录。

本轮测试、lint、类型检查、格式/架构验证、构建、完整审计、原生/界面/真实消费者验收均 **未运行**。仅阅读既有 CI：#9 `37096643153`、#10 `37096385450`、#12 `37095110127` 的 Linux/Windows job 都失败于 file provenance inventory，安装及后续产品检查 skipped。不得写成通过，不重跑、不绕过门禁。来源清单新鲜度、跨模块兼容、source-expression/权利核验、原生 UI/平台、安装版/便携版/迁移与最终 Linux/Windows CI 仍待最终阶段完成；根许可不改称全量 MIT。

## 四路冻结接收与最终集中验收

2026-10-03，父任务明确通知四路完成并冻结，用户现在授权在唯一整合树执行最终集中验收。上文不运行验证的约束描述先前实现阶段，本节进入原定后续阶段；继续同一 `integration/backlog-20261003` / PR13，不新建任务，不重建分支，不提前合 main。

输入为 #14 `5274ca99d13531377000fe0f2c529561f75ce046`、#15 `809374e21993bb03cabaf3d68adad6564baa41fa`、#16 `dac1483b661064ba64003a1137713646d2ebbc8c`、#17 `f7ad7efa3e5e1bec72eaba818db6bce43fa33d97`，整合者前置 `dc0c4ad2c746d311d9b34634677f93a96ecc642c`。必须先核对远端，不以 PR 文案中的历史 head 替代；按精确 SHA 普通 merge，保留各路 ancestry/spec/源码/来源与原 UI/数据兼容。本次相对共同基线的各路修改路径没有交集，仍需实际组合验收。

根测试发现由 `scripts/test-studio.mjs` 继续唯一管理；新增 `packages/server-cli/test` 目录，当前三份控制传输、状态持久化与锁所有权测试及同目录 fixtures 随原规则选取。CLI 六个 explicitTests 为 bootstrap 的 message-mapper、session-projection、session-snapshot-images、session-snapshot，cli 的 argument-admission，以及 dynamic-workflow 的 ask-scheduler contract 文件。core 顶层发现不重复显式登记。保持已有 glob 对账、失败状态传播、120s 上限、并发 2、测试目录隔离与凭据过滤，不遗漏用例、不把 fixture 当测试。

先提交推送组合 checkpoint，再在其后同一树集中运行必要类型、lint、格式、架构、CLI 构建与统一回归，并构建实际受影响产品入口。使用仓库固定 Node 24.14.0 / pnpm 10.33.2 与 frozen lockfile；缺依赖或工具错误如实区分，不标通过。先集中收集快速类型/组合失败，由父任务协调原任务按领域修复；仅在新修复或真实失败需要时复跑对应检查，不每次改动重复全套。

CI 门禁保持；provenance report 只在对齐实际 SHA/源与真实候选、保留来源/义务后更新。候选接入、测试通过或清单新鲜度不解除历史 accepted-byte/权利 HOLD，也不是 clean room 或 MIT 验收。全量 MIT 只能基于完成的来源/出版者/贡献与第三方权利核验；不满足的具体文件、证据缺项和保留许可需明确。最终技术验收与必要来源边界就绪后先报父任务，再执行已授权 main 合并；实质失败时修复或报告阻塞。

## 首轮真实编译失败的整合者修复边界

受检组合 `8b9113d97379ec2e7b1d80f9a4277b008d40441c` 暴露 shared 的内部 presentation 索引和网络 header 字典，以及 contracts 的 background snapshot 动态字段投影类型问题。只修这些整合者路径；services、desktop/server、UI 与移交 CLI 切片的实际诊断交父任务协调原任务，不自行接管。

assistant-presentation 的 blocks 仅由本函数按序 push 构造，采用 entries 同步迭代保留前向顺序、最后一个相同文本的选中 index 与原块身份，不增加输入验证/过滤。network-debug-status 对 Object.entries 的原 string 过滤补充真实 tuple type predicate，不改变值/顺序/own-property 投影或隐私规则。backgroundSnapshot 的固定字段白名单已包含 required taskId/status，started/completed typed payload 保障其类型；用 Partial<BackgroundTaskInfo> 记录动态阶段，然后在完整投影边界保留原完整 assertion，不加 unknown/any 双重转换、二次 payload getter 读取、字段默认值或新验证。三项是有依据的类型表达修复，不另计重写模块，不改变 API/状态/数据/安全边界。保留首轮失败，集中复跑受影响编译/真实组合检查。

## 统一回归入口与 RPC 清单对齐边界

源码阅读确认 shared 的九份边界测试及共用 authority fixture 原来强制 positional source root，根 runner 不传这个参数。保留显式历史/候选 root 模式，并在未提供时用 import.meta.url + fileURLToPath 指向本包当前 src；file-lock 套件指向实际 src/node。authority fixture 的真实编译入口使用本机 resolve，虚拟 authority 端口仍用固定 POSIX 夹具；不更改任何断言/fixture/虚拟端口/生产语义，不扩展到其他路测试。此修复使原永久发现真正运行当前树，不把 standalone probe 的旧通过改写为组合验收。

第三方门禁实际失败于十二个 RPC current-input 摘要。逐项保存旧 input、当前原始/归一摘要、最近 source commit 和现有来源状态，结合已接收 candidate 历史再更新这十二个 current inputs。复制组件的 Microsoft 归属、原导入版本未知说明、原许可与 notice、source registers、reviewRequired、历史输入与权利 HOLD 均不删除或转通过；current input 是当前候选身份而非出版者来源/独立表达/权利证明。之后按模型对齐 current-files，原 review 决定保持；任何 stale/conflict 与未解决义务仍如实让检查失败，不批量授 MIT。首轮失败单独保存。

## 根质量入口与冻结证据完整性

父任务要求原四路处理各自类型与构建错误，整合者只维护根工具、共享和既有整合者模块，等修复 heads 收齐后再统一类型/构建。格式失败按冻结 head 相对共同基线的实际文件归属分配，不能因为 UI/v4 路径相近就覆盖另一任务；native 文件由原任务独占。本阶段只运行新增守卫与改动路径的必要定向验证，不重复根全套。

根 lint 首轮把冻结 API 摘录/合并前草稿当可编译模块，fmt 把原来源证据当可改写文本。保持这些原始字节，并在任何根 lint/fmt 操作前加独立的、失败即阻断的完整性守卫。`licensing/frozen-evidence.json` 是唯一冻结集合与摘要登记，初始绑定完整 `19f6ccf74ba1064ca81d93194b4f25a36030e361` 中 `docs/evidence/**` 与 `licensing/evidence/**` 的 5493 个文件；保存 SHA-256 原字节与大小。根 lint/fmt 在先核验完整集合后把这两个数据目录交由该守卫负责，不忽略生产源码、现行 tests、spec 或顶层说明。根 CI 的来源、类型、lint、格式、架构、CLI 构建、统一回归仍全都必须成功。

守卫拒绝摘要/大小变更、遗失、未登记新文件、重复或越界路径、目录中的 symlink/特殊文件；没有自动补摘要或授权豁免。未来证据新增/修订需记录精确 source head、保留原历史，并显式更新登记后接受复核。`.gitattributes` 对这两个数据目录保留原字节，防止平台换行转换影响固定证据。测试须覆盖篡改、新增、遗失、越界与 symlink，不能只测试正常输出。完整性通过不授予来源/版权/许可，也不消除 review/HOLD/26 项材料义务。

已有 test/spec max-lines 例外补齐实际根 runner 使用的 `.test.mjs`/`.spec.mjs`，保留生产代码行数限制及其余 lint 规则。整合者只对自身 30 个格式失败源路径和未由四路持有的顶层文档/spec 作格式修复，不格式化任何冻结载荷，不更改 UI 常量、存储键、API 或断言。

26 项材料义务另作逐项可执行分类，直接绑定现行 source registers 与 reviewRequired：保留第三方自己的独立许可范围；缺版本版权/来源、二进制链接证据或权利人材料继续 HOLD。npm/素材义务不能当作自有源重写数量，不能以替换格式、移除声明或当前清单一致推导 MIT 可发布。

## 四路最终修复接收后的统一验收

父任务交付并冻结 services `33072cae538f02b739406279733127c90ec96c50`、CLI `8f1e18d309cd475c0ba091a1b75961d8f8eef7df`、UI `73696902cbefbd084b54f6e4ac02b10d709adb40`、native `60480cf85887eac594d63d2095b53cab3821f14f`。四路都保留 `19f6ccf74ba1064ca81d93194b4f25a36030e361` 的 ancestry，相对它的修改路径与各路/整合者均无交集；按完整 SHA 普通 merge，不压缩或覆盖其他提交。新增31份原路证据逐项核对其冻结 head 字节后显式加入 raw manifest；原5493份原字节不变。来源材料、许可和权利 HOLD 不随接收清除。

根 runner 增加实际存在的 `packages/server/test`，接纳新增 remote-header-proxy contract 并补齐同目录已有11套离线安全边界。另接纳三个已有 desktop native source test 目录（host、main/browserView、preload）的16套 Node fake-port tests，保留各自分拆的场景/fixture import；不把 fixtures/cases 文件当独立 tests。相同唯一扫描、glob完整集合对账、data隔离/凭据过滤、并发2/120s与原退出语义继续适用，不创建另一套根入口。

提交发布组合 checkpoint，再按仓库标准工程引用集中执行根 typecheck/lint/fmt、CLI构建与合理完整根回归，并对CLI依赖图及实际产品入口补必要检查。UI的RPC22条来自关闭project references、启用UI索引严格项的单独源码driver；根RPC工程自身配置未启用该索引项。保留其原诊断，依据标准统一检查是否仍有故障，不能算UI未修或降低配置。如果新统一失败，保存精确路径/错误和真实scope，交原任务定向修复，不重复计旧快照或为通过抹来源。

## 最终组合树的集中格式修复

`d826add56755be673efd924b92cf24756af43d6d` 的标准根 types、lint、architecture、provenance 检查退出0；fmt剩余116个路径。四路已冻结，父任务授权整合者集中处理这些纯格式改动，避免各路重复安装/同步；不改变业务、接口、状态、UI取值、测试断言或许可事实。对源码比较格式前后语法结构，对JSON比较完整解析值，逐项绑定原提交、原blob与前后原字节SHA；这种静态等价核对不替代完整回归。

其中12份历史JSON原记录先按原字节复制至 `docs/evidence/final-central-format-20261003/originals/` 并显式加入冻结清单，保留原路径及完整原提交指针。已有5524份冻结载荷不改写；格式工具继续先检查原字节完整性。原路径的JSON只允许空白、排版和等价转义变化，不能更新历史快照中的断言、hash、结果或来源判定。来源/版权 HOLD、原通知和26项材料义务保持原有边界，不能以格式或门禁通过推断MIT可发布。

## 最终组合检查结果与失败归属

`f5deb08595725c91d74ca96e09bba338fba1119d` 的完整根回归实际结束，Node 统计8034 tests、8004 pass、22 fail、8 skipped，退出1。17个CLI core套件被旧当前输入/产物绑定挡在加载前；另外CLI phase-fold历史NaN基线1个、native导出1个、services扫描及Git顺序2个、UI菜单1个。不能将加载失败、跳过或补充定向复现加为完整回归通过数。完整原日志/实际子进程退出码与源码SHA需冻结发布。

根types/lint/fmt/architecture/provenance与Web、desktop源码构建退出0；实际CLI构建退出2，完整CLI工作区no-bail types退出1，均报bootstrap5文件同一18条TS2322。直接在根cwd发出的早期CLI过滤命令未选中项目，虽退出0也不接纳为通过。原CLI任务按父任务指示独占这5个projection文件；其他真实断言须按精确测试/来源路径交原native、services、UI任务修复，不降低规则、删除场景或盲目改golden。

当前源码/标准构建产物绑定的失配需要区分格式变化、已经授权的新候选、编译器/配置变化与真实行为差异。原历史source/compiled/declaration/golden及其hash不能因当前绑定过期被覆盖；若对账当前输入，须保存旧绑定原字节、记录实际源码提交/配置/完整来源链，只更新证明属于当前输入的字段，并继续执行真实消费者与旧基线断言。技术结果不授予独立性/贡献者权利，不清除原accepted-hash/权利HOLD或26项材料义务。
