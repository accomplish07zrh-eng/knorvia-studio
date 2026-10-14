// SPDX-License-Identifier: Apache-2.0
// workflowRuns 归约的 run-started 分支：把一条 run 拉回 running，并清掉上一世的结算残影。
// 同一个 runId 可能再次收到 run-started（进程内 cancel → resume 的重臂）。原样展开会让上一世
// 的结算残影（error / resultPreview / 停驻问题 / resumable / stopReason）挂在一个 running 的
// run 上，因此这条事件要把它们剥净。concurrency 与 subagentModel 不在剥除之列：前者是这个 run
// 跑在什么并发下的事实（共享桶那侧甚至是进程级现状），后者是用户给这次 run 定下的条件，resume
// 重臂会带同一个值。lineage 指针随载荷到达，读不出就沿用已知值。
import { reduceRunStartedConcurrency } from "./workflow-runs-concurrency.js";
import { readRunIdField } from "./workflow-runs-lineage.js";
import { WORKFLOW_RUNS_LIMITS, type WorkflowRunState } from "./workflow-runs.js";

// 上一世结算后残留、run-started 必须剥除的键。
const SETTLED_RESIDUE = [
  "error",
  "resultPreview",
  "pendingQuestions",
  "resumable",
  "stopReason",
] as const;

// 载荷上的子代理模型（providerId/modelId[$reasoningLevel]）。超界整条丢弃而不是截断：一个被
// 砍短的模型 id 是假话，宁可什么都不显示。
function acceptSubagentModel(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const label = raw.trim();
  const usable = label.length > 0 && label.length <= WORKFLOW_RUNS_LIMITS.maxSubagentModelLength;
  return usable ? label : undefined;
}

// 把 run 摊成一份不含结算残影的基底，再按载荷回到 running、归零用量并更新本 run 自己的条件。
export function reduceRunStarted(
  current: WorkflowRunState,
  incoming: Record<string, unknown>,
): WorkflowRunState {
  const base = { ...current } as Record<string, unknown>;
  for (const residue of SETTLED_RESIDUE) delete base[residue];

  // lineage 指针与子代理模型：载荷读得出就用载荷，读不出退回已知值（老 CLI 少发是退化）。
  const lineage = readRunIdField(incoming.resumedFrom) ?? current.resumedFrom;
  const agentModel = acceptSubagentModel(incoming.subagentModel) ?? current.subagentModel;

  const restarted: Record<string, unknown> = { ...base };
  restarted.status = "running";
  restarted.usage = { spentTokens: 0, nodesUsed: 0 };
  if (lineage !== undefined) restarted.resumedFrom = lineage;
  if (agentModel !== undefined) restarted.subagentModel = agentModel;

  // 并发（含本 run 的 limit、天花板）交给并发分支按载荷归约，规则见 workflow-runs-concurrency。
  return reduceRunStartedConcurrency(restarted as WorkflowRunState, incoming);
}
