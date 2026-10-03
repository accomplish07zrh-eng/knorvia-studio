import { isIP } from "node:net";
import { quotePosixShellArg } from "@knorvia/server/remote/posixShell.js";

export function normalizeWslProxyUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol.length > 0 && url.hostname.length > 0 ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isLoopbackProxyHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  return host === "localhost" || host === "::1" || (isIP(host) === 4 && host.startsWith("127."));
}

export function replaceProxyHostname(proxyUrl: string, hostname: string): string {
  const url = new URL(proxyUrl);
  url.hostname = isIP(hostname) === 6 ? `[${hostname}]` : hostname;
  return url.toString();
}

export function buildWslProxyPortProbeCommand(proxyUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(proxyUrl);
  } catch {
    return null;
  }
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (!/^\d+$/u.test(port)) return null;
  const host = url.hostname.replace(/^\[|\]$/gu, "");
  const target = isIP(host) === 6 ? `[${host}]` : host;
  const script = `:</dev/tcp/${target}/${port}`;
  return [
    "if command -v timeout >/dev/null 2>&1 &&",
    `timeout 1 bash -c ${quotePosixShellArg(script)} >/dev/null 2>&1; then`,
    "printf reachable",
    "else",
    "printf unreachable",
    "fi",
  ].join(" ");
}

export function parseWslProxyPortProbeOutput(output: string): boolean | undefined {
  const text = output.trim();
  if (text === "reachable") return true;
  if (text === "unreachable") return false;
  return undefined;
}

export function buildWslHostGatewayCommand(): string {
  return [
    "gateway=",
    `if command -v ip >/dev/null 2>&1; then gateway=$(ip route show default 2>/dev/null | awk '$1=="default" && $2=="via" {print $3; exit}'); fi`,
    `if [ -n "$gateway" ]; then printf "route=%s " "$gateway"; fi`,
    `if [ -r /etc/resolv.conf ]; then awk '$1=="nameserver" {print "resolv=" $2}' /etc/resolv.conf; fi`,
  ].join("; ");
}

function isPrivateOrLinkLocal(candidate: string, family: number): boolean {
  if (family === 6) {
    const lower = candidate.toLowerCase();
    return lower.startsWith("fc") || lower.startsWith("fd") || /^fe[89ab]/u.test(lower);
  }
  const parts = candidate.split(".").map(Number);
  const [first, second] = parts;
  // IPv4 已由 isIP 收窄；仍显式携带第二个 octet，避免长度检查被误当作索引类型证明。
  return (
    parts.length === 4 &&
    (first === 10 ||
      (first === 192 && second === 168) ||
      (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
      candidate.startsWith("169.254."))
  );
}

export function parseWslHostGatewayOutput(output: string): string | null {
  for (const token of output.trim().split(/\s+/u)) {
    // 无匹配时仍按原始 resolv token 处理；命中的 capture 与缺省值都是真实字符串。
    const [, source = "resolv", value = token] = /^(route|resolv)=(.+)$/u.exec(token) ?? [];
    const candidate = value.replace(/^\[|\]$/gu, "");
    const family = isIP(candidate);
    if (family !== 4 && family !== 6) continue;
    if (candidate === "::1" || (family === 4 && candidate.startsWith("127."))) continue;
    if (source !== "resolv" || isPrivateOrLinkLocal(candidate, family)) return candidate;
  }
  return null;
}

export function formatWslProxyForLog(proxyUrl: string): string {
  try {
    const url = new URL(proxyUrl);
    const host = url.hostname.replace(/^\[|\]$/gu, "");
    const displayHost = isIP(host) === 6 ? `[${host}]` : host;
    return `${url.protocol}//${displayHost}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return "<invalid-proxy>";
  }
}
