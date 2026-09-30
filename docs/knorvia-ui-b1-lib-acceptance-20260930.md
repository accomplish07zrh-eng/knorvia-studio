<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# UI B1 实现检查点与集成交接

2026-09-30。只改 error/meta/draft 三份生产 helper；customModelValue 保持原字节，继续转发共享 codec。生产改动保留 Apache-2.0；此次自读源、自写合同、自实现、自复核不构成独立角色审查、clean-room 或 MIT-ready 结论。整体迁移仍未完成。

## 分支、顺序与范围

- 仓库：`accomplish07zrh-eng/knorvia-studio`。开工实际读取 PR #7 远端 head 为 `8e8f6310d5ca70a57a454054e44f7b61db30b83f`，再次查询时相同。
- 工作分支：`ui/b1-lib-contracts-20260930-01`。不向 main 或 PR #7 集成分支写入，不创建第二个 PR。
- 首次 cherry-pick：`3e41a6bec6562bc85bad55397cd1785c92285c4f`（先行规格与三份测试，62 项在旧版通过）。随后 cherry-pick 本文所在的实现提交；精确最终 SHA 由最终交接附上，避免文档自引用。
- 三份生产变更：`packages/ui/src/lib/uiError.ts`、`taskMetaMerge.ts`、`draftSkillInvalidation.ts`。第四份 owned path `customModelValue.ts` 无变更。
- 新规格：`specs/knorvia-ui-b1-lib-contracts-20260930.md`。三份新永久测试均为 `packages/ui/test/ui-b1-*-contracts-20260930.test.ts`；顶层 `.test.ts` 文件会被现有 `scripts/test-studio.mjs` 自动收录。
- 新验收：本文与 `docs/knorvia-ui-b1-lib-evidence-20260930.json`。不修改共享 codec/schema、sessionStore/logger、设备/fs、service worker 的路径、锁文件、global config 或共享许可清单。B2/B3 由父任务协调；B4 未启动。

## 行为与实现

uiError 的 ordered envelope/field rules 与分阶段候选投影保持 message 优先级、非泛化根因、第一 detail 的 provider_code 优先权和现有 schema 验证；静态规则取代每次调用重复创建路径列表，字段阶段共享一次 JSON record 解析。未新增原因链解析或异常吞噬。detail/traceId/taskId 的 own undefined 与 underlying/attribution 的缺省省略仍不同。

taskMetaMerge 的单次 sources 选择与七个字段策略保持时间/原始标题长度竞争、手动与占位标题规则、状态 nullish 回退及 optimistic own unreadAt 清除。只浅复制基底，保留未知字段、symbol 和 nested 引用；多候选仍按原顺序累积，不更换状态 owner 或过滤身份。

draftSkillInvalidation 的同步 owner 命令产生局部 retirement 记录，随后关闭捕获的 id，统一投影两种日志结果。没有 legacy id 时仍同步失效；close 挂起、同步 throw/reject、info 失败转 warn、warn/错误 String 转换失败公开 reject，均在永久合同中验证。store/provider/shared 服务仍是原边界。

## 实际检查

环境为从官方发布下载并校验 SHA-256 的 Node `24.14.0`，pnpm `10.33.2`；依赖使用既有 frozen lockfile 安装，跳过 install scripts。本批使用合成输入和 mock owner，不读取真实用户数据、数据库、模型凭据或生产会话。

