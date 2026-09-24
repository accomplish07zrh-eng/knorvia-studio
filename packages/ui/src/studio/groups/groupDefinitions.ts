import type { StudioGroup } from "./groupModel.js";

/** Acknowledged definitions remain authoritative until the service snapshot catches up. */
export function projectGroupDefinitions(
  definitions: Omit<StudioGroup, "draft">[],
  drafts: StudioGroup[],
  revisions: Record<string, number>,
  revision: number,
): StudioGroup[] {
  const pending = new Map(drafts.map((draft) => [draft.id, draft]));
  const result: StudioGroup[] = [];
  for (const definition of definitions) {
    const draft = pending.get(definition.id);
    pending.delete(definition.id);
    if ((revisions[definition.id] ?? 0) > revision) {
      if (draft) result.push(draft); // Missing draft with a newer receipt is an acknowledged deletion.
    } else result.push({ ...definition, draft: draft?.draft ?? "" });
  }
  for (const draft of pending.values())
    if ((revisions[draft.id] ?? 0) > revision) result.push(draft);
  return result;
}
