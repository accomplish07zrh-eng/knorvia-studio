// ============================================================
// Plan Mode Tool Handlers
// ============================================================

import {
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  EnterPlanModeInputJsonSchema,
  EnterPlanModeInputSchema,
  EnterPlanModeOutputJsonSchema,
  EnterPlanModeOutputSchema,
  ExitPlanModeInputJsonSchema,
  ExitPlanModeInputSchema,
  ExitPlanModeOutputJsonSchema,
  ExitPlanModeOutputSchema,
  type ToolPermissionSpec,
} from "@knorvia/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";
import {
  ENTER_PLAN_MODE_PROVIDER_DESCRIPTION,
  createEnterPlanModeProviderDescription,
  EXIT_PLAN_MODE_MODEL_INSTRUCTIONS,
} from "./plan-mode-prompts.js";

import { executePlanMode } from "./plan-mode-operation.js";
import {
  formatEnterPlanModeModelContent,
  formatExitPlanModeModelContent,
} from "./plan-mode-projection.js";

const MAX_PLAN_MODE_MODEL_BYTES = 100_000;

const EXIT_PLAN_MODE_DESCRIPTION = EXIT_PLAN_MODE_MODEL_INSTRUCTIONS[0];

const enterPlanModeHandler: ToolHandler = (input, context) =>
  executePlanMode("enter", input, context);
const exitPlanModeHandler: ToolHandler = (input, context) =>
  executePlanMode("exit", input, context);

export const enterPlanModeToolEntry: ToolEntry = {
  capability: "Enter read-only planning mode before implementation",
  requiresUserInteraction: false,
  metadata: {
    name: ENTER_PLAN_MODE_TOOL_NAME,
    description: ENTER_PLAN_MODE_PROVIDER_DESCRIPTION,
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    requiresUserInteraction: false,
    timeoutMs: 30000,
    maxOutputBytes: MAX_PLAN_MODE_MODEL_BYTES,
    sideEffectScope: "session",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: enterPlanModeHandler,
  formatModelContent: formatEnterPlanModeModelContent,
  inputSchema: EnterPlanModeInputJsonSchema,
  outputSchema: EnterPlanModeOutputJsonSchema,
  runtimeInputSchema: EnterPlanModeInputSchema,
  runtimeOutputSchema: EnterPlanModeOutputSchema,
  permission: planModePermission("plan.enter", "EnterPlanMode changes session mode to plan", false),
  resultBudget: planModeResultBudget(),
  timeout: planModeTimeout(),
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "EnterPlanMode was cancelled before plan mode was entered",
  },
  trace: planModeTracePolicy(),
};

export function createEnterPlanModeToolEntry(
  options: {
    embeddedSearchEnabled?: boolean;
  } = {},
): ToolEntry {
  return {
    ...enterPlanModeToolEntry,
    metadata: {
      ...enterPlanModeToolEntry.metadata,
      description: createEnterPlanModeProviderDescription(options),
    },
  };
}

export const exitPlanModeToolEntry: ToolEntry = {
  capability: "Request user approval for the plan and exit planning mode before coding",
  requiresUserInteraction: true,
  metadata: {
    name: EXIT_PLAN_MODE_TOOL_NAME,
    description: EXIT_PLAN_MODE_DESCRIPTION,
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    requiresUserInteraction: true,
    timeoutMs: 30000,
    maxOutputBytes: MAX_PLAN_MODE_MODEL_BYTES,
    sideEffectScope: "session",
    riskLevel: "low",
    needsApproval: true,
  },
  handler: exitPlanModeHandler,
  formatModelContent: formatExitPlanModeModelContent,
  inputSchema: ExitPlanModeInputJsonSchema,
  outputSchema: ExitPlanModeOutputJsonSchema,
  runtimeInputSchema: ExitPlanModeInputSchema,
  runtimeOutputSchema: ExitPlanModeOutputSchema,
  permission: planModePermission(
    "plan.exit",
    "ExitPlanMode changes session mode after user plan approval",
  ),
  resultBudget: planModeResultBudget(),
  timeout: planModeTimeout(),
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "ExitPlanMode was cancelled before plan mode was exited",
  },
  trace: planModeTracePolicy(),
};

function planModePermission(
  permission: string,
  reason: string,
  needsApproval = true,
): ToolPermissionSpec {
  return {
    permission,
    reason,
    riskLevel: "low" as const,
    sideEffectScope: "session" as const,
    needsApproval,
    patternSources: ["toolName", "input"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk" as const,
  };
}

function planModeResultBudget() {
  return {
    maxInlineBytes: MAX_PLAN_MODE_MODEL_BYTES,
    maxModelBytes: MAX_PLAN_MODE_MODEL_BYTES,
    strategy: "truncate" as const,
    preview: {
      maxBytes: MAX_PLAN_MODE_MODEL_BYTES,
      direction: "head" as const,
    },
  };
}

function planModeTimeout() {
  return {
    defaultMs: 30000,
    maxMs: 30000,
    allowCallOverride: false,
  };
}

function planModeTracePolicy() {
  return {
    required: true as const,
    propagateToAdapters: false,
    recordInput: "summary" as const,
    recordOutput: "summary" as const,
  };
}
