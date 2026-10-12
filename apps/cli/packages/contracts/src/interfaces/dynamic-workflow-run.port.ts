// SPDX-License-Identifier: Apache-2.0
// ════════════════════════════════════════════════════════════
// Dynamic Workflow Run Port —— dwf 引擎 run 的边界契约
// ════════════════════════════════════════════════════════════
// 这份文件回答一个问题：跨过端口能看见什么。所以它只写请求、快照与读数，而且每个形状都能
// JSON 序列化；引擎内部怎么算、领域包（@knorvia/dynamic-workflow）里有哪些类型，一概不出现在
// 这里——持有端口的层不必为了拿这些读数而在编译期依赖引擎。

// 所有权交代：脚本编译、站点表、schema 合成、lowering 全部发生在实现侧（run service）。
// 调用方递进来的只有脚本原文与执行上下文。

// 章节沿着读者的路径铺开：
//   一、提交与修订    run 怎么诞生、怎么被替换、怎么被叫停；
//   二、运行快照      后台任务追踪器直接读的那一份；
//   三、run 内省      列表 / 详情 / 会话摘要三条查询面；
//   四、事件流        事件分页与载荷边界；
//   五、工作区节点    files.* / git.* / world.run 的 transcript；
//   六、用户面产物    artifact.* 发布的版本史；
//   七、问答与恢复    升级问题的作答、被打断的 run 怎么续；
//   八、情势截面      子代理 / 阶段 / 健康，整块再导出；
//   九、端口          把上面这些读面收成一条边界。

import type { DynamicWorkflowRunProgressPayload } from "../events/session.events.js";
import type { ModelSelection } from "../model/model.js";
import type { TraceContext } from "../tracing/tracer.js";
import type {
  DynamicWorkflowRunHealth,
  DynamicWorkflowRunPhaseView,
  DynamicWorkflowRunSubagentView,
} from "./dynamic-workflow-run-roster.port.js";
import type { SessionId, ToolCallId } from "./shared.js";
import type { WorkflowTaskSnapshot } from "./workflow.port.js";

// 一、提交与修订：run 从哪来

/** 启动一次 run 所需的全部入参。 唯一算数的输入是脚本原文：编译、站点表、schema 合成、lowering 统统由它派生。因此这里不出现编译 产物——那属于 run service 的内部事务，调用方连概念都不必持有。 */
export interface DynamicWorkflowRunSubmitRequest {
  /** 脚本原文。写入 `dwf_run.script_text` 时逐字节照抄；resume 判断「是不是同一份脚本」看的是它的哈希。 */
  scriptText: string;
  /** 沙箱子进程的工作目录；world-read 也以它为根。 */
  cwd: string;
  /** 发起方会话。引擎事件会投影回这个会话。 */
  parentSessionId?: SessionId | string;
  /** 触发这次 run 的 CreateWorkflow 工具调用 id，充当工具卡到详情页的连线。 */
  toolCallId?: ToolCallId | string;
  /** 发起轮次的 inputId，子代理产生的 `agent_step` 都挂在它这条 message 下。中枢直接启动时才有值 （`startSavedWorkflowRun` 铸出的 UUID v7，controlOnly 启动轮与它共用同一个）；聊天路径上没有， run service 会从父 runtime 的当前轮自行解析。 */
  launchInputId?: string;
  /** 给枚举面当标签的展示名，对应 `CreateWorkflow` 的可选 `input.name`，落到 `dwf_run.name`。它只是 元数据：执行路线与 resume 校验都不读；留空则读侧改用脚本首行。 */
  name?: string;
  /** 这次 run 的实参。saved workflow 的声明式参数到工具侧时已经按声明校验完，并补上了默认值。 它不同于 `name`——它是 run 身份的一部分：写入 `dwf_run.args_json`，注入沙箱后成为脚本里的 `args` 全局。resume 重放当初存下的那一份，不接受新值。内联脚本没有实参，字段缺席视作空对象。 */
  args?: Record<string, unknown>;
  /** 脚本声明的阶段（因果图上的有名阶段，保持声明序，上限 32 × 128；`createWorkflowPhaseNames`）。 引擎把它和锚点一起写进 `run-launched`，sessions-index 投影靠它为侧栏迷你轨道标出前方站点。展示 元数据而已：执行与 resume 校验都不看；脚本没有 `phase()` 标记时缺省。 */
  phaseNames?: string[];
  // 与 `phaseNames` 逐位对齐的并行表（`createWorkflowPhaseAlongside`）：`phaseAlongside[i]` 是进入 `phaseNames[i]` 时仍未收手的其他阶段下标，下标取自同一张 `phaseNames`。
  // 侧栏迷你轨道据此把并行的 两站画成双线段。 与 `phaseNames` 一样随锚点进 `run-launched`，引擎不读； 任何阶段都不并行时整个字段缺省，读作 「轨道是笔直的一条」。
  phaseAlongside?: number[][];
  // 脚本所在文件的绝对路径。
  // 通道与 {@link subagentModel} 相同：随 `run-launched` 记一次，引擎从不读， 也不占 SQL 列（`dwf_run` 里没有这一列），两条读面再回头从事件取。
  // ⚠ 与产物的 `sourcePath` 无关——后者说产物落在哪，它说**脚本**住在哪。
  // 缺省意味着这个 run 没有可编辑的脚本文件（草稿写不下去的项目、升级之前启动的 run），模型面于是 继续建议「改好脚本再内联提交」。 桌面与 TUI 都不显示它。
  scriptPath?: string;
  // 这个 run 的并发上界，即同时在飞的 ask 数。 写入 `dwf_run.caps_max_concurrency`，resume 照用。
  // 缺省就是天花板（机器推导值，`resolveWorkflowConcurrencyCeiling`）； 有值则钳进 `[1, 天花板]`： 它压得低，抬不高。
  // 工具层在 `resolveInput` 已钳过一次（确认窗里必须显示真正生效的数），端口再钳 一次算它自己的契约。
  maxConcurrency?: number;
  /** 子代理使用的模型。journal 事件 `run-launched` 上那个规范形由它而来，resume 照用；缺省即跟随发起 会话的模型。 类型用结构化的 {@link ModelSelection}，不接收字符串：用户报出的名字在工具层已经过模型目录解析 （解析失败在确认窗之前就退回），端口若再匹配一次，「解析在哪儿发生」就有了两个答案。主代理不受 影响，始终用会话模型。 */
  subagentModel?: ModelSelection;
  /** 执行上下文。事件、日志以及派生任务靠它归入同一条 trace。 */
  trace: TraceContext;
}

/** submit 与 amend 共用的取消面：调用方可以中途收手。 */
export interface DynamicWorkflowRunSubmitOptions {
  signal?: AbortSignal;
}

/** submit 成功时返回的 runId 一个值兼三职：backgroundTaskId、`cancelBackgroundWork` 的 workId 都是它 （runId ≡ taskId ≡ workId），三条路径因此不用各建映射表。全新 run 不会被拒：接线故障（编译产物损 坏、journal 打不开）直接上抛。 */
export type DynamicWorkflowRunSubmitResult = { ok: true; runId: string };

