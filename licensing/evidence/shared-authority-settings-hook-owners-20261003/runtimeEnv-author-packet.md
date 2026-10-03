# runtimeEnv owner packet

You are a fresh complete-owner author with no inherited context. Author ONLY the named allocated shared source file. Use GPT-6.1 Sol/high as selected. Read EXACTLY this packet plus cat /workspace/knorvia-studio/AGENTS.md and cat /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. Do not inspect other source/tests/dependencies/history/config/environment/network/other authors/output bodies. No runtime/format/check/repository write. Fixed declaration material below includes retained schema/static-map callbacks, not substantive owner bodies or independent credit; preserve it without cosmetic rewriting. Full substantive behavior bodies must be supplied from the contract. Preserve API/dependency identity. No policy widening. Write ONE WHOLE literal heredoc or apply_patch to the designated /tmp output (no file assembly/extraction/transform, no self-inspection). Then sha256sum that output ONLY. Report hash, exact reads/write method and any access deviations. Shared filesystem is not OS isolation; do not claim independent provenance/MIT. Stop for curator freeze/review. User overrides repo broad checks and forbids live operations; you must not run any checks except SHA metadata.

Output: /tmp/knorvia-authority-runtimeEnv-authored.ts

Behavior:
Complete private capture/sanitization owner. Do not run/read process.env; defaults process.env must remain in published signatures but tests will supply virtual process or explicit records. Retain all exact constants/arrays/regex/types/private state declarations. Short flag/runtime adapters are conventional uncounted: explicit dev trim lowercase 1/true/on; CUA feature dev wins even disabledproduct, otherwise product0/false/off=>false else true. normalize runtime development/production/test trimlowercase elseundefined; resolve supplied key fallback production nullish.
Capture broker reads exact-case socket,pluginAuthority,refreshMarker IN THAT ORDER, each ?.trim(). If both socket andauthority truthy freeze new object socket,pluginAuthority,optional truthyrefreshMarker; replace snapshot and return. If onlyone truthy clear snapshot. Neither retains old snapshot (including refresh-only input); never join old/new halves. Read getter returns copy old snapshot else explicit own socket:undefined/pluginAuthority:undefined, optionalrefresh onlywhenheld. Reset setsundefined. Captured telemetry private {} map accumulates via Object.assign(read...) without clearing absent keys. Reader loops SANITIZED_RUNTIME_ENV_KEYS in listed order, selects keys startsOTEL_ orKNORVIA_TELEMETRY_ or equalsKNORVIA_MODEL_TELEMETRY_ENABLED, exact-case env[key]?.trim(), truthyassign. Getter shallowcopy; reset deletes own Object.keys values. No cache per env object and no other keycapture.
shouldSanitize uppercaseskey then .some array equality OR package-manager regex test(originalkey). shouldCapture uppercaseskey, rejects telemetry prefixes/model flag, rejects NON_TOOL list then calls shouldSanitize(originalkey). Preserve exact blacklist even where legacy broker TOKEN is sanitized but permitted passthrough: do NOT harden policy. Mixed-case retained key names copied as given. UnknownOTEL_ key rejected passthrough but not sanitized unless in list.
sanitize copy capturesbroker THEN telemetry BEFORE Object.entries(env), skips undefined or shouldSanitize, preserves other strings includingempty and givenkey casing, no input mutation. InPlace same captures then Object.keys env deletes keys whose predicate true evenundefined, preserves other undefined properties.
read passthrough reads exact rawkey; falsy=>{}; JSON.parse try with objecttruthy/nonarray guard (any object accepted); Object.entries nativeorder retain ONLY string value, key regex /^[A-Za-z_][A-Za-z0-9_]*$/, shouldCapture true, using {} result. Parse/object/entry/getter/predicate exceptions withintry return {}. No trimming stored values.
build first reads priorJSON then enumerates native env entries, skips undefined or !predicate, directly overrides matching existingkeys; explicitvalue empty permitted. stringify sorts Object.entries with left.localeCompare(right), no entries returns{}, else one own passthrough key JSON.stringify(Object.fromEntries(sorted)). Do not expose captures in tool outputs. Preserve error/read/order semantics and private module state.

