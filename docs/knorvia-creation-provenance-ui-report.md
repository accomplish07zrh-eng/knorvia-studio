# T09 UI 侧交付报告：创作参数复用、来源关系与远端核验

- 仓库：`D:\tools\knorvia-studio`
- 基线提交：`81b2073`（`perf: 建立可复现性能基线并按证据收敛运行历史（T10）`），版本 `0.8.0-preview.2`
- 服务层依赖：`3dc3a62`（`feat: 创作参数快照、来源关系与只读远端核验（T09 服务层）`），已在基线祖先中，未做任何改动
- 本次改动全部留在工作区，未执行任何写状态的 Git 命令（未 `add`、未 `commit`、未 `stash`、未改 `.architecture-baseline.json`）
- 工作区状态：7 个文件修改、9 个文件新增（5 个 UI 源码、3 个测试、本报告），全部落在 T09 UI 写的范围内

## 1. 改动清单

修改：

| 文件                                                            | 改动                                                                                                                                            |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [specs/knorvia-creation.md](../../../specs/knorvia-creation.md) | 追加「T09 UI 参数复用、来源关系与远端核验」一节（入口与承载界面、快照／来源呈现、旧记录不可还原、能力门控、核验为显式动作、幂等可见）           |
| `packages/ui/src/studio/creation/StudioCreationHistory.tsx`     | 历史列表继续负责筛选与布局，单张卡片抽成 `StudioCreationJobCard`，按任务计算入口状态                                                            |
| `packages/ui/src/studio/creation/StudioCreationPage.tsx`        | 提交改用 `resolveCreationSubmission` 复用同一个 `requestId`；接入卡片动作 hook；显示当前生成编号与「已沿用参数」提示                            |
| `packages/ui/src/studio/creation/creationInput.ts`              | 抽出 `CREATION_REFERENCE_MAX_BYTES`（10 MB，与服务端同一条边界）；新增 `creationFileFromBase64` / `creationDraftFiles` 把复用草稿回填成表单文件 |
| `packages/ui/src/studio/creation/messages.ts`                   | 删除已无引用的 `studio.creation.reuse`（旧「再次编辑」按钮已被「沿用参数」取代）                                                                |
| `packages/ui/src/i18n/locales/zh-CN.ts`                         | 新增 50 条 `studio.creation.*` 文案（直接放在 catalog 的 creation 段，`i18n/locales/*.ts` 的 `max-lines` 已关闭）                               |
| `packages/ui/src/i18n/locales/en-US.ts`                         | 同上的英文文案                                                                                                                                  |

新增：

