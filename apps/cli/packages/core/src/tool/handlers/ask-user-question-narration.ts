// Exact inherited narration prose and membership behavior are retained compatibility material.
import type { AskUserQuestionOutput } from "@knorvia/contracts";

type AnswerNarration =
  | { kind: "none" }
  | { kind: "partial"; answers: string; skipped: number }
  | { kind: "complete"; answers: string };

/** Per-call string fold preserves answer-entry order without mapped parts arrays. */
function answerText(result: AskUserQuestionOutput): string {
  let text = "";
  let separator = "";
  for (const [question, answer] of Object.entries(result.answers)) {
    const annotation = result.annotations?.[question];
    text += `${separator}"${question}"="${answer}"`;
    if (annotation?.preview) text += ` selected preview:\n${annotation.preview}`;
    if (annotation?.notes) text += ` user notes: ${annotation.notes}`;
    separator = ", ";
  }
  return text;
}

function narrationOf(result: AskUserQuestionOutput): AnswerNarration {
  if (Object.keys(result.answers).length === 0) return { kind: "none" };
  const answers = answerText(result);
  // Retained sparse-slot/inherited-key membership primitive at the raw formatter boundary.
  const skipped = result.questions.filter(
    (question) => !(question.question in result.answers),
  ).length;
  return skipped > 0 ? { kind: "partial", answers, skipped } : { kind: "complete", answers };
}

/** The existing formatter is intentionally unvalidated; admission belongs to its consumer. */
export function renderAnsweredQuestion(output: unknown): string {
  const narration = narrationOf(output as AskUserQuestionOutput);
  switch (narration.kind) {
    case "none":
      return "The user did not provide answers to these questions. Continue using your best judgment; do not treat this as a rejection or invent a user preference.";
    case "partial":
      return `The user answered some questions and skipped ${narration.skipped}. Provided answers: ${narration.answers}. Continue with the provided answers and use your best judgment for the unanswered questions; do not invent user preferences.`;
    case "complete":
      return `User has answered your questions: ${narration.answers}. You can now continue with the user's answers in mind.`;
  }
}
