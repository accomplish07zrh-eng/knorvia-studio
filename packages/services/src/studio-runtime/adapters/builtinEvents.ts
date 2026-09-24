import type { KnorviaStreamEvent, KnorviaPermissionOption } from "@knorvia/shared";
import type {
  StudioKernelAnswer,
  StudioKernelEvent,
  StudioKernelInteraction,
} from "../kernelTypes.js";

function printable(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function builtinOutput(event: KnorviaStreamEvent): StudioKernelEvent | undefined {
  switch (event.type) {
    case "agent_message_chunk":
      return !event.parentToolUseId ? { type: "text", text: event.content } : undefined;
    case "agent_thought_chunk":
      return !event.parentToolUseId ? { type: "reasoning", text: event.content } : undefined;
    case "tool_call":
      return {
        type: "tool",
        id: event.toolId,
        name: event.toolName ?? event.kind,
        state: "running",
        input: printable(event.input),
      };
    case "tool_call_update":
      return {
        type: "tool",
        id: event.toolId,
        name: event.toolName ?? event.kind ?? "Tool",
        state:
          event.status === "completed"
            ? "succeeded"
            : ["failed", "denied", "stopped"].includes(event.status)
              ? "failed"
              : "running",
        input: printable(event.input),
        output: event.error ?? printable(event.content),
      };
    case "task_complete":
      return event.usage
        ? {
            type: "usage",
            inputTokens: event.usage.inputTokens,
            outputTokens: event.usage.outputTokens,
          }
        : undefined;
    default:
      return undefined;
  }
}

export function builtinPermissionChoices(options: KnorviaPermissionOption[]): string[] {
  const choices: string[] = [];
  if (options.some((option) => option.kind === "allow_once")) choices.push("allow-once");
  if (options.some((option) => option.kind === "allow_session")) choices.push("allow-session");
  if (options.some((option) => option.response.decision === "deny")) choices.push("deny");
  return choices;
}

export function builtinPermissionOption(
  options: KnorviaPermissionOption[],
  answer: StudioKernelAnswer,
): KnorviaPermissionOption {
  const option = options.find((candidate) =>
    answer.decision === "deny"
      ? candidate.response.decision === "deny"
      : candidate.kind ===
        (answer.decision === "allow-once"
          ? "allow_once"
          : answer.decision === "allow-session"
            ? "allow_session"
            : ""),
  );
  // 项目永久授权不能冒充会话授权；未知答案不能静默提高权限。
  if (!option) throw new Error("Knorvia does not support the selected approval scope.");
  return option;
}

export function builtinQuestion(
  event: Extract<KnorviaStreamEvent, { type: "elicitation_request" }>,
): StudioKernelInteraction {
  const questions = event.questions?.length
    ? event.questions
    : [
        {
          question: event.message,
          header: event.header ?? "",
          options: event.options,
          multiSelect: event.multiSelect,
        },
      ];
  return {
    id: event.requestId,
    kind: "question",
    title: event.message,
    questions: questions.map((question, index) => ({
      id: `answer_${index}`,
      title: question.question,
      options: question.options.map((option) => option.label),
      multiple: question.multiSelect,
    })),
  };
}

export function builtinQuestionContent(
  event: Extract<KnorviaStreamEvent, { type: "elicitation_request" }>,
  answer: StudioKernelAnswer,
): Record<string, unknown> {
  const questions = event.questions?.length
    ? event.questions
    : [
        {
          question: event.message,
          header: event.header ?? "",
          options: event.options,
          multiSelect: event.multiSelect,
        },
      ];
  const content: Record<string, unknown> = {};
  const answers: Record<string, string> = {};
  questions.forEach((question, index) => {
    const selected = answer.answers?.[`answer_${index}`] ?? [];
    if (!question.multiSelect && selected.length > 1)
      throw new Error("This question accepts one answer.");
    if (!selected.length) return;
    const values = selected.map(
      (value) => question.options.find((option) => option.label === value)?.value ?? value,
    );
    answers[question.question] = values.join(", ");
    content[`answer_${index}`] = question.multiSelect ? values : values[0];
    if (questions.length === 1) content.answer = question.multiSelect ? values : values[0];
  });
  return { ...content, answers };
}
