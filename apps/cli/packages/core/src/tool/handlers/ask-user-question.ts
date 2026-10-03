// ============================================================
// AskUserQuestion Tool Handler
// ============================================================

import {
  ASK_USER_QUESTION_TOOL_NAME,
  AskUserQuestionInputJsonSchema,
  AskUserQuestionInputSchema,
  AskUserQuestionOutputJsonSchema,
  AskUserQuestionOutputSchema,
} from "@knorvia/contracts";
import type { ToolEntry } from "../types.js";
import { executeAnsweredQuestion } from "./ask-user-question-result.js";
import { renderAnsweredQuestion } from "./ask-user-question-narration.js";

const MAX_ASK_USER_QUESTION_MODEL_BYTES = 100_000;

const ASK_USER_QUESTION_DESCRIPTION =
  [
    "Use this tool only when you are blocked on a decision that is genuinely the user's to make: one you cannot resolve from the request, the code, or sensible defaults.",
    "",
    "Usage notes:",
    '- Users will always be able to select "Other" to provide custom text input',
    "- Use multiSelect: true to allow multiple answers to be selected for a question",
    '- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label',
    "",
    'Plan mode note: To switch into plan mode, use EnterPlanMode (not this tool). Once in plan mode, use this tool to clarify requirements or choose between approaches BEFORE finalizing your plan. Do NOT use this tool to ask "Is my plan ready?", "Should I proceed?", or otherwise reference "the plan" in questions — the user cannot see the plan until you call ExitPlanMode for approval.',
    "",
    "Reserve this for decisions where the user's answer changes what you do next — not for choices with a conventional default or facts you can verify in the codebase yourself. In those cases pick the obvious option, mention it in your response, and proceed.",
    "",
    "Preview feature:",
    "Use the optional `preview` field on options when presenting concrete artifacts that users need to visually compare:",
    "- ASCII mockups of UI layouts or components",
    "- Code snippets showing different implementations",
    "- Diagram variations",
    "- Configuration examples",
    "",
    "Preview content is rendered as markdown in a monospace box. Multi-line text with newlines is supported. When any option has a preview, the UI switches to a side-by-side layout with a vertical option list on the left and preview on the right. Do not use previews for simple preference questions where labels and descriptions suffice. Note: previews are only supported for single-select questions (not multiSelect).",
  ].join("\n") + "\n";

export const askUserQuestionToolEntry: ToolEntry = {
  capability:
    "Ask the user multiple-choice clarification questions and continue with their answers",
  requiresUserInteraction: true,
  metadata: {
    name: ASK_USER_QUESTION_TOOL_NAME,
    description: ASK_USER_QUESTION_DESCRIPTION,
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    requiresUserInteraction: true,
    timeoutMs: 30000,
    maxOutputBytes: MAX_ASK_USER_QUESTION_MODEL_BYTES,
    sideEffectScope: "userInteraction",
    riskLevel: "low",
    needsApproval: true,
  },
  handler: executeAnsweredQuestion,
  formatModelContent: renderAnsweredQuestion,
  inputSchema: AskUserQuestionInputJsonSchema,
  outputSchema: AskUserQuestionOutputJsonSchema,
  runtimeInputSchema: AskUserQuestionInputSchema,
  runtimeOutputSchema: AskUserQuestionOutputSchema,
  permission: {
    permission: "userInteraction.askQuestion",
    reason: "AskUserQuestion pauses execution to collect answers from the user",
    riskLevel: "low",
    sideEffectScope: "userInteraction",
    needsApproval: true,
    patternSources: ["toolName", "input"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_ASK_USER_QUESTION_MODEL_BYTES,
    maxModelBytes: MAX_ASK_USER_QUESTION_MODEL_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: MAX_ASK_USER_QUESTION_MODEL_BYTES,
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
    userVisibleMessage: "AskUserQuestion was cancelled before answers were returned",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
