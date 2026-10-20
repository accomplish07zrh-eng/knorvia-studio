// SPDX-License-Identifier: Apache-2.0
// 网络观测的分类与上报：把一次 RPC 调用的结局转成一条观测记录。
//
// 拆成三件事，各自独立可测：
//   1. `classifyFailure`  —— 从错误文本推断失败种类（规则表驱动）
//   2. `buildObservation` —— 把「调用上下文 + 结局」装配成一条不可变记录
//   3. `emit`             —— 交给当前登记的 sink（模块级唯一装配点）
// 中间层不缓存任何状态，因此这里没有生命周期问题。
import type { NetworkObservation, NetworkTransportKind } from "./network-telemetry-sink.js";

/**
 * 失败种类判定表：按顺序取第一个命中的规则。
 *
 * 文本匹配而非错误码匹配，是因为底层传输可能来自 fetch、WebSocket 或 Node net，
 * 三者给出的错误形态不统一；用文本特征是不依赖实现的唯一稳定判据。
 */
const FAILURE_SIGNATURES: ReadonlyArray<{ kind: string; needles: readonly string[] }> = [
  { kind: "timeout", needles: ["timeout", "timed out"] },
  { kind: "dns_failure", needles: ["dns", "getaddrinfo", "enotfound"] },
  { kind: "connection_reset", needles: ["econnreset", "connection reset", "econnrefused"] },
];

/** 兜底种类：不属于上面任何一类的失败。 */
const UNCLASSIFIED = "other";

/** 从错误里推断失败种类；无法归类时返回 `UNCLASSIFIED`。 */
function classifyFailure(failure: unknown): string {
  const haystack = (failure instanceof Error ? failure.message : String(failure)).toLowerCase();
  for (const signature of FAILURE_SIGNATURES) {
    if (signature.needles.some((needle) => haystack.includes(needle))) {
      return signature.kind;
    }
  }
  return UNCLASSIFIED;
}

/** 装配一条观测记录时所需的全部事实。 */
interface ObservationFacts {
  readonly transport: NetworkTransportKind;
  readonly channelName: string;
  readonly command: string;
  readonly startedAt: number;
  /** 成功时为 `undefined`；失败时携带原始原因。 */
  readonly failure?: unknown;
}

/**
 * 装配一条观测记录。
 *
 * 只构造一次、不做后续赋值：记录会被 sink 拿走后可能被异步处理，
 * 就地修改会引入跨时序的读写竞争。
 */
export function buildObservation(facts: ObservationFacts): NetworkObservation {
  const succeeded = facts.failure === undefined;
  const record: NetworkObservation = {
    transport: facts.transport,
    // 接口名固定为 `<channel>.<command>`：这是 sink 侧做聚合分组的键。
    interface: `${facts.channelName}.${facts.command}`,
    durationMs: Math.max(0, Math.round(performance.now() - facts.startedAt)),
    ok: succeeded,
    attempt: 1,
  };
  if (!succeeded) {
    record.errorKind = classifyFailure(facts.failure);
  }
  return record;
}
