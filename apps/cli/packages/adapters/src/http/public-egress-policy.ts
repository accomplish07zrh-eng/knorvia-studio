// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 公共出口策略：判断一个目标主机是否允许出网。本层只做「允许/拒绝」的判定，
// 不负责重试、超时或缓存。
//
// 判定顺序（拒绝即抛 egress_blocked，带稳定错误码）：
// 一、目标必须是可归一化的主机名；
// 二、localhost、*.localhost、*.local 一律拒绝；
// 三、既不是 IP 字面量、又不含点的主机（如内网短名）拒绝；
// 四、是 IP 字面量就直接用，否则走注入的 dnsLookup 解析；
// 五、解析结果为空拒绝；任一地址落在非公有网段也拒绝。
//
// 取消优先于结果：signal 已取消时立刻抛出 signal.reason。

import { lookup as nodeLookup } from "node:dns/promises";
import type http from "node:http";
import {
  createHttpClientError,
  getIpAddressVersion,
  getPublicEgressIpBlockReason,
  normalizeIpAddressLiteral,
} from "@knorvia/contracts";
import type {
  Completion,
  DnsLookup,
  DnsLookupAddress,
  PublicEgressLookupOptions,
} from "./public-egress-policy-types.js";

export type { DnsLookupAddress, DnsLookup } from "./public-egress-policy-types.js";

/** 明确的本地主机名后缀：命中即拒绝。 */
const LOCAL_HOST_SUFFIXES = [".localhost", ".local"];

/** 取消时的兜底原因（父 signal 没带 Error 时用）。 */
const CANCELLED_MESSAGE = "HTTP request was cancelled";

/** 解析上下文的三个要素：主机、所属 URL、解析器；选项单独传。 */
type ResolveContext = {
  targetHost: string;
  context: URL;
  dnsLookup: DnsLookup;
};

/** 造一条 egress_blocked 错误。 */
function reject(url: string, message: string): Error {
  const details = { code: "egress_blocked" as const, url, message };
  return createHttpClientError(details);
}

/** 从 signal 取取消原因：父级给了 Error 就用它，否则用兜底文案。 */
function cancelReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error(CANCELLED_MESSAGE);
}

/** 该主机名是否属于明确禁止的本地形态。 */
function isLocalHostname(host: string): boolean {
  if (host === "localhost") return true;
  return LOCAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * 发起 DNS 查询并把它与取消信号联动。
 * 先观察 Promise 的拒绝（resolver 可能同步取消后返回已拒绝的 Promise，不能因后面的
 * 早退而留下未处理的拒绝）；再在信号上挂一次性监听，先到者结算。
 */
async function queryAddresses(
  ask: ResolveContext,
  signal?: AbortSignal,
): Promise<DnsLookupAddress[]> {
  if (signal?.aborted) throw cancelReason(signal);

  const resolving = ask.dnsLookup(ask.targetHost, { all: true, verbatim: true });
  void resolving.catch(() => {});
  if (signal?.aborted) throw cancelReason(signal);
  if (!signal) return resolving;

  const querySignal = signal;
  return new Promise<DnsLookupAddress[]>((resolve, rejectQuery) => {
    let settled = false;

    const finish = (deliver: () => void): void => {
      if (settled) return;
      settled = true;
      querySignal.removeEventListener("abort", onAbort);
      deliver();
    };
    const onAbort = (): void => finish(() => rejectQuery(cancelReason(querySignal)));

    querySignal.addEventListener("abort", onAbort, { once: true });
    void resolving.then(
      (resolved) => finish(() => resolve(resolved)),
      (reason: unknown) => finish(() => rejectQuery(reason)),
    );
    if (querySignal.aborted) onAbort();
  });
}

/** 解析并校验目标主机；返回可用的地址列表（IP 字面量时长度为 1）。 */
async function resolvePublicAddresses(
  ask: ResolveContext,
  options?: PublicEgressLookupOptions,
): Promise<DnsLookupAddress[]> {
  const origin = ask.context.toString();
  const host = normalizeIpAddressLiteral(ask.targetHost);
  if (!host) throw reject(origin, "HTTP public egress requires a hostname");
  if (isLocalHostname(host)) {
    throw reject(origin, `HTTP public egress blocked local hostname ${host}`);
  }

  const family = getIpAddressVersion(host);
  if (!family && !host.includes(".")) {
    throw reject(origin, "HTTP public egress requires a public hostname");
  }

  const resolved = family
    ? [{ address: host, family }]
    : await queryAddresses({ ...ask, targetHost: host }, options?.signal);
  if (resolved.length === 0) {
    throw reject(origin, `HTTP public egress DNS lookup returned no addresses for ${host}`);
  }
  for (const item of resolved) {
    if (getPublicEgressIpBlockReason(item.address)) {
      throw reject(
        origin,
        `HTTP public egress blocked ${host} because it resolved to a non-public address`,
      );
    }
  }
  return resolved;
}

// 实现侧说明（形状见 public-egress-policy-types.ts）：
// 一、策略只做「目标是否允许出网」判断，不负责重试或超时。
// 二、解析失败与地址为空都按「禁止」处理，并带上稳定错误码 egress_blocked。
// 三、取消优先于结果：signal 已取消时立即抛出 signal.reason。
// 四、解析走注入的 dnsLookup，便于测试与宿主替换。
// 五、地址归一化与版本判断复用共享工具，本文件不再自行解析 IP 文本。
export function defaultPublicDnsLookup(): DnsLookup {
  return nodeLookup;
}

/** 断言目标允许出网；不允许时抛 egress_blocked。 */
export async function assertPublicEgressDestination(
  url: URL,
  dnsLookup: DnsLookup,
  options: PublicEgressLookupOptions = {},
): Promise<void> {
  await resolvePublicAddresses({ targetHost: url.hostname, context: url, dnsLookup }, options);
}

/** 回调式 lookup 的结果投递：区分「返回全部地址」与「只返回首选地址」两种形态。 */
function deliverLookupResult(
  done: Completion,
  url: string,
  resolved: DnsLookupAddress[],
  returnAll: boolean,
): void {
  if (returnAll) {
    done(null, resolved);
    return;
  }
  const first = resolved[0];
  if (first === undefined) {
    done(reject(url, "HTTP public egress DNS lookup returned no addresses"));
    return;
  }
  done(null, first.address, first.family);
}

/**
 * 造一个 node http 用的 lookup 钩子：把解析结果按回调格式投递。
 * 回调格式在发起查询时就固定，不能被等待期间 options 的变化切换。
 */
export function createPublicEgressLookup(
  url: string,
  dnsLookup: DnsLookup,
  options: PublicEgressLookupOptions = {},
): NonNullable<http.RequestOptions["lookup"]> {
  return (targetHost, lookupOptions, callback) => {
    const done = (typeof lookupOptions === "function" ? lookupOptions : callback) as
      | Completion
      | undefined;
    if (!done) return;

    const context = new URL(url);
    const ask: ResolveContext = { targetHost, context, dnsLookup };
    const returnAll =
      lookupOptions !== null && typeof lookupOptions === "object" && lookupOptions.all === true;
    void resolvePublicAddresses(ask, options).then(
      (resolved) => deliverLookupResult(done, url, resolved, returnAll),
      // 调用方 done 抛出的异常属于这段 continuation，不能被 DNS 错误处理再投递一次。
      (reason: unknown) => done(reason instanceof Error ? reason : new Error(String(reason))),
    );
  };
}
