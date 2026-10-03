import { formatModelPickerValue } from "./model-selection.js";

import type { KnorviaSessionMode, KnorviaSessionSettingsState } from "./protocol/index.js";

import type { KnorviaConfigOption, KnorviaTaskModeInfo } from "./task-types-core.js";

const MODEL_CONFIG_ID = "model";

const MODEL_CONFIG_CATEGORY = "model";

const MODE_CONFIG_ID = "mode";

const MODE_CONFIG_CATEGORY = "mode";

const THOUGHT_LEVEL_CONFIG_ID = "thought_level";

const THOUGHT_LEVEL_CONFIG_CATEGORY = "thought_level";

const KNORVIA_AGENT_MODE_OPTIONS = [
  {
    id: "build",
    name: "Ask before changes",
    description: "Ask before each file changes.",
  },
  {
    id: "edit",
    name: "Edit automatically",
    description: "Edit selected files or relevant workspace files automatically.",
  },
  {
    id: "plan",
    name: "Plan mode",
    description: "Inspect the code and present a plan before editing.",
  },
  {
    id: "yolo",
    name: "Full access",
    description: "Edit and run commands with fewer confirmations.",
  },
] as const satisfies readonly KnorviaTaskModeInfo[];

export function normalizeAvailableKnorviaMode(mode: KnorviaSessionMode): string {
  switch (mode) {
    case "build":
    case "edit":
    case "plan":
    case "yolo":
      return mode;
    default:
      return "build";
  }
}

export function getKnorviaAgentModeSelectOptions(): NonNullable<KnorviaConfigOption["options"]> {
  return KNORVIA_AGENT_MODE_OPTIONS.map(({ id, name, description }) => ({
    value: id,
    name,
    description,
  }));
}

export function getKnorviaAgentAvailableModes(): KnorviaTaskModeInfo[] {
  return KNORVIA_AGENT_MODE_OPTIONS.map((mode) => ({ ...mode }));
}

export function sessionSettingsToKnorviaConfigOptions(
  settings: KnorviaSessionSettingsState,
): KnorviaConfigOption[] {
  const modelCurrentValue = formatModelPickerValue(settings.model.current);
  const modelOptions = settings.model.available.map((model) => {
    const reasoning = model.reasoning;
    const modelThoughtLevels = reasoning?.levels.map((level) => level.value);
    const defaultLevel = reasoning?.defaultLevel;
    const modelDefaultThoughtLevel =
      defaultLevel && modelThoughtLevels?.includes(defaultLevel) ? defaultLevel : undefined;
    const value = formatModelPickerValue(model.ref);

    return {
      value,
      name: model.label,
      description: model.description,
      modelProviderId: model.ref.providerId,
      modelProviderName: model.providerLabel ?? model.ref.providerId,
      ...(modelThoughtLevels !== undefined ? { modelThoughtLevels } : {}),
      ...(modelDefaultThoughtLevel !== undefined ? { modelDefaultThoughtLevel } : {}),
    };
  });

  const options: KnorviaConfigOption[] = [
    {
      id: MODEL_CONFIG_ID,
      name: "Model",
      category: MODEL_CONFIG_CATEGORY,
      type: "select",
      currentValue: modelCurrentValue,
      options: modelOptions,
    },
    {
      id: MODE_CONFIG_ID,
      name: "Mode",
      category: MODE_CONFIG_CATEGORY,
      type: "select",
      currentValue: normalizeAvailableKnorviaMode(settings.mode.current),
      options: getKnorviaAgentModeSelectOptions(),
    },
  ];

  const thoughtLevel = settings.thoughtLevel;
  if (thoughtLevel.enabled) {
    const availableValues = thoughtLevel.available.map((level) => level.value);
    const allowedValues = new Set(availableValues);
    const defaultLevel = thoughtLevel.defaultLevel;
    const validDefault = defaultLevel && allowedValues.has(defaultLevel) ? defaultLevel : undefined;

    options.push({
      id: THOUGHT_LEVEL_CONFIG_ID,
      name: "Thought Level",
      category: THOUGHT_LEVEL_CONFIG_CATEGORY,
      type: "select",
      currentValue: thoughtLevel.current ?? validDefault ?? availableValues[0] ?? "",
      options: thoughtLevel.available.map((level) => ({
        value: level.value,
        name: level.label,
        description: level.description,
      })),
    });
  }

  return options;
}
