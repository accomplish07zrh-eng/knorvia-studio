// SPDX-License-Identifier: Apache-2.0
// 公网出口 IP 判定：判断一个地址是不是「可以拿去做公网出口」的地址，不是就给出阻断原因。
// 组织方式：网段写成一张三列的紧凑表（地址/前缀、地址族、阻断原因），由解析器建成 BlockList；
// 判定只做一次规范化与一次查表。

import { BlockList, isIP } from "node:net";

/** 地址族：只区分 IPv4 与 IPv6。 */
export type IpAddressVersion = 0 | 4 | 6;

/** 阻断结论：不可出口的原因，以及该地址实际属于哪个版本。 */
export interface PublicEgressIpBlockReason {
  reason: string;
  version: IpAddressVersion;
}

type IpAddressFamily = "ipv4" | "ipv6";

interface BlockedIpRange {
  address: string;
  family: IpAddressFamily;
  prefix: number;
  reason: string;
}

interface CompiledBlockedIpRange extends BlockedIpRange {
  blockList: BlockList;
}

/**
 * 不可作为公网出口的网段表，一行一段：`<地址>/<前缀> <族> <阻断原因>`。
 * 原因文案是外部可见的判定结论，改动即破坏兼容面。
 */
const BLOCKED_IP_RANGE_TABLE = [
  "0.0.0.0/8 ipv4 unspecified IPv4 address",
  "10.0.0.0/8 ipv4 private IPv4 address",
  "127.0.0.0/8 ipv4 loopback IPv4 address",
  "100.64.0.0/10 ipv4 carrier-grade NAT IPv4 address",
  "169.254.0.0/16 ipv4 link-local IPv4 address",
  "172.16.0.0/12 ipv4 private IPv4 address",
  "192.168.0.0/16 ipv4 private IPv4 address",
  "192.0.0.0/24 ipv4 IETF protocol assignment IPv4 address",
  "198.18.0.0/15 ipv4 benchmark IPv4 address",
  "224.0.0.0/4 ipv4 multicast IPv4 address",
  "240.0.0.0/4 ipv4 reserved IPv4 address",
  "::/128 ipv6 unspecified IPv6 address",
  "::1/128 ipv6 loopback IPv6 address",
  "fc00::/7 ipv6 unique-local IPv6 address",
  "fe80::/10 ipv6 link-local IPv6 address",
  "ff00::/8 ipv6 multicast IPv6 address",
].join("\n");

const NOT_AN_IP_REASON = "not an IP address";

function parseBlockedIpRange(line: string): BlockedIpRange {
  const [cidr, family, ...reasonParts] = line.split(" ");
  const separator = cidr?.lastIndexOf("/") ?? -1;
  if (!cidr || separator < 0) throw new Error(`网段表格式错误: ${line}`);
  return {
    address: cidr.slice(0, separator),
    prefix: Number.parseInt(cidr.slice(separator + 1), 10),
    family: family as IpAddressFamily,
    reason: reasonParts.join(" "),
  };
}

/** 建表时只编译一次：BlockList 的 CIDR 匹配同时覆盖 IPv4-mapped IPv6 写法。 */
const BLOCKED_PUBLIC_EGRESS_RANGES: readonly CompiledBlockedIpRange[] =
  BLOCKED_IP_RANGE_TABLE.split("\n").map((line) => {
    const range = parseBlockedIpRange(line);
    const blockList = new BlockList();
    blockList.addSubnet(range.address, range.prefix, range.family);
    return { ...range, blockList };
  });

/** 去掉方括号、尾点与大小写差异，得到 `isIP` 能识别的字面量。 */
export function normalizeIpAddressLiteral(value: string): string {
  const withoutTailDot = value.toLowerCase().replace(/\.$/u, "");
  return withoutTailDot.replace(/^\[/u, "").replace(/\]$/u, "");
}

export function getIpAddressVersion(value: string): IpAddressVersion {
  return isIP(normalizeIpAddressLiteral(value)) as IpAddressVersion;
}

/** 能出口返回 `undefined`；否则给出阻断原因与版本（`0` 表示根本不是 IP）。 */
export function getPublicEgressIpBlockReason(value: string): PublicEgressIpBlockReason | undefined {
  const normalized = normalizeIpAddressLiteral(value);
  const version = isIP(normalized) as IpAddressVersion;
  if (version === 0) return { reason: NOT_AN_IP_REASON, version };

  const family: IpAddressFamily = version === 4 ? "ipv4" : "ipv6";
  const blocked = BLOCKED_PUBLIC_EGRESS_RANGES.find((range) =>
    range.blockList.check(normalized, family),
  );
  return blocked ? { reason: blocked.reason, version } : undefined;
}
