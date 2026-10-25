// SPDX-License-Identifier: Apache-2.0
// 系统服务装配层。
//
// 分工：本文件只负责「把请求变成可执行计划」与「把响应体读成判定」，
// socket / HTTP 的真实调用、超时与重试由 systemServiceOwner 完成。
// 因此这里没有任何 I/O import，也不读环境变量。

import type {
  IntranetProbeRequest,
  IntranetProbeResult,
  IntranetProbeServiceResponse,
  IntranetProbeTarget,
} from "@knorvia/shared";
import type { ISystemService } from "./system.js";
import type { ProbeTarget } from "./systemServiceOwner.js";
import { createSystemServiceOwner } from "./systemServiceOwner.js";

// 装配参数与策略形状由 owner 定义：这里复用而不是另抄一份字段表，
// 避免「多一层同名类型」后两边悄悄漂移。
type CreateSystemServiceOptions = Parameters<typeof createSystemServiceOwner>[0];
type ProbePolicy = Parameters<typeof createSystemServiceOwner>[1];

/** 单次探测耗时下限：低于它的超时会被抬上来，防止一次抖动就被判成不可达。 */
const DEFAULT_PROBE_TIMEOUT_MS = 100;

/** 未指定重试次数时用的值。 */
const DEFAULT_PROBE_ATTEMPTS = 2;

/** 重试次数上限：调用方给再大的数字也截到这里。 */
const MAX_PROBE_ATTEMPTS = 3;

/** 未指定端口时的缺省值：SSH，内网机器最基本的连通证据。 */
const DEFAULT_PROBE_PORT = 22;

/** 端口合法区间的两端。 */
const LOWEST_PORT = 1;
const HIGHEST_PORT = 65_535;

/** 一份可执行计划：合法目标 + 收进区间的重试与门槛。 */
type ProbePlan = ReturnType<ProbePolicy["plan"]>;

/** 空串与全空白一律当作「没给」。 */
function textOf(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

/** 超时：非有限值取缺省，过小抬到下限。 */
function timeoutOf(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PROBE_TIMEOUT_MS;
  return Math.max(DEFAULT_PROBE_TIMEOUT_MS, Math.floor(value));
}

/** 端口：越界或非整数都回落到缺省端口。 */
function portOf(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return DEFAULT_PROBE_PORT;
  if (value < LOWEST_PORT || value > HIGHEST_PORT) return DEFAULT_PROBE_PORT;
  return value;
}

/** 重试次数夹在 [1, MAX_PROBE_ATTEMPTS]；非有限值按缺省值处理。 */
function attemptsOf(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PROBE_ATTEMPTS;
  return Math.min(MAX_PROBE_ATTEMPTS, Math.max(1, Math.floor(value)));
}

/**
 * 门槛夹在 [1, 目标数]。
 *
 * 下界是 1：门槛为 0 会让空请求也判成「内网」；
 * 上界是目标数：门槛超过目标数就永远达不到。缺省值是目标数本身。
 */
function requiredOf(value: number | undefined, targetCount: number): number {
  const ceiling = Math.max(1, targetCount);
  if (typeof value !== "number" || !Number.isFinite(value)) return ceiling;
  return Math.min(ceiling, Math.max(1, Math.floor(value)));
}

/** 目标没给 ID 时，用「类型 + 原始下标」拼一个稳定标识。 */
function idOf(value: string | undefined, kind: ProbeTarget["kind"], index: number): string {
  return textOf(value) ?? `${kind}-${index}`;
}

/** 只探测 http/https：其它协议不可能出现在内网服务里。 */
function urlIsProbeable(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** TCP 目标：主机为空则丢弃。 */
function tcpTargetOf(target: IntranetProbeTarget, index: number): ProbeTarget | null {
  if (target.kind === "service") return null;
  const host = textOf(target.host);
  if (host === undefined) return null;
  return {
    kind: "tcp",
    targetId: idOf(target.id, "tcp", index),
    host,
    port: portOf(target.port),
    timeoutMs: timeoutOf(target.timeoutMs),
  };
}

/** 服务目标：URL 缺失或协议不可探测则丢弃。 */
function serviceTargetOf(target: IntranetProbeTarget, index: number): ProbeTarget | null {
  if (target.kind !== "service") return null;
  const url = textOf(target.url);
  if (url === undefined || !urlIsProbeable(url)) return null;
  return {
    kind: "service",
    targetId: idOf(target.id, "service", index),
    url,
    expectedMarker: textOf(target.expectedMarker),
    token: textOf(target.token),
    timeoutMs: timeoutOf(target.timeoutMs),
  };
}

/** 请求 → 计划：先剔掉不可探测的目标，再收拢重试与门槛。 */
function planOf(request: IntranetProbeRequest): ProbePlan {
  const targets: ProbeTarget[] = [];
  request.targets.forEach((target, index) => {
    const planned =
      target.kind === "service" ? serviceTargetOf(target, index) : tcpTargetOf(target, index);
    if (planned !== null) targets.push(planned);
  });
  return {
    targets,
    attempts: attemptsOf(request.attempts),
    requiredSuccessCount: requiredOf(request.requiredSuccessCount, targets.length),
  };
}

/** 响应体 → 判定：只有显式 `ok: true` 才算服务自证可用，marker 取非空串。 */
function verdictOf(payload: unknown): IntranetProbeServiceResponse {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("intranet probe response must be a JSON object");
  }
  const { ok, marker } = payload as { ok?: unknown; marker?: unknown };
  const verdict: IntranetProbeServiceResponse = { ok: ok === true };
  if (typeof marker === "string") {
    const text = textOf(marker);
    if (text !== undefined) verdict.marker = text;
  }
  return verdict;
}

/** 策略名由目标种类决定：只有 TCP / 只有服务 / 两者都有。 */
function strategyOf(targets: ProbeTarget[]): IntranetProbeResult["strategy"] {
  const kinds = new Set(targets.map((target) => target.kind));
  if (kinds.size > 1) return "mixed";
  return kinds.has("service") ? "service-http" : "tcp-connect";
}

/** 系统服务：把计划与判定策略交给 owner，owner 负责真实探测。 */
export function createSystemService(options: CreateSystemServiceOptions = {}): ISystemService {
  const policy: ProbePolicy = {
    plan: planOf,
    parseResponse: verdictOf,
    strategy: strategyOf,
  };
  return createSystemServiceOwner(options, policy);
}
