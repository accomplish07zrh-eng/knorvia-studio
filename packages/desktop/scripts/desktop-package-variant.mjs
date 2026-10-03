import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const DESKTOP_PORTABLE_MARKER = "knorvia-portable.json";

export function resolveDesktopPackageVariant(env = process.env, platform = process.platform) {
  const value = env.KNORVIA_PORTABLE_BUILD?.trim() ?? "";
  if (!["", "0", "1"].includes(value)) {
    throw new Error("invalid KNORVIA_PORTABLE_BUILD; expected 1 or 0");
  }
  const portable = value === "1";
  if (portable && platform !== "win32" && platform !== "linux") {
    throw new Error(`portable desktop packaging is not configured for ${platform}`);
  }
  return {
    portable,
    windowsTargets: portable ? ["portable", "zip"] : ["nsis"],
    linuxTargets: portable ? ["AppImage", "tar.gz"] : ["AppImage", "deb", "rpm", "pacman"],
  };
}

export function assertDesktopPackageTargets({ portable, platform, targets }) {
  const names = targets.map((target) => target.toLowerCase());
  if (!portable) {
    if (platform === "win32" && names.includes("portable")) {
      throw new Error("Windows portable target requires KNORVIA_PORTABLE_BUILD=1");
    }
    return;
  }
  const archives = ["dir", "zip", "7z", "tar.gz", "tar.xz", "tar.bz2", "tar.lz", "tar.zst"];
  const allowed = new Set([...archives, platform === "win32" ? "portable" : "appimage"]);
  const rejected = names.filter((name) => !allowed.has(name));
  if (rejected.length > 0) {
    // 同一 appOutDir 共用便携标记；把它装进 NSIS/deb/rpm 会让安装版也写旁边的 data。
    throw new Error(`portable desktop build cannot contain installer targets: ${rejected.join(", ")}`);
  }
}

/** 只触碰本次 appOutDir 的模式标记，不读取或创建任何用户 data。 */
export async function stageDesktopPackageVariant(resourcesDir, { portable }) {
  const marker = join(resourcesDir, DESKTOP_PORTABLE_MARKER);
  if (portable) {
    await writeFile(
      marker,
      `${JSON.stringify({ product: "Knorvia Studio", version: 1, dataDirectory: "data" }, null, 2)}\n`,
      "utf8",
    );
  } else {
    // 输出目录被复用时不能把上一轮的便携状态带入安装版；其它文件一律不清理。
    await rm(marker, { force: true });
  }
}
