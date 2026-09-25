# 可信交付小结、批量复核与验收记录（T05）

2026-09-26。本规格在现有 Studio 运行时之上定义**交付结论类别**、**交付证据优先级**、**验收记录**、**应用顺序**与**重启后显示规则**。不新增页面、不新增查询入口、不新增第二套任务状态机；`run` / `step-result`（检查点 steps）/ `turn` 仍然是任务终态的唯一所有者。

## 目标与边界

- 让"这次交付到底做到了什么"能从**已存在的 Host 证据**推导出来，而不是从模型文字推导。
- 让交付结论是**只读投影**（读时派生、不落库、不写状态），并且只以增量可选字段挂在既有 `StudioTimeline` / `StudioOverview` 载荷上。
- 让复核弹窗支持**多选批量应用**，仍然走既有 `paths: string[]` 参数与既有应用锁、基线冲突、活跃任务、链接安全校验。
- 让"已应用/已验收"有一份**辅助证据**（验收记录），可在重启后显示三种状态；验收记录永不作为任务终态被读回。
- 模型声称"测试通过/文件已写好"永远不提升结论；只有 Host 哈希、apply journal、创作作业记录可以。

明确的非目标：

- 不新增成果页面、素材库、验收页面或新的服务方法；不新增第二条业务写入路径。
- 不新增 exit code 之类的工具退出码字段（当前链路根本没有该数据，凭空造字段等于伪造证据）。
- 不把验收记录并入 `run` / `step-result` / `turn`，也不改写历史快照。
- 不运行仓库级 `pnpm fmt`（本任务只对自己改动的文件运行 `oxfmt`）。

## 四个交付结论类别

每个 run/step 得到且只能得到下列四种之一：

| 类别         | 含义         | 判定（自上而下，命中即止）                                                                                                             |
| ------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `unknown`    | 结果未知     | 任务或步骤 `resultKnown !== true`；任务处于 `interrupted` 且结果未知；有 apply-lock/journal 处于非终态（正在应用/正在核验）            |
| `produced`   | 已产出未验收 | 存在 Host 观测到的隔离改动（`workspace` 记录 + `workspace-head` 步骤 + 非空 `changesSummary`），但该步骤没有任何已验收记录             |
| `checked`    | 已核验       | 存在 Host 侧证据：已验证的验收记录（Host 重读哈希与 journal 提交哈希一致），或带内容哈希的创作作业产物引用（`creation-output.sha256`） |
| `unverified` | 未核验       | 步骤已到终态且结果已知，但只有内核工具状态或模型文字；远端 Host 返回的摘要也归入此类（本地 Host 无法核验）                             |

run 级结论按步骤汇总，优先级 `unknown` > `produced` > `checked` > `unverified`：任一未知步骤使整次运行"未知"；只要有产出但未验收就"已产出"；全部已核验才"已核验"；没有任何 Host 证据则"未核验"。**"未核验"不是失败**，它表示"没有 Host 证据能证明它成立"。

## 交付证据优先级

高优先级证据可以提升结论，低优先级证据永远不能覆盖高优先级证据：

| 优先级 | 证据                                                       | 来源                                                                                  | 能证明什么                                                    |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1      | Host 哈希 + apply journal（`host-hash` / `apply-journal`） | `workspaceApply.ts` 的 apply journal（含每文件 `beforeHash`/`afterHash`）与 Host 重读 | 文件确实被发布到了项目，且内容等于 journal 记录的 `afterHash` |
| 2      | 创作作业记录（`creation-record`）                          | `StudioOutputRef` 的 `creation-output`（`creationJobId` + `outputId`，可选 `sha256`） | Host 侧创作作业确实产出了带哈希的产物                         |
| 3      | 内核工具状态（`kernel-tool-state`）                        | `message` 记录 `kind:"tool"` 的 `name`/`state`                                        | 内核**自称**某工具成功；没有退出码，不是 Host 核验            |
| 4      | 模型文字（`model-claim`）                                  | 步骤 `text`（模型散文）                                                               | 只是声明，永远不提升结论                                      |

