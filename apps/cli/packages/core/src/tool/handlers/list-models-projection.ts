// Exposed-source replacement; declarations and exact compatibility text are retained.
import {
  ListModelsInputSchema,
  ListModelsOutputSchema,
  type ListModelsEntry,
  type ListModelsOutput,
  type ModelCatalogEntry,
  type ModelMessageContent,
} from "@knorvia/contracts";
import type { ToolHandler } from "../types.js";
import { formatModelCatalogId } from "./model-reference.js";

interface CatalogField {
  key: keyof ListModelsEntry;
  read: (entry: ModelCatalogEntry) => unknown;
  optional?: boolean;
}

/** Public row order and omission rules are a projection policy, not host state. */
const ROW_FIELDS: readonly CatalogField[] = [
  { key: "id", read: formatModelCatalogId },
  { key: "providerId", read: (entry) => entry.providerId },
  { key: "modelId", read: (entry) => entry.modelId },
  { key: "providerLabel", read: (entry) => entry.providerLabel, optional: true },
  { key: "reasoningLevels", read: copyLevels },
  { key: "defaultReasoningLevel", read: (entry) => entry.defaultReasoningLevel, optional: true },
  { key: "contextWindow", read: (entry) => entry.contextWindow, optional: true },
  { key: "disabledReason", read: (entry) => entry.disabledReason, optional: true },
];

function copyLevels(entry: ModelCatalogEntry): string[] {
  const levels: string[] = [];
  for (const level of entry.reasoningLevels) levels.push(level);
  return levels;
}

function projectRow(entry: ModelCatalogEntry): ListModelsEntry {
  const fields: [string, unknown][] = [];
  for (const field of ROW_FIELDS) {
    const value = field.read(entry);
    if (!field.optional) fields.push([field.key, value]);
    else if (value !== undefined) fields.push([field.key, field.read(entry)]);
  }
  return Object.fromEntries(fields) as ListModelsEntry;
}

function projectCatalog(entries: ModelCatalogEntry[]): ListModelsOutput {
  const current = entries.find((entry) => entry.current);
  const fields: [string, unknown][] = [];
  if (current !== undefined) fields.push(["current", formatModelCatalogId(current)]);
  const models: ListModelsEntry[] = [];
  models.length = entries.length;
  entries.forEach((entry, index) => {
    models[index] = projectRow(entry);
  });
  fields.push(["models", models]);
  return Object.fromEntries(fields) as ListModelsOutput;
}

export const executeListModels: ToolHandler = async (input, context) => {
  ListModelsInputSchema.parse(input);
  const catalog = context.modelCatalogPort;
  if (catalog === undefined)
    return {
      result: false,
      errorCode: 31,
      message:
        "model_catalog_unavailable: this session cannot list models — the host did not provide a model catalog. This is a capability gap, not an empty configuration. Omit `subagent_model` on CreateWorkflow and AmendWorkflow; the workflow's subagents will run on the session model.",
    };
  return projectCatalog(catalog.listModels());
};

/** Schema admission precedes all text output; preserve raw values and line order. */
export function renderListModels(output: unknown): ModelMessageContent {
  const parsed = ListModelsOutputSchema.safeParse(output);
  if (!parsed.success) return "ListModels returned an invalid result.";
  const { current, models } = parsed.data;
  let content = `<models count="${models.length}">`;
  if (models.length === 0)
    content +=
      "\nNo models are configured on this host. Omit `subagent_model`: the workflow's subagents run on the session model.";
  for (const model of models) {
    content += `\n${model.id}`;
    if (model.providerLabel !== undefined) content += ` — ${model.providerLabel}`;
    if (model.reasoningLevels.length > 0) {
      content += `; levels: ${model.reasoningLevels.join(",")}`;
      if (model.defaultReasoningLevel !== undefined)
        content += ` (default ${model.defaultReasoningLevel})`;
    }
    if (model.id === current) content += " [current]";
    if (model.disabledReason !== undefined) content += ` [disabled: ${model.disabledReason}]`;
  }
  return `${content}\n</models>`;
}
