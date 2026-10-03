import type { ProbeTarget, ServiceProbe, TargetResult, TcpProbe } from "./contracts.js";

export async function runTarget(
  target: ProbeTarget,
  attempts: number,
  tcpProbe: TcpProbe,
  serviceProbe: ServiceProbe,
): Promise<TargetResult> {
  let lastError = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (target.kind === "tcp") {
        const latencyMs = await tcpProbe({
          host: target.host,
          port: target.port,
          timeoutMs: target.timeoutMs,
        });
        return {
          targetId: target.targetId,
          kind: "tcp",
          host: target.host,
          port: target.port,
          reachable: true,
          attemptCount: attempt,
          latencyMs,
        };
      }
      const result = await serviceProbe({
        url: target.url,
        timeoutMs: target.timeoutMs,
        token: target.token,
      });
      if (target.expectedMarker && result.marker !== target.expectedMarker) {
        throw new Error(
          `marker mismatch(expected=${target.expectedMarker}, actual=${result.marker ?? "<empty>"})`,
        );
      }
      return {
        targetId: target.targetId,
        kind: "service",
        url: target.url,
        reachable: true,
        attemptCount: attempt,
        latencyMs: result.latencyMs,
        marker: result.marker,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (target.kind === "tcp") {
    return {
      targetId: target.targetId,
      kind: "tcp",
      host: target.host,
      port: target.port,
      reachable: false,
      attemptCount: attempts,
      latencyMs: null,
      error: lastError || "probe failed",
    };
  }
  return {
    targetId: target.targetId,
    kind: "service",
    url: target.url,
    reachable: false,
    attemptCount: attempts,
    latencyMs: null,
    error: lastError || "probe failed",
  };
}
