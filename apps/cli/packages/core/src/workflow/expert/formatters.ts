// SPDX-License-Identifier: Apache-2.0
// 专家工作流的状态/完成度文本渲染：纯函数，输出格式是用户可见契约（逐字保持）。
import type { ExpertWorkflowRunSnapshot } from "@knorvia/contracts";

type Snapshot = ExpertWorkflowRunSnapshot;
type PhaseEntry = Snapshot["phases"][number];

/** 阶段状态 → 行首标记；未列出的状态用中性标记。 */
const PHASE_MARKERS: Readonly<Record<string, string>> = Object.freeze({
  active: ">",
  completed: "[x]",
});
const NEUTRAL_MARKER = "-";

function markerFor(state: PhaseEntry["status"]): string {
  return PHASE_MARKERS[state] ?? NEUTRAL_MARKER;
}

/** 活动/会话与错误各自成段，拼成阶段行尾的括号与竖线部分。 */
function suffixFor(entry: PhaseEntry): string {
  const runParts: string[] = [];
  if (entry.activityId !== undefined) runParts.push(`activity ${entry.activityId}`);
  if (entry.sessionId !== undefined) runParts.push(`session ${entry.sessionId}`);
  const runText = runParts.length === 0 ? "" : ` | ${runParts.join(" | ")}`;
  return `${runText}${entry.error === undefined ? "" : ` (${entry.error})`}`;
}

export function formatExpertWorkflowStatus(record: Snapshot): string {
  const header = [
    `Expert workflow ${record.runId}`,
    `Status: ${record.status}`,
    `Task: ${record.task}`,
    `Directory: ${record.cwd}`,
    `Updated: ${record.updatedAt}`,
    "",
    "Phases:",
  ];
  const phaseLines = record.phases.map(
    (entry) => `  ${markerFor(entry.status)} ${entry.phase}: ${entry.status}${suffixFor(entry)}`,
  );
  const footer = record.reportPath === undefined ? [] : ["", `Report: ${record.reportPath}`];
  return [...header, ...phaseLines, ...footer].join("\n");
}

export function formatExpertWorkflowCompletion(record: Snapshot): string {
  const head = [`Expert workflow ${record.runId} ${record.status}.`, `Task: ${record.task}`];
  const report = record.reportPath === undefined ? [] : [`Report: ${record.reportPath}`];
  return [...head, ...report].join("\n");
}
