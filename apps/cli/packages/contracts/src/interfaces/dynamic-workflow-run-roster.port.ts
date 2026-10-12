// SPDX-License-Identifier: Apache-2.0
// ════════════════════════════════════════════════════════════
// Dynamic Workflow Run 的情势截面 —— 子代理、阶段、健康
// ════════════════════════════════════════════════════════════
// 这组类型另立一篇，因为主契约已经触到 oxlint 的 max-lines 上限（当初 dwf-journal-introspection.ts
// 被拆出来也是这个缘故）。公开面没有变化：主端口文件把这里的名字整块再导出，`@knorvia/contracts`
// 上原有的导入路径照旧有效。

// 字段由读面在计算 run 详情时现算，挂到 `DynamicWorkflowRunDetail` 上。三组类型共守一条纪律：时间
// 只能来自一处——事件写进 journal 的那一刻（dwf_event.time_created）。读时临时拿 `Date.now()` 顶上，
// 会把一周前的历史整体说成「刚刚」，而这几个字段的全部价值就在于让「多久以前」可信。老 journal 缺
// 这一列时，相关时间字段一律**缺席**，既不用 0 也不用 NaN 顶上。

// ① 子代理：一个 actor 实例此刻在干什么

/** 这条 ask 上最近一次被看到的工具调用。`target` 是给人看的**线索**（例如文件路径、命令头），而不是 入参本身：引擎到这里之间每一段都按同一条界裁剪，入参全文不会进来。 */
export interface DynamicWorkflowRunSubagentLastTool {
  name: string;
  target?: string;
  /** 看到它的那条 `node-progress` 是什么时候落库的；事件不带时间戳就缺席。 */
  at?: number;
}

/** 子代理当前那次仍在跑的 ask（有 ask 行还是 `running` 时它才在场）。 这里只放下读面确实用得上的东西：身份定位、派活时写下的指令头、以及随进度事件同步到达的计数。 指令全文不归边界管，只留开头 240 字。 */
export interface DynamicWorkflowRunSubagentAsk {
  siteId: string;
  ordinal: number;
  /** 这是该子代理第几次发问，数值来自 journal 的 `actorSeq`；老行不落这一列就缺席。 */
  actorSeq?: number;
  /** 派这次 ask 时作者写下的指令，只保留前 240 字。读面靠它回答「这个子代理被派去干什么」——相位 本身最多说得出「在跑」。老 journal 里没有 `instructionsHead` 就缺席，**不会去读指令全文来补齐**。 */
  instructionsHead?: string;
  /** 这条 ask 在 `node-dispatched` 上的时刻；事件不带时间戳就缺席。 */
  startedAt?: number;
  /** 随 `node-progress` 一起到达的计数：解析到第几轮了，累计又调了几次工具。没有 `node-progress` 的老 journal 上它们一律缺席——缺席的意思是「不知道」，而 `0` 说的是「一个工具都没调过」，两件 事不能混为一谈。 */
  turn?: number;
  toolCalls?: number;
  lastTool?: DynamicWorkflowRunSubagentLastTool;
}

/** 当前这次 ask 卡在什么上（取自最后一条 `node-waiting` 的观察）。 */
export interface DynamicWorkflowRunSubagentWait {
  /** 等的是进程级准入闸门（`slot`），还是 runner 正在退避重试（`backoff`）。 */
  cause: "slot" | "backoff";
  reason?: string;
  retryAfterMs?: number;
  /** **进入这一轮等待**的时刻——即最近一条非 waiting 生命周期事件之后的第一条 `node-waiting`，而不是 最后一条 `node-waiting` 的时刻：退避阶梯会连着发好几条，而读者想问的是「它已经卡了多久」。事件 没有时间戳时缺席。 */
  since?: number;
}

// 子代理此刻的处境。
// 判定按**读的顺序即写的顺序**，前一条命中就定案： run 尚未终态时：`parked`（停在自己的问题上等答案）→ `waiting`（当前 ask 的最近一条生命周期事件是 `node-waiting`，说明在等槽位或在退避）→ `executing`（还有 ask 行在跑）→ `failed`（最近一条已结算 的 ask 以失败收场）→ `idle`。
// run 已是终态时，三个「活着」的词一并退场，只剩 `unfinished`（仍有 ask 行标着 running，说明进程死在 它下面）、`failed`、`done`，按此顺序判定。
export type DynamicWorkflowRunSubagentState =
  | "idle"
  | "executing"
  | "waiting"
  | "parked"
  | "done"
  | "failed"
  | "unfinished";