// {@link DynamicWorkflowRunPort.amend} 收的入参。
// 修订走 **supersede**：用新脚本铸一个新 run，并把前驱 journal 里「每个具名 actor 已完结的 ask 前缀」 连同 world 节点当缓存导入。
// 前驱不要求先停——它正在飞反而才是本方法要处理的局面：service 先把它停 下、等结算，接着导入、启动，一次调用走完，模型于是不必自己演 TaskStop + 轮询 + 重提交。
// 实参只有 saved 来源才有，它与修订无关，不随修订传递。
export interface DynamicWorkflowRunAmendRequest {
  /** 被修订的前驱 run，任何状态都接受。 */
  predecessorRunId: string;
  scriptText: string;
  cwd: string;
  parentSessionId?: SessionId | string;
  /** 触发本次修订的 AmendWorkflow 工具调用 id；新 run 的工具卡凭它连到详情页。 */
  toolCallId?: ToolCallId | string;
  /** 新 run 的展示名；留空则沿用前驱的名字。 */
  name?: string;
  /** **新脚本**声明的阶段；含义见 {@link DynamicWorkflowRunSubmitRequest.phaseNames}。 */
  phaseNames?: string[];
  /** **新脚本**的并行表；含义见 {@link DynamicWorkflowRunSubmitRequest.phaseAlongside}，下标对应本请求的 `phaseNames` 而非前驱那张表。 */
  phaseAlongside?: number[][];
  /** **新脚本**所在文件；含义见 {@link DynamicWorkflowRunSubmitRequest.scriptPath}。 它和并发上界、子代理模型不一样，**没有三态**：记下的永远是本次修订所用脚本的出处（`path` 提交对应 那个文件，内联提交对应当时写下的草稿），不能沿用前驱的——前驱的路径指向旧脚本，写进新 run 等于让 模型下次去改一个已经不在跑的文件。 */
  scriptPath?: string;
  /** 新 run 的并发上界；含义见 {@link DynamicWorkflowRunSubmitRequest.maxConcurrency}（缺省即天花板）。 「省略即沿用前驱、`null` 即解除」的三态属于**工具面**，在 `AmendWorkflow` 的 `resolveInput` 里被归 一成这里的一个数或缺席——确认窗得显示沿用下来的值，那条规则只能在 handler 之前落地。 */
  maxConcurrency?: number;
  /** 新 run 的子代理模型；含义见 {@link DynamicWorkflowRunSubmitRequest.subagentModel}（缺省即随会话模 型）。「省略即沿用前驱、`null` 即清除」同样归工具面，在 `AmendWorkflow` 的 `resolveInput` 里连同 一次重新解析一起归一。 */
  subagentModel?: ModelSelection;
  /** 让新 run 沿用前驱落库的实参（`dwf_run.args_json`）。缺省即修订不带实参，工具路径的契约不变。唯一 会传它的是 GUI 的「配置」：它重跑前驱自己的脚本，脚本要读的正是前驱启动时那份实参；不沿用，从中枢 启动的带参已保存工作流就会以空 `args` 重跑。 */
  inheritArgs?: true;
  /** 执行上下文。事件、日志以及派生任务靠它归入同一条 trace。 */
  trace: TraceContext;
}

// amend 被拒时的判别键。 这两条指向**两个不同的下一步**（换一个 run id / 放弃修订、重新走一次全新 run），必须分得开。 可操作文案由工具层撰写，端口只承载判别键。
// 这里没有「前驱仍在飞」：在飞的前驱是被停下，而不是被拒（旧实现的 `not_amendable` 以及「停完再轮询 到 stopped 才重提交」那段竞态，因此一并消失）。
// **被拒不会有任何副作用**：预检先于停止前驱完成； 被拒时既没有 `dwf_run` 行，也没有注册表条目，前驱 不受打扰，继续跑。
export type DynamicWorkflowRunAmendRefusalReason =
  /** journal 里没有这个前驱。 */
  | "run_not_found"
  /** 前驱有已完结却缺消息边界记账的 ask，导入的转录谈不上截断（整体拒绝，没有降级回退）。 */
  | "missing_boundaries";

/** 修订的结果：成功回新 run 的 id，被拒只回判别键（文案归工具层）。 */
export type DynamicWorkflowRunAmendResult =
  | {
      ok: true;
      runId: string;
      /** 前驱原本在飞、被本次修订停下时才有（值为 `predecessorRunId`）；前驱早已结算则缺省。 */
      supersededRunId?: string;
    }
  | { ok: false; reason: DynamicWorkflowRunAmendRefusalReason };

/** 谁发起的停止。`user` / `model` 对应两条停止入口；amend 路径停下在飞前驱时给 `{ superseded }`，新 run 的 id 会随这个原因写进前驱的结算袋（`supersededBy`）。 */
export type DynamicWorkflowRunCancelInitiator = "user" | "model" | { superseded: string };

/** {@link DynamicWorkflowRunPort.waitForTask} 的等待面：调用方靠它退出等待。 */
export interface DynamicWorkflowRunWaitOptions {
  signal?: AbortSignal;
}

// 二、运行快照：后台任务追踪器读的那一份

// run 的生命周期状态。
// 字面集与 journal 的 `dwf_run.status` 对齐，但这里是**另起的一份声明**，不从 @knorvia/dynamic-workflow import：端口承载的是 JSON 形状，引擎词汇表一旦被 contracts 引用，每个持有 端口的层就都得在编译期依赖引擎内部类型（理由同 {@link DynamicWorkflowRunEvent} 的 `type`）。
// 它与 {@link DynamicWorkflowRunSnapshot} 的 status 故意不重合：后者说后台任务追踪器的语言，`pending` 被并进了 `running`。
// 内省面要留住 `pending`——「已提交、引擎尚未建行」是模型看得懂也有用的分界。
export type DynamicWorkflowRunLifecycleStatus =
  | "completed"
  | "errored"
  | "pending"
  | "running"
  | "stopped";

// `stopped` 的成因：`user` 用户取消； `model` 主代理 TaskStop； `provider` 模型侧确定性错误； `interrupted` 持有进程亡故或沙箱故障；
// `superseded` 被一次 AmendWorkflow 停下并取代。 可 resume 的是前 四种； `superseded` 不行（它的后继还活着），`errored`（脚本自己的错）也不行。
// 字面集取自引擎 `RunStopReason`，同样是另起的一份声明。
export type DynamicWorkflowRunStopReason =
  | "user"
  | "model"
  | "provider"
  | "interrupted"
  | "superseded";

/** 结构化失败。判别键是 `code`——「进程死了」与「脚本真的失败」对模型是两码事。 */
export interface DynamicWorkflowRunError {
  code: string;
  message: string;
  /** 仅当 `code` 为 `"ProviderStop"` 才有值；引擎 `ProviderStopDetails` 的 JSON 镜像。 */
  providerStop?: DynamicWorkflowRunProviderStop;
}

/** 供应商侧停摆的结构化明细；在端口上只以 JSON 形状存在。 */
export interface DynamicWorkflowRunProviderStop {
  kind: "auth" | "not_configured" | "model_unavailable" | "invalid_request" | "quota" | "other";
  reason: string;
  providerId?: string;
  providerLabel?: string;
  modelId?: string;
  providerCode?: string;
  subagent?: string;
  subagentName?: string;
  phase?: string;
  rawMessage?: string;
  resetAt?: number;
}

