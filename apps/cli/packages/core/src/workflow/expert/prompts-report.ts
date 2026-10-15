// SPDX-License-Identifier: Apache-2.0
// 运行报告的渲染：阶段、活动、工件三段，供收尾时展示与归档。
import { BLANK, DASH, type Lines, type Run, type Text } from "./prompts-sections.js";

/** 阶段行：附工件路径（若有），格式与提示词列表一致。 */
const phaseRow = (entry: Run["phases"][number]): Text => {
  const artifact = entry.artifactPath;
  return `${DASH}${entry.phase}: ${entry.status}` + (artifact ? ` (${artifact})` : "");
};

/** 活动行：会话与回合标识作为后缀，便于回溯源。 */
const activityRow = (entry: Run["activities"][number]): Text => {
  const session = entry.sessionId ? ` session=${entry.sessionId}` : "";
  const turn = entry.turnId ? ` turn=${entry.turnId}` : "";
  return `${DASH}${entry.phase}: ${entry.status} (${entry.activityId})` + session + turn;
};

/** 工件行：标签与路径成对，路径保持原样便于用户直接打开。 */
const artifactRow = (entry: Run["artifacts"][number]): Text =>
  `${DASH}${entry.label}: ${entry.path}`;

/** 报告段落对：阶段、活动、工件三段，顺序即阅读顺序。 */
const reportSections = (run: Run): readonly (readonly [Text, Lines])[] => [
  ["## Phases", run.phases.map(phaseRow)],
  ["## Activities", run.activities.map(activityRow)],
  ["## Artifacts", run.artifacts.map(artifactRow)],
];

export function buildReport(run: Run): Text {
  const rows: Text[] = ["# Workflow Report", BLANK];
  rows.push(`Run: ${run.runId}`, `Task: ${run.task}`, `Status: ${run.status}`);
  rows.push(`Directory: ${run.cwd}`, `Created: ${run.createdAt}`, `Updated: ${run.updatedAt}`);
  for (const [heading, content] of reportSections(run)) {
    rows.push(BLANK, heading, BLANK, ...content);
  }
  rows.push(BLANK);
  return rows.join("\n");
}
