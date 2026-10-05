import * as semver from "semver";
import {
  KNORVIA_OFFICIAL_RELEASE_INFO_URL,
  validReleaseAssetUrl,
  validReleaseInfoUrl,
  type AppSettings,
  type ReleaseUpdateCheckResult,
} from "@knorvia/shared";

export const FIRST_RELEASE_CHECK_DELAY_MS = 30000;
export const RELEASE_CHECK_INTERVAL_MS: number = 86400000;
function version(value: unknown): string | null {
  return typeof value === "string" ? semver.valid(value.trim().replace(/^studio-/i, "")) : null;
}
async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty response");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      // GitHub 发布记录含全部资产与发布说明，0.8.3 已约 52KB；上限放宽到 512KB。
      if (length > 524288) throw new Error("oversized response");
      chunks.push(result.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
/** 一键安装的目标环境：只有打包的 Windows 安装版才会选择安装包。 */
export interface ReleaseInstallerTarget {
  platform: string;
  arch: string;
  packaged: boolean;
  portable: boolean;
}

/** 选中的安装包与其校验文件；地址都来自发布记录并经主机白名单校验。 */
export interface ReleaseInstallerAsset {
  fileName: string;
  url: string;
  checksumUrl: string;
  size?: number;
}

/** Main 内部使用的检查结果：在公开结果之外携带安装包信息，不经 IPC 下发地址。 */
export type ReleaseUpdateCheckDetail = ReleaseUpdateCheckResult & {
  installer?: ReleaseInstallerAsset;
};

export function selectReleaseInstaller(
  record: Record<string, unknown>,
  latestVersion: string,
  target: ReleaseInstallerTarget | undefined,
): ReleaseInstallerAsset | undefined {
  if (!target || target.platform !== "win32" || !target.packaged || target.portable) return;
  const arch = target.arch === "arm64" ? "arm64" : "x64";
  const fileName = `Knorvia-Studio-${latestVersion}-win-${arch}-setup.exe`;
  const assets = Array.isArray(record.assets) ? record.assets : [];
  const find = (name: string) =>
    assets.find(
      (asset): asset is Record<string, unknown> =>
        Boolean(asset) &&
        typeof asset === "object" &&
        (asset as Record<string, unknown>).name === name,
    );
  const installer = find(fileName);
  const checksum = find(`${fileName}.sha256`);
  const url = installer?.browser_download_url;
  const checksumUrl = checksum?.browser_download_url;
  if (typeof url !== "string" || typeof checksumUrl !== "string") return;
  if (!validReleaseAssetUrl(url) || !validReleaseAssetUrl(checksumUrl)) return;
  return {
    fileName,
    url,
    checksumUrl,
    ...(typeof installer?.size === "number" ? { size: installer.size } : {}),
  };
}

export async function checkReleaseUpdate(options: {
  getSettings: () => Promise<Pick<AppSettings, "releaseInfoUrl" | "releaseChecksEnabled">>;
  currentVersion: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  installerTarget?: ReleaseInstallerTarget;
}): Promise<ReleaseUpdateCheckDetail> {
  const currentVersion = version(options.currentVersion);
  if (!currentVersion)
    return { status: "failed", currentVersion: options.currentVersion, reason: "invalid-response" };
  let settings: Pick<AppSettings, "releaseInfoUrl" | "releaseChecksEnabled">;
  try {
    settings = await options.getSettings();
  } catch {
    return { status: "failed", currentVersion, reason: "settings" };
  }
  if (settings.releaseChecksEnabled === false) return { status: "disabled", currentVersion };
  // 留空即使用官方 GitHub 发布源（2026-10-05 用户要求默认可检测更新）。
  const source = settings.releaseInfoUrl?.trim() || KNORVIA_OFFICIAL_RELEASE_INFO_URL;
  if (!validReleaseInfoUrl(source))
    return { status: "failed", currentVersion, reason: "invalid-source" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);
  try {
    const fetcher = options.fetchImpl ?? fetch;
    const response = await fetcher(source, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok)
      return { status: "failed", currentVersion, reason: "http", httpStatus: response.status };
    let payload: unknown;
    try {
      payload = await boundedJson(response);
    } catch {
      return { status: "failed", currentVersion, reason: "invalid-response" };
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return { status: "failed", currentVersion, reason: "invalid-response" };
    const record = payload as Record<string, unknown>;
    const latestVersion = version(record.tag_name ?? record.version);
    if (!latestVersion) return { status: "failed", currentVersion, reason: "invalid-response" };
    const preview = record.prerelease === true || semver.prerelease(latestVersion) !== null;
    if (preview && semver.prerelease(currentVersion) === null)
      return { status: "no-compatible-release", currentVersion };
    if (!semver.gt(latestVersion, currentVersion))
      return { status: "up-to-date", currentVersion, latestVersion };
    const candidate = record.html_url ?? record.url;
    const releaseUrl =
      typeof candidate === "string" && validReleaseInfoUrl(candidate) ? candidate : undefined;
    const installer = selectReleaseInstaller(record, latestVersion, options.installerTarget);
    return {
      status: "available",
      currentVersion,
      latestVersion,
      ...(releaseUrl ? { releaseUrl } : {}),
      installable: Boolean(installer),
      ...(installer ? { installer } : {}),
    };
  } catch {
    return {
      status: "failed",
      currentVersion,
      reason: controller.signal.aborted ? "timeout" : "offline",
    };
  } finally {
    clearTimeout(timeout);
  }
}
export function scheduleReleaseUpdateChecks(
  check: () => Promise<ReleaseUpdateCheckResult>,
  onResult: (result: ReleaseUpdateCheckResult) => void,
): () => void {
  let disposed = false;
  const run = () => {
    check()
      .then((result) => {
        if (!disposed) onResult(result);
      })
      .catch(() => undefined);
  };
  const first = setTimeout(() => {
    if (disposed) return;
    run();
    interval = setInterval(run, RELEASE_CHECK_INTERVAL_MS);
    interval.unref?.();
  }, FIRST_RELEASE_CHECK_DELAY_MS);
  first.unref?.();
  let interval: ReturnType<typeof setInterval> | undefined;
  return () => {
    disposed = true;
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
}
