import type { StudioInteraction } from "@knorvia/services";

/** Free text is a separate choice; multi-select answers retain every selected option. */
export function studioInteractionAnswers(
  questions: NonNullable<StudioInteraction["questions"]>,
  selected: Record<string, string[]>,
  custom: Record<string, string>,
): Record<string, string[]> {
  return Object.fromEntries(
    questions.map((question) => {
      const text = custom[question.id]?.trim();
      const options = (selected[question.id] ?? []).filter((value) =>
        question.options.includes(value),
      );
      return [
        question.id,
        question.multiple
          ? [...new Set([...options, ...(text ? [text] : [])])]
          : text
            ? [text]
            : options.slice(0, 1),
      ];
    }),
  );
}

export function studioApprovalChoices(item: Pick<StudioInteraction, "choices">): string[] {
  return item.choices ?? ["allow-once", "deny"];
}