| 检查                                          | 实际结果                                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 工作区 freshness                              | 新分支相对 origin/main ahead 10、behind 0；基线检查通过                                                                 |
| 架构受控上下文                                | ui 为 legacy/unmanaged；无 module.ts、未声明受控直接依赖合同；保持原公开入口                                            |
| 修改前/后 `pnpm architecture:check --changed` | 0 violations、0 baseline、0 new                                                                                         |
| 冻结旧文件上的 B1 合同                        | 62/62 通过，0 fail/skip                                                                                                 |
| 候选 source B1 合同                           | 62/62 通过，0 fail/skip                                                                                                 |
| 最终 source 定向 UI 回归                      | 84/84 通过，0 fail/skip；B1 加既有 async gate、settings async field、appearance、theme identity、clean-base             |
| 实际 UI dist B1 合同                          | 62/62 通过，0 fail/skip                                                                                                 |
| 有限旧/新输出对照                             | 5,793 error 输入 + 99,249 metadata pair + 1,480 candidate fold；合计 106,522，0 差异；比对值、own keys/order、prototype |
| 根 `pnpm typecheck`                           | 旧版/候选/最终均通过；中英文 5,422 keys 一致                                                                            |
| 新三份 test 独立 TypeScript noEmit 检查       | 通过，沿用 NodeNext/ES2024、noUncheckedIndexedAccess 与 Node 类型                                                       |
| 最终根 `pnpm lint`                            | 2,800 files，0 warning、0 error                                                                                         |
| owned 源码/测试/规格格式与 diff whitespace    | 通过；本文和证据另随最终提交检查                                                                                        |
| 最终 `pnpm --filter @knorvia/web build`       | 通过，11.81s；保留大 chunk 与三处 ineffective dynamic import 提示                                                       |
| 最终 Web source-map 输入字节                  | 四个目标都找到，sourcesContent 全部等于最终文件（仅 CRLF/LF 归一）                                                      |

最初环境 pnpm 自动安装触及不可写用户工具目录，改用 workspace 内的 pinned toolchain 后通过。首次冻结目录缺少 workspace dependency 链接，两份 test 文件加载失败，修正测试工作区链接/ESM 元数据后旧版 62 项通过。第一轮 lint 的三个新测试 unsafe optional chaining warning 已修正，未把那轮写成 0 warning。首次 Web source-map 核对发现构建早于格式化，重新构建后四份都精确匹配。没有降低验收或隐藏首次失败。

没有重复运行整仓 suite/CLI 全量构建；父任务负责整合后的全量门。未运行真实模型、设备/桌面打包、UI 目视/E2E、Windows/macOS 运行时或数据升级。此次没有视觉与交互变动。有限数据对照不等于任意 stateful Proxy/getter、全产品或法律等价；JSON string 字段阶段由多次解析变为一次，篡改 JSON.parse 或全局 builtin 的行为不作兼容承诺。

## 来源证据与集成者待办

Library 的 `Knorvia-UI-Provenance-Review-20260930.zip`（`libfile_78deb60edfcc81919f6fd9e1358f2ebd`，委派称 version 0）按当前 Library skill 尝试物化两次均 download failed，没有本地可读字节，因此没有使用该 archive 的正文或宣称重新验证其 1,462 项/18 alias。此限制已开工时报告，不阻止四个路径的行为验收。

本任务另从固定公开提交 `zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521` 读取四个 alias 的字节，原 SHA-256 全部与本地 upstream-baseline 对应项一致。与开工旧版比较，在明确列出的品牌、包/路径/参数名替换后，跳过 trivia 和右括号前的可选 trailing comma，四份 TypeScript token stream 全部相等。首次未经可选 comma 归一的 token 检查在 taskMetaMerge 的格式化参数列表失败，保留该差别而不误称逐字相等。适配规则、blob、旧版/最终摘要在 JSON 证据；未把旧源码拷入本产品仓库。customModelValue 只做品牌替换就逐字相等，不能授予原创状态。

请唯一集成者复核以下提议，本分支不代写共享清单：

1. 在 provenance 路径映射中补入这四条 `zcodeUiError`/`zcodeTaskMetaMerge`/`zcodeDraftSkillInvalidation`/`zcodeCustomModelValue` 到当前 owned path 的经固定 blob 核验 alias；不要以当前 `upstream:null` 推导 original。
2. 三份修改后的生产文件继续 pending authorship/license review，记录 source exposure 和合同/实测证据；不自动记 `independent-replacement` 或授予 MIT。custom adapter 为保留的薄包装，shared codec 另由协议 worker 负责，不能计作本批完整独立 codec。
3. 新规格、三份测试及两份验收证据按各自最终摘要审查。共享 reviews/current-files 的更新和 report/check 由集成者在整合后统一生成；本批不运行会写这些文件的命令，未宣称 provenance:check 通过。
4. 父任务的独立 review track 复核 source exposure、等价范围与实现必要性后，再安排 B2/B3；整体 MIT、全功能/用户数据迁移、全量测试和发行目标仍在后续范围内。
