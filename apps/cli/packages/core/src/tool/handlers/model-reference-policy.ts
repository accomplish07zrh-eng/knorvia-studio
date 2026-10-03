// Exposed-source replacement from the frozen model catalog contract.
import type { ModelCatalogEntry } from "@knorvia/contracts";
import { KNORVIA_MODEL_REASONING_SEPARATOR } from "@knorvia/shared/model-selection";

interface CatalogQuery {
  provider?: string;
  model: string;
  level?: string;
}

export type CatalogModelDecision =
  | { kind: "selected"; entry: ModelCatalogEntry; reasoningLevel?: string }
  | { kind: "not_found" | "disabled" | "ambiguous"; candidates: ModelCatalogEntry[] }
  | { kind: "reasoning_level_unknown"; entry: ModelCatalogEntry; level: string };

const PROVIDER_SEPARATOR = "/";

function token(value: string): string {
  return value.trim().toLowerCase();
}

/** Delimiter scan keeps literal/empty-side dollars and the first slash boundary. */
function queryOf(input: string): CatalogQuery {
  const text = input.trim();
  let slash = -1;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === PROVIDER_SEPARATOR) {
      slash = index;
      break;
    }
  }
  const afterProvider = slash + 1;
  let dollar = -1;
  for (let index = afterProvider; index < text.length; index++) {
    if (text[index] === KNORVIA_MODEL_REASONING_SEPARATOR) {
      dollar = index;
      break;
    }
  }
  const hasLevel = dollar > afterProvider && dollar + 1 < text.length;
  const reference = hasLevel ? text.slice(0, dollar) : text;
  return {
    ...(slash > 0 ? { provider: token(reference.slice(0, slash)) } : {}),
    model: token(slash > 0 ? reference.slice(slash + 1) : reference),
    ...(hasLevel ? { level: text.slice(dollar + 1) } : {}),
  };
}

/** Per-query index: do not read model names outside a qualified provider scope. */
function nameIndex(query: CatalogQuery, entries: ModelCatalogEntry[]) {
  const index = new Map<string, ModelCatalogEntry[]>();
  entries.forEach((entry) => {
    if (query.provider !== undefined && token(entry.providerId) !== query.provider) return;
    const key = token(entry.modelId);
    const bucket = index.get(key);
    if (bucket === undefined) index.set(key, [entry]);
    else bucket.push(entry);
  });
  return index;
}

function enabledEntries(entries: ModelCatalogEntry[]): ModelCatalogEntry[] {
  const enabled: ModelCatalogEntry[] = [];
  entries.forEach((entry) => {
    if (entry.disabledReason === undefined) enabled.push(entry);
  });
  return enabled;
}

function chooseEntry(entries: ModelCatalogEntry[]): ModelCatalogEntry | undefined {
  if (entries.length === 1) return entries[0];
  for (const entry of entries) if (entry.current) return entry;
  return undefined;
}

function chooseLevel(
  entry: ModelCatalogEntry,
  requested: string | undefined,
): CatalogModelDecision {
  if (requested === undefined) {
    if (entry.reasoningLevels.length === 0 || entry.defaultReasoningLevel === undefined)
      return { kind: "selected", entry };
    return { kind: "selected", entry, reasoningLevel: entry.defaultReasoningLevel };
  }
  const wanted = token(requested);
  const levels = entry.reasoningLevels;
  const length = levels.length;
  for (let index = 0; index < length; index++) {
    const level = levels[index]!;
    if (token(level) === wanted) return { kind: "selected", entry, reasoningLevel: level };
  }
  return { kind: "reasoning_level_unknown", entry, level: requested };
}

/** No index or derived catalog survives this invocation. */
export function decideCatalogModel(
  text: string,
  entries: ModelCatalogEntry[],
): CatalogModelDecision {
  const query = queryOf(text);
  const matches = nameIndex(query, entries).get(query.model) ?? [];
  if (matches.length === 0) return { kind: "not_found", candidates: enabledEntries(entries) };
  const enabled = enabledEntries(matches);
  if (enabled.length === 0) return { kind: "disabled", candidates: matches };
  const chosen = chooseEntry(enabled);
  return chosen === undefined
    ? { kind: "ambiguous", candidates: enabled }
    : chooseLevel(chosen, query.level);
}

export function catalogModelId(entry: ModelCatalogEntry): string {
  return `${entry.providerId}${PROVIDER_SEPARATOR}${entry.modelId}`;
}
