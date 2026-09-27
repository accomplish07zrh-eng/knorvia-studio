// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ToolResultDisplayPayload } from "@knorvia/contracts";
import { createBashResultDisplay } from "./bash-result-display.js";
import { createCreateWorkflowDisplay } from "./create-workflow-display.js";
import { createWorkflowObservationDisplay } from "./workflow-observation-display.js";
import { computerAction, createComputerCard } from "./display/computer-card.js";
import { createDiffCard } from "./display/diff-card.js";
import { createMcpToolDisplay, type McpDisplayMetadata } from "./display/mcp-card.js";
import { createReplCard } from "./display/repl-card.js";
import { taskCardProjectors } from "./display/task-cards.js";

export { createCreateWorkflowDisplay, createMcpToolDisplay };
export { MAX_NODE_REPL_DISPLAY_IMAGE_BASE64_BYTES } from "./display/repl-card.js";

type OutputProjector = (output: unknown) => ToolResultDisplayPayload | undefined;
interface DisplayOptions {
  officialCua?: boolean;
  mcp?: McpDisplayMetadata;
}
const candidates = [createReplCard, createCreateWorkflowDisplay, createWorkflowObservationDisplay];

function primaryProjector(name: string, options?: DisplayOptions): OutputProjector | undefined {
  if (name === "Bash") return createBashResultDisplay;
  const action = computerAction(name);
  if (!action) return;
  const trusted = options?.officialCua === true;
  return (output) => createComputerCard(action, output, trusted);
}

export function createToolResultDisplay(
  name: string,
  output: unknown,
  options?: DisplayOptions,
): ToolResultDisplayPayload | undefined {
  const primary = primaryProjector(name, options);
  if (primary) return primary(output);
  // 候选路由可交还结果；终止路由的 undefined 是最终结论，不能误走文件差异后备。
  for (const project of candidates) {
    const card = project(name, output);
    if (card) return card;
  }
  if (options?.mcp) return createMcpToolDisplay(options.mcp, output);
  const project = taskCardProjectors.get(name) ?? createDiffCard;
  return project(output);
}
