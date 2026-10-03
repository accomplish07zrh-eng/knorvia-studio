You are a fresh internal author. Read ONLY this designated packet and exact /workspace/knorvia-studio/AGENTS.md plus /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. Do not read source bodies, tests, dependencies, history, config, environment, other outputs or repository files beyond these two instructions. User explicitly narrows validation: do not run architecture/runtime/tests/typechecks/formatting or repository writes; curator handles them. No network/native/account/security operations. Author an ENTIRE compatible TypeScript file into the designated tmp output using a whole literal heredoc or apply_patch. Do not inspect/re-read authored output (sha256sum permitted). Report exact reads/writes/patches/hash and limits. No novelty requirement; preserve contracts exactly. Retained public declarations/imports/static tables below are uncounted, not independently rewritten. Curator is source-exposed; you have no inherited conversation; shared filesystem is not OS isolation. Whole file will be frozen/hash-bound before curator review.

Target: packages/shared/src/pluginStoreOrdering.ts. Output: /tmp/knorvia-settings-pluginStoreOrdering-authored.ts

Complete stable pure plugin display ordering owner. Retain exported fallback/category table and private entry interface exactly. Official doc priority IDs are pdf,presentations,spreadsheets,documents with @imported KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID suffix; exact ID match (personal marketplace same name NOT elevated). Build priority ranks at module init from imported constant. compareDocumentPluginPriority returns difference of ranked positions; unknown rank=rank map size; unknown/unknown=>0. category resolver trim; exact guides=>utilities; other nonblank trim kept; blank/undefined=>undefined, case-sensitive. sort creates fresh array of same original item references, input never sorted/mutated. Native map projects each visited item ONCE in original order, remembers index, fields from project, normalizedcategory??other. Preserve native sparse visitation (holes ultimately preserved by native map/sort/map). Rank order lists: first occurrence only gets consecutive size, duplicates ignored; missing list empty. Config category ranks precede all default ordering; unlisted rank=list unique size. Plugin-order maps by original category key (do NOT normalize configured keys), percategory rank firstunique. Compare lexicographically: configured category difference, default category difference, per-left-category configured plugin difference, official-document priority difference, displayName.localeCompare(other,locale), original index difference. Default categories: equal=>0, fallback other after allothers, known table categories order, known before unknown, unknown lexical < (not locale). Because category difference resolves ties before plugin-order step, left/right normalized category same there. Keep integer diff result, locale/errors propagate. Project callback missing/invalid values/errors propagate, no schema parsing/new validation. PluginStoreModeOrder imported type shape {categoryOrder?:string[],pluginOrder?:Record<string,string[]>}. No live marketplace/store operations. Exact default vocabulary and priority sequence retained uncounted; whole ordering behavior authored.

Retained API/declarations/static data (no inherited behavior bodies):
```ts
import { KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID } from "./plugin-marketplaces.js";

import type { PluginStoreModeOrder } from "./pluginStoreOrder.js";

export const FALLBACK_PLUGIN_STORE_CATEGORY = "other";

export const PLUGIN_STORE_CATEGORY_ORDER: readonly string[] = [
    "productivity",
    "developer-tools",
    "utilities",
    "finance",
    "legal",
    "template",
];

export function compareDocumentPluginPriority(leftId: string, rightId: string): number;

export function resolvePluginStoreCategory(category: string | undefined): string | undefined;

interface PluginStoreSortEntry {
    id: string;
    category?: string;
    displayName: string;
}

export function sortPluginStoreEntries<T>(items: readonly T[], project: (item: T) => PluginStoreSortEntry, locale: string, order?: PluginStoreModeOrder): T[];
```
