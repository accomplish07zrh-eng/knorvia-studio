You are a fresh internal author. Read ONLY this designated packet and exact /workspace/knorvia-studio/AGENTS.md plus /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. Do not read source bodies, tests, dependencies, history, config, environment, other outputs or repository files beyond these two instructions. User explicitly narrows validation: do not run architecture/runtime/tests/typechecks/formatting or repository writes; curator handles them. No network/native/account/security operations. Author an ENTIRE compatible TypeScript file into the designated tmp output using a whole literal heredoc or apply_patch. Do not inspect/re-read authored output (sha256sum permitted). Report exact reads/writes/patches/hash and limits. No novelty requirement; preserve contracts exactly. Retained public declarations/imports/static tables below are uncounted, not independently rewritten. Curator is source-exposed; you have no inherited conversation; shared filesystem is not OS isolation. Whole file will be frozen/hash-bound before curator review.

Target: packages/shared/src/remoteAppConfig.ts. Output: /tmp/knorvia-settings-remoteAppConfig-authored.ts

Complete pure config value-admission owner. Retain imports/type/interfaces shown. Record acceptance = typeof value object AND nonnull; arrays intentionally accepted (no Array.isArray exclusion). URL-like strings accepted iff typeof string and trim nonempty; RETURN ORIGINAL STRING BYTES incl spaces, no URL parsing/protocol/host check/trim/fetch. Feedback getters guard config then field lookup; absent=>undefined. externalForm true only boolean true OR exact string true (not uppercase/spaces/1), invalidconfig=>false. Community getter guard config then rawcommunity field; invalid raw=>fresh empty object, valid raw=>fresh object with own keys zh-CN and en-US, each sanitized as above even undefined. locale getter createsboth values and returns exactlocale key, no crosslanguage fallback. getCommunityUrlFromConfigs ALWAYS evaluates remoteUrls then localUrls (evenremotevalid); returns remote same-language??local same-language. Preserve remote/local getter side effects/order and sparse/array property acceptance, keypresence. forceUpdate getter guard config then forceUpdate nonnullobject (arraysallowed), minimalVersion string with trimnonempty=>trimmedstring, otherwiseundefined. Types Locale union zh-CN|en-US. No invented schema/safety hardening; thrown getters propagate. No network/update/security action. Retained fixed locale/field names uncounted; whole getter/validation behavior authored.

Retained API/declarations/static data (no inherited behavior bodies):
```ts
import type { Locale } from "./protocol.js";

interface RemoteAppConfigLike {
    feedback_url?: unknown;
    feedback_api_base?: unknown;
    feedback_use_external_form?: unknown;
    community_urls?: unknown;
    forceUpdate?: unknown;
}

type LocaleUrlMap = Partial<Record<Locale, string>>;

export function getFeedbackUrlFromConfig(config: unknown): string | undefined;

export function getFeedbackApiBaseFromConfig(config: unknown): string | undefined;

export function getFeedbackUseExternalFormFromConfig(config: unknown): boolean;

export function getCommunityUrlsFromConfig(config: unknown): LocaleUrlMap;

export function getCommunityUrlFromConfig(config: unknown, locale: Locale): string | undefined;

export function getCommunityUrlFromConfigs(remoteConfig: unknown, localConfig: unknown, locale: Locale): string | undefined;

export function getForceUpdateMinimalVersionFromConfig(config: unknown): string | undefined;
```
