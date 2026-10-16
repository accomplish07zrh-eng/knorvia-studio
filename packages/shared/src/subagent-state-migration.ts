// SPDX-License-Identifier: Apache-2.0
// A present selection map is authoritative, even when it is empty or unreadable.
import { modelSelectionSchema } from "./model-selection.js";
import {
  migrateLegacyModelProviderId,
  migrateLegacyOfficialGlmModelId,
} from "./legacy-model-provider-identity.js";
import { parseSubagentMarkdownSelection } from "./subagent-markdown-selection.js";
import {
  parsePluginSubagentModelSelectionOverrides,
  type BuiltInSubagentModelSelectionOverrides,
  type PluginSubagentModelSelectionOverrides,
} from "./subagents-types.js";

type StoredSelection = NonNullable<ReturnType<typeof parseSubagentMarkdownSelection>>;

const BUILT_IN_ORDER = ["Explore", "general-purpose"] as const;
const PLUGIN_PREFIX = "plugin:";
const BUILTIN_PREFIX = "builtin:";

type ImportedSubagentState = Record<string, unknown> & {
  builtInModelSelectionOverrides: BuiltInSubagentModelSelectionOverrides;
  pluginAgentModelSelectionOverrides: PluginSubagentModelSelectionOverrides;
};

function plainRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function adoptSelection(selection: StoredSelection, legacy: boolean): StoredSelection {
  const sourceProvider = selection.providerId;
  const providerId =
    legacy && sourceProvider.startsWith(BUILTIN_PREFIX)
      ? migrateLegacyModelProviderId(sourceProvider)
      : sourceProvider;
  if (!providerId) return selection;
  const modelId = legacy
    ? migrateLegacyOfficialGlmModelId(sourceProvider, selection.modelId)
    : selection.modelId;
  return { ...selection, providerId, modelId };
}

function readBuiltInName(
  input: Record<string, unknown>,
  authoritative: boolean,
  name: (typeof BUILT_IN_ORDER)[number],
): StoredSelection | undefined {
  if (authoritative) {
    const current = plainRecord(input.builtInModelSelectionOverrides);
    // Failure leaves data unset, including ports that omit the success flag.
    return modelSelectionSchema.safeParse(current[name]).data;
  }
  const models = plainRecord(input.builtInModelOverrides);
  const thoughts = plainRecord(input.builtInThoughtLevelOverrides);
  return parseSubagentMarkdownSelection({
    model: models[name],
    thoughtLevel: thoughts[name],
  });
}

function importBuiltIns(input: Record<string, unknown>): BuiltInSubagentModelSelectionOverrides {
  const authoritative = Object.hasOwn(input, "builtInModelSelectionOverrides");
  const collected: BuiltInSubagentModelSelectionOverrides = {};
  for (const name of BUILT_IN_ORDER) {
    const selection = readBuiltInName(input, authoritative, name);
    if (!selection) continue;
    collected[name] = adoptSelection(selection, !authoritative);
  }
  return collected;
}

function importLegacyPlugins(
  input: Record<string, unknown>,
): PluginSubagentModelSelectionOverrides {
  const thoughts = plainRecord(input.pluginAgentThoughtLevelOverrides);
  const accepted: Record<string, StoredSelection> = {};
  for (const [id, model] of Object.entries(plainRecord(input.pluginAgentModelOverrides))) {
    if (!id.startsWith(PLUGIN_PREFIX)) continue;
    const selection = parseSubagentMarkdownSelection({
      model,
      thoughtLevel: thoughts[id],
    });
    if (!selection) continue;
    accepted[id] = adoptSelection(selection, true);
  }
  return accepted;
}

function importPlugins(input: Record<string, unknown>): PluginSubagentModelSelectionOverrides {
  if (Object.hasOwn(input, "pluginAgentModelSelectionOverrides")) {
    return parsePluginSubagentModelSelectionOverrides(input.pluginAgentModelSelectionOverrides);
  }
  return importLegacyPlugins(input);
}

export function importSubagentStateSelections(
  input: Record<string, unknown>,
): ImportedSubagentState {
  return {
    ...input,
    builtInModelSelectionOverrides: importBuiltIns(input),
    pluginAgentModelSelectionOverrides: importPlugins(input),
  };
}