Fixed declarations and body-free named signatures (declarations can be placed around implementations as needed; validation retains original max-lines waiver):
```ts
export const KNORVIA_RUNTIME_ENV_KEY = "KNORVIA_RUNTIME_ENV";

export const KNORVIA_HTTP_PROXY_ENV_KEY = "KNORVIA_HTTP_PROXY";

export const KNORVIA_NO_PROXY_ENV_KEY = "KNORVIA_NO_PROXY";

export const KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY = "KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY";

export const KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY = "KNORVIA_REMOTE_HTTP_PROXY";

export const KNORVIA_REMOTE_NO_PROXY_ENV_KEY = "KNORVIA_REMOTE_NO_PROXY";

export const KNORVIA_AGENT_CA_CERT_ENV_KEY = "KNORVIA_AGENT_CA_CERT";

export const KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY = "KNORVIA_TOOL_ENV_PASSTHROUGH_JSON";

export const KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV = "KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED";

export const KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY = "KNORVIA_CUA_PRODUCT_HELPER";

export const KNORVIA_CUA_BROKER_SOCKET_ENV_KEY = "KNORVIA_CUA_PERMISSION_BROKER_SOCKET";

export const KNORVIA_CUA_NODE_REPL_HOST_ENV_KEY = "KNORVIA_CUA_NODE_REPL_HOST";

export const KNORVIA_CUA_DEV_MODE_ENV_KEY = "KNORVIA_CUA_DEV_MODE";

export type KnorviaRuntimeEnv = "development" | "production" | "test";

type EnvRecord = Record<string, string | undefined>;

export function isCuaDevModeRequested(env: EnvRecord = process.env): boolean;

export function isKnorviaCuaInternalFeatureEnabled(env: EnvRecord = process.env): boolean;

const SANITIZED_RUNTIME_ENV_KEYS = [
    "NODE_ENV",
    "ELECTRON_RUN_AS_NODE",
    "NODE_NO_WARNINGS",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "NODE_EXTRA_CA_CERTS",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE",
    "GIT_SSL_CAINFO",
    KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
    KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY,
    KNORVIA_REMOTE_NO_PROXY_ENV_KEY,
    KNORVIA_CUA_BROKER_SOCKET_ENV_KEY,
    "KNORVIA_CUA_PERMISSION_BROKER_TOKEN",
    "KNORVIA_CUA_PERMISSION_BROKER_REFRESH_MARKER",
    "KNORVIA_CUA_PLUGIN_AUTHORITY",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
    "OTEL_EXPORTER_OTLP_HEADERS",
    "OTEL_EXPORTER_OTLP_TRACES_HEADERS",
    "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
    "OTEL_EXPORTER_OTLP_METRICS_HEADERS",
    "OTEL_SERVICE_NAME",
    "OTEL_RESOURCE_ATTRIBUTES",
    "OTEL_EXPORTER_OTLP_COMPRESSION",
    "KNORVIA_MODEL_TELEMETRY_ENABLED",
    "KNORVIA_TELEMETRY_DEVICE_MID",
    "KNORVIA_TELEMETRY_USER_ID",
    "KNORVIA_TELEMETRY_USER_ID_HASH",
    "KNORVIA_TELEMETRY_USER_SUBJECT_ID",
    "KNORVIA_TELEMETRY_IDENTITY_STATE",
    "KNORVIA_TELEMETRY_RUNTIME_SURFACE",
    "KNORVIA_TELEMETRY_RUNTIME_DISTRIBUTION",
] as const;

const NON_TOOL_PASSTHROUGH_RUNTIME_ENV_KEYS = [
    "NODE_ENV",
    "ELECTRON_RUN_AS_NODE",
    "NODE_NO_WARNINGS",
    KNORVIA_CUA_BROKER_SOCKET_ENV_KEY,
    "KNORVIA_CUA_PERMISSION_BROKER_REFRESH_MARKER",
    "KNORVIA_CUA_PLUGIN_AUTHORITY",
    KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
    KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY,
    KNORVIA_REMOTE_NO_PROXY_ENV_KEY,
] as const;

const SANITIZED_PACKAGE_MANAGER_ENV_PATTERN = /^(npm_config|yarn|pnpm)_(http_proxy|https_proxy|proxy|all_proxy|no_proxy|cafile|ca)$/i;

export function normalizeKnorviaRuntimeEnv(value: string | undefined): KnorviaRuntimeEnv | undefined;

export function resolveKnorviaRuntimeEnv(env: Record<string, string | undefined>, fallback: KnorviaRuntimeEnv = "production"): KnorviaRuntimeEnv;

export const KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY = "KNORVIA_CUA_PLUGIN_AUTHORITY";

interface CapturedCuaBrokerCredentials {
    socket: string;
    pluginAuthority: string;
    refreshMarker?: string;
}

let capturedCuaBrokerCredentials: Readonly<CapturedCuaBrokerCredentials> | undefined;

const capturedKnorviaAgentTelemetryEnv: Record<string, string> = {};

function captureKnorviaCuaBrokerCredentials(env: Record<string, string | undefined>): void;

function captureKnorviaAgentTelemetryEnv(env: Record<string, string | undefined>): void;

export function readKnorviaAgentTelemetryEnv(env: Record<string, string | undefined>): Record<string, string>;

export function getCapturedKnorviaAgentTelemetryEnv(): Record<string, string>;

export function getCapturedKnorviaCuaBrokerCredentials(): {
    socket: string | undefined;
    pluginAuthority: string | undefined;
    refreshMarker?: string;
};

export function resetCapturedKnorviaCuaBrokerCredentialsForTest(): void;

export function resetCapturedKnorviaAgentTelemetryEnvForTest(): void;

export function sanitizeKnorviaRuntimeEnv<T extends Record<string, string | undefined>>(env: T): Record<string, string>;

export function buildKnorviaToolEnvPassthroughEnv(env: EnvRecord): Record<string, string>;

export function readKnorviaToolEnvPassthroughEnv(env: EnvRecord): Record<string, string>;

export function sanitizeKnorviaRuntimeEnvInPlace(env: Record<string, string | undefined>): void;

function isKnorviaAgentTelemetryEnvKey(key: string): boolean;

export function shouldSanitizeKnorviaRuntimeEnvKey(key: string): boolean;

export function shouldCaptureKnorviaToolEnvPassthroughKey(key: string): boolean;

function stringifyKnorviaToolEnvPassthroughEnv(captured: Record<string, string>): Record<string, string>;
```
