// SPDX-License-Identifier: Apache-2.0
// 内网探测只共享请求与结果的形状：连接和 HTTP 调用发生在 Host 侧，
// renderer 侧只认类型，因此本模块没有任何运行时代码，也不引入 node 能力。

/** 所有目标都有的旋钮：自定义 ID 与单次超时。 */
type TargetFacets = { id?: string; timeoutMs?: number };

type TcpFacets = { kind?: "tcp"; host: string; port?: number };

type ServiceFacets = {
  kind: "service";
  /** 由调用方从 .env 注入，不接受硬编码内网地址。 */
  url: string;
  /** 期望响应里出现的标记；缺省不比对。 */
  expectedMarker?: string;
  /** 放进 x-knorvia-intranet-token 的短期令牌。 */
  token?: string;
};

/** 单目标共有的观测字段：谁、通没通、试了几次。 */
type OutcomeCore = { targetId: string; reachable: boolean; attemptCount: number };

/** 耗时与最后错误；可达时 latencyMs 是数字，否则 null。 */
type OutcomeMeasure = { latencyMs: number | null; error?: string };

type TcpObservation = { kind: "tcp"; host: string; port: number };

type ServiceObservation = { kind: "service"; url: string; marker?: string };

export type IntranetProbeTcpTarget = TargetFacets & TcpFacets;

export type IntranetProbeServiceTarget = TargetFacets & ServiceFacets;

/** 判别键在 TCP 上可省略，所以服务目标必须显式写 kind。 */
type ProbeTargets = IntranetProbeTcpTarget | IntranetProbeServiceTarget;

export type IntranetProbeTarget = ProbeTargets;

/** 门槛三件套：试几次、几个目标算成功。 */
type AttemptBudget = { attempts?: number; requiredSuccessCount?: number };

export type IntranetProbeRequest = AttemptBudget & { targets: ProbeTargets[] };

export type IntranetProbeTcpTargetResult = OutcomeCore & OutcomeMeasure & TcpObservation;

export type IntranetProbeServiceTargetResult = OutcomeCore & OutcomeMeasure & ServiceObservation;

type TargetOutcomes = IntranetProbeTcpTargetResult | IntranetProbeServiceTargetResult;

export type IntranetProbeTargetResult = TargetOutcomes;

type ProbeVerdict = { isIntranet: boolean; reachedTargetCount: number };

type ProbeTally = { requiredSuccessCount: number; totalTargets: number };

type ProbeClock = { checkedAt: number };

type ProbeStrategy = { strategy: "tcp-connect" | "service-http" | "mixed" };

export type IntranetProbeResult = ProbeVerdict &
  ProbeTally &
  ProbeClock &
  ProbeStrategy & { results: TargetOutcomes[] };

/** 服务最小响应体：marker 用来确认连到的是目标服务，而不是任意返回 200 的网关。 */
export type IntranetProbeServiceResponse = { ok: boolean; marker?: string };
