import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  modelSelectionSchema,
  parsePluginSubagentModelSelectionOverrides,
  type BuiltInSubagentModelSelectionOverrides,
  type ModelSelection,
  type PluginSubagentModelSelectionOverrides,
} from "@knorvia/shared";
import { migrateSubagentStateFile } from "@knorvia/shared/node";
import { atomicWriteText } from "#src/fs/atomicFileUtils.js";
import { resolveSubagentStateFile, type SubagentStorageOptions } from "./subagentStorage.js";

export interface AgentsStateFile {
  builtInModelSelectionOverrides: BuiltInSubagentModelSelectionOverrides;
  pluginAgentModelSelectionOverrides: PluginSubagentModelSelectionOverrides;
  disabledAgentIds: string[];
  builtInModelOverrides?: unknown;
  builtInThoughtLevelOverrides?: unknown;
}

function builtInSelections(value: unknown): BuiltInSubagentModelSelectionOverrides {
  const normalized: BuiltInSubagentModelSelectionOverrides = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return normalized;
  const record = value as Record<string, unknown>;
  for (const name of ["general-purpose", "Explore"] as const) {
    const result = modelSelectionSchema.safeParse(record[name]) as { data?: ModelSelection };
    if (result.data) normalized[name] = result.data;
  }
  return normalized;
}

export async function readState(options: SubagentStorageOptions): Promise<AgentsStateFile> {
  await migrateSubagentStateFile(await resolveSubagentStateFile(options));
  try {
    const raw = JSON.parse(await readFile(await resolveSubagentStateFile(options), "utf-8"));
    return {
      ...raw,
      builtInModelSelectionOverrides: builtInSelections(raw.builtInModelSelectionOverrides),
      pluginAgentModelSelectionOverrides: parsePluginSubagentModelSelectionOverrides(
        raw.pluginAgentModelSelectionOverrides,
      ),
      disabledAgentIds: Array.isArray(raw.disabledAgentIds)
        ? raw.disabledAgentIds.filter(
            (value: unknown): value is string => typeof value === "string" && !!value.trim(),
          )
        : [],
    };
  } catch {
    return {
      builtInModelSelectionOverrides: {},
      pluginAgentModelSelectionOverrides: {},
      disabledAgentIds: [],
    };
  }
}

export async function writeState(
  state: AgentsStateFile,
  options: SubagentStorageOptions,
): Promise<void> {
  const path = await resolveSubagentStateFile(options);
  await mkdir(dirname(path), { recursive: true });
  await atomicWriteText(path, JSON.stringify(state, null, 2));
}

export async function migrateDisabledAgentId(
  oldId: string,
  newId: string,
  options: SubagentStorageOptions,
): Promise<void> {
  if (oldId === newId) return;
  const state = await readState(options);
  const disabled = new Set(state.disabledAgentIds);
  if (!disabled.has(oldId)) return;
  disabled.delete(oldId);
  disabled.add(newId);
  await writeState({ ...state, disabledAgentIds: [...disabled].sort() }, options);
}
