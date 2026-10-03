import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ProxyConfig, Session } from "electron";
import { EMBEDDED_BROWSER_PARTITION } from "./browserDataManager.js";
interface DesktopNetworkPolicySettings {
  httpProxy?: string;
  httpProxyNoProxy?: string;
  httpProxyCaCertPath?: string;
  embeddedBrowserAllowInsecureCertificates?: boolean;
}
interface DesktopNetworkPolicyLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}
interface DesktopSessionProvider {
  readonly defaultSession: Session;
  fromPartition(partition: string): Session;
}
type Verifier = NonNullable<Parameters<Session["setCertificateVerifyProc"]>[0]>;
interface Certificate {
  data?: string;
  fingerprint?: string;
  issuerCert?: Certificate | null;
}
function proxyFor(
  httpProxy: string | undefined,
  noProxy: string | undefined,
  emptyMode: "direct" | "system",
): ProxyConfig {
  const raw = httpProxy?.trim();
  let rules: string | undefined;
  if (raw) {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
    try {
      const url = new URL(candidate);
      const authentication = url.username
        ? `${url.username}${url.password ? `:${url.password}` : ""}@`
        : "";
      rules = `${url.protocol}//${authentication}${url.host}`;
    } catch {
      /* Existing invalid values use the per-session fallback. */
    }
  }
  if (!rules) return { mode: emptyMode };
  const tokens = noProxy
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const bypass = tokens && tokens.length > 0 ? tokens.join(",") : undefined;
  return {
    mode: "fixed_servers",
    proxyRules: rules,
    ...(bypass ? { proxyBypassRules: bypass } : {}),
  };
}
function normalizedFingerprint(value: string): string {
  return value.replace(/[^a-f0-9]/gi, "").toLowerCase();
}
function certificateFingerprint(certificate: Certificate): string | undefined {
  if (certificate.data) {
    try {
      return normalizedFingerprint(new X509Certificate(certificate.data).fingerprint256);
    } catch {
      /* Fall through to the original native fingerprint. */
    }
  }
  return certificate.fingerprint ? normalizedFingerprint(certificate.fingerprint) : undefined;
}
function chainHasTrusted(start: Certificate | undefined, trusted: Set<string>): boolean {
  const seen = new Set<string>();
  let certificate: Certificate | null | undefined = start;
  for (let depth = 0; certificate && depth < 16; depth++) {
    const fingerprint = certificateFingerprint(certificate);
    if (fingerprint) {
      if (trusted.has(fingerprint)) return true;
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
    }
    certificate = certificate.issuerCert;
  }
  return false;
}
function customVerifier(
  path: string | undefined,
  logger: DesktopNetworkPolicyLogger,
): Verifier | null {
  const location = path?.trim();
  if (!location) return null;
  try {
    const pem = readFileSync(location, "utf8");
    const certificates =
      pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
    if (certificates.length === 0) {
      logger.warn(`[desktop-network] custom CA file contains no certificates: ${location}`);
      return null;
    }
    const trusted = new Set(
      certificates.map((value) => normalizedFingerprint(new X509Certificate(value).fingerprint256)),
    );
    return (request, callback) => {
      if (request.verificationResult === "OK") {
        callback(-3);
        return;
      }
      callback(
        chainHasTrusted(request.certificate, trusted) ||
          chainHasTrusted(request.validatedCertificate, trusted)
          ? 0
          : -3,
      );
    };
  } catch (error) {
    logger.warn(`[desktop-network] failed to load custom CA file: ${location}`, error);
    return null;
  }
}
async function applyTarget(
  session: Session,
  settings: DesktopNetworkPolicySettings,
  logger: DesktopNetworkPolicyLogger,
  emptyMode: "direct" | "system",
  insecure: boolean,
): Promise<void> {
  // 保留原调用参数读取与异步拒绝边界：空代理也必须先读取两个设置值。
  const proxy = proxyFor(settings.httpProxy, settings.httpProxyNoProxy, emptyMode);
  await session.setProxy(proxy);
  await session.closeAllConnections();
  const verifier: Verifier | null = insecure
    ? (_request, callback) => callback(0)
    : customVerifier(settings.httpProxyCaCertPath, logger);
  session.setCertificateVerifyProc(verifier);
  logger.info(
    `[desktop-network] renderer proxy mode=${proxy.mode ?? "fixed_servers"} bypass=${proxy.proxyBypassRules ? "enabled" : "disabled"} customCa=${verifier ? "enabled" : "disabled"} insecureCerts=${insecure ? "allowed" : "rejected"}`,
  );
}
export async function applyDesktopChromiumNetworkPolicies(
  sessionProvider: DesktopSessionProvider,
  settings: DesktopNetworkPolicySettings,
  logger: DesktopNetworkPolicyLogger,
): Promise<void> {
  const targets = [
    {
      session: sessionProvider.defaultSession,
      name: "default-session",
      emptyMode: "direct" as const,
      insecure: false,
    },
    {
      session: sessionProvider.fromPartition(EMBEDDED_BROWSER_PARTITION),
      name: "embedded-browser",
      emptyMode: "system" as const,
      insecure: settings.embeddedBrowserAllowInsecureCertificates === true,
    },
  ];
  await Promise.all(
    targets.map(async (target) => {
      try {
        await applyTarget(target.session, settings, logger, target.emptyMode, target.insecure);
      } catch (error) {
        logger.warn(`[desktop-network] ${target.name} network policy apply failed:`, error);
      }
    }),
  );
}
