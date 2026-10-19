// SPDX-License-Identifier: Apache-2.0
export interface IntranetProbeTcpTarget {
  id?: string;
  kind?: "tcp";
  host: string;
  port?: number;
  timeoutMs?: number;
}

export interface IntranetProbeServiceTarget {
  id?: string;
  kind: "service";
  url: string;
  expectedMarker?: string;
  token?: string;
  timeoutMs?: number;
}

export type IntranetProbeTarget = IntranetProbeTcpTarget | IntranetProbeServiceTarget;

export interface IntranetProbeRequest {
  targets: IntranetProbeTarget[];
  attempts?: number;
  requiredSuccessCount?: number;
}

export interface IntranetProbeTcpTargetResult {
  targetId: string;
  kind: "tcp";
  host: string;
  port: number;
  reachable: boolean;
  attemptCount: number;
  latencyMs: number | null;
  error?: string;
}

export interface IntranetProbeServiceTargetResult {
  targetId: string;
  kind: "service";
  url: string;
  reachable: boolean;
  attemptCount: number;
  latencyMs: number | null;
  marker?: string;
  error?: string;
}

export type IntranetProbeTargetResult =
  | IntranetProbeTcpTargetResult
  | IntranetProbeServiceTargetResult;

export interface IntranetProbeResult {
  isIntranet: boolean;
  reachedTargetCount: number;
  requiredSuccessCount: number;
  totalTargets: number;
  checkedAt: number;
  strategy: "tcp-connect" | "service-http" | "mixed";
  results: IntranetProbeTargetResult[];
}

export interface IntranetProbeServiceResponse {
  ok: boolean;
  marker?: string;
}
