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

export type DnsLookupAddress = { address: string; family: number };
export type DnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<DnsLookupAddress[]>;

interface PublicEgressLookupOptions {
  signal?: AbortSignal;
}

type Completion = (
  error: NodeJS.ErrnoException | null,
  address?: string | DnsLookupAddress[],
  family?: number,
) => void;

function blocked(url: string, message: string) {
  return createHttpClientError({ code: "egress_blocked", url, message });
}

function cancellation(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("HTTP request was cancelled");
}

async function queryAddresses(
  hostname: string,
  dnsLookup: DnsLookup,
  signal?: AbortSignal,
): Promise<DnsLookupAddress[]> {
  if (signal?.aborted) throw cancellation(signal);

  const pending = dnsLookup(hostname, { all: true, verbatim: true });
  // resolver 可以同步取消后返回已拒绝 Promise；先观察，不能因后面的取消早退而遗落。
  void pending.catch(() => {});
  if (signal?.aborted) throw cancellation(signal);
  if (!signal) return pending;
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
    void pending.then(
      (addresses) => finish(() => resolve(addresses)),
      (reason: unknown) => finish(() => reject(reason)),
    );
    if (querySignal.aborted) onAbort();
  });
}

async function resolvePublicAddresses(
  hostname: string,
  context: URL,
  dnsLookup: DnsLookup,
  options?: PublicEgressLookupOptions,
): Promise<DnsLookupAddress[]> {
  const host = normalizeIpAddressLiteral(hostname);
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

  const addresses = family
    ? [{ address: host, family }]
    : await queryAddresses(host, dnsLookup, options?.signal);
  if (addresses.length === 0) {
    throw blocked(
      context.toString(),
      `HTTP public egress DNS lookup returned no addresses for ${host}`,
    );
  }
  for (const item of addresses) {
    if (getPublicEgressIpBlockReason(item.address)) {
      throw blocked(
        context.toString(),
        `HTTP public egress blocked ${host} because it resolved to a non-public address`,
      );
    }
  }
  return addresses;
}

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
  return (hostname, lookupOptions, callback) => {
    const done = (typeof lookupOptions === "function" ? lookupOptions : callback) as
      | Completion
      | undefined;
    if (!done) return;

    const context = new URL(url);
    // 回调格式在发起查询时确定，不能被等待期间的 options 修改切换。
    const returnAll =
      lookupOptions !== null && typeof lookupOptions === "object" && lookupOptions.all === true;
    void resolvePublicAddresses(hostname, context, dnsLookup, options).then(
      (addresses) => {
        if (returnAll) {
          done(null, addresses);
          return;
        }
        const first = addresses[0];
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
