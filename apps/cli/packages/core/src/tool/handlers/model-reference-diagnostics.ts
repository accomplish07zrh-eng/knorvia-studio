// Exact diagnostic wording is retained compatibility material, not a license claim.
import type { ModelCatalogEntry } from "@knorvia/contracts";
import { catalogModelId, type CatalogModelDecision } from "./model-reference-policy.js";

const CANDIDATE_PREVIEW_LINES = 40;
type Refusal = Exclude<CatalogModelDecision, { kind: "selected" }>;

export interface CatalogModelRefusal {
  ok: false;
  reason: "not_found" | "disabled" | "ambiguous" | "reasoning_level_unknown";
  message: string;
  candidates: ModelCatalogEntry[];
}

function reasoningMessage(entry: ModelCatalogEntry, level: string): string {
  const id = catalogModelId(entry);
  let guidance = `${id} has no reasoning levels — drop the \`$\` suffix.`;
  if (entry.reasoningLevels.length > 0) {
    guidance = `Its levels are: ${entry.reasoningLevels.join(", ")}.`;
    if (entry.defaultReasoningLevel !== undefined)
      guidance += ` Omit the suffix to use ${entry.defaultReasoningLevel}.`;
  }
  return `\`${level}\` is not a reasoning level of ${id}. ${guidance}`;
}

/** Render the choice outcome, preserving candidate references and all wording. */
export function explainCatalogRefusal(text: string, refusal: Refusal): CatalogModelRefusal {
  if (refusal.kind === "reasoning_level_unknown") {
    return {
      ok: false,
      reason: refusal.kind,
      message: reasoningMessage(refusal.entry, refusal.level),
      candidates: [refusal.entry],
    };
  }

  const candidates = refusal.candidates;
  let message: string;
  switch (refusal.kind) {
    case "not_found": {
      let available = "No models are configured on this host.";
      if (candidates.length > 0) {
        available = "Available models:";
        const count = Math.min(candidates.length, CANDIDATE_PREVIEW_LINES);
        for (let index = 0; index < count; index++) {
          const entry = candidates[index]!;
          available += `\n${catalogModelId(entry)}${entry.current ? " [current]" : ""}`;
        }
        if (count < candidates.length) available += `\n… and ${candidates.length - count} more.`;
      }
      message = `No configured model matches \`${text}\`. ${available}\n\nPass one of these ids, or call ListModels.`;
      break;
    }
    case "disabled":
      message = `\`${text}\` matches a model that cannot be used on this host:`;
      for (const entry of candidates)
        message += `\n${catalogModelId(entry)} — ${entry.disabledReason}`;
      message += "\n\nResolve that with the user, or call ListModels and pick another id.";
      break;
    case "ambiguous":
      message = `\`${text}\` is configured under more than one provider:`;
      for (const entry of candidates) message += `\n${catalogModelId(entry)}`;
      message += "\n\nPass the full `providerId/modelId` of the one you want.";
      break;
  }
  return { ok: false, reason: refusal.kind, message, candidates };
}
