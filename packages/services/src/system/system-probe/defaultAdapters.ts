import { Socket } from "node:net";
import type { OwnerPolicy, ServiceParameters, TcpParameters } from "./contracts.js";

export function probeTcp({ host, port, timeoutMs }: TcpParameters): Promise<number> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      complete();
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      const latencyMs = Math.max(0, Date.now() - startedAt);
      finish(() => resolve(latencyMs));
    });
    socket.once("timeout", () => {
      finish(() => reject(new Error(`timeout(${timeoutMs}ms)`)));
    });
    socket.once("error", (error) => {
      finish(() => reject(error));
    });
    socket.connect(port, host);
  });
}

export async function probeHttp(
  params: ServiceParameters,
  policy: OwnerPolicy,
): Promise<{ latencyMs: number; marker?: string }> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await fetch(params.url, {
      method: "GET",
      headers: params.token ? { "x-knorvia-intranet-token": params.token } : undefined,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload: unknown = await response.json();
    const parsed = policy.parseResponse(payload);
    if (!parsed.ok) throw new Error("service returned ok=false");
    return {
      latencyMs: Math.max(0, Date.now() - startedAt),
      marker: parsed.marker,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`timeout(${params.timeoutMs}ms)`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
