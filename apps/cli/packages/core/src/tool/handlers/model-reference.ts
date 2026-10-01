// Public model-reference boundary; source exposure and retained compatibility
// strings/codec behavior are documented in the model catalog spec.
import type { ModelCatalogEntry, ModelSelection } from "@knorvia/contracts";
import { formatModelPickerValue, parseModelPickerValue } from "@knorvia/shared/model-selection";
import { explainCatalogRefusal, type CatalogModelRefusal } from "./model-reference-diagnostics.js";
import { catalogModelId, decideCatalogModel } from "./model-reference-policy.js";

type ModelReferenceResolution =
  | { ok: true; selection: ModelSelection; entry: ModelCatalogEntry; canonical: string }
  | CatalogModelRefusal;

export function resolveModelReference(
  text: string,
  entries: ModelCatalogEntry[],
): ModelReferenceResolution {
  const decision = decideCatalogModel(text, entries);
  if (decision.kind !== "selected") return explainCatalogRefusal(text, decision);
  const selection: ModelSelection = {
    providerId: decision.entry.providerId,
    modelId: decision.entry.modelId,
    ...(decision.reasoningLevel === undefined
      ? {}
      : { options: { reasoningLevel: decision.reasoningLevel } }),
  };
  return {
    ok: true,
    selection,
    entry: decision.entry,
    canonical: formatModelPickerValue(selection),
  };
}

/** Existing handler codec/error boundary; resolution has already happened. */
export function parseWorkflowSubagentModel(
  canonical: string | undefined,
): ModelSelection | undefined {
  if (canonical === undefined) return undefined;
  try {
    return parseModelPickerValue(canonical);
  } catch (cause) {
    throw new Error(`workflow subagent_model reached the handler un-canonicalised: ${canonical}`, {
      cause,
    });
  }
}

export function describeWorkflowSubagentModel(canonical: string | undefined): string {
  return canonical === undefined
    ? ""
    : ` Subagents run on ${canonical} (the main agent stays on the session model).`;
}

export function formatModelCatalogId(entry: ModelCatalogEntry): string {
  return catalogModelId(entry);
}
