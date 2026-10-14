// SPDX-License-Identifier: Apache-2.0
// 排程汇总的渲染：按相位过滤活动与节点，渲染成「节点段 + 活动段」两段。
import { PROMPT_TEXTS } from "./prompts.text.js";
import { BLANK, DASH, type Lines, type Run, type Text } from "./prompts-sections.js";

/** 活动行：nodeId 优先于 activityId 作标签；工件与错误作为后缀追加。 */
const activityRow = (entry: Run["activities"][number]): Text => {
  const artifact = entry.artifactPath;
  const failure = entry.error;
  const detail = (artifact ? ` (${artifact})` : "") + (failure ? ` error=${failure}` : "");
  return `${DASH}${entry.nodeId ?? entry.activityId}: ${entry.status}${detail}`;
};

/** 节点行：尝试次数与错误作为后缀，缺省时不显示。 */
const nodeRow = (entry: Run["graph"]["nodes"][number]): Text => {
  const attempts = entry.attempts;
  const failure = entry.error;
  const detail = (attempts ? ` attempts=${attempts}` : "") + (failure ? ` error=${failure}` : "");
  return `${DASH}${entry.id}: ${entry.status}${detail}`;
};

/** 汇总段落对：节点段与活动段；空态用固定文案，避免出现空标题段。 */
const summarySections = (run: Run, phaseName: string): readonly (readonly [Text, Lines])[] => {
  const nodes = run.graph.nodes
    .filter((entry) => entry.phase === phaseName || entry.kind === "task")
    .map(nodeRow);
  const activities = run.activities.filter((entry) => entry.phase === phaseName).map(activityRow);
  const nodeLines = nodes.length === 0 ? [PROMPT_TEXTS.noScheduledNodes] : nodes;
  const activityLines = activities.length === 0 ? [PROMPT_TEXTS.noActivities] : activities;
  return [
    ["## Nodes", nodeLines],
    ["## Activities", activityLines],
  ];
};

export function buildScheduledPhaseSummary(run: Run, phaseName: string): Text {
  const rows: Text[] = [`# ${phaseName} ` + PROMPT_TEXTS.schedulerSummaryTitle, BLANK];
  rows.push(`Run: ${run.runId}`, `Status: ${run.status}`, `Updated: ${run.updatedAt}`);
  for (const [heading, content] of summarySections(run, phaseName)) {
    rows.push(BLANK, heading, BLANK, ...content);
  }
  rows.push(BLANK);
  return rows.join("\n");
}