// run 的运行快照。
// 形状沿用 {@link WorkflowTaskSnapshot}（后台任务追踪器与通知管线按它读取），只把 `output` 放宽：workflow run 的产物是脚本顶层返回值，形状由脚本定义，套不上 legacy `Workflow` 工具的 输出类型。
// legacy 端口本身不加宽——两套 workflow 机制各有各的端口。
// `reports` 保留脚本 `report(item)` 交出的渐进产物**原值**，顺序即报告顺序，数据取自 journal 中 `kind = "report"` 的节点行；
// 这些条目的持久归宿就在那里（`workflowRuns.reports` 只是有界的纯内存展示 面）。
// 完成通知因此能在 completed / failed / cancelled 三种结局下一律回投：死在第 12 个 ask 上的 run 毕竟完成了 11 个 ask，把它捞回来就是 `report` 的用意。
export type DynamicWorkflowRunSnapshot = Omit<WorkflowTaskSnapshot, "output"> & {
  output?: unknown;
  /** run 真正的终态词。基类 `status` 讲的是后台任务追踪器的通用语言（`stopped` 折成 `cancelled`、 `errored` 折成 `failed`），通知与工具要讲实话就得看这两个字段；`stopReason` 仅在 `runStatus` 为 `stopped` 时有值。 */
  runStatus?: DynamicWorkflowRunLifecycleStatus;
  stopReason?: DynamicWorkflowRunStopReason;
  /** 这个 run 的发起会话（取自 journal 的 `parent_session_id`；注册表有条目就用条目的）。 */
  parentSessionId?: string;
  /** 产生这个 run 的那次修订；不是修订产物则缺省。 */
  resumedFrom?: string;
  /** 取代这个 run 的那次修订；未被取代则缺省。 */
  supersededBy?: string;
  /** 这个 run 的并发上界（`dwf_run.caps_max_concurrency`）。**达到或超过当前天花板时不出现**：跑在天花 板上的 run 没什么可讲（规则同 `reports`：没有值就不给字段）。`AmendWorkflow` 的 `resolveInput` 靠 它判断省略 `max_concurrency` 时沿用什么。 */
  maxConcurrency?: number;
  /** 这个 run 的子代理模型（journal 事件 `run-launched` 上那一个），规范形 `providerId/modelId[$reasoningLevel]`。**只有设过才有值**：随会话模型的 run 没什么可讲（规则同为 「没有值就不给字段」）。 这里用字符串而非 {@link ModelSelection}：读面只负责显示与原样回填，没人按字段取值。 */
  subagentModel?: string;
  /** 这个 run 的脚本文件（绝对路径，取自 journal 事件 `run-launched`）。**只有记下过文件才有值**。 终态通知要把「改好脚本再内联提交」换成「就地编辑那个文件、再走 `path` 修订」，就得能从快照里读到 它；用户面完全不显示（`subagentModel` 则会进桌面的 run 面板）。 */
  scriptPath?: string;
  /** 结构化失败，取自与 {@link DynamicWorkflowRunDetail.error} 相同的地方；基类那个 `error` 装的是它的 message 文本。 */
  failure?: DynamicWorkflowRunError;
  /** 脚本 `report(item)` 交出的条目原值，按报告顺序排列（细节见本类型说明）。 */
  reports?: readonly unknown[];
  // 眼下停在这个 run 上、等着主代理作答的升级问题。
  // **它来自内存注册表，而不是 journal 重放**：journal 里确实有两类事件 `escalation-raised` / `escalation-resolved`，但「还有谁欠着答案」是进程内的活事实——重放出的未配对 raised 在进程亡故后只 会骗人（停驻的 deferred 随进程消失，resume 会让 actor 重新提问并拿到新 qid）。
  // 它同时充当通知被丢弃（stale branch generation / shutdown drop）之后的**查询兜底**：主代理随时能借 既有观察面把没答的问题找回来。
  // 一条都没有时字段整个不出现，不发空数组。
  pendingQuestions?: readonly DynamicWorkflowRunPendingQuestion[];
  // 这个 run 发布出去的**用户面产物**，按首次出现顺序排列，数据取自 journal 中 `kind = "artifact"` 的 行；
  // 版本史的持久归宿在那里（`workflowRuns.artifacts` 只带最新版元数据）。
  // 规则同 `reports`：**只在 终态读**（`getTask` 会被反复轮询，而这些行的消费者只有终态通知与 GetWorkflowRun）； 一件都没有时字段 整个不出现。
  // ⚠ 别把它和本类型的 `output` 混起来：后者是脚本顶层返回值（引擎内部称 `RunSettlement.artifact`）， 前者是脚本经 `artifact.*` 发布给用户看的产出。
  artifacts?: readonly DynamicWorkflowRunArtifact[];
};

// 三、run 内省：列表 / 详情 / 会话摘要

/** 列表与详情**共享的截面**。标签、归属标注与时间戳在两条读面上必须逐字段同源——同一个 run 在列表与详 情里名字或归属对不上，属于最难被测试逮住、又最伤信任的那类毛病。写成共享基接口，胜过两份各自演化的 字段表。 */
export interface DynamicWorkflowRunSummary {
  runId: string;
  /** 展示标签，**已经烹熟**：实现侧（run service）按 name → 脚本首行 → runId 派生完毕，消费方直接展 示。为什么不下放原料（name / scriptText）让工具层自己拼：那条兜底链属于读时启发式，两处各拼一次必 然漂移；而 `scriptText` 又是端口上最大的字符串，列表面犯不着为了取首行把 50 份脚本搬过边界。 */
  label: string;
  /** 标签的出处：`"name"` 表示用户起过名字，`"script"` 表示读时从脚本派生（含退到 runId 的情况）。 */
  labelSource: "name" | "script";
  status: DynamicWorkflowRunLifecycleStatus;
  /** 仅 `status` 为 `"stopped"` 时有值。 */
  stopReason?: DynamicWorkflowRunStopReason;
  /** 产生这个 run 的那次修订（`dwf_run.resumed_from`）；不是修订产物则缺省。 */
  resumedFrom?: string;
  /** 取代这个 run 的那次修订（`stopped(superseded)` 的结算袋）；未被取代则缺省。 */
  supersededBy?: string;
  /** 这个 run 是否由本会话发起（命中 journal 的 `parent_session_id`，或它就在本会话注册表里）。 */
  ownedByThisSession: boolean;
  /** 「本会话无法证实它还活着」：journal 非终态 ∧ 不属于本会话 ∧ 不在本会话注册表。它可能是死进程的残 迹，也可能是同进程里兄弟会话正在飞的 run——所以只是**标注，不改状态**：读面不替别人收尸（孤儿收敛 只由 owning 会话在自己的构造时刻执行）。为真时才出现。 */
  possiblyInterrupted?: boolean;
  /** journal 里建立与更新的两个时刻（`time_created` / `time_updated`，epoch 毫秒）。 */
  createdAt: number;
  updatedAt: number;
}

/** 列表里的一行：共同截面 + 用量。刻意做得轻——没有 actors，没有节点计数，没有产物预览。 */
export interface DynamicWorkflowRunListItem extends DynamicWorkflowRunSummary {
  /** 直接读 `dwf_run.spent_tokens`；run 级 token 用量以这一列为准。 */
  spentTokens: number;
}

/** 交给 {@link DynamicWorkflowRunPort.listRuns} 的查询条件。 */
export interface DynamicWorkflowRunListQuery {
  /** 项目键，**必填**，按字面等值匹配 `dwf_run.cwd`（写入原样落、读取原样查）。端口不会替调用方猜默认 cwd：工具面一律查 `context.workingDirectory`，模型无权跨项目扫库。 */
  cwd: string;
  /** **必填**的条数上限。范围钳制是工具面的事（[1, 50]）；端口不做无界枚举。 */
  limit: number;
  /** 可选的状态子集。省略即不过滤；传空数组即「不匹配任何状态」（回空列表）。 */
  statuses?: readonly DynamicWorkflowRunLifecycleStatus[];
}

