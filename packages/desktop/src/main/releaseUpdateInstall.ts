import { createHash } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { validReleaseAssetUrl, type ReleaseUpdateInstallResult } from "@knorvia/shared";
import type { ReleaseInstallerAsset, ReleaseUpdateCheckDetail } from "./releaseUpdateCheck.js";

/** 安装包与校验文件的大小上限（specs/knorvia-release-update-install.md）。 */
export const RELEASE_INSTALLER_MAX_BYTES = 600 * 1024 * 1024;
const CHECKSUM_MAX_BYTES = 4096;

export interface ReleaseUpdateInstallDeps {
  /** 安装时重新检查发布记录；不接受来自 Renderer 的地址。 */
  check: () => Promise<ReleaseUpdateCheckDetail>;
  downloadDir: string;
  /** 启动已校验的安装程序（detached）；返回后应用退出。 */
  launch: (installerPath: string) => Promise<void>;
  quit: () => void;
  fetchImpl?: typeof fetch;
  logger?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
}

async function fetchAsset(fetcher: typeof fetch, url: string): Promise<Response> {
  if (!validReleaseAssetUrl(url)) throw new Error("asset host not allowed");
  // GitHub 资产会 302 到 objects.githubusercontent.com；手动跟随一跳并重新校验主机白名单。
  let response = await fetcher(url, { credentials: "omit", redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("redirect without location");
    const next = new URL(location, url).toString();
    if (!validReleaseAssetUrl(next)) throw new Error("redirect host not allowed");
    response = await fetcher(next, { credentials: "omit", redirect: "error" });
  }
  if (!response.ok || !response.body) throw new Error(`http ${response.status}`);
  return response;
}

async function readChecksum(fetcher: typeof fetch, asset: ReleaseInstallerAsset): Promise<string> {
  const response = await fetchAsset(fetcher, asset.checksumUrl);
  const text = await response.text();
  if (text.length > CHECKSUM_MAX_BYTES) throw new Error("checksum too large");
  const hex = text.trim().split(/\s+/u)[0]?.toLowerCase() ?? "";
  if (!/^[0-9a-f]{64}$/u.test(hex)) throw new Error("invalid checksum file");
  return hex;
}

class TooLargeError extends Error {}

/** 流式下载并计算 SHA-256；超过上限立即中止。 */
async function downloadInstaller(
  fetcher: typeof fetch,
  asset: ReleaseInstallerAsset,
  target: string,
): Promise<string> {
  if (asset.size !== undefined && asset.size > RELEASE_INSTALLER_MAX_BYTES)
    throw new TooLargeError();
  const response = await fetchAsset(fetcher, asset.url);
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > RELEASE_INSTALLER_MAX_BYTES) throw new TooLargeError();
  const hash = createHash("sha256");
  const file = await open(target, "w");
  const reader = response.body!.getReader();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > RELEASE_INSTALLER_MAX_BYTES) throw new TooLargeError();
      hash.update(value);
      await file.write(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    await file.close();
  }
  return hash.digest("hex");
}

/**
 * 一键更新：重新检查 → 下载校验文件 → 流式下载安装包并校验 → 启动安装程序 → 退出应用。
 * 同一时刻只允许一个流程；任何失败都会删除临时文件且不退出应用。
 */
export function createReleaseUpdateInstaller(deps: ReleaseUpdateInstallDeps) {
  let running = false;
  return async function installReleaseUpdate(): Promise<ReleaseUpdateInstallResult> {
    if (running) return { status: "failed", reason: "busy" };
    running = true;
    const fetcher = deps.fetchImpl ?? fetch;
    let target: string | undefined;
    try {
      const result = await deps.check();
      if (result.status === "failed") return { status: "failed", reason: "check-failed" };
      if (result.status !== "available") return { status: "failed", reason: "no-update" };
      if (!result.installer) return { status: "failed", reason: "unsupported" };
      const asset = result.installer;
      await mkdir(deps.downloadDir, { recursive: true });
      target = join(deps.downloadDir, asset.fileName);
      let expected: string;
      let actual: string;
      try {
        expected = await readChecksum(fetcher, asset);
        actual = await downloadInstaller(fetcher, asset, target);
      } catch (error) {
        deps.logger?.warn("[release-update] 下载更新失败", { error: String(error) });
        return {
          status: "failed",
          reason: error instanceof TooLargeError ? "too-large" : "download",
        };
      }
      if (actual !== expected) {
        deps.logger?.warn("[release-update] 安装包校验不一致", { version: result.latestVersion });
        return { status: "failed", reason: "checksum" };
      }
      try {
        await deps.launch(target);
      } catch (error) {
        deps.logger?.warn("[release-update] 启动安装程序失败", { error: String(error) });
        return { status: "failed", reason: "launch" };
      }
      deps.logger?.info("[release-update] 安装程序已启动，应用退出", {
        version: result.latestVersion,
      });
      // 安装程序已接管文件；成功路径不删除它，由安装程序与系统临时目录清理。
      target = undefined;
      deps.quit();
      return { status: "started", version: result.latestVersion };
    } finally {
      if (target) await rm(target, { force: true }).catch(() => undefined);
      running = false;
    }
  };
}
