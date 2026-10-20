// SPDX-License-Identifier: Apache-2.0
import { parse as parseLegacyUrl } from "node:url";

/** 可以安全展示主机名的协议白名单。 */
const DISPLAYABLE_ENDPOINT_PROTOCOLS: readonly string[] = ["http:", "https:"];

/** 判断解析结果的协议是否允许展示主机名。 */
function isDisplayableEndpointProtocol(protocol: string | null): boolean {
  if (protocol === null) return false;
  return DISPLAYABLE_ENDPOINT_PROTOCOLS.includes(protocol);
}

/**
 * 取出可安全展示给用户的端点主机名。
 *
 * 仅 `http:` / `https:` 端点有主机名可展示；裸主机、其它协议、空串与解析失败的输入
 * 一律得到空串，调用方据此跳过端点展示，不要把原始地址直接拼进界面。
 */
export function resolveSafeEndpointHostname(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (text.length === 0) return "";

  const parsed = parseLegacyUrl(text);
  if (!isDisplayableEndpointProtocol(parsed.protocol)) return "";

  const hostname = parsed.hostname;
  return typeof hostname === "string" ? hostname.toLowerCase() : "";
}