/** `listRuns` 的返回。用对象而非裸数组是有意的：页级字段（比如 `truncated`）属于纯追加改动，裸数组则 只能整体换形状。 */
export interface DynamicWorkflowRunListResult {
  runs: DynamicWorkflowRunListItem[];
  /** 本项目还有 run 没被这一页装下。**只在为真时出现**。 判定靠「多取一条」（实现侧按 `limit + 1` 查询后回落），不靠 `length === limit`：后者在条数正好等于 limit 时会误报，而误报会让模型去追一页根本不存在的历史。v4 网关的事件分页字段 `hasMore` 已经用过同 样的手法。 */
  truncated?: boolean;
}

/** run 的进度与用量（观察面，无上限）。`nodesObserved` 是**已落库节点行数**（三态之和），不冒充「总步 数」：动态工作流没有静态总数，`queued` 只活在事件相位里，不落库。 */
export interface DynamicWorkflowRunUsage {
  spentTokens: number;
  nodesObserved: number;
  nodesRunning: number;
  nodesCompleted: number;
  nodesFailed: number;
}

/** 一个 actor 站点实例。整段 system prompt（`persona`）在端口上天然无界，因此特意不出现在这里。 */
export interface DynamicWorkflowRunActor {
  siteId: string;
  ordinal: number;
  name?: string;
}

/** 脚本 `log()` 留下的一条叙事。 */
export interface DynamicWorkflowRunLogEntry {
  sequence: number;
  /** 已经过端口字符串上限的裁剪（上限见 {@link DYNAMIC_WORKFLOW_RUN_EVENT_PAYLOAD_LIMITS}）。 */
  message: string;
  /** 事件写入 journal 的时刻（`dwf_event.time_created`）。位置由序号给出，年龄由这个时刻给出——情势截面 那三组字段都拿这把尺算年龄，叙事尾巴没理由换一把。**老 journal 缺这一列即缺省**，读侧就别报年龄， 也不要拿读时的 `Date.now()` 顶上。 */
  at?: number;
}

/** 单 run 详情：在共同截面之上补上进度、情势截面，以及随终态而变的产物与失败。 */
export interface DynamicWorkflowRunDetail extends DynamicWorkflowRunSummary {
  usage: DynamicWorkflowRunUsage;
  /** 这个 run 的并发上界，含义见 {@link DynamicWorkflowRunSnapshot.maxConcurrency}：低于当前天花板才有值。 刻意不写进 {@link DynamicWorkflowRunSummary}——列表行不必为一个很少设置的字段加宽。 */
  maxConcurrency?: number;
  /** 这个 run 的子代理模型，含义见 {@link DynamicWorkflowRunSnapshot.subagentModel}：设过才有值。理由同 `maxConcurrency`，同样不进 {@link DynamicWorkflowRunSummary}——列表行不必为很少设置的字段加宽。 */
  subagentModel?: string;
  /** 这个 run 的脚本文件，含义见 {@link DynamicWorkflowRunSnapshot.scriptPath}：记下过文件才有值。 `GetWorkflowRun` 靠它在 `<amendable>` 里把下一步写成「就地编辑这个文件」。 */
  scriptPath?: string;
  actors: DynamicWorkflowRunActor[];
  /** `log()` 事件的尾巴，按时序排列（sequence 升序）。没有 log 事件就是空数组。 */
  logTail: DynamicWorkflowRunLogEntry[];
  /** 阶段表：已声明阶段按声明序排在前，随后是「进过但没声明」的那些。 **脚本既没声明阶段、也没进过任何阶段时，字段整个缺席**——那样的 run 谈不上阶段，发个空数组读起来像 「阶段表是空的」，意思差得远。 */
  phases?: DynamicWorkflowRunPhaseView[];
  // 子代理花名册，顺序与 actor 行相同（也就是铸造顺序）。
  // **恒在场**：没有 actor 的 run 得到空数组—— `phases` 可以缺席，但「这个 run 有几个子代理」永远有答案，0 也是答案。
  // 它与并列的 `actors` 故意不合并：`actors` 是稳定的身份表（siteId / ordinal / name），消费者已经按它 join；
  // 这里每一项都是**读时快照**，同一个 run 隔一秒再读就会变。
  subagents: DynamicWorkflowRunSubagentView[];
  /** 这个 run 整体是否仍在推进（语义见 {@link DynamicWorkflowRunHealth}）。恒在场。 */
  health: DynamicWorkflowRunHealth;
  // 脚本的顶层返回值，**原值**，不做序列化。 仅 completed 的 run 有； 返回 `undefined` 则字段整个缺席。
  // 为什么不在这里顺手序列化：面向模型的文本投影已有唯一实现（core 的 `serializeWorkflowArtifact`，完成 通知与 TaskOutput 共用它）。
  // 端口再来一遍，同一个 run 的产物就会在通知里和这个工具里长得不一样——那正 是那份共用要挡掉的损失。 序列化归 core，端口只负责把原值送达边界。
  result?: unknown;
  /** errored 时恒在场；stopped 只在 provider / interrupted 两种成因下在场。`code` 原样透出，不折叠。 */
  error?: DynamicWorkflowRunError;
  // 眼下停在这个 run 上、等着主代理作答的升级问题。
  // 它与 {@link DynamicWorkflowRunSnapshot.pendingQuestions} 同源，投影方式也一样（都读进程内的升级停驻 表，无条目时字段整个缺席），只是换了读面：快照服务后台任务追踪器，这个字段服务 `GetWorkflowRun`—— 而后者是**模型侧唯一的发现面**。
  // 这条链路不是可选项：升级通知有两条已知的丢弃路径（stale branch generation 与 shutdown），查询是它们的兜底；
  // `resolveQuestion` 的 `unknown_question` 文案也明确叫模型 来这里找 qid。 少了它，那两处承诺都会指向一个什么都不返回的工具。
  pendingQuestions?: readonly DynamicWorkflowRunPendingQuestion[];
  /** 这个 run 的用户面产物（任何状态都附；由 journal 支撑，与 {@link DynamicWorkflowRunSnapshot.artifacts} 同源）。`GetWorkflowRun` 靠它告诉模型「这些已经以卡片 呈现给用户了，按标题引用即可」。一件都没有时字段整个缺席。 */
  artifacts?: readonly DynamicWorkflowRunArtifact[];
}

