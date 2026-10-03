Fresh internal author: read ONLY this designated packet and exact /workspace/knorvia-studio/AGENTS.md plus /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No source bodies/tests/deps/history/config/env/other outputs/additional repository reads. User explicitly defers ordinary validation; do NOT run architecture/runtime/tests/typechecks/formatting/network/native operations or write repository. Author entire target file at designated tmp path using whole literal heredoc or apply_patch. Do not inspect/re-read output (sha256sum permitted). Report exact read/write/patch/hash/access limits. Whole draft frozen/hash-bound before curator review. No novelty requirement; exact public declarations/static data below retained uncounted. Curator source-exposed; shared filesystem not OS isolation. No user data/credentials/account/Library/native IO/security actions.

Target packages/shared/src/telemetry.ts; output /tmp/knorvia-telemetry-telemetry-authored.ts

Whole privacy/context behavior owner; retain supplied types/interfaces exactly. resolveSafeTelemetryHostname: optional trim, falsy=>empty; try parse URL, accept only parsed.protocol exact http: or https:, return hostname lowercased, catch parse/protocol/hostname errors=>empty. No networking or alternative protocol admission. sanitizeTelemetryErrorMessage returns [redacted] for truthy value else empty (original text never retained). Private login hostname sanitizer: first resolveSafeTelemetryHostname(value), if truthy return it; else trim lower; accept only nonempty normalized AND resolveSafeTelemetryHostname(https://+normalized)===normalized; elseempty. This admits exact already-extracted hostname incl supported host grammar and rejects path/userinfo/no-protocol misc text; no extra hardening. sanitizeTelemetryEventDetail returns fresh Object.fromEntries of native Object.entries(detail) in order; every key retained; error_msg always redacted; only when elementName app_login_ck AND key login_url apply private hostname sanitizer; other keys unchanged; input not mutated. Error_msg branch wins before login_url branch. collectTelemetryRendererContext MUST evaluate typeof Intl !== undefined ? Intl.DateTimeFormat().resolvedOptions() : undefined even with explicit options. Then timeZone options?.timeZone??resolved?.timeZone??UTC, clientLanguage options?.intlLocale??resolved?.locale??en-US, runtimeScreen reads globalThis.screen, screen=options?.screen??runtimeScreen??{width:0,height:0}. Return exact key insertion clientTimezone/clientLanguage/screenResolution width+'x'+height. Empty explicit options values preserved, no finite/range validation. Native errors from Intl/options/screen propagate; URL catch intentionallybounded toURLhelper. No actual environment/screen collection by author; curator fakeVM only. Fixed literals/field/key vocabulary retained uncounted.

Retained API/static declarations (behavior owner bodies removed):
```ts
export interface TelemetryRendererContext {
    clientTimezone: string;
    clientLanguage: string;
    screenResolution: string;
}

export interface TelemetryEventPayload {
    elementName: string;
    eventRegion: string;
    eventType: string;
    eventText?: string;
    eventExtraDetail: Record<string, string>;
    userId?: string;
    talkId?: string;
    messageId?: string;
}

export interface RendererTelemetryEventPayload extends TelemetryEventPayload {
    context: TelemetryRendererContext;
}

export interface ArmsCustomEventPayload {
    name: string;
    group: string;
    value?: number;
    properties?: Record<string, string | number | boolean | undefined>;
}

export interface FinalArmsCustomEventPayload {
    name: string;
    type: "custom";
    group: string;
    value: number;
    properties: Record<string, string>;
}

export interface FinalArmsCustomEventE2EEntry {
    sequence: number;
    recordedAt: number;
    payload: FinalArmsCustomEventPayload;
}

export interface ConfigureFinalArmsCustomEventE2ERequest {
    suppressedEventNames: string[];
}

export function resolveSafeTelemetryHostname(value: string | null | undefined): string;

export function sanitizeTelemetryErrorMessage(value: string | null | undefined): string;

export function sanitizeTelemetryEventDetail(elementName: string, detail: Readonly<Record<string, string>>): Record<string, string>;

interface TelemetryScreenLike {
    width: number;
    height: number;
}

interface TelemetryWindowLike {
    intlLocale?: string;
    timeZone?: string;
    screen: TelemetryScreenLike;
}

export function collectTelemetryRendererContext(options?: TelemetryWindowLike): TelemetryRendererContext;
```
