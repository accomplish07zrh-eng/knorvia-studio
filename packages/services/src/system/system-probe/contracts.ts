import type {
  IntranetProbeRequest,
  IntranetProbeResult,
  IntranetProbeServiceResponse,
} from "@knorvia/shared";

export type ProbeTarget =
  | { kind: "tcp"; targetId: string; host: string; port: number; timeoutMs: number }
  | {
      kind: "service";
      targetId: string;
      url: string;
      expectedMarker?: string;
      token?: string;
      timeoutMs: number;
    };

export type TcpParameters = { host: string; port: number; timeoutMs: number };
export type ServiceParameters = { url: string; timeoutMs: number; token?: string };
export type TcpProbe = (params: TcpParameters) => Promise<number>;
export type ServiceProbe = (
  params: ServiceParameters,
) => Promise<{ latencyMs: number; marker?: string }>;
export type OwnerOptions = {
  env?: NodeJS.ProcessEnv;
  isExecutable?: (path: string) => boolean;
  platform?: NodeJS.Platform;
  tcpProbe?: TcpProbe;
  serviceProbe?: ServiceProbe;
  now?: () => number;
};
export type OwnerPolicy = {
  plan: (request: IntranetProbeRequest) => {
    targets: ProbeTarget[];
    attempts: number;
    requiredSuccessCount: number;
  };
  parseResponse: (payload: unknown) => IntranetProbeServiceResponse;
  strategy: (targets: ProbeTarget[]) => IntranetProbeResult["strategy"];
};
export type TargetResult = IntranetProbeResult["results"][number];
