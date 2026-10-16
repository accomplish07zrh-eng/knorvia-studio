// SPDX-License-Identifier: Apache-2.0
// 端口视图 → 契约投影：phases/subagents（含 ask/wait 子投影）/health 三组只读投影。
// 纪律（B-gr）：缺席即不造键（undefined 不展开成字段）、截断按切片比较、零 leftover 不出字段。
// 三函数纯投影：同输入同输出、无副作用、不抛错。

import type {
  DynamicWorkflowRunHealth,
  DynamicWorkflowRunPhaseView,
  DynamicWorkflowRunSubagentAsk,
  DynamicWorkflowRunSubagentView,
  DynamicWorkflowRunSubagentWait,
  GetWorkflowRunHealth,
  GetWorkflowRunPhase,
  GetWorkflowRunSubagent,
  GetWorkflowRunSubagentAsk,
} from "@knorvia/contracts";
import { GET_WORKFLOW_RUN_ROSTER_LIMITS } from "@knorvia/contracts";

/** 只把定义了的键收进对象：缺席字段不展开成 `undefined` 键。 */
function pickDefined(entries: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}

export function toGetWorkflowRunPhases(
  phases: readonly DynamicWorkflowRunPhaseView[] | undefined,
): GetWorkflowRunPhase[] | undefined {
  if (phases === undefined || phases.length === 0) return undefined;
  const cap = GET_WORKFLOW_RUN_ROSTER_LIMITS.maxPhases;
  return phases.slice(0, cap).map((phase) =>
    pickDefined({
      name: phase.name, // 阶段名
      state: phase.state, // 阶段状态
      rounds: phase.rounds, // 轮数
      nodesSettled: phase.nodesSettled, // 已结算节点
      nodesRunning: phase.nodesRunning, // 在飞节点
      enteredAt: phase.enteredAt,
      exitedAt: phase.exitedAt,
    }),
  ) as GetWorkflowRunPhase[];
}

function projectAsk(ask: DynamicWorkflowRunSubagentAsk): GetWorkflowRunSubagentAsk {
  const lastTool = ask.lastTool;
  return pickDefined({
    siteId: ask.siteId, // 场地 id
    ordinal: ask.ordinal, // 场内序号
    actorSeq: ask.actorSeq,
    instructionsHead: ask.instructionsHead,
    startedAt: ask.startedAt,
    turn: ask.turn,
    toolCalls: ask.toolCalls,
    lastTool:
      lastTool === undefined
        ? undefined
        : pickDefined({ name: lastTool.name, target: lastTool.target, at: lastTool.at }),
  }) as GetWorkflowRunSubagentAsk;
}

function projectWait(
  wait: DynamicWorkflowRunSubagentWait,
): NonNullable<GetWorkflowRunSubagent["wait"]> {
  return pickDefined({
    cause: wait.cause, // 等待原因类别
    reason: wait.reason,
    retryAfterMs: wait.retryAfterMs,
    since: wait.since,
  }) as NonNullable<GetWorkflowRunSubagent["wait"]>;
}

export function toGetWorkflowRunSubagents(subagents: readonly DynamicWorkflowRunSubagentView[]): {
  subagents: GetWorkflowRunSubagent[];
  truncated: boolean;
} {
  const cap = GET_WORKFLOW_RUN_ROSTER_LIMITS.maxSubagents;
  const projected = subagents.slice(0, cap).map((actor) =>
    pickDefined({
      siteId: actor.siteId,
      ordinal: actor.ordinal,
      name: actor.name,
      state: actor.state,
      phaseName: actor.phaseName,
      currentAsk: actor.currentAsk === undefined ? undefined : projectAsk(actor.currentAsk),
      wait: actor.wait === undefined ? undefined : projectWait(actor.wait),
      parkedOn: actor.parkedOn,
      stepsSettled: actor.stepsSettled,
      stepsFailed: actor.stepsFailed,
      tokens: actor.tokens,
      lastProgressAt: actor.lastProgressAt,
    }),
  ) as GetWorkflowRunSubagent[];
  return { subagents: projected, truncated: projected.length < subagents.length };
}

export function toGetWorkflowRunHealth(health: DynamicWorkflowRunHealth): GetWorkflowRunHealth {
  const concurrency = health.concurrency;
  const leftover = health.leftoverRunning;
  return pickDefined({
    lastProgressAt: health.lastProgressAt,
    stalledSince: health.stalledSince,
    concurrency:
      concurrency === undefined
        ? undefined
        : pickDefined({
            effective: concurrency.effective,
            cap: concurrency.cap,
            reason: concurrency.reason,
            since: concurrency.since,
          }),
    consecutiveFailures: health.consecutiveFailures, // 连续失败
    cachedSteps: health.cachedSteps, // 缓存步数
    leftoverRunning: leftover !== 0 ? leftover : undefined, // 零残留不出字段
    pendingQuestionsKnown: health.pendingQuestionsKnown, // 停驻表可知性
  }) as GetWorkflowRunHealth;
}