/** {@link DynamicWorkflowRunPort.listRunsForSession} 返回的 run 摘要。字面集与 journal 的 `dwf_run.status` 相同，但这是**另起的一份声明**：端口承载 JSON 形状，引擎词汇表一旦被 contracts 引用，每个持有端口的层 都会在编译期依赖引擎内部类型。 */
export interface DynamicWorkflowRunSessionSummary {
  runId: string;
  /** 触发 run 的 CreateWorkflow 工具调用 id（工具卡 → 详情页 / Resume 按钮的关联键）；老 run 没有。 */
  toolCallId?: string;
  // 展示标签由服务端在读的时候派生（`name` → 脚本首行 → runId，见 bootstrap 的 `resolveDynamicWorkflowRunLabel`）。
  // 设为可选是为了**偏斜安全**：老服务端不发这个键，读侧退回 runId 即可——列表少一个标签只是退化，不是错误。
  // 与 `resumable` 同理把它集中在服务端：两处都各拼一次兜底，同一个 run 在 `/dwf list` 与工具卡上就会显 示成两个名字。
  label?: string;
  /** 最后更新时间（epoch 毫秒，取自 journal 的 `dwf_run.time_updated`）。可选的理由同上：老服务端不发，读 侧就不显示时间列。排序仍由存储层负责（最近更新在前）；这个字段只供展示，读侧别拿它重排，否则会跟服 务端的 tie-break 漂移。 */
  updatedAt?: number;
  status: "completed" | "errored" | "pending" | "running" | "stopped";
  /** 仅 `status` 为 `"stopped"` 时有值。 */
  stopReason?: DynamicWorkflowRunStopReason;
  /** 产生这个 run 的那次修订；不是修订产物则缺省。 */
  resumedFrom?: string;
  /** 取代这个 run 的那次修订；未被取代则缺省。 */
  supersededBy?: string;
  /** errored 或 stopped(provider|interrupted) 情况下的失败编码（`ProviderStop` / `Interrupted` …）。 */
  failureCode?: string;
  failureMessage?: string;
  /** 能否恢复。**服务端用与 resume 门相同的谓词算好**：UI 若自己按 status + failureCode 再推一遍，两处谓 词迟早不一致——按钮亮着，命令却被拒。 */
  resumable: boolean;
}

// 四、事件流：事件分页与载荷边界

/** 翻事件日志时的分页参数；cursor 是 journal sequence，由 appendEvent 单调分配。 */
export interface DynamicWorkflowRunEventPage {
  /** 只要 sequence 严格大于该值的事件；省略即从头开始。 */
  afterSequence?: number;
  limit?: number;
}

/** 一条 run 事件的**协议形态**：序号 + 种类 + JSON 载荷。 引擎的 `RunEvent` 不在这里复用：那是领域包（@knorvia/dynamic-workflow）的词汇表，import 进 contracts 会让每个持有端口的层在编译期依赖引擎内部类型。端口承载 JSON 形状就够了——`type` 视为不透明字符串， `payload` 由读端按需解释。 */
export interface DynamicWorkflowRunEvent {
  sequence: number;
  type: string;
  payload: Record<string, unknown>;
  /** 载荷被 {@link boundDynamicWorkflowRunEventPayload} 裁过（原始事实仍留在 journal 里）。 */
  truncated?: boolean;
}

// run 事件载荷的界。
// **走协议边界的载荷一律有界**，而引擎事件里有两个字段天生无界：`actor-created` 的 `persona.system`（一整段 system prompt）、node 级错误的 `finalText`（一整轮模型输出）。
// 「大概不会太 长」不是放行它们的理由。
// 界取**结构性**口径（字符串长度 / 数组条数 / 键数 / 深度），不取字节总量：结构界可以逐字段就地施加， 无需先整体序列化再回退，也不会因为某一个巨大字段而牺牲其余字段。
export const DYNAMIC_WORKFLOW_RUN_EVENT_PAYLOAD_LIMITS = {
  /** 单个字符串保留多少 UTF-16 码元，超出即截尾。 */
  maxStringLength: 2_048,
  /** 单个数组保留多少项，超出即切掉尾部。 */
  maxArrayItems: 32,
  /** 单个对象保留多少个键，按原顺序截断。 */
  maxKeys: 32,
  /** 递归深度上限；根对象算第 0 层，到顶的子树整体丢弃。 */
  maxDepth: 6,
} as const;

// 走协议边界的载荷一律有界。引擎事件里有两个字段天生无界：`actor-created` 的 `persona.system`（一整段
// system prompt）与 node 级错误的 `finalText`（一整轮模型输出）；界取结构性口径（字符串长度 / 数组条数 /
// 键数 / 深度）而不是字节总量，这样每个字段都能就地施加，不必先整体序列化再回退。
// 规范化是必需品而非附带品：`Infinity` / `NaN` 经 `JSON.stringify` 会变成 `null`，于是「同一个载荷，
// 落库前后不相等」。与其让每个读端各自应付，不如在这里一次性折叠，让返回值满足
// `JSON.parse(JSON.stringify(x))` 与 x 的结构等价。
export function boundDynamicWorkflowRunEventPayload(payload: Record<string, unknown>): {
  payload: Record<string, unknown>;
  truncated: boolean;
} {
  const state = { truncated: false };
  const bounded = boundJsonValue(payload, 0, state);
  return { payload: isJsonRecord(bounded) ? bounded : {}, truncated: state.truncated };
}

/** 判断一个值是不是普通 JSON 对象（跳过 null 与数组）。 */
function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

/** 非有限数不是合法 JSON 数字；折叠成 null，避免 JSON.stringify 悄悄改写载荷。 */
function normalizeJsonNumber(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

/** 按 UTF-16 码元截断且不留孤立高代理项：切点落在代理对中间时宁可少留一个码元。 */
function truncateSurrogateSafe(value: string, maxLength: number): string {
  const cut = value.slice(0, maxLength);
  const tailIndex = cut.length - 1;
  const tailCode = cut.charCodeAt(tailIndex);
  const splitPair = tailCode >= 0xd800 && tailCode <= 0xdbff;
  return splitPair ? cut.slice(0, tailIndex) : cut;
}

function boundJsonString(value: string, state: TruncationState): string {
  if (value.length <= DYNAMIC_WORKFLOW_RUN_EVENT_PAYLOAD_LIMITS.maxStringLength) return value;
  state.truncated = true;
  return truncateSurrogateSafe(value, DYNAMIC_WORKFLOW_RUN_EVENT_PAYLOAD_LIMITS.maxStringLength);
}

/** 数组少一位就会改变后续下标，所以承载不了的元素补 null，绝不能直接跳过。 */
function boundJsonArray(value: unknown[], depth: number, state: TruncationState): unknown[] {
  const keep = Math.min(value.length, DYNAMIC_WORKFLOW_RUN_EVENT_PAYLOAD_LIMITS.maxArrayItems);
  if (keep < value.length) state.truncated = true;
  return value.slice(0, keep).map((item) => boundJsonValue(item, depth + 1, state) ?? null);
}

function boundJsonRecord(
  value: Record<string, unknown>,
  depth: number,
  state: TruncationState,
): Record<string, unknown> {
  const entries = Object.entries(value);
  const kept = entries.slice(0, DYNAMIC_WORKFLOW_RUN_EVENT_PAYLOAD_LIMITS.maxKeys);
  if (kept.length < entries.length) state.truncated = true;
  return kept.reduce<Record<string, unknown>>((accumulated, [key, item]) => {
    const bounded = boundJsonValue(item, depth + 1, state);
    if (bounded === undefined) return accumulated;
    accumulated[key] = bounded;
    return accumulated;
  }, {});
}

/** 递归裁剪值；返回 `undefined` 表示这个值承载不了，怎么处理交给调用方。 */
function boundJsonValue(value: unknown, depth: number, state: TruncationState): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return normalizeJsonNumber(value);
  if (typeof value === "string") return boundJsonString(value, state);
  if (typeof value !== "object") {
    // undefined / function / symbol / bigint 一律省略——bigint 同样过不了 JSON 序列化。
    return undefined;
  }
  if (depth >= DYNAMIC_WORKFLOW_RUN_EVENT_PAYLOAD_LIMITS.maxDepth) {
    state.truncated = true;
    return undefined;
  }
  if (Array.isArray(value)) return boundJsonArray(value, depth, state);
  return boundJsonRecord(value as Record<string, unknown>, depth, state);
}