/** 情势截面里的一个子代理：一个 actor 实例对应一项。 */
export interface DynamicWorkflowRunSubagentView {
  siteId: string;
  ordinal: number;
  /** `agent("poet")` 解析出的有效名；匿名 actor 没有名字，这里也不会替它编一个（与 pendingQuestions 同一态度）。 */
  name?: string;
  state: DynamicWorkflowRunSubagentState;
  /** 当前（或最后一次）ask 出生在哪个阶段；读不出就退到它自己的出生阶段。 */
  phaseName?: string;
  currentAsk?: DynamicWorkflowRunSubagentAsk;
  wait?: DynamicWorkflowRunSubagentWait;
  /** 它是在哪个问题上停住的（对应 `pendingQuestions[].qid`）。**仅当这次读确实能碰到停驻表时才可能出 现**：一旦 `health.pendingQuestionsKnown` 为假，读数根本不知道有没有人在等——细节见那个字段。 */
  parkedOn?: string;
  /** 累计结算的 ask 有几条、其中失败几条，以及这些 ask 的 token 总和（取自节点行的 stats）。 */
  stepsSettled: number;
  stepsFailed: number;
  tokens: number;
  /** 它名下任一节点的最后一条进度类事件发生在何时——也就是最后一次看到它在动。 */
  lastProgressAt?: number;
}

// ② 阶段：脚本声明的站点走到了哪一步

/** 阶段在情势截面里可能处的状态。 - `ahead`：脚本写了它，控制流尚未抵达（`rounds: 0` 只可能出现在这个状态）； - `current`：run 还在跑，并且它就是最后进入的那个阶段； - `unfinished`：run 已终态，但该阶段里仍有 ask 未结算（进程是死在它下面的）； - `done`：以上都不是。 */
export type DynamicWorkflowRunPhaseState = "done" | "current" | "ahead" | "unfinished";

/** 情势截面里的一个阶段，来自脚本的 `phase("…")` 标记。 */
export interface DynamicWorkflowRunPhaseView {
  /** 作者写下的原词；`run-launched.phaseNames` 与 `phase-entered.name` 用的是同一张词表。 */
  name: string;
  state: DynamicWorkflowRunPhaseState;
  /** 进出过几个来回（同名再入一次就 +1）。`ahead` 永远是 0，其余至少是 1。 */
  rounds: number;
  /** 在这个阶段出生的节点里，已结算的有几条、还在跑的有几条。 */
  nodesSettled: number;
  nodesRunning: number;
  /** **最后一次**进入的时刻，以及那一次的离开时刻（出现在下一个异名 `phase-entered` 上）。为什么取 最后一次而不是第一次：一个被回边绕了三圈的阶段，读者真正想问的是「这一圈进来多久了」。当前阶段 没有离开时刻；事件缺时间戳时两个字段一起缺席。 */
  enteredAt?: number;
  exitedAt?: number;
}

// ③ 健康：run 整体还有没有在动

/** run 级的并发现状：现在被压到多少、按理该是多少，以及成因从何时开始。 **只有 `effective < cap` 时整个对象才出现**（缺席规则与详情面的 `maxConcurrency` 相同）：跑满自己 那条界的 run 没什么可讲，它出现就说明「正被限着」。 */
export interface DynamicWorkflowRunConcurrencyHealth {
  /** 治理器此刻真正放行的数，等于共享闸门与 {@link cap} 中的较小者。 */
  effective: number;
  /** **本 run 专属**的上界：用户定过就用那个数，没定过才用本机天花板。 特意不把天花板报出来：以 `max_concurrency: 3` 启动的 run 放在六核机器上，会一直显示成「3/6」， 读起来像被限流，可它正跑在用户亲手定下的界上——那条界是设定，不是故障。 */
  cap: number;
  /** 触发最后那条 `concurrency-changed` 的缘由（`rate_limited` / `recovered` …）。 */
  reason?: string;
  /** 那条事件落库于何时；没有时间戳就缺席。 */
  since?: number;
}

/** run 整体的动静：还在往前推，还是已经停在原地。 */
export interface DynamicWorkflowRunHealth {
  /** 全 run 上最后一条进度类事件落在什么时候。 */
  lastProgressAt?: number;
  /** 最后一条 `run-stalled` 的时刻，前提是它之后**再没有**任何进度类事件。「等槽位」不能算进度—— 那段等待本身就是停滞，算进去就永远看不到停滞。 */
  stalledSince?: number;
  concurrency?: DynamicWorkflowRunConcurrencyHealth;
  /** 按结算顺序**结尾处连续**失败的 ask 数：连挂 3 次与散落 3 次是两种不同的处境。 */
  consecutiveFailures: number;
  /** 命中完结缓存（`node-settled { cached: true }`）而完成结算的条数。 */
  cachedSteps: number;
  /** **只在终态 run 上**：仍标着 `running` 的节点行数——进程就是死在它们下面的。为 0 时缺席。 */
  leftoverRunning?: number;
  // 这一次读**有没有能力**回答「是否存在等问题答案的问题」。 停驻问题只存在于提问进程的内存中（见 {@link DynamicWorkflowRunDetail.pendingQuestions}）；
  // 因此在读 另一个进程名下在飞的 run 时，「没有待答问题」和「不知道」看上去一模一样——可对模型来说，这两者导向 完全不同的下一步。
  // 它取真值的条件是：本会话手里有这个 run 的注册表条目，或者 run 已经终态（终态 run 按定义不再有听者）。
  // 取假值时 `pendingQuestions` 整字段缺席，也不会有任何子代理被报成 `parked`。
  pendingQuestionsKnown: boolean;
}