`evidence` 数组按上表顺序输出，UI 可据此区分"Host 核验"与"模型声称"。模型文字即使写着"测试全部通过"也只会得到 `model-claim`，结论仍是 `unverified`（或 `produced`，如果 Host 观测到了改动）。工具状态证据需要读取方提供该目标的 `message` 记录：时间线载荷提供，`overview` 为避免每次变更都扫描消息记录而不枚举它；它从不改变结论类别，因此省略不影响判定。远端返回的摘要既不是本地 journal 也不是本地哈希，因此远端应用的步骤**不会**得到 `host-hash` / `apply-journal` 证据。

## 验收记录

写入位置：`StudioRepository` 的新 kind `apply-acceptance`，id = `${runId}:${stepId}:${operationId}`，scope = `runId`。这是**辅助证据**，不是任务状态机：

```ts
export interface StudioApplyAcceptance {
  version: 1;
  runId: string;
  stepId: string;
  projectKey: string;
  operationId: string;
  acceptedAt: number;
  paths: string[];
  fileVersions: { path: string; afterHash: string | null }[];
  creation?: { jobId: string; outputIds: string[] } | null;
  confirmation: "host-verified" | "host-journal" | "remote-returned";
  result: "accepted" | "applied-unverified" | "remote-unverified" | "failed";
  journalState?:
    | "preparing"
    | "applying"
    | "rolling-back"
    | "complete"
    | "rolled-back"
    | "rollback-incomplete";
}
```

字段规则：

