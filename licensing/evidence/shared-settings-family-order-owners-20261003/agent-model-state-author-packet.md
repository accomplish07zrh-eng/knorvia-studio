You are a fresh internal author. Read ONLY this designated packet and exact /workspace/knorvia-studio/AGENTS.md plus /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. Do not read source bodies, tests, dependencies, history, config, environment, other outputs or repository files beyond these two instructions. User explicitly narrows validation: do not run architecture/runtime/tests/typechecks/formatting or repository writes; curator handles them. No network/native/account/security operations. Author an ENTIRE compatible TypeScript file into the designated tmp output using a whole literal heredoc or apply_patch. Do not inspect/re-read authored output (sha256sum permitted). Report exact reads/writes/patches/hash and limits. No novelty requirement; preserve contracts exactly. Retained public declarations/imports/static tables below are uncounted, not independently rewritten. Curator is source-exposed; you have no inherited conversation; shared filesystem is not OS isolation. Whole file will be frozen/hash-bound before curator review.

Target: packages/shared/src/agent-model-state.ts. Output: /tmp/knorvia-settings-agent-model-state-authored.ts

Complete legacy settings projection owner. Retain supplied imports and fixed six id/category strings and exact mode table. Exports five funcs shown (imported picker is not re-exported). normalizeAvailableKnorviaMode accepts only build/edit/plan/yolo, otherwise build. Each get select-options call returns fresh array/fresh rows with value=id,name,description (all keys); available-modes returns fresh array/fresh row copies, fixed table unchanged. sessionSettingsToKnorviaConfigOptions emits Model then Mode then optional Thought Level. Model: id/model category/model name Model type select, currentValue picker(settings.model.current); options native map of model.available, row value picker(ref), name label, description (own key even undefined), modelProviderId ref.providerId, modelProviderName providerLabel??ref.providerId (empty label kept). If model.reasoning exists its levels native map to level.value; include modelThoughtLevels whenever this array exists (including empty); no property when reasoning absent. modelDefaultThoughtLevel only when reasoning.defaultLevel truthy AND included in mapped values. Mode current normalized; options freshly projected fixed modes. Thought omitted when !enabled. When enabled row id/category thought_level,name Thought Level,type select; currentValue current??valid truthy default??first available.value??empty string (empty explicit current retained); default valid only included among available.value. Options native map value/value,name/label,description/key present. Preserve sparse map visitation, source order, no input mutation, no hidden array alias; picker call order current then options. settings data shape model:{current?:ModelSelection,available:[{ref:{providerId,modelId,options?},label,description?,providerLabel?,reasoning?:{levels:[{value,...}],defaultLevel?}}]},mode:{current},thoughtLevel:{enabled,current?,defaultLevel?,available:[{value,label,description?}]}. Types imported as shown. picker port signature (selection:ModelSelection|undefined)=>string; no changes to actual picker. Type errors/port throws propagate, no schema validation or fallback additions. Static table retained uncounted; functions whole-authored.

Retained API/declarations/static data (no inherited behavior bodies):
```ts
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

export function normalizeAvailableKnorviaMode(mode: KnorviaSessionMode): string;

export function getKnorviaAgentModeSelectOptions(): NonNullable<KnorviaConfigOption["options"]>;

export function getKnorviaAgentAvailableModes(): KnorviaTaskModeInfo[];

export function sessionSettingsToKnorviaConfigOptions(settings: KnorviaSessionSettingsState): KnorviaConfigOption[];
```
