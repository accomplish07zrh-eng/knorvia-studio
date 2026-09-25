# T09 参数复用、来源关系与工作流交接（服务层）实施报告

- 仓库：`D:\tools\knorvia-studio`，版本 `0.8.0-preview.2`
- 任务基线（Lead 指定）：`bcc63b6`；开始工作时工作树 HEAD 为 `797a76e`（T01 在基线上的提交）
- 实施范围：`specs/knorvia-creation.md` + `packages/services/src/creation/*`（contract / creationStorage / creationJobs / creationService / providers）+ 两个新增测试文件
- 未提交：按分工由 Lead 统一提交（本报告不含任何 state-changing git 操作）

## 交付内容

| 需求                                                                                                                   | 落地位置                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| T09 规格（参数快照、来源关系、凭据排除、能力门控、幂等、未知结果、工作流交接）                                         | `specs/knorvia-creation.md` 新增「T09 参数复用、来源关系与工作流交接」章节                         |
| `parameterSnapshot`（可选）+ `provenance`（可选）+ 计算字段 `reconstructible` / `missing` + `CreationOutput.hash`      | `packages/services/src/creation/contract.ts`、`creationStorage.ts`                                 |
| 快照在接纳时按白名单生成（不展开模型 / 工作流 / 映射 / 凭据）                                                          | `creationJobs.ts`（`creationParameterSnapshot`）                                                   |
| `reuseJob(id)`：新目标编号、只读、无副作用                                                                             | `creationService.ts`（委派 `creationStorage.reuseStoredJob`）                                      |
| `verifyJob(id)`：只读远程验证，绝不新增提交                                                                            | `creationService.ts`（委派 `creationJobs.verifyStoredJob` + `creationJobs.queryCreationProvider`） |
| 只读查询能力仅在协议适配层扩展（ComfyUI `/history/{taskId}`、JSON API `pollPath`；openai-images 明确「无法远程验证」） | `creationJobs.ts`（查询适配）+ `providers.ts`（提交与查询共用状态判定）                            |
| 无第二队列 / 第二条请求路径                                                                                            | `verifyJob` 复用 `initialize()`、凭据读取、`mutate()` 串行的 `updateJob()` 与成果写入路径          |

关键设计点：

- 快照与来源关系只从允许清单取值；参考图只记录名称与 sha256，字节与 base64 永不进入任务记录。
- `reconstructible` / `missing` 由 `publicJob` 在读取时计算：旧记录没有快照时诚实给出 `false` 与 `["parameterSnapshot"]`，字段与任务记录不一致时逐项列出（例如 `parameterSnapshot.params.model`）。
- `verifyJob` 只接受 `interrupted` / `cancelled`：查询确认成功 → `succeeded` 并写入成果哈希；确认失败 → `failed`（此后才允许一键重试）；仍无确定结果或协议无查询能力 → 保持原状态，只写 `checkedAt` 与诚实说明；查询超时 / 网络错误 / 5xx 一律按「结果未知」处理。
- 能力门控只有 `creationReferenceSlots` 一个谓词，`createJob` 与 `reuseJob` 共用；提交模板占位符替换、状态词表、成果格式与大小校验也同样单点实现。

## 真实执行结果（本机 Windows，Node v26.3.0，pnpm 10.33.2）

新增测试：

```text
node --experimental-test-module-mocks --import tsx --test packages/services/test/creation-provenance.test.ts
  → tests 7 / pass 7 / fail 0，exit 0
node --experimental-test-module-mocks --import tsx --test packages/services/test/creation-verify-job.test.ts
  → tests 5 / pass 5 / fail 0，exit 0
```

回归（未修改这些文件）：

```text
node --experimental-test-module-mocks --import tsx --test packages/services/test/creation-service.test.ts
  → tests 4 / pass 4 / fail 0，exit 0
node --experimental-test-module-mocks --import tsx --test packages/services/test/creation-polish.test.ts
  → tests 11 / pass 11 / fail 0，exit 0（该文件属其他 agent，本次仅运行校验，未改动）
四文件合并运行：tests 27 / pass 27 / fail 0，exit 0
```

覆盖到的行为：

- 快照 + 来源关系落盘往返；`reconstructible: true` / `missing: []`；输出 `hash` 与参考图 sha256 一致。
- 旧记录（无快照）→ `reconstructible: false`、`missing: ["parameterSnapshot"]`；快照与记录不一致 → 逐项 `missing`。
- `reuseJob` 返回 `reuse-*` 新编号、两次复用编号不同、不写盘（`jobs.json` 字节不变）、供应商层没有新增请求；草稿可显式提交并带上 `parentJobId` / `repeatOfRequestId`。
- 复用受服务端同一个能力谓词约束（模型改为不声明图生图时拒绝复用）。
- 同一 `requestId` + 相同内容幂等；内容、来源关系或提示词变化都被拒绝；来源关系格式非法直接拒绝。
- 密钥不出现在任务记录、快照与失败文本中（失败文本为 `[redacted]`）；映射模板 / 路径 / 地址也不进入 `jobs.json`。
- `verifyJob`：ComfyUI 历史缺失 / 仍在运行 / 5xx → 保持 `interrupted` 并写 `checkedAt`；确认成功 → `succeeded` + 成果哈希；确认失败 → `failed` 且随后可重试；JSON API 轮询路径成功；openai-images 与无 `pollPath` 的映射返回 `unsupported`「无法远程验证」；无 `providerTaskId`、已有确定结果、不存在的任务明确报错。
- 全部验证路径断言供应商层 POST 计数不变（没有第二次付费提交）。

其他检查：

