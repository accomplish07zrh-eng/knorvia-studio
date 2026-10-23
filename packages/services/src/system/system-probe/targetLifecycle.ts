// SPDX-License-Identifier: Apache-2.0
// 单个探测目标的执行生命周期。
//
// 边界：本模块不持有 I/O 能力 —— 连接与请求由注入的探针完成，
// 它只决定「预算内试几次、每次算不算成功、失败怎么记账」。

import type { ProbeTarget, ServiceProbe, TargetResult, TcpProbe } from "./contracts.js";

/** 注入的两个探针。 */
type Probes = { tcp: TcpProbe; service: ServiceProbe };

/** 探针交回的观测值。 */
type Observation = { latencyMs: number; marker?: string };

/**
 * 单次尝试的结局。
 *
 * 用可判别联合而不是让异常穿过重试循环：「这次没成」是循环要继续的信号，
 * 不是调用方要处理的错误。
 */
type Attempt = { ok: true; seen: Observation } | { ok: false; why: string };

/** 探针抛出的可能是任意值，统一折算成能写进结果的文案。 */
function whyOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 发起一次探测。
 *
 * 服务目标还要核对 marker：连到了返回 200 的网关但 marker 不符，
 * 语义上等同于没连到目标服务，因此按失败处理、交给外层重试。
 */
async function attemptOf(target: ProbeTarget, probes: Probes): Promise<Attempt> {
  try {
    if (target.kind === "service") {
      const { url, token, timeoutMs, expectedMarker } = target;
      const seen = await probes.service({ url, token, timeoutMs });
      if (expectedMarker !== undefined && expectedMarker !== seen.marker) {
        return { ok: false, why: `marker mismatch: ${seen.marker ?? "none"} != ${expectedMarker}` };
      }
      return { ok: true, seen };
    }
    const { host, port, timeoutMs } = target;
    return { ok: true, seen: { latencyMs: await probes.tcp({ host, port, timeoutMs }) } };
  } catch (error) {
    return { ok: false, why: whyOf(error) };
  }
}

/**
 * 把一次尝试折算成结果记录。
 *
 * 可达时带上本次观测，不可达时耗时置空、只留最后一次失败的原因 ——
 * 「试了几次、最后为什么没通」是排障的唯一线索。
 */
function toResult(target: ProbeTarget, attemptCount: number, attempt: Attempt): TargetResult {
  const { targetId } = target;
  const ids = { targetId, attemptCount };
  const outcome = attempt.ok
    ? { reachable: true as const, latencyMs: attempt.seen.latencyMs }
    : { reachable: false as const, latencyMs: null, error: attempt.why };
  if (target.kind === "service") {
    const { url } = target;
    const marker = attempt.ok ? attempt.seen.marker : undefined;
    return { ...ids, ...outcome, kind: "service", url, marker };
  }
  const { host, port } = target;
  return { ...ids, ...outcome, kind: "tcp", host, port };
}

/**
 * 在预算内反复探测单个目标，成功即刻返回，预算耗尽后返回不可达结果。
 *
 * `attempts` 已由 policy 归一化，这里再兜一层「至少一次」——
 * 否则调用方会拿到既不可达、又没有失败原因的空白记录。
 */
export async function runTarget(
  target: ProbeTarget,
  attempts: number,
  tcpProbe: TcpProbe,
  serviceProbe: ServiceProbe,
): Promise<TargetResult> {
  const probes: Probes = { tcp: tcpProbe, service: serviceProbe };
  const budget = Number.isFinite(attempts) ? Math.max(1, Math.trunc(attempts)) : 1;
  let attempt: Attempt = { ok: false, why: "attempt budget exhausted" };

  for (let tried = 1; tried <= budget; tried += 1) {
    attempt = await attemptOf(target, probes);
    if (attempt.ok) return toResult(target, tried, attempt);
  }

  return toResult(target, budget, attempt);
}