interface TruncationState {
  truncated: boolean;
}

// 把 workflow run 里的**任意脚本值**（顶层返回的产物、`report(item)` 的条目）转成给模型或读者看的文本。
// 实现已随共享的 workflowRuns reducer 迁到 `@knorvia/shared/protocol-v4`（workflow-artifact.ts；
// 规则与来龙去脉见那边的注释）：`reports[].preview` 的归约下沉到 shared 后多出第四个消费者，而依赖方向是
// contracts → shared，函数只能跟着走。这里保留 re-export，三个老消费者（完成通知、TaskOutput 的
// resultText、v4 投影）一行都不用改。
export { serializeWorkflowArtifact } from "@knorvia/shared/protocol-v4";

// 五、工作区节点：files.* / git.* / world.run 的 transcript

/** 工作区节点的种类，即 journal `dwf_node.kind` 的两个 world 取值。 */
export type DynamicWorkflowRunWorkspaceNodeKind = "world-read" | "world-run";

/** 节点行的状态，等同 journal 的 `NodeRecordStatus`（另起一份声明，理由同 lifecycle status）。 */
export type DynamicWorkflowRunWorkspaceNodeStatus = "running" | "completed" | "failed";

// 清单上一行的**摘要**：不解正文就能报出的那几个数。
// 存储层在查询里用 SQLite 的 JSON 函数算出它们 （`resultBytes` / `resultCount` / `exitCode` / `stdoutBytes` / `stderrBytes`），端口原样透传。
// 字段是否 有值看 op：数组正文（glob / grep / changedFiles）带 `resultCount`，`world.run` 带 exitCode 与两路输出 的字节数，字符串正文只有 `resultBytes`。
export interface DynamicWorkflowRunWorkspaceNodeSummary {
  /** 正文序列化为 UTF-8 后的字节数。 */
  resultBytes: number;
  resultCount?: number;
  exitCode?: number;
  stdoutBytes?: number;
  stderrBytes?: number;
}

// 工作区 transcript 的一行，对应一次 `files.*` / `git.*` / `world.run` 调用，且**不含正文**。
// `op` 与 `args` 出自迁移 0030 加的 `input_json`（admission 时写入，≤ 4 KB）； 升级前的历史行两样都没 有，UI 退回静态图上的步标签。
// `inputTruncated` 表示 args 存的是逐项字符串预览，而非原值。
export interface DynamicWorkflowRunWorkspaceNode {
  siteId: string;
  ordinal: number;
  kind: DynamicWorkflowRunWorkspaceNodeKind;
  op?: string;
  args?: readonly unknown[];
  inputTruncated?: true;
  status: DynamicWorkflowRunWorkspaceNodeStatus;
  /** failed 行的结构化失败（取自 journal `error_json` 的 code、message；其余字段不出端口）。 */
  error?: DynamicWorkflowRunError;
  /** 只有结算成功的行会带它。 */
  summary?: DynamicWorkflowRunWorkspaceNodeSummary;
  /** journal 行的建立与最近更新时刻（epoch 毫秒）；两个时刻之差即这一步耗时。 */
  createdAt: number;
  updatedAt: number;
}

/** 传给 {@link DynamicWorkflowRunPort.readWorkspaceNodeResult} 的分页袋，用来限定正文的字节数上限。 */
export interface DynamicWorkflowRunWorkspaceNodeResultQuery {
  /** **必填**。端口照它**有界化**正文——截断而不是拒绝，因为这是审计面，不是脚本的取数面。 */
  maxBytes: number;
}

/** 一个工作区节点的正文：`result`，已按形状有界化。 截断**保形**：字符串切尾、数组去尾、`world.run` 的 stdout / stderr 分别切尾；`truncated` 表明发生过截 断，`totalBytes` 是截断前的字节数。running 行没有正文；failed 行只剩 `error`。 */
export interface DynamicWorkflowRunWorkspaceNodeResult {
  status: DynamicWorkflowRunWorkspaceNodeStatus;
  result?: unknown;
  error?: DynamicWorkflowRunError;
  truncated: boolean;
  totalBytes: number;
}

// 六、用户面产物：artifact.* 的版本史

/** 用户面产物的种类，对应 facade `artifact.*` 的六个成员。 */
export type DynamicWorkflowRunArtifactKind =
  | "file"
  | "markdown"
  | "chart"
  | "table"
  | "metrics"
  | "board";

// 用户面产物的某一个版本（journal `dwf_node.result_json` 里 `ArtifactVersionRecord` 的 JSON 镜像）。
// **这里刻意另起声明**，不从 @knorvia/dynamic-workflow import：端口承载的只有 JSON 形状（论证同 {@link DynamicWorkflowRunLifecycleStatus}）。
// 内容型产物（`file` / `markdown`）填 `contentType` / `bytes` / `uri` / `sourcePath`；
// 预置看板（`chart` / `table` / `metrics` / `board`）填 `spec`。 字节永远不在这儿——`uri` 指向 tool-artifact store。
export interface DynamicWorkflowRunArtifactVersion {
  version: number;
  title?: string;
  description?: string;
  contentType?: string;
  bytes?: number;
  uri?: string;
  sourcePath?: string;
  spec?: unknown;
  /** 发布时刻（epoch 毫秒）；driver 恒定写入。 */
  publishedAt: number;
  /** 这一版是 run 的交付物。 */
  primary?: true;
}

/** 一个用户面产物：同一 id 下的全部版本（版本号升序），外加打了该标签的 report 计数。 `title` / `description` / `contentType` / `sourcePath` / `spec` 一律取**最新版**的值，省得只关心「现在 长什么样」的读者自己去翻 versions。 */
export interface DynamicWorkflowRunArtifact {
  id: string;
  kind: DynamicWorkflowRunArtifactKind;
  title?: string;
  description?: string;
  contentType?: string;
  sourcePath?: string;
  spec?: unknown;
  /** 最新版号（即 versions 末项的 version）。 */
  version: number;
  versions: readonly DynamicWorkflowRunArtifactVersion[];
  /** 打了这个 id 标签的 `report` 条目数（预置看板的数据量；内容型产物恒为 0）。 */
  itemCount: number;
  /** run 的交付物（至多一件）。`artifacts` 清单由它领头，其余按首次发布顺序。 */
  primary?: true;
}

/** 送进某个预置产物的 `report` 条目，以 journal sequence 定位（看板的取数面）。 */
export interface DynamicWorkflowRunArtifactItem {
  sequence: number;
  siteId: string;
  ordinal: number;
  item: unknown;
}

/** 传给 {@link DynamicWorkflowRunPort.listArtifactItems} 的分页袋（cursor 就取 journal sequence，必须严格大于）。 */
export interface DynamicWorkflowRunArtifactItemPage {
  afterSequence?: number;
  /** **必填**；调用方可以传「上限 + 1」探测 hasMore，实现方不得再钳一次。 */
  limit: number;
}

/** {@link DynamicWorkflowRunPort.readArtifact} 交出的东西：某个版本的全数字节。 */
export interface DynamicWorkflowRunArtifactBytes {
  bytes: Uint8Array;
  contentType: string;
}

// 七、问答与恢复：升级问题怎么答、被打断的 run 怎么续

