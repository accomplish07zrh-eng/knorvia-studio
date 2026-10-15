// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 公网出口策略的形状声明：导出的两个类型由 public-egress-policy.ts 原样再导出，公开面不变。
// 字段说明（调用方按这些名字读写，字段名是契约）：
// DnsLookupAddress：解析结果（地址 + IP 版本）。
// DnsLookup：可注入的解析函数签名（all/verbatim 固定为 true）。
// PublicEgressLookupOptions.signal：取消信号，取消时以 signal.reason 为准。
// Completion：node dns.lookup 风格的回调签名。
export type DnsLookupAddress = { address: string; family: number };
export type DnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<DnsLookupAddress[]>;

export interface PublicEgressLookupOptions {
  signal?: AbortSignal;
}

export type Completion = (
  error: NodeJS.ErrnoException | null,
  address?: string | DnsLookupAddress[],
  family?: number,
) => void;
