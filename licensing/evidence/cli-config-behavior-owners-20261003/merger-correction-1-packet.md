# Complete config merger owner

Read ONLY this packet and these instructions: /workspace/knorvia-studio/AGENTS.md, /workspace/knorvia-studio/apps/cli/AGENTS.md, /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md.
Do not inspect any other source, tests, dependencies, history, config, environment, prior drafts or other authors. No network, execution, formatter, builds or repository writes. Choose private structure freely; no novelty requirement. Public declarations/imports below are contract exposure, not implementation-body exposure.
Write ONE complete TypeScript module using ONE literal quoted heredoc (or one apply_patch) to the assigned /tmp output. Do not assemble, copy or transform file fragments. Then compute SHA256 only; do not reopen or execute the draft. Keep whole owner under 400 nonblank/noncomment lines without extraction. Use imported types and preserve runtime schema checks. Report exact reads/writes/exposure and limitations. Zero accepted independence/MIT credit pending parent review.
Preserve property ordering, references, sync/async evaluation and raw failure identity. No added containment/security/permissions policies. Synthetic injected validation belongs to curator; no actual HOME/config/credentials/file writes.

Assigned output: /tmp/knorvia-cli-config-merger-author.ts

## Public declarations and permitted imports

import type { HookEventName, HookMatcherConfig, PluginOptionValues, RuntimeConfigPatch, } from "@knorvia/contracts";
import { ConfigScope, ConfigScopePriority } from "@knorvia/contracts";
interface PrioritizedConfig {
    config: RuntimeConfigPatch;
    scope: ConfigScope;
    priority: number;
}
export function mergeConfigs(...configs: PrioritizedConfig[]): RuntimeConfigPatch;
export function getScopePriority(scope: ConfigScope): number;
export function createPrioritizedConfig(config: RuntimeConfigPatch, scope: ConfigScope): PrioritizedConfig;

## External behavior

getScopePriority indexes ConfigScopePriority[scope]; createPrioritizedConfig returns {config,scope,priority:getScopePriority(scope)}, preserving config ref.
mergeConfigs returns new RuntimeConfigPatch; stable ascending caller priority, no input list mutation. Each whole patch shallow-assigns accumulator, unknown keys/explicit undefined preserved. This means ordinary nested sections REPLACE earlier section keys before cloning current section; do NOT fix into general deep merge. Applies modelStream,permission,storage,network,features,memory,mcp,skills,skillOverrides,commandOverrides,logging,toolConcurrency,modelAnomalyGuard,ui. Truthy current section shallow copy; mcp copies current mcp/current servers into new map; earlier servers lost. Falsey fields retain assignment semantics.
Exceptions plugins/hooks retain previous values before assignment. Project-scope truthy plugins: exclude extraKnownMarketplaces ONLY (clone,no mutation). Truthy plugins copies previous and next unknown fields; truthy dirs concatenate previous dirs??[] and next dirs, Set deduplicate encounter order; absent dirs inherit previous ref. Truthy enabledPlugins/extraKnownMarketplaces merge previous and next maps; absent inherit previous. Truthy options merge by plugin id then option key, preserve missing earlier entries; clone top map/affected entries. Explicit undefined survives spread when conditional merging skipped.
Truthy hooks copy previous/next unknown fields; effective enabled is previous.enabled===true OR next.enabled===true. events new shallow copy previous.events. Only when next.enabled!==false append each truthy next event matchers after previous matchers, array copies. Falsey matchers skipped; disabled next ignores all its events. Prior events retained even disabled/missing next; returned events always object. No normalization/mutation. Raw getters/iterator failures propagate.

## Superseding body-free contract correction

Compare scope to imported runtime ConfigScope.Project; do not guess/cast a string value. Public ConfigScope members System,User,Project,Env,Cli.
The initial whole draft is frozen. You are authorized ONE NEW WHOLE literal heredoc/apply_patch at /tmp/knorvia-cli-config-merger-correction-1.ts. Do not reopen or transform the predecessor; author the whole module from packet and your own design. SHA only afterward. Read only this correction packet and three previously permitted instructions. No further source/tests/execution/network/repository writes.