```text
pnpm exec oxfmt <8 个改动文件>            → exit 0
pnpm exec oxfmt --check <8 个改动文件>    → All matched files use the correct format，exit 0
pnpm typecheck                            → [i18n] 5223 matching keys + tsc -b 全部通过，exit 0
pnpm lint                                 → Found 0 warnings and 0 errors，exit 0
pnpm architecture:check --changed         → architecture: OK（violations 0 / baseline 0 / new 0），exit 0
pnpm exec tsc --noEmit --strict --skipLibCheck --target es2023 --module nodenext \
  --moduleResolution nodenext --types node \
  packages/services/test/creation-provenance.test.ts packages/services/test/creation-verify-job.test.ts
  → exit 0（仓库 typecheck 只编译 src，故单独对新增测试做了严格检查；
     同一命令对故意写错的临时文件返回 exit 2，证明该检查有效）
```

## 结构与行数约束（重要）

`architecture-policy.yaml` 同时限制单文件 400 行、`contract.*` 300 行、公开方法 12 个，且 `forbidCycles` 生效。creation 模块在 T09 之前是 1160 行，五个文件合计上限 1900 行；本次改动后为：

```text
contract.ts 288 / 300
creationJobs.ts 391 / 400
creationStorage.ts 387 / 400
creationService.ts 393 / 400
providers.ts 395 / 400
合计 1854 / 1900
```

也就是说模块只剩约 46 行余量，`contract.ts` 距上限 12 行。为保证 `architecture:check` 通过，本次按「纯规则 / 记录与文件 / 任务语义与供应商事实 / 唯一所有者 / 协议适配」重新分配了函数归属：

- `contract.ts`：契约类型 + 能力谓词 + 提示词与成果字节边界（浏览器侧可复用同一份规则）；
- `creationStorage.ts`：记录读写、快照可重建判定、来源关系白名单、成果写入、重启恢复、复用草稿重建；
- `creationJobs.ts`：能力门控调用点、请求身份比较、任务构造、参考图装载、失败分类、只读查询与验证编排；
- `creationService.ts`：唯一所有者与生命周期编排（串行 `mutate()`、控制器、运行）；
- `providers.ts`：提交适配器与提交/查询共用的状态判定。

后续 wave（尤其 T10 之后的 UI 与工作流交接）很可能需要新增文件（例如 `creationQuery.ts` / `creationProvenance.ts`）或放宽行数上限；继续在现有五个文件里堆叠会立即撞线。

## 未执行项（如实说明）

- 未运行 `pnpm test:studio`、`pnpm fmt`（全仓）、`pnpm lint:fix`：按任务要求避免影响其他 agent 的并发改动。
- 未运行 `pnpm knip`、`pnpm build:cli-packages`、桌面 GUI 验证、i18n/UI wave：本次范围仅为服务层。
- 未联系任何真实供应商，未产生任何付费调用；所有供应商交互都来自本地 fixture（`fetchImpl` 注入）。
- 未修改 `packages/services/test/creation-polish.test.ts`（其他 agent 所有），仅运行验证。
- 未修改 `packages/services/src/creation/module.ts`：新增导出都在模块内部，公开入口仍只有 `contract.ts` 与 `node.ts`，无需改清单。

## 残余风险

1. 真实协议未经真机验证：ComfyUI `/history/{taskId}` 的变体结构、JSON API 轮询字段差异、鉴权头行为都只经过本地 fixture；错误结构会被保守地判为「结果未知」。
2. `openai-images` 的 `unsupported` 路径需要该任务留有 `providerTaskId`（正常提交不会写入），实际可达场景是模型协议在任务接纳之后被改成 `openai-images`；没有远端编号的任务直接报错。
3. 凭据排除依赖「显式允许清单 + 精确密钥的 `replaceAll` 脱敏」。供应商回显经过变形（base64、截断、片段）的密钥仍可能逃过替换；`jobs.json` 以 0600 落盘，后续新增字段必须继续走允许清单。
4. `reconstructible` 只判断记录层字段；参考图文件是否仍在、哈希是否一致由 `reuseJob`（`savedReference`）校验。工作流交接的哈希校验需要下一 wave 在交接处显式调用，本次只提供了 `CreationOutput.hash` 与规格规则。
5. `reuseJob` 会通过 RPC 返回参考图 base64（每槽位 ≤10 MB）；若 UI 直接复用大图，需要沿用现有大小限制提示。
6. 行数余量很小（见上）：任何后续改动都需要同步做拆分或申请新文件/例外，否则 `pnpm architecture:check` 会失败。
7. `writeCreationOutput` 在目标文件已存在时不覆盖，而是按磁盘真实内容重新计算类型与哈希（避免删除既有成果）；这意味着「同 id 的旧文件」会被认作当前成果，异常残留文件不会被自动清理。

## 回滚说明

- 本次改动未提交，Lead 可直接丢弃工作树改动：`packages/services/src/creation/{contract,creationJobs,creationStorage,creationService,providers}.ts`、`specs/knorvia-creation.md`，并删除新增的 `packages/services/test/creation-provenance.test.ts`、`packages/services/test/creation-verify-job.test.ts`、`docs/knorvia-creation-provenance-report.md`。
- 无数据迁移：`jobs.json` / `models.json` 仍是 `{version: 1, items: []}`，仅新增可选字段；旧读取方忽略新字段，新读取方对旧记录给出 `reconstructible: false`。
- 回滚后无需清理落盘数据；`verifyJob` 恢复的成果文件位于 `<KnorviaDataRoot>/creation/assets/creation-<jobId>.<ext>`，如已生成可单独删除。