/** 停驻中的一个升级问题。字段与 `escalation-raised` 同源，另加提问时刻。 */
export interface DynamicWorkflowRunPendingQuestion {
  /** 全局唯一的问题 id（形如 `dwfq-<runId 片段>-<seq>`），也是 `resolveQuestion` 唯一认得的键。 */
  qid: string;
  /** 提问的 actor，`refToString` 形态（例如 `actor#1@1`）。恒在场，且在 run 内可唯一定位。 */
  actor: string;
  /** 这个 actor 的人类可读名（脚本里 `agent("poet")` 的那个 `"poet"`）。 **匿名 actor 没有本字段，这里也不会替它编兜底标签**：兜底是渲染决策，通知面与侧栏各有各的写法（一个 读成句子，一个塞进一列）。在这里造一个「actor#1@1」充名字，两个消费者反而都拿不回「这个 actor 本来 没有名字」这件事。 */
  actorName?: string;
  question: string;
  /** actor 附上的额外上下文（`escalate` 的可选 `context`）。 */
  context?: string;
  /** 提问时刻（epoch 毫秒）。主代理靠它判断「这个问题已经等了多久」。 */
  askedAt: number;
}

/** {@link DynamicWorkflowRunPort.resolveQuestion} 的结构化拒绝理由。三条对应**三个不同的下一步**，必须 能分辨：去快照里取正确的 id / 什么都不用做 / 这个 run 不再需要答案。 */
export type DynamicWorkflowResolveQuestionRefusalReason =
  /** 注册表里没有这个 qid：要么拼错，要么它来自已经亡故的进程（停驻项不持久化）。 */
  | "unknown_question"
  /** 问题已被回答，actor 早就带着那个答案继续跑了。 */
  | "already_resolved"
  /** qid 所属的 run / ask 已经不在飞行中（取消、失败或结束），没有人在等这个答案。 */
  | "run_not_in_flight";

/** `resolveQuestion` 的结构化结果。失败走 reason 而不 throw，理由同 {@link DynamicWorkflowRunSubmitResult}：三种理由都是调用方可以预期的业务分支。 `message` 由实现侧写好（陈述现状与下一步），不交给工具层拼：判别键与文案分开维护，两处迟早说出不同 的话，而这里读者是模型——它读到的那句就是它的下一步。 */
export type DynamicWorkflowResolveQuestionResult =
  | { ok: true; qid: string }
  | { ok: false; reason: DynamicWorkflowResolveQuestionRefusalReason; message: string };

/** {@link DynamicWorkflowRunPort.resume} 失败时的结构化原因。 */
export type DynamicWorkflowRunResumeErrorReason =
  /** journal 里查不到这个 run。 */
  | "not_found"
  /** run 不在可恢复集合内（completed 或 errored；可恢复的只有 stopped）。 */
  | "not_resumable"
  /** run 被一次 AmendWorkflow 停下并取代：活着的是后继，重放它等于把同一件事做两遍。 */
  | "superseded"
  /** 同一 runId 的 run 正在本进程内飞行。 */
  | "already_running"
  /** 记录里没有 scriptText（落库该字段之前的老 run），于是没有可重跑的脚本。 */
  | "script_missing"
  /** 记录里的 scriptHash 与按 scriptText 重算的值对不上（记录本身被外力改过）。 */
  | "script_mismatch"
  /** 记录里的 scriptText 放到**当前** facade 下已经过不了类型检查（facade 重构前的老 run）。逐字重放只 会失败；出路是按当前 facade 改写脚本再走 AmendWorkflow。`message` 携带有界诊断。 */
  | "compile_failed";

/** resume 的结构化结果。失败走 reason 而不 throw：五种理由都是调用方可以预期的业务分支（判断流程看错误 码，不看错误文本——house rule），throw 只留给真正的接线故障。 */
export type DynamicWorkflowRunResumeResult =
  | { ok: true; runId: string; toolCallId?: string }
  | { ok: false; reason: DynamicWorkflowRunResumeErrorReason; message?: string };

// 八、情势截面：子代理 / 阶段 / 健康（整块再导出）

// 这些类型住在 dynamic-workflow-run-roster.port.ts（拆分理由写在那份文件的开头）。此处整块再导出，
// 原导入路径继续可用——消费方不必知道它们搬过家。
export type * from "./dynamic-workflow-run-roster.port.js";

// 九、端口：把上面这些读面收成一条边界

