import { createSystemServiceOwner } from "./systemServiceOwner.js";

import type {
  IntranetProbeResult,
  IntranetProbeServiceResponse,
  IntranetProbeServiceTarget,
  IntranetProbeTarget,
  IntranetProbeTcpTarget,
} from "@knorvia/shared";
import type { ISystemService } from "./system.js";

const DEFAULT_PROBE_TIMEOUT_MS = 800;
const DEFAULT_PROBE_ATTEMPTS = 2;
const MAX_PROBE_ATTEMPTS = 3;
const DEFAULT_PROBE_PORT = 22;

interface NormalizedProbeTarget {
  kind: "tcp";
  targetId: string;
  host: string;
  port: number;
  timeoutMs: number;
}

interface NormalizedServiceProbeTarget {
  kind: "service";
  targetId: string;
  url: string;
  expectedMarker?: string;
  token?: string;
  timeoutMs: number;
}

type NormalizedTarget = NormalizedProbeTarget | NormalizedServiceProbeTarget;

interface TcpProbeParams {
  host: string;
  port: number;
  timeoutMs: number;
}

interface CreateSystemServiceOptions {
  env?: NodeJS.ProcessEnv;
  isExecutable?: (path: string) => boolean;
  platform?: NodeJS.Platform;
  tcpProbe?: (params: TcpProbeParams) => Promise<number>;
  serviceProbe?: (params: ServiceProbeParams) => Promise<ServiceProbeResult>;
  now?: () => number;
}

interface ServiceProbeParams {
  url: string;
  timeoutMs: number;
  token?: string;
}

interface ServiceProbeResult {
  latencyMs: number;
  marker?: string;
}

function normalizeProbeAttempts(attempts: number | undefined): number {
  if (typeof attempts !== "number" || !Number.isFinite(attempts)) {
    return DEFAULT_PROBE_ATTEMPTS;
  }

  return Math.min(MAX_PROBE_ATTEMPTS, Math.max(1, Math.floor(attempts)));
}

function normalizeRequiredSuccessCount(
  requiredSuccessCount: number | undefined,
  totalTargets: number,
): number {
  if (totalTargets <= 0) {
    return 1;
  }

  if (typeof requiredSuccessCount !== "number" || !Number.isFinite(requiredSuccessCount)) {
    return 1;
  }

  return Math.min(totalTargets, Math.max(1, Math.floor(requiredSuccessCount)));
}

function normalizeProbeTimeout(timeoutMs: number | undefined): number {
  return typeof timeoutMs === "number" && Number.isFinite(timeoutMs)
    ? Math.min(10_000, Math.max(100, Math.floor(timeoutMs)))
    : DEFAULT_PROBE_TIMEOUT_MS;
}

function normalizeTcpTarget(target: IntranetProbeTcpTarget): NormalizedProbeTarget | null {
  const host = target.host.trim();
  if (host.length === 0) {
    return null;
  }

  const resolvedPort =
    typeof target.port === "number" &&
    Number.isInteger(target.port) &&
    target.port >= 1 &&
    target.port <= 65535
      ? target.port
      : DEFAULT_PROBE_PORT;

  return {
    kind: "tcp",
    targetId: target.id?.trim() || `${host}:${resolvedPort}`,
    host,
    port: resolvedPort,
    timeoutMs: normalizeProbeTimeout(target.timeoutMs),
  };
}

function normalizeServiceTarget(
  target: IntranetProbeServiceTarget,
): NormalizedServiceProbeTarget | null {
  const urlText = target.url.trim();
  if (urlText.length === 0) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlText);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return null;
  }

  const expectedMarker = target.expectedMarker?.trim();
  const token = target.token?.trim();

  return {
    kind: "service",
    targetId: target.id?.trim() || parsedUrl.toString(),
    url: parsedUrl.toString(),
    expectedMarker: expectedMarker && expectedMarker.length > 0 ? expectedMarker : undefined,
    token: token && token.length > 0 ? token : undefined,
    timeoutMs: normalizeProbeTimeout(target.timeoutMs),
  };
}

function normalizeProbeTarget(target: IntranetProbeTarget): NormalizedTarget | null {
  if (target.kind === "service") {
    return normalizeServiceTarget(target);
  }

  return normalizeTcpTarget(target);
}

function parseProbeServiceResponse(payload: unknown): IntranetProbeServiceResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid service response");
  }

  const response = payload as IntranetProbeServiceResponse;
  if (typeof response.ok !== "boolean") {
    throw new Error("invalid service response: missing ok");
  }

  if (
    "marker" in response &&
    response.marker !== undefined &&
    typeof response.marker !== "string"
  ) {
    throw new Error("invalid service response: marker must be string");
  }

  return response;
}

function resolveProbeStrategy(targets: NormalizedTarget[]): IntranetProbeResult["strategy"] {
  if (targets.every((target) => target.kind === "tcp")) {
    return "tcp-connect";
  }
  if (targets.every((target) => target.kind === "service")) {
    return "service-http";
  }
  return "mixed";
}
export function createSystemService(options: CreateSystemServiceOptions = {}): ISystemService {
  return createSystemServiceOwner(options, {
    plan(request) {
      const targets = request.targets
        .map(normalizeProbeTarget)
        .filter((target): target is NormalizedTarget => target !== null);
      const attempts = normalizeProbeAttempts(request.attempts);
      const requiredSuccessCount = normalizeRequiredSuccessCount(
        request.requiredSuccessCount,
        targets.length,
      );
      return { targets, attempts, requiredSuccessCount };
    },
    parseResponse: parseProbeServiceResponse,
    strategy: resolveProbeStrategy,
  });
}
