// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { lookup as nodeLookup } from "node:dns/promises";
import type http from "node:http";
import {
  createHttpClientError,
  getIpAddressVersion,
  getPublicEgressIpBlockReason,
  normalizeIpAddressLiteral,
} from "@knorvia/contracts";

export type { DnsLookupAddress, DnsLookup } from "./public-egress-policy-types.js";

import type {
  Completion,
  DnsLookup,
  DnsLookupAddress,
  PublicEgressLookupOptions,
} from "./public-egress-policy-types.js";

function blocked(url: string, message: string) {
  return createHttpClientError({ code: "egress_blocked", url, message });
}

function cancellation(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("HTTP request was cancelled");
}

async function queryAddresses(
  targetHost: string,
  dnsLookup: DnsLookup,
  signal?: AbortSignal,
): Promise<DnsLookupAddress[]> {
  if (signal?.aborted) throw cancellation(signal);

  const resolving = dnsLookup(targetHost, { all: true, verbatim: true });
  // resolver 可以同步取消后返回已拒绝 Promise；先观察，不能因后面的取消早退而遗落。
  void resolving.catch(() => {});
  if (signal?.aborted) throw cancellation(signal);
  if (!signal) return resolving;
  const querySignal = signal;

  return new Promise<DnsLookupAddress[]>((resolve, reject) => {
    let settled = false;

    function finish(deliver: () => void): void {
      if (settled) return;
      settled = true;
      querySignal.removeEventListener("abort", onAbort);
      deliver();
    }

    function onAbort(): void {
      finish(() => reject(cancellation(querySignal)));
    }

    querySignal.addEventListener("abort", onAbort, { once: true });
    void resolving.then(
      (resolved) => finish(() => resolve(resolved)),
      (reason: unknown) => finish(() => reject(reason)),
    );
    if (querySignal.aborted) onAbort();
  });
}

async function resolvePublicAddresses(
  targetHost: string,
  context: URL,
  dnsLookup: DnsLookup,
  options?: PublicEgressLookupOptions,
): Promise<DnsLookupAddress[]> {
  const host = normalizeIpAddressLiteral(targetHost);
  if (!host) {
    throw blocked(context.toString(), "HTTP public egress requires a hostname");
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw blocked(context.toString(), `HTTP public egress blocked local hostname ${host}`);
  }

  const family = getIpAddressVersion(host);
  if (!family && !host.includes(".")) {
    throw blocked(context.toString(), "HTTP public egress requires a public hostname");
  }

  const resolved = family
    ? [{ address: host, family }]
    : await queryAddresses(host, dnsLookup, options?.signal);
  if (resolved.length === 0) {
    throw blocked(
      context.toString(),
      `HTTP public egress DNS lookup returned no addresses for ${host}`,
    );
  }
  for (const item of resolved) {
    if (getPublicEgressIpBlockReason(item.address)) {
      throw blocked(
        context.toString(),
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

export async function assertPublicEgressDestination(
  url: URL,
  dnsLookup: DnsLookup,
  options: PublicEgressLookupOptions = {},
): Promise<void> {
  await resolvePublicAddresses(url.hostname, url, dnsLookup, options);
}

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
    // 回调格式在发起查询时确定，不能被等待期间的 options 修改切换。
    const returnAll =
      lookupOptions !== null && typeof lookupOptions === "object" && lookupOptions.all === true;
    void resolvePublicAddresses(targetHost, context, dnsLookup, options).then(
      (resolved) => {
        if (returnAll) {
          done(null, resolved);
          return;
        }
        const first = resolved[0];
        if (!first) {
          done(blocked(url, "HTTP public egress DNS lookup returned no addresses"));
          return;
        }
        done(null, first.address, first.family);
      },
      // 用户 done 的异常属于此 continuation，不能被 DNS 错误处理再投递一次。
      (reason: unknown) => done(reason instanceof Error ? reason : new Error(String(reason))),
    );
  };
}
