// SPDX-License-Identifier: Apache-2.0
/**
 * 从 URL 中提取并校验安全的主机名。
 * 仅允许 http: 和 https: 协议，返回统一转为小写的主机名；
 * 解析失败、空值或非 HTTP(S) 协议均返回空字符串。
 */
export function resolveSafeEndpointHostname(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const candidate = value.trim();
  if (candidate.length === 0) {
    return "";
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return "";
  }
}
