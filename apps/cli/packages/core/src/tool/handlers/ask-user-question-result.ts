// Exposed-source result boundary; public validation/error contracts remain applicable.
import {
  ASK_USER_QUESTION_TOOL_NAME,
  AskUserQuestionAnsweredInputSchema,
  CoreErrorType,
  createCoreError,
  type AskUserQuestionOutput,
} from "@knorvia/contracts";
import type { ToolHandler } from "../types.js";

const ANSWERS_REQUIRED = "AskUserQuestion requires user answers before execution";
type AnswerDecision =
  | { kind: "return"; value: AskUserQuestionOutput }
  | { kind: "refuse"; issues: { message: string; path: (string | number)[] }[] };

/** The shared schema owns validation; this decision neither asks nor retains answers. */
function answerDecision(input: unknown): AnswerDecision {
  const admission = AskUserQuestionAnsweredInputSchema.safeParse(input);
  if (admission.success) {
    const data = admission.data;
    const fields: [string, unknown][] = [
      ["questions", data.questions],
      ["answers", data.answers ?? {}],
    ];
    if (data.annotations) fields.push(["annotations", data.annotations]);
    return { kind: "return", value: Object.fromEntries(fields) as AskUserQuestionOutput };
  }
  const issues: Extract<AnswerDecision, { kind: "refuse" }>["issues"] = [];
  for (const issue of admission.error.issues)
    issues.push({ message: issue.message, path: issue.path });
  return { kind: "refuse", issues };
}

/** Explicit terminal effects only: return a projection or raise the existing CoreError. */
export const executeAnsweredQuestion: ToolHandler = async (input, context) => {
  const decision = answerDecision(input);
  switch (decision.kind) {
    case "return":
      return decision.value;
    case "refuse":
      throw createCoreError(CoreErrorType.ToolExecutionFailed, ANSWERS_REQUIRED, {
        context: {
          issues: decision.issues,
          toolCallId: context.toolCallId,
          toolName: ASK_USER_QUESTION_TOOL_NAME,
        },
        recoverable: true,
      });
  }
};