| 文件                                                                                                 | 作用                                                                                                 |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/ui/src/studio/creation/creationEntries.ts`                                                 | 纯逻辑：入口门控（沿用／变体／参考／核验）、不可用原因分组、快照与来源关系展示模型、核验结果展示模型 |
| `packages/ui/src/studio/creation/creationSubmit.ts`                                                  | 纯逻辑：幂等签名与 `requestId` 复用判定                                                              |
| `packages/ui/src/studio/creation/creationActions.ts`                                                 | 纯逻辑：动作请求到既有服务调用的唯一分派（`reuseJob` / `createJob` / `verifyJob`）与提交入参构造     |
| `packages/ui/src/studio/creation/useCreationJobActions.ts`                                           | React 绑定层：串行化一次动作、通过 `IFileService.readBinaryPreview` 读取被引用成果字节               |
| `packages/ui/src/studio/creation/StudioCreationJobCard.tsx`                                          | 单张历史卡片：预览、状态、快照／来源折叠区、四个入口与不可用原因                                     |
| `packages/ui/test/creation-entries.test.ts` / `creation-actions.test.ts` / `creation-submit.test.ts` | 纯逻辑测试（无 DOM）                                                                                 |

没有新增成果页、素材库、任务详情页或路由；没有触碰服务层、内核、工作流、运行历史与设置文件。

## 2. 实现要点

### 入口与承载界面

四个入口都渲染在既有历史卡片的操作行里，全部复用既有服务调用，没有第二条请求路径：

- **沿用参数** → `reuseJob(id)`。把草稿的提示词、模型与参考图／首尾帧一起填回底部输入区；不自动提交，草稿本身无副作用。
- **作为参考继续生成** → 通过 `IFileService.readBinaryPreview`（上限取参考图的 10 MB）读取成果字节，再 `createJob`，带 `provenance.parentJobId` 与 `provenance.referencedOutputId`。
- **变体** → `reuseJob(id)` 取得草稿后原样 `createJob(draft)`：沿用同一份参数与来源关系，只换成草稿自带的新 `requestId`。
- **核验远端结果** → `verifyJob(id)`，只读；只在任务为 `interrupted`／`cancelled` 时渲染该按钮。

### 门控（与服务端同一个谓词）

- 槽位能力只用 `creationReferenceSlots(model)`（`packages/services/src/creation/contract.ts:38-64`）。没有尺寸、时长、画幅、质量字段，界面也不渲染这些通用参数。
- 沿用／变体与 `reuseStoredJob` 的条件逐项对应：源任务不在 `queued`／`running`，原模型存在、启用、类型一致、已配置，且源任务实际用到的槽位在当前模型下仍被声明。
- 参考入口额外要求源任务 `succeeded`、有成果、成果带 `hash`（旧记录缺哈希一律拒绝，与工作流交接规则一致）、成果为图片且在上限内、模型仍声明参考图槽位。
- 不可用入口渲染为禁用按钮，并在操作行下方按原因合并成一行说明（例如「沿用参数／变体：任务仍在进行中，结束后才能复用」）。

### 快照与来源关系

- 有快照时在卡片内 `<details>` 展开显示白名单字段：类型、模型名、协议、供应商模型、提示词、记录时间、各槽位参考图名称与哈希前缀。参考图只显示名称与前 12 位哈希，不显示字节。
- `provenance` 的三项缺失即不渲染，不用「未知」占位。
- `reconstructible` / `missing` 直接取服务端 `publicJob` 的计算结果。为 false 时显示「无法还原参数」+ 说明 + 原样列出 `missing` 字段；没有快照就不渲染任何参数行，**绝不**用当前模型配置或表单当前值顶替。
- `checkedAt` 有值显示「最近核验：…」，否则在结果未知时显示「尚未核验」。

### 核验结果呈现

`verifyJob` 的四种 `outcome` 分别显示为：远端已确认完成 / 远端已确认失败 / 结果仍未知 / 无法远程验证，`message` 原样显示服务端文案。`openai-images` 与缺少远端任务编号的情况都显示服务端给出的「无法远程验证」类说明，不改判为失败、不猜测结果。核验动作只在用户点击时发生，加载、轮询、重试与工作流恢复都不会调用它。

### 幂等

- `creationSubmissionSignature` 覆盖类型、模型、提示词（trim 后）与来源关系，与服务端 `sameCreationRequest` 同口径。
- `resolveCreationSubmission` 在签名与参考图文件都没变时沿用原 `requestId`；内容变化才换新编号。没有用「禁用按钮」替代服务端幂等规则。
- 输入区提示始终显示当前规则；一次提交被保留时显示保留的具体编号；服务端拒绝原因（如「这次生成编号已用于其他内容」）原样显示，不改写成「生成失败」。

## 3. 命令与真实结果

全部命令在仓库根目录执行，Node `v26.3.0`（`mise.toml` 要求 24.14.0，pnpm 打印了 engine 警告，未影响结果）。

### 3.1 新增／相关 UI 测试

```text
$env:TSX_TSCONFIG_PATH=<repo>/packages/ui/tsconfig.json
node --import tsx --test packages/ui/test/creation-entries.test.ts \
  packages/ui/test/creation-actions.test.ts \
  packages/ui/test/creation-submit.test.ts \
  packages/ui/test/creation-history.test.ts
```

结果：`tests 16 / pass 16 / fail 0`，退出码 0。覆盖：入口门控与能力谓词（含 comfyui 无 `{{image}}`、json-api 有 `{{imageBase64}}`）、每一类不可用原因、旧记录缺哈希、结果未知时的核验入口与再次计费提示、不可用原因分组、快照字段行与哈希前缀、旧记录不可还原（无快照不渲染参数行）、核验四种展示状态、动作分派（核验只调 `verifyJob`，`createJob` 调用次数为 0）、变体沿用草稿编号与来源、参考提交写入 `referencedOutputId`、同一次提交复用编号／新意图换编号。

### 3.2 服务层回归（未修改这些文件）

```text
node --import tsx --test packages/services/test/creation-provenance.test.ts \
  packages/services/test/creation-verify-job.test.ts \
  packages/services/test/creation-service.test.ts
