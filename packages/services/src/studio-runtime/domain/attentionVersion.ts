import type { StudioInteraction, StudioRun } from "../types.js";

/** A duplicate fact has the same version; a later attempt can never share its read receipt. */
export function studioAttentionVersion(run: StudioRun, interaction?: StudioInteraction): string {
  return JSON.stringify([
    1,
    run.id,
    run.attempt,
    interaction ? "pending" : run.state,
    interaction?.id ?? run.updatedAt,
    interaction?.turnId ?? run.resultKnown ?? null,
  ]);
}
