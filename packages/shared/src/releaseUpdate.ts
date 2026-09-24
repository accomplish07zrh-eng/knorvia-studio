/** Read-only release check result. No installation or authentication capability is attached. */
export type ReleaseUpdateCheckResult =
  | { status: "unconfigured" | "disabled"; currentVersion: string }
  | { status: "up-to-date"; currentVersion: string; latestVersion: string }
  | { status: "no-compatible-release"; currentVersion: string }
  | {
      status: "available";
      currentVersion: string;
      latestVersion: string;
      releaseUrl?: string;
    }
  | {
      status: "failed";
      currentVersion: string;
      reason: "settings" | "invalid-source" | "offline" | "timeout" | "http" | "invalid-response";
      httpStatus?: number;
    };

/** Source URL carries no authentication material; loopback HTTP is only for local fixtures. */
export function validReleaseInfoUrl(value: string): boolean {
  if (!value || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const sensitiveQuery = [...url.searchParams.keys()].some((key) =>
      /(?:api[-_]?key|auth|credential|password|secret|token)/i.test(key),
    );
    return (url.protocol === "https:" || (url.protocol === "http:" && loopback)) &&
      !url.username && !url.password && !url.hash && !sensitiveQuery;
  } catch {
    return false;
  }
}