```

结果：`tests 16 / pass 16 / fail 0`，退出码 0。

### 3.3 整个 UI 测试目录（补充回归）

```text
node --import tsx --test --test-concurrency=2 <packages/ui/test/*.test.ts 共 50 个文件>
```

结果：`tests 299 / pass 299 / fail 0`，退出码 0。

### 3.4 门禁

| 命令                                                     | 结果                                                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm i18n:check`                                        | `[i18n] en-US and zh-CN: 5363 matching keys, validated values and placeholders`，退出码 0（新增 50 条、删除 1 条未引用文案） |
| `pnpm exec tsc -b packages/ui packages/services`         | 无输出，退出码 0                                                                                                             |
| `pnpm typecheck`                                         | 退出码 0（先 `i18n:check` 通过，再 `tsc -b` 全部工程）                                                                       |
| `pnpm lint`                                              | `Found 0 warnings and 0 errors.`（2687 个文件）                                                                              |
| `node scripts/architecture/architecture-check.mjs check` | `architecture: OK` / `violations: 0` / `baseline: 0` / `new: 0`，退出码 0                                                    |
| `pnpm exec oxfmt <本次改动的 14 个文件>` 后 `--check`    | `All matched files use the correct format.`，退出码 0                                                                        |

行数上限：本次新增／修改的非测试文件最长 `StudioCreationPage.tsx` 370 行（非空 358）、`StudioCreationJobCard.tsx` 238 行（非空 234）、`creationEntries.ts` 240 行（非空 220），均低于 400 行；`oxlint` 的 `max-lines` 未触发。新增文案放在 `i18n/locales/*.ts`（该路径已关闭 `max-lines`），沿用仓库既有的 `studio.workflow.*` 直写 catalog 做法。

## 4. 未执行项（如实说明）

1. **没有任何真实供应商调用**：全部验证使用纯逻辑测试与本地 fixture，未向 OpenAI、ComfyUI 或任何远端地址发起请求，未产生任何费用。
2. **没有 DOM／可视化验证**：`packages/ui/test` 没有 jsdom／@testing-library，本次没有引入；四个入口的按钮、折叠区与提示文案只做了逻辑层验证，未做浏览器或 Electron 实机点击、未做截图或视觉回归，也未做键盘／窄窗口走查。
3. **没有端到端联调**：没有启动 `pnpm dev:desktop` / `pnpm dev:web`，未在真实 Host + Renderer 之间走一遍「沿用参数 → 提交」「作为参考继续生成」「核验远端结果」；卡片与页面组件没有被任何测试直接渲染（无 DOM 环境），只覆盖了它们调用的纯函数。
4. **没有跑 `pnpm test:studio`**：该入口需要先 `pnpm build:cli-packages`，本次只按任务书列出的 UI 与服务测试文件运行，并额外跑了整个 `packages/ui/test` 目录。
5. **没有跑 `pnpm fmt:check` 全仓库检查**：按要求只对本次改动的文件执行 `oxfmt` 与 `oxfmt --check`。

## 5. 剩余风险

1. **`openai-images` 无法远程核验**：该协议没有只读查询接口，界面只能显示服务端的「无法远程验证」并写 `checkedAt`。用户仍无法从本机确认远端结果，需要自行到供应商后台核对。这是服务层既定行为，不是本次引入的缺陷。
2. **缺少 `providerTaskId` 的任务会被拒绝**：`verifyJob` 直接抛错（「该任务没有远端任务编号，无法远程验证」）。界面把这条拒绝显示在卡片上，但无法在点击前判断（`publicJob` 不返回 `providerTaskId`），因此按钮对这类任务是可点的、点了才报错。
3. **「作为参考继续生成」的提示词沿用源任务提示词**：没有让用户先改提示词再提交，用户需要提交后用卡片上的「沿用参数」再编辑。这条交互未经实机走查，是否顺手待确认。
4. **参考输入受文件服务上限约束**：成果字节通过 `IFileService.readBinaryPreview` 读取，单次上限 25 MB，界面按参考图 10 MB 门控；若某天参考图上限被放宽到 10 MB 以上，这里需要同步调整。
5. **`reconstructible` 只判断记录层字段**：参考图文件是否仍存在、哈希是否仍一致要等 `reuseJob` 真正执行时才校验，所以「可按原参数重建」并不等于「一定复用成功」，失败会以卡片上的拒绝原因呈现。
6. **卡片动作错误是本机瞬时状态**：`actionErrors` 只保存在页面内存里，刷新页面即消失；持久事实仍以服务端 `job.error` 与 `checkedAt` 为准。

## 6. 回滚

改动全部未提交，回滚只需丢弃工作区改动：

```powershell
cd D:\tools\knorvia-studio
git status --porcelain   # 先确认只有本报告第 1 节列出的文件
# 1) 恢复被修改的文件
git restore specs/knorvia-creation.md
git restore packages/ui/src/i18n/locales/zh-CN.ts packages/ui/src/i18n/locales/en-US.ts
git restore packages/ui/src/studio/creation/StudioCreationHistory.tsx
git restore packages/ui/src/studio/creation/StudioCreationPage.tsx
git restore packages/ui/src/studio/creation/creationInput.ts
git restore packages/ui/src/studio/creation/messages.ts
# 2) 删除新增文件
Remove-Item packages/ui/src/studio/creation/StudioCreationJobCard.tsx
Remove-Item packages/ui/src/studio/creation/creationActions.ts
Remove-Item packages/ui/src/studio/creation/creationEntries.ts
Remove-Item packages/ui/src/studio/creation/creationSubmit.ts
Remove-Item packages/ui/src/studio/creation/useCreationJobActions.ts
Remove-Item packages/ui/test/creation-actions.test.ts
Remove-Item packages/ui/test/creation-entries.test.ts
Remove-Item packages/ui/test/creation-submit.test.ts
Remove-Item docs/knorvia-creation-provenance-ui-report.md
```

本次没有数据迁移、没有写盘格式变化、没有服务层改动，回滚不涉及 `jobs.json` 或已落盘的创作数据；服务层 `3dc3a62` 仍然独立可用。
