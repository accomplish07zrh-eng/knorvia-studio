# official-mcp-auth owner packet

You are a fresh complete-owner author with no inherited context. Author ONLY the named allocated shared source file. Use GPT-6.1 Sol/high as selected. Read EXACTLY this packet plus cat /workspace/knorvia-studio/AGENTS.md and cat /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. Do not inspect other source/tests/dependencies/history/config/environment/network/other authors/output bodies. No runtime/format/check/repository write. Fixed declaration material below includes retained schema/static-map callbacks, not substantive owner bodies or independent credit; preserve it without cosmetic rewriting. Full substantive behavior bodies must be supplied from the contract. Preserve API/dependency identity. No policy widening. Write ONE WHOLE literal heredoc or apply_patch to the designated /tmp output (no file assembly/extraction/transform, no self-inspection). Then sha256sum that output ONLY. Report hash, exact reads/write method and any access deviations. Shared filesystem is not OS isolation; do not claim independent provenance/MIT. Stop for curator freeze/review. User overrides repo broad checks and forbids live operations; you must not run any checks except SHA metadata.

Output: /tmp/knorvia-authority-official-mcp-auth-authored.ts

Behavior:
Own the complete origin decision and async registry from this behavior, with existing public API and fixed declarations. No auth operation, credentials or network. Short header/string adapters are conventional retained behavior, uncounted: reserved name trims/lowercases into retained Set; undefined headers gives[], own Object.keys normalized/deduplicated sorted; summary Map of Object.entries name.lowercase (NO trim), last equal-lowercase value wins, sorted key names, has organization/project booleans, equality pair flag, conditional truthy target type only (do not leak other values).
normalizeHttpsOrigin accepts any valid URL whose protocol is https and username/password empty, returns URL.origin (path/query/fragment are tolerated, contrary to stricter prose). Invalid URL catches undefined. Loopback normalizer likewise forbids credentials and requires http plus hostname exactly127.0.0.1/localhost/[::1]; port participates in origin; valid paths tolerated. parseDev raw?.trim(), falsy=>[], split comma trimmed truthy entries in order.
isOfficialMcpOriginTrusted reads input.origin.trim() first; empty => {detail:invalid_input,trusted:false}. Normalize target loopback and ONLY if truthy iterate parsed dev list; matching normalized loopback returns ok true even without expected authority. Never compare two undefined normalizations as equality admission. Then truthy input.knorviaApiOrigin normalized HTTPS otherwiseundefined; if absent/invalid =>knorvia_origin_unresolved false; normalize targetHTTPS and compare expected =>origin_mismatch false or ok true. Literal pluginId is ignored for authority; do not add filters. Exact result own key order detail then trusted.
Registry returns object with async isTrusted destructuring origin/pluginId, ignores mcpKey. Each call eagerly awaits options.resolveKnorviaApiOrigin() with options receiver; catch covers resolver only and returns unresolved false (including rejection). THEN call trust decision outside catch, reading current options.devTrustedOriginsRaw (not creation-time snapshot). Trust decision input order devTrustedOriginsRaw,origin,pluginId,knorviaApiOrigin. Resolver throw even dev-loopback fails closed. Do not cache calls or broaden catch. Keep constructor-free interface shape. Preserve existing behavior, not security redesign.

Fixed declarations and body-free named signatures (declarations can be placed around implementations as needed; validation retains original max-lines waiver):
```ts
export const KNORVIA_OFFICIAL_MCP_AUTH_TYPE = "knorvia_official" as const;

export const KNORVIA_OFFICIAL_MCP_AUTH_PROVIDER_JWT_TOKEN = "jwt_token" as const;

export const OFFICIAL_MCP_AUTH_HEADER_NAMES = {
    authorization: "Authorization",
    codingPlanAuthorization: "X-Bigmodel-Authorization",
    targetType: "Bigmodel-Target-Type",
    organization: "Bigmodel-Organization",
    project: "Bigmodel-Project",
} as const;

export const OFFICIAL_MCP_AUTH_META_KEY = "com.knorvia-studio/official-mcp-auth" as const;

export const OFFICIAL_MCP_RESERVED_HEADER_NAMES: readonly string[] = [
    ...Object.values(OFFICIAL_MCP_AUTH_HEADER_NAMES).map((name) => name.toLowerCase()),
    "x-coding-plan-api-key",
    "mcp-session-id",
    "mcp-protocol-version",
];

const RESERVED_HEADER_SET = new Set(OFFICIAL_MCP_RESERVED_HEADER_NAMES);

export function isOfficialMcpReservedHeaderName(name: string): boolean;

export function findOfficialMcpReservedHeaders(headers: Record<string, string> | undefined): string[];

export type OfficialMcpTargetType = "PERSONAL" | "TEAM";

export const OFFICIAL_MCP_AUTH_FAILURE_REASONS = [
    "official_auth_unavailable",
    "official_auth_plan_required",
] as const;

export type OfficialMcpAuthFailureReason = (typeof OFFICIAL_MCP_AUTH_FAILURE_REASONS)[number];

export const OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS = [
    ...OFFICIAL_MCP_AUTH_FAILURE_REASONS,
    "official_mcp_origin_untrusted",
] as const;

export type OfficialMcpAuthPortFailureReason = (typeof OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS)[number];

export type OfficialMcpAuthFailureKind = OfficialMcpAuthFailureReason | "official_mcp_origin_untrusted" | "official_auth_rejected" | "official_auth_forbidden" | "official_auth_redirect_blocked";

function normalizeHttpsOrigin(candidate: string): string | undefined;

function normalizeLoopbackOrigin(candidate: string): string | undefined;

export const OFFICIAL_MCP_DEV_TRUSTED_ORIGINS_ENV = "KNORVIA_OFFICIAL_MCP_DEV_TRUSTED_ORIGINS";

export const KNORVIA_WORKSPACE_IDENTITY_ENV = "KNORVIA_WORKSPACE_IDENTITY";

export function summarizeOfficialMcpIdentityHeaders(headers: Record<string, string>): Record<string, unknown>;

export interface OfficialMcpTrustResult {
    trusted: boolean;
    detail: "ok" | "invalid_input" | "origin_mismatch" | "knorvia_origin_unresolved";
}

export interface IsOfficialMcpOriginTrustedInput {
    devTrustedOriginsRaw?: string | undefined;
    origin: string;
    pluginId: string;
    knorviaApiOrigin: string | undefined;
}

export function isOfficialMcpOriginTrusted(input: IsOfficialMcpOriginTrustedInput): OfficialMcpTrustResult;

function parseDevTrustedOrigins(raw: string | undefined): string[];

export interface OfficialMcpTrustedOriginRegistry {
    isTrusted(input: {
        mcpKey: string;
        origin: string;
        pluginId: string;
    }): Promise<OfficialMcpTrustResult>;
}

export interface CreateOfficialMcpTrustedOriginRegistryOptions {
    devTrustedOriginsRaw?: string | undefined;
    resolveKnorviaApiOrigin: () => string | undefined | Promise<string | undefined>;
}

export function createOfficialMcpTrustedOriginRegistry(options: CreateOfficialMcpTrustedOriginRegistryOptions): OfficialMcpTrustedOriginRegistry;
```