| 字段           | 规则                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operationId`  | 本地应用取 Host 自己的应用事务 id（与 apply journal 文件名 `apply-<uuid>.json` 同源）；远端应用取本地关联 id（见下）                                                      |
| `fileVersions` | 只记录 Host 发布时可证明的 `afterHash`；`null` 表示该路径被删除，禁止用空数组冒充"无文件"                                                                                 |
| `creation`     | 只从步骤结果 `outputs` 的 `creation-output` 引用提取（经 `decodeStepOutputs` 校验）；`outputs` 缺失/更高版本时为 `null`                                                   |
| `confirmation` | `host-verified` = Host 独立重读哈希与 journal 一致；`host-journal` = 只有 Host 自己的 journal，无法独立重读；`remote-returned` = 远端 Host 返回的摘要，本地 Host 无法核验 |
| `result`       | 只有 `accepted` 是"已验收"；`applied-unverified` / `remote-unverified` 是"已应用但未能核验"；`failed` 只描述明确失败的应用                                                |
| `journalState` | 本地应用返回时的 journal 终态；远端没有本地 journal，该字段缺省（不写 `complete` 冒充）                                                                                   |

**验收记录永不作为任务终态被读回**：`run` / `step-result` / `turn` 仍是任务状态的唯一所有者；验收记录只被交付投影读取，且只影响"交付结论/重启显示"。

## 应用顺序规则

一次应用严格按下列顺序执行；不允许并行、不允许跳步：

```text
1. inspect（既有 reviewableWorkspace：活跃任务/同项目并发任务拒绝、无隔离改动拒绝）
2. 取项目锁（既有 apply-lock 事务，重校验可复核性；锁记录 token + pid + phase）
3. apply（既有隔离→项目的锁定事务；返回 receipt = {operationId, files[{path, afterHash}], journalState}）
4. 核验（Host 重读项目文件哈希，与 receipt 的 afterHash 比较）
5. 写验收记录 + 释放锁（同一个事务；只在核验成功后写入）
```

- 第 5 步必须与释放锁在**同一事务**内：不允许"先写验收记录再释放锁"或反过来。
- 核验失败（重读抛错）时：**不写任何验收行**，保留既有的 `recoveryRequired` 锁，UI 保留既有 `readAfterApplyFailed` 状态。
- 应用自身失败时：沿用既有失败路径（重新读取修改以判断是否回滚成功；无法核验则保留 `recoveryRequired` 锁）；不写"已验收"行。
- 远端应用：本地 Host 无法读远端文件，因此**永不**标记为 `host-verified`；写入 `confirmation: "remote-returned"` 与 `result: "remote-unverified"`，`fileVersions` 只来自远端返回的摘要（当前契约为空）。

## 重启后显示规则

纯函数 `studioRestartDisplay(input)` 只接收数据、不读 IO、不写状态，输出下列三种状态之一或 `null`：

输入 = `{ acceptances, currentFileHashes?, observedChanges?, journals?, applyLock?, resultKnown? }`。

| 顺序 | 显示状态                                          | 触发条件                                                                                                    |
| ---- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1    | `partial-unknown`（部分/未知）                    | `resultKnown === false`；或存在非终态 journal；或有 apply-lock（不带 `recoveryRequired`）但没有任何验收记录 |
| 2    | `applied-refresh-failed`（已应用但刷新失败）      | apply-lock 带 `recoveryRequired`，或有 `applied-unverified` / `remote-unverified` 验收记录                  |
| 3    | `accepted-later-modified`（已接受版本之后被修改） | 有 `accepted` 记录，且当前哈希 ≠ 记录的 `afterHash`，或复核读取到该路径 `conflict === true`                 |
| —    | `null`                                            | 已接受且当前文件与被接受版本一致（无需提示）                                                                |

两个等价证据源，任一成立即可判定"之后被修改"：

- `currentFileHashes`：Host 重读项目文件得到的当前哈希；
- `observedChanges`：Host 复核读取到的变更，`conflict === true` 表示当前项目文件既不等于基线也不等于隔离版本，因此**在存在验收记录的前提下**证明被接受版本已被改动（apply 不会改动隔离目录）。

显示位置：既有运行历史步骤行（时间线投影的增量字段）与既有复核弹窗；不新增页面。

## 四个数据归属问题（显式回答）

1. **谁拥有"交付结论"？** 只读投影拥有*推导*，不拥有状态。结论由 `app/runOutcomeProjection.ts` 在读取时从既有记录派生，不落库、不可写；任何其他模块不得把结论写回记录。
2. **谁拥有"验收记录"？** services 侧的应用事务（`app/workspaceReview.ts`）在核验成功后写入 `StudioRepository` 的 `apply-acceptance`；它是辅助证据，唯一所有者是写入它的应用事务，读取者只有交付投影。任务终态仍然只属于 `run` / `step-result` / `turn`。
3. **谁拥有"应用操作 id"？** 本地应用的事务 id 由**执行应用的 Host** 生成（`adapters/workspaceApply.ts` 的 `randomUUID`，与该次 apply journal 文件名同源），经 `StudioWorkspacePort.apply` 的返回值交给服务层。远端应用的事务 id 只有远端 Host 知道；本地 Host 只记录"远端返回了/未返回摘要"，绝不把本地 token 冒充成远端事务 id。
4. **谁拥有"重启后显示"？** 纯函数 `studioRestartDisplay` 拥有*判定*，输入由读取方提供（验收记录来自 `apply-acceptance`，当前哈希/冲突来自 Host 复核读取，journal 状态来自验收记录与 apply-lock）；判定结果不写回任何记录。

## 验收场景

1. 步骤成功、结果已知、模型文字声称"测试通过"，但没有任何 Host 证据 → 结论 `unverified`，证据只含 `model-claim`。
2. 隔离目录有 Host 观测到的改动 → 结论 `produced`；应用并核验成功后 → `checked`，验收记录 `result: "accepted"`、`confirmation: "host-verified"`。
3. 内核报告工具成功但 Host 无哈希/无验收 → `kernel-tool-state`，结论不高于 `unverified`。
4. 核验重读失败 → 不写验收行、保留 `recoveryRequired` 锁；重启后显示 `applied-refresh-failed`。
5. 远端应用 → 验收记录 `confirmation: "remote-returned"`、`result: "remote-unverified"`，永不显示为已核验。
6. 验收后用户再改该文件 → 重启后显示 `accepted-later-modified`。
7. 任务结果未知（`resultKnown !== true`）→ 显示 `partial-unknown`，不显示"已接受"。
8. 复核弹窗多选 N 个文件 → 一次 `paths: [...]` 提交；冲突/不可应用文件不进选择集；关闭或切换目标后选择集被清空；迟到的读取结果不复活旧选择。
