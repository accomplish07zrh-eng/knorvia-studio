import {
  RESPOND_TO_COORDINATOR_TOOL_NAME,
  RespondToCoordinatorInputJsonSchema,
  RespondToCoordinatorInputSchema,
  RespondToCoordinatorOutputSchema,
} from "@knorvia/contracts";
import type { ToolEntry } from "../types.js";
import { respondToCoordinator } from "./collaboration-invocation.js";
import { coordinatorResponseModelContent } from "./collaboration-result.js";

const MAX_RESPOND_TO_COORDINATOR_MODEL_BYTES = 4_096;

const RESPOND_TO_COORDINATOR_PROVIDER_OUTPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    success: { type: "boolean" },
    message: { type: "string" },
  },
  required: ["success", "message"],
  additionalProperties: false,
};

export const respondToCoordinatorToolEntry: ToolEntry = {
  capability: "Respond to the coordinator that owns this subagent",
  metadata: {
    name: RESPOND_TO_COORDINATOR_TOOL_NAME,
    description: "Respond to the coordinator that owns this subagent.",
    modelInstructions: [
      'When you receive "The coordinator sent a message while you were working:" (or the legacy "Message from coordinator:" prefix), use this tool to answer it.',
      "Use this tool for a concise response or progress update to the coordinator.",
      "When replying while work remains, do not use assistant text as the reply.",
      "Place this call before or alongside the next work tool call when possible.",
      "Continue the current task unless the coordinator explicitly changed or ended it.",
      "Do not use this tool as a substitute for the final task result.",
    ],
    allowedInPlanMode: true,
    readOnly: false,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: 10_000,
    maxOutputBytes: MAX_RESPOND_TO_COORDINATOR_MODEL_BYTES,
    sideEffectScope: "session",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: respondToCoordinator,
  formatModelContent: coordinatorResponseModelContent,
  inputSchema: RespondToCoordinatorInputJsonSchema,
  outputSchema: RESPOND_TO_COORDINATOR_PROVIDER_OUTPUT_SCHEMA,
  runtimeInputSchema: RespondToCoordinatorInputSchema,
  runtimeOutputSchema: RespondToCoordinatorOutputSchema,
  permission: {
    permission: "agent.message.respond",
    reason: "RespondToCoordinator writes a message to the parent runtime queue",
    riskLevel: "low",
    sideEffectScope: "session",
    needsApproval: false,
    patternSources: ["toolName", "input"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_RESPOND_TO_COORDINATOR_MODEL_BYTES,
    maxModelBytes: MAX_RESPOND_TO_COORDINATOR_MODEL_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: MAX_RESPOND_TO_COORDINATOR_MODEL_BYTES,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: 10_000,
    maxMs: 10_000,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "RespondToCoordinator was cancelled before delivery status returned",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
