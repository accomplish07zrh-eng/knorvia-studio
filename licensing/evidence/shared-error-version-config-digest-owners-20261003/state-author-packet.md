# Complete owner API and behavior packet

Exact target: packages/shared/src/subagent-state-migration.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-state-config-authored/subagent-state-migration.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
import { modelSelectionSchema } from "./model-selection.js";

import { migrateLegacyModelProviderId, migrateLegacyOfficialGlmModelId, } from "./legacy-model-provider-identity.js";

import { parseSubagentMarkdownSelection } from "./subagent-markdown-selection.js";

import { parsePluginSubagentModelSelectionOverrides, type BuiltInSubagentModelSelectionOverrides, type PluginSubagentModelSelectionOverrides, } from "./subagents-types.js";

export function importSubagentStateSelections(input: Record<string, unknown>): Record<string, unknown> & {
    builtInModelSelectionOverrides: BuiltInSubagentModelSelectionOverrides;
    pluginAgentModelSelectionOverrides: PluginSubagentModelSelectionOverrides;
};
```

Complete pure STORAGE import migration owner; neverreinterpretlegacy at runtime orread files. Retained ports: modelSelectionSchema.safeParse(any)->{data?:ModelSelection}, migrationprovider(string)->string|undefined and officialmodel(oldProvider,model)->string; parseSubagentMarkdownSelection({model,thoughtLevel})->selection|undefined; parsePluginSubagentModelSelectionOverrides(any)->Readonly<Record<string,selection>>. ModelSelection providerId/modelId:string, options?:{reasoningLevel?:string}; BuiltInSubagentModelSelectionOverrides partialrecord exactly 'Explore'|'general-purpose'. Do notinlineportbodies.
Recordguard truthy objectnonarray else{}. Input ownpresence Object.hasOwn('builtInModelSelectionOverrides') isauthority evenundefined/null/corrupt/empty, inheriteddoesNOTcount. Newbuiltinmap {} only iterateExplore then general-purpose. Current ownmap branch: record(input.currentmap)[name] safeParse then.data; nolegacyfallback/migrationofprovider/model. Else callMarkdownparser withrecordlegacy builtInModelOverrides name and builtInThoughtLevelOverrides name (separatemaps). Ifselectionfalsy skip. Provider current ORlegacy nonbuiltinprefix=>selection.providerId; legacybuiltin:=>migrationprovider oldid. Ifprovidertruthy, selectionshallowcopy preservingoptions andoverrideproviderId; modelId currentunchanged else officialmodelmigration(oldoriginalprovider,selection.modelId), EVENnonbuiltinlegacy provider (portauthoritative). Ifproviderundefined/falsy keep SAMEselectionref. No name availability/env/accountchecks.
Plugin current map ownpresence analogousauthority eveninvalid; call retainedparsePlugin... and retainreturnedmap identity, nolegacyfallback/migration. Else Object.entries(record(input.pluginAgentModelOverrides)) inown order; FOR EACH entry callMarkdownparser withmodel andmatchingrecord(pluginAgentThoughtLevelOverrides)[id] BEFOREcheckid.startsWith('plugin:'); ifinvalidprefixORselectionfalsy skip. Acceptedlegacyplugins providerlogic samebuiltinprefixmigration; iftruthy shallowcopyofficialmodelmigration(oldprovider,model), else same selection; buildObject.fromEntries acceptedentries. Do not filter IDs before parser, catchportexceptions, mergeold/current, deleteoldmaps or addselectionvalidation. Returnfresh{...input,builtInModelSelectionOverrides:newmap,pluginAgentModelSelectionOverrides:chosenmap}, preservesother/legacyinputfieldsbyreference and doesnotmutateinput orportselections. Chinese current-mapauthority/runtimescopecomments. Constants/ports/nativepresence/controlstructurerecurrence unavoidable.

No numeric similarity threshold/novelty requirement. Complete behavior authoring preserves public data declarations/constants uncounted. Report required expression/structure recurrence honestly without inherited-source comparison.
