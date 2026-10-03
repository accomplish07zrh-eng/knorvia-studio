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

const builtInNames = ["Explore", "general-purpose"] as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

// 旧身份只在存储导入时迁移；运行时不重新解释历史配置。
function selectionForImport(selection: StoredSelection, legacy: boolean): StoredSelection {
  const originalProvider = selection.providerId;
  const providerId =
    legacy && originalProvider.startsWith("builtin:")
      ? migrateLegacyModelProviderId(originalProvider)
      : originalProvider;
  if (!providerId) {
    return selection;
  }
  return {
    ...selection,
    providerId,
    modelId: legacy
      ? migrateLegacyOfficialGlmModelId(originalProvider, selection.modelId)
      : selection.modelId,
  };
}

export function importSubagentStateSelections(input: Record<string, unknown>): Record<
  string,
  unknown
> & {
  builtInModelSelectionOverrides: BuiltInSubagentModelSelectionOverrides;
  pluginAgentModelSelectionOverrides: PluginSubagentModelSelectionOverrides;
} {
  const builtInModelSelectionOverrides: BuiltInSubagentModelSelectionOverrides = {};
  // 自有的新字段即为权威值，包括空值或损坏值，不回退到旧字段。
  const hasCurrentBuiltIns = Object.hasOwn(input, "builtInModelSelectionOverrides");
  const currentBuiltIns: Record<string, unknown> = hasCurrentBuiltIns
    ? asRecord(input.builtInModelSelectionOverrides)
    : {};
  const legacyBuiltInModels: Record<string, unknown> = hasCurrentBuiltIns
    ? {}
    : asRecord(input.builtInModelOverrides);
  const legacyBuiltInThoughtLevels: Record<string, unknown> = hasCurrentBuiltIns
    ? {}
    : asRecord(input.builtInThoughtLevelOverrides);

  for (const name of builtInNames) {
    const selection = hasCurrentBuiltIns
      ? modelSelectionSchema.safeParse(currentBuiltIns[name]).data
      : parseSubagentMarkdownSelection({
          model: legacyBuiltInModels[name],
          thoughtLevel: legacyBuiltInThoughtLevels[name],
        });
    if (selection) {
      builtInModelSelectionOverrides[name] = selectionForImport(selection, !hasCurrentBuiltIns);
    }
  }

  let pluginAgentModelSelectionOverrides: PluginSubagentModelSelectionOverrides;
  // 插件的新字段同样以自有属性为准，保留解析端口返回的映射身份。
  if (Object.hasOwn(input, "pluginAgentModelSelectionOverrides")) {
    pluginAgentModelSelectionOverrides = parsePluginSubagentModelSelectionOverrides(
      input.pluginAgentModelSelectionOverrides,
    );
  } else {
    const thoughtLevels = asRecord(input.pluginAgentThoughtLevelOverrides);
    const accepted: Array<[string, StoredSelection]> = [];
    for (const [id, model] of Object.entries(asRecord(input.pluginAgentModelOverrides))) {
      const selection = parseSubagentMarkdownSelection({
        model,
        thoughtLevel: thoughtLevels[id],
      });
      if (id.startsWith("plugin:") && selection) {
        accepted.push([id, selectionForImport(selection, true)]);
      }
    }
    pluginAgentModelSelectionOverrides = Object.fromEntries(accepted);
  }

  return {
    ...input,
    builtInModelSelectionOverrides,
    pluginAgentModelSelectionOverrides,
  };
}