// workflow run 的窄端口。
// 它与 legacy {@link import("./workflow.port.js").WorkflowPort} 并列、不合并： 后者服务 `Workflow` 工具与 `workflow_*` 旧表，共用一个端口等于在接口层把「独立于既有 workflow 机制」 这条边界又焊回去。
// 取消不设专属 RPC：详情页按钮与后台面板的停止都走既有的 v4 `cancelBackgroundWork`，最终落到这里的 {@link cancel}（runId 与 workId 同一个值）。
export interface DynamicWorkflowRunPort {
  /** 编译一趟并启动引擎；返回 runId（同时也是 backgroundTaskId）。 */
  submit(
    request: DynamicWorkflowRunSubmitRequest,
    options?: DynamicWorkflowRunSubmitOptions,
  ): Promise<DynamicWorkflowRunSubmitResult>;
  /** 修订一个 run：预检前驱 → 铸新 id → 前驱在飞则带 `{ superseded: newRunId }` 停下并等结算 → 从前驱 导入缓存 → 启动新 run（细节见 {@link DynamicWorkflowRunAmendRequest}）。预检被拒即结构化失败，且 **什么都没动**。老宿主可能没有这个方法（可选成员）：工具层按能力探测，统一归一为「本会话不支持修 订」。 */
  amend?(
    request: DynamicWorkflowRunAmendRequest,
    options?: DynamicWorkflowRunSubmitOptions,
  ): Promise<DynamicWorkflowRunAmendResult>;
  // 恢复一个被取消、或被进程死亡打断的 run：同 runId 重跑（引擎走 resume 分支，journal 里命中的节点短 路，未完结的节点重新派发）。
  // 门由实现侧把守：可恢复的只有 `cancelled`，以及失败编码为 `Interrupted` 的 `failed`。
  // **可选成员**：端口 stub 不必为恢复面全员陪跑，消费方 `typeof` 探测即可； 对消费方而言「端口缺席」与 「方法缺席」是同一个业务失败。
  resume?(runId: string): Promise<DynamicWorkflowRunResumeResult>;
  /** 停下一个 run：中止在飞的 ask、kill 子进程，run 结算为 `stopped(initiator)`。`initiator` 默认 `user`；主代理经 TaskStop 停的传 `model`（原因从此落库，不再只活在后台任务注册表里）；amend 路径传 `{ superseded: newRunId }`。runId 未知时返回 false。 */
  cancel(runId: string, initiator?: DynamicWorkflowRunCancelInitiator): Promise<boolean>;
  // run 这条并发界的天花板（`max(1, min(16, availableParallelism() − 2))`，每进程一个值）。 同步，无副作 用。
  // 工具层有两个读者：`CreateWorkflow` / `AmendWorkflow` 的 `resolveInput` 拿它钳住模型给的 `max_concurrency`（确认窗里显示的必须是将要生效的值），`GetWorkflowRun` 拿它判断某个 run 的上界是否 值得提一句。
  // **可选成员**（消费方 `typeof` 探测）：端口 stub 不必为它陪跑； 缺席时工具层不钳、原样下 传（端口实现自己还会再钳一次）。
  concurrencyCeiling?(): number;
  getTask(taskId: string): Promise<DynamicWorkflowRunSnapshot | undefined>;
  waitForTask(
    taskId: string,
    options?: DynamicWorkflowRunWaitOptions,
  ): Promise<DynamicWorkflowRunSnapshot | undefined>;
  /** 按 cursor 翻事件日志；cursor 越界回空页，不报错。 */
  listEvents(
    runId: string,
    options: DynamicWorkflowRunEventPage,
  ): Promise<DynamicWorkflowRunEvent[]>;
  // run 存档的脚本原文（`dwf_run.script_text`，与 resume 重放的是同一份字节），逐字节给出，不做任何加 工。
  // `AmendWorkflow` 有两处读它：一是省略脚本时把前驱的脚本回填进入参，二是 `path` 修订的 `script_unchanged` 预检——后者必须逐字节比，不能比哈希，因为工具侧手里是文件内容而不是编译产物。
  // GUI 的「配置」也走这条读路。
  // 为什么单开一条读面而不塞进 {@link DynamicWorkflowRunSnapshot}：快照被后台追踪器反复轮询，而脚本是端 口上最大的字符串（{@link DynamicWorkflowRunSummary.label} 出于同样的理由留在外面）。
  // runId 未知、或 记录里压根没有脚本（落库该字段之前的老 run）都回 `undefined`——对调用方这是同一个事实：没有可沿用的 脚本。 只读，不看服务是否已关闭。
  // **可选成员**（消费方 `typeof` 探测）：缺席时省略脚本的修订当场失 败，`script_unchanged` 预检则被跳过（它是网，不是门）。
  getScript?(runId: string): Promise<string | undefined>;
  /** 按项目（cwd）枚举 run，最近更新的排前面。服务 `ListWorkflowRuns` 工具。 **可选成员**（消费方 `typeof` 探测）：只有 journal 带内省查询时实现方才提供它，既有的端口 stub 也不 必为一个只读枚举面全员陪跑。对消费方来说「端口缺席」与「方法缺席」给同一个业务失败——对模型也是同一 件事（本会话没这个能力）。 */
  listRuns?(query: DynamicWorkflowRunListQuery): Promise<DynamicWorkflowRunListResult>;
  /** 单个 run 的详情（进度摘要 + 产物 / 失败）。服务 `GetWorkflowRun` 工具。runId 未知回 `undefined` （消费方归一为 `run_not_found`），**没有 wait / block 语义**——要等请用 {@link waitForTask}，这里给 的是即时快照。可选成员的理由见 {@link listRuns}。 */
  getRunDetail?(runId: string): Promise<DynamicWorkflowRunDetail | undefined>;
  // 枚举**本服务父会话**名下的 run 摘要（最近更新在前，由 journal 支撑）。
  // 这是 UI 重启后发现现场的手段： `workflowRuns` 投影活不过进程，工具卡 join 与 Resume 按钮的可用性只能从这里还原。
  // 刻意不接收 parentSessionId 参数——服务实例本就按父会话构造（per-app），允许传任意会话等于开一个跨会话读洞。 可 选成员的理由见 {@link resume}。
  listRunsForSession?(limit?: number): Promise<DynamicWorkflowRunSessionSummary[]>;
  // 冷回放：把**本服务父会话**名下、本进程没跑过的 run 从 journal 回放成进度事件载荷。
  // 它与 live 时 `onRunEvent` 交出的是**同一种**载荷、同一条铸造链，冷物化把它们当内存事件喂给同一个 reducer， `workflowRuns` 投影于是重启前后逐字节一致。
  // - 上界与投影淘汰规则一致（最近更新的 8 条），最旧的 run 在前； - `excludeRunIds`：内存里已有事件的 run（本进程跑过 / 正在跑）不回放；
  // - 行已终态、而事件流缺 `run-settled` 的 run（进程死亡后被孤儿收敛改写过的行）追加一条**内存态**合 成 settle 载荷（带该行的 status / failure / resumable），绝不写进 journal。
  // 可选成员的理由参见 {@link listRunsForSession}：内存 journal 没有枚举面，回放也就没有东西可还原。
  replayProgressForSession?(input: {
    excludeRunIds: ReadonlySet<string>;
  }): Promise<DynamicWorkflowRunProgressPayload[]>;
  // 回答 actor 升级上来的阻塞问题。 服务 `ResolveWorkflowQuestion` 工具。
  // 只收一个不透明 token，而不是 `(runId, qid)` 对：qid 本身跨 run 全局唯一，多 run 并发时让模型自己配 对是错配的温床。
  // 答案原样成为 actor 那次 `escalate` 调用的工具结果，actor 的轮次随即继续； run 状态全 程不动（升级是 ask 内部的一次慢工具调用，不是 run 生命周期事件）。
  // **可选成员**（消费方 `typeof` 探测）：端口 stub 不必为一个应答面全员陪跑； 对消费方「端口缺席」与「方 法缺席」是同一个业务失败。
  resolveQuestion?(qid: string, answer: string): Promise<DynamicWorkflowResolveQuestionResult>;
  // 读某个产物版本的字节：**先**在 journal 里确认 `(runId, artifactId, version)` 有 `completed` 行，再 按行上的 `uri` 经 tool-artifact store 取——调用方传来的 id 不会直接变路径。
  // 版本不存在 / 不是内容型 产物 / store 缺席 → `undefined`。 分块归网关（v4 `workflowRunArtifactRead`，每块 ≤ 512 KiB）。
  // 可选成 员的理由见 {@link listRuns}。
  readArtifact?(
    runId: string,
    artifactId: string,
    version: number,
  ): Promise<DynamicWorkflowRunArtifactBytes | undefined>;
  /** 这个 run 的用户面产物清单（journal 里 `kind = "artifact"` 的行按 id 分组、版本升序）。UI 冷恢复与中 枢详情的 durable 读法。runId 未知回 `undefined`。**可选成员**，理由见 {@link listRuns}（journal 带 产物读面时才提供；消费方 `typeof` 探测）。 */
  listArtifacts?(runId: string): Promise<readonly DynamicWorkflowRunArtifact[] | undefined>;
  /** 喂给某个预置产物的 `report` 条目，按 journal sequence 升序分页（看板取数面）。cursor 越界回空页，不 报错。可选成员，理由见 {@link listArtifacts}。 */
  listArtifactItems?(
    runId: string,
    artifactId: string,
    page: DynamicWorkflowRunArtifactItemPage,
  ): Promise<readonly DynamicWorkflowRunArtifactItem[]>;
  // 这个 run 的工作区 transcript：journal 里 `kind ∈ {world-read, world-run}` 的行按落库先后排列， **不含正文**。
  // 授权链同 {@link readArtifact}：run 必须属于本服务的父会话，否则 `undefined`（答案与「无此 run」一 致——不告诉越权者他猜对了哪一半）。
  // 正文可能含工作区文件内容，所以清单也不对别的会话放行。 可选成员， 理由见 {@link listArtifacts}。
  listWorkspaceNodes?(
    runId: string,
  ): Promise<readonly DynamicWorkflowRunWorkspaceNode[] | undefined>;
  /** 一个工作区节点的正文，按 `maxBytes` 做保形式的有界化。授权链同 {@link listWorkspaceNodes}；节点不存在 / 非 world 行 / 不是你的 run → `undefined`。可选成员，理由见 {@link listArtifacts}。 */
  readWorkspaceNodeResult?(
    runId: string,
    siteId: string,
    ordinal: number,
    query: DynamicWorkflowRunWorkspaceNodeResultQuery,
  ): Promise<DynamicWorkflowRunWorkspaceNodeResult | undefined>;
}
