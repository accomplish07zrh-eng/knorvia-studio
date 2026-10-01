// Retained Skill declaration and model-facing prompt. Execution is replaced
// from the frozen behavioral contract; source exposure is disclosed in the spec.

import {
  SkillInputJsonSchema,
  SkillInputSchema,
  SkillOutputJsonSchema,
  SkillOutputSchema,
} from "@knorvia/contracts";
import type { ToolEntry } from "../types.js";
import { executeSkill, SKILL_CONTENT_LIMIT } from "./skill-execution.js";

export const skillToolEntry: ToolEntry = {
  capability: "Load local skill instructions into the current session context",
  metadata: {
    name: "Skill",
    description: `Execute a skill within the main conversation

When users ask you to perform tasks, check if any of the available skills match. Skills provide specialized capabilities and domain knowledge.

When users reference a "slash command" or "/<something>", they are referring to a skill. Use this tool to invoke it.

How to invoke:
- Set \`skill\` to the exact name of an available skill (no leading slash). For plugin-namespaced skills use the fully qualified \`plugin:skill\` form.
- Set \`args\` to pass optional arguments.

Important:
- Available skills are listed in system-reminder messages in the conversation
- Only invoke a skill that appears in that list, or one the user explicitly typed as \`/<name>\` in their message. Never guess or invent a skill name from training data; otherwise do not call this tool
- When a skill matches the user's request, this is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about the task
- NEVER mention a skill without actually calling this tool
- Do not invoke a skill that is already running
- Do not use this tool for built-in CLI commands (like /help, /clear, etc.)
- If you see a <command-name> tag in the current conversation turn, the skill has ALREADY been loaded - follow the instructions directly instead of calling this tool again
`,
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: 30000,
    maxOutputBytes: SKILL_CONTENT_LIMIT,
    sideEffectScope: "session",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: executeSkill,
  inputSchema: SkillInputJsonSchema,
  outputSchema: SkillOutputJsonSchema,
  runtimeInputSchema: SkillInputSchema,
  runtimeOutputSchema: SkillOutputSchema,
  permission: {
    permission: "skill",
    reason: "Skill loads local instructions into session context",
    riskLevel: "low",
    sideEffectScope: "session",
    needsApproval: false,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: SKILL_CONTENT_LIMIT,
    maxModelBytes: SKILL_CONTENT_LIMIT,
    strategy: "truncate",
    preview: {
      maxBytes: SKILL_CONTENT_LIMIT,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: 30000,
    maxMs: 30000,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "Skill loading was cancelled before content was returned",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
