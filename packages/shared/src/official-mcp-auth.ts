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

export function isOfficialMcpReservedHeaderName(name: string): boolean {
  return RESERVED_HEADER_SET.has(name.trim().toLowerCase());
}

export function findOfficialMcpReservedHeaders(
  headers: Record<string, string> | undefined,
): string[] {
  if (!headers) {
    return [];
  }
  const reservedNames = new Set<string>();
  for (const name of Object.keys(headers)) {
    const normalizedName = name.trim().toLowerCase();
    if (RESERVED_HEADER_SET.has(normalizedName)) {
      reservedNames.add(normalizedName);
    }
  }
  return [...reservedNames].sort();
}

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

export type OfficialMcpAuthPortFailureReason =
  (typeof OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS)[number];

export type OfficialMcpAuthFailureKind =
  | OfficialMcpAuthFailureReason
  | "official_mcp_origin_untrusted"
  | "official_auth_rejected"
  | "official_auth_forbidden"
  | "official_auth_redirect_blocked";

function normalizeHttpsOrigin(candidate: string): string | undefined {
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function normalizeLoopbackOrigin(candidate: string): string | undefined {
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" || parsed.username !== "" || parsed.password !== "") {
      return undefined;
    }
    if (
      parsed.hostname !== "127.0.0.1" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "[::1]"
    ) {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

export const OFFICIAL_MCP_DEV_TRUSTED_ORIGINS_ENV = "KNORVIA_OFFICIAL_MCP_DEV_TRUSTED_ORIGINS";

export const KNORVIA_WORKSPACE_IDENTITY_ENV = "KNORVIA_WORKSPACE_IDENTITY";

export function summarizeOfficialMcpIdentityHeaders(
  headers: Record<string, string>,
): Record<string, unknown> {
  const lower = new Map<string, string>();
  for (const [name, value] of Object.entries(headers)) {
    lower.set(name.toLowerCase(), value);
  }
  const organizationPresent = lower.has("bigmodel-organization");
  const projectPresent = lower.has("bigmodel-project");
  const summary: Record<string, unknown> = {
    identityHeaderNames: [...lower.keys()].sort(),
    identityOrganizationPresent: organizationPresent,
    identityProjectPresent: projectPresent,
    identityTeamPaired: organizationPresent === projectPresent,
  };
  const targetType = lower.get("bigmodel-target-type");
  if (targetType) {
    summary.identityTargetType = targetType;
  }
  return summary;
}

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

export function isOfficialMcpOriginTrusted(
  input: IsOfficialMcpOriginTrustedInput,
): OfficialMcpTrustResult {
  const origin = input.origin.trim();
  if (!origin) {
    return { detail: "invalid_input", trusted: false };
  }

  const loopbackOrigin = normalizeLoopbackOrigin(origin);
  if (loopbackOrigin) {
    for (const allowedOrigin of parseDevTrustedOrigins(input.devTrustedOriginsRaw)) {
      if (normalizeLoopbackOrigin(allowedOrigin) === loopbackOrigin) {
        return { detail: "ok", trusted: true };
      }
    }
  }

  const expectedOrigin = input.knorviaApiOrigin
    ? normalizeHttpsOrigin(input.knorviaApiOrigin)
    : undefined;
  if (!expectedOrigin) {
    return { detail: "knorvia_origin_unresolved", trusted: false };
  }
  if (normalizeHttpsOrigin(origin) !== expectedOrigin) {
    return { detail: "origin_mismatch", trusted: false };
  }
  return { detail: "ok", trusted: true };
}

function parseDevTrustedOrigins(raw: string | undefined): string[] {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => Boolean(entry));
}

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

export function createOfficialMcpTrustedOriginRegistry(
  options: CreateOfficialMcpTrustedOriginRegistryOptions,
): OfficialMcpTrustedOriginRegistry {
  return {
    async isTrusted({ origin, pluginId }) {
      let knorviaApiOrigin: string | undefined;
      try {
        knorviaApiOrigin = await options.resolveKnorviaApiOrigin();
      } catch {
        return { detail: "knorvia_origin_unresolved", trusted: false };
      }
      return isOfficialMcpOriginTrusted({
        devTrustedOriginsRaw: options.devTrustedOriginsRaw,
        origin,
        pluginId,
        knorviaApiOrigin,
      });
    },
  };
}
