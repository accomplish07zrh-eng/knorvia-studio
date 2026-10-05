/**
 * 官方更新源：项目 GitHub 发布接口。`releaseInfoUrl` 留空时使用（specs/knorvia-release-update-install.md）。
 */
export const KNORVIA_OFFICIAL_RELEASE_INFO_URL =
  "https://api.github.com/repos/accomplish07zrh-eng/knorvia-studio/releases/latest";

/** Release check result. 安装能力只由 Main 在安装时重新检查后决定，Renderer 只看到是否可一键安装。 */
export type ReleaseUpdateCheckResult =
  | { status: "unconfigured" | "disabled"; currentVersion: string }
  | { status: "up-to-date"; currentVersion: string; latestVersion: string }
  | { status: "no-compatible-release"; currentVersion: string }
  | {
      status: "available";
      currentVersion: string;
      latestVersion: string;
      releaseUrl?: string;
      /** 当前平台可一键下载安装（Windows 安装版且发布含匹配安装包与校验文件）。 */
      installable?: boolean;
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
    return (
      (url.protocol === "https:" || (url.protocol === "http:" && loopback)) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !sensitiveQuery
    );
  } catch {
    return false;
  }
}

/** 一键安装结果；`started` 表示安装程序已启动、应用即将退出。 */
export type ReleaseUpdateInstallResult =
  | { status: "started"; version: string }
  | {
      status: "failed";
      reason:
        | "busy"
        | "no-update"
        | "unsupported"
        | "check-failed"
        | "download"
        | "too-large"
        | "checksum"
        | "launch";
    };

/** GitHub 发布资产的下载主机白名单（含资产下载的重定向目标）。 */
export const RELEASE_ASSET_HOSTS: readonly string[] = [
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
];

export function validReleaseAssetUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      RELEASE_ASSET_HOSTS.includes(url.hostname)
    );
  } catch {
    return false;
  }
}
