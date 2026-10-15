// SPDX-License-Identifier: Apache-2.0
// `<summary>` 生成器：把快照压成一句话。确定性——同输入必同句，全程无模型参与。
// 两条硬规矩：① 超预算先从尾巴整句扔（前两句是骨头，永远留），真扔不动才硬切加省略号；
// ② 没有的事实不编——没时刻就不写年龄，查不到停驻表就把「查不到」说出来。

import type { GetWorkflowRunOutput } from "@knorvia/contracts";
import { GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS } from "@knorvia/contracts";
import { readWorkflowSummaryClause } from "./get-workflow-run-summary-clauses.js";

/** 拼摘要所依据的事实面 = 整份输出摘掉摘要自身。 */
type SummaryFacts = Omit<GetWorkflowRunOutput, "summary">;

/** 没有下一步动作的三种状态（与端口终态判定一致）。 */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["completed", "errored", "stopped"]);

const ELLIPSIS = "…"; // 硬切收尾符号（占一格）
const JOIN = " "; // 句间分隔

type Contribution = {
  essential: boolean; // 骨头句：任何预算下都不许扔
  read: (run: SummaryFacts, clock: number, terminal: boolean) => string | undefined;
};

function fromClause(
  kind: "questions" | "progress" | "failure" | "deliverable" | "ownership",
): Contribution["read"] {
  return (run) => readWorkflowSummaryClause(kind, run);
}

// 七条贡献按读者关心的顺序排：在哪 → 走多远 → 出过事吗 → 谁在等 → 动过吗 → 交付物 → 归属。
const CONTRIBS: readonly Contribution[] = [
  {
    essential: true,
    read: (run, clock, terminal) => `${readWorkflowSummaryClause("status", run, clock, terminal)!}${readWorkflowSummaryClause("phase", run)!}.`,
  },
  {
    essential: true,
    read: (run, _clock, terminal) => `${readWorkflowSummaryClause("steps", run, 0, terminal)!}.`,
  },
  { essential: false, read: fromClause("failure") },
  { essential: false, read: fromClause("questions") },
  {
    essential: false,
    // progress 子句要读时钟（相对年龄）且终态下整句抑制——fromClause 的无参形态不够
    read: (run, clock, terminal) => readWorkflowSummaryClause("progress", run, clock, terminal),
  },
  { essential: false, read: fromClause("deliverable") },
  { essential: false, read: fromClause("ownership") },
];

export function buildWorkflowRunSummary(run: SummaryFacts): string {
  const clock = run.generatedAt;
  const terminal = TERMINAL_STATUSES.has(run.status);
  const picked: string[] = [];
  let essentials = 0;
  for (const contribution of CONTRIBS) {
    const line = contribution.read(run, clock, terminal);
    if (line === undefined) continue;
    picked.push(line);
    if (contribution.essential) essentials += 1;
  }
  return clampToBudget(picked, essentials);
}

/**
 * 预算裁剪：先用整段 join 的长度说话（这一步的长度错误不许被裁句动作吞掉——独立极限探针钉住），
 * 然后从尾句开始整句扔，扔到只剩骨头句；仍超预算才切片补省略号。
 */
function clampToBudget(sentences: readonly string[], essentials: number): string {
  const whole = sentences.join(JOIN);
  let span = whole.length;
  let kept = sentences.length;
  while (kept > essentials && span > GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS) {
    kept -= 1;
    span -= sentences[kept]!.length + JOIN.length;
  }
  const keptText = whole.slice(0, span);
  if (span <= GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS) return keptText;
  return `${keptText.slice(0, GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS - ELLIPSIS.length)}${ELLIPSIS}`;
}
