import { dirname, isAbsolute, join, resolve } from "node:path";

export const KNORVIA_APPLICATION_NAME = "Knorvia Studio";
export const KNORVIA_APP_ID = "dev.knorvia.studio";
export const KNORVIA_PORTABLE_MARKER = "knorvia-portable.json";

/**
 * Windows AUMID 的唯一决策：必须与 electron-builder 的 appId（NSIS 快捷方式写入的 AUMID）一致。
 * 修复依据：此前最早 bootstrap 固定写正式 appId，app ready 后又按 flavor 改写成 preview/dev 身份；
 * 进程中途换 AUMID 会让任务栏按钮、快捷方式和通知分属不同应用，任务栏找不到匹配快捷方式时图标缺失。
 * 取值需与 scripts/desktop-product-identity.mjs 的 resolveWindowsAppUserModelIdForFlavor 保持一致（有测试校验）。
 */
export function resolveKnorviaAppUserModelId(input: { packaged: boolean; flavor?: string }) {
  if (!input.packaged) return `${KNORVIA_APP_ID}.dev`;
  return input.flavor === "preview" ? `${KNORVIA_APP_ID}.preview` : KNORVIA_APP_ID;
}

/** 纯路径决策便于测试；此处不读取或迁移任何上游配置。 */
export function resolveDesktopProfile(input: {
  env: Record<string, string | undefined>;
  appData: string;
  executable: string;
  packaged: boolean;
  portableMarker: boolean;
  platform?: string;
}) {
  const explicitPortableDir = input.env.KNORVIA_PORTABLE_DIR?.trim();
  const portable = Boolean(explicitPortableDir || input.portableMarker);
  const explicitBase = input.env.KNORVIA_DATA_BASE_DIR?.trim();
  for (const path of [explicitPortableDir, explicitBase]) {
    if (path && !isAbsolute(path)) throw new Error("Knorvia data directory must be absolute");
  }
  let portableDir = explicitPortableDir || dirname(input.executable);
  if (portable && !explicitPortableDir) {
    const platform = input.platform ?? process.platform;
    const launcherPath =
      platform === "win32"
        ? input.env.PORTABLE_EXECUTABLE_DIR?.trim()
        : platform === "linux"
          ? input.env.APPIMAGE?.trim()
          : undefined;
    // NSIS 临时解压和 AppImage 挂载目录会在退出时消失或只读，数据必须留在原便携文件旁。
    if (launcherPath && !isAbsolute(launcherPath)) {
      throw new Error("Portable launcher path must be absolute");
    }
    if (launcherPath) portableDir = platform === "linux" ? dirname(launcherPath) : launcherPath;
  }
  const base = portable
    ? join(portableDir, "data")
    : explicitBase ||
      join(
        input.appData,
        input.packaged ? KNORVIA_APPLICATION_NAME : `${KNORVIA_APPLICATION_NAME} Dev`,
      );
  const root = resolve(base);
  return {
    portable,
    base: root,
    applicationName: KNORVIA_APPLICATION_NAME,
    userData: join(root, "profile"),
    sessionData: join(root, "profile", "session"),
    cache: join(root, "cache"),
    logs: join(root, ".knorvia-studio", "v2", "logs"),
    crashDumps: join(root, ".knorvia-studio", "v2", "crash", "live"),
    temp: join(root, "temp"),
  };
}

/** Host 与 Agent 的目录来自 Main 的同一个决定，不重用系统 HOME。 */
export function buildDesktopProfileEnvironment(base: string): Record<string, string> {
  const appRoot = join(base, ".knorvia-studio");
  return {
    KNORVIA_DATA_BASE_DIR: base,
    KNORVIA_HOME: appRoot,
    KNORVIA_STORAGE_DIR: appRoot,
  };
}
