import { dirname, isAbsolute, join, resolve } from "node:path";

export const KNORVIA_APPLICATION_NAME = "Knorvia Studio";
export const KNORVIA_APP_ID = "dev.knorvia.studio";
export const KNORVIA_PORTABLE_MARKER = "knorvia-portable.json";

/** 纯路径决策便于测试；此处不读取或迁移任何上游配置。 */
export function resolveDesktopProfile(input: {
  env: Record<string, string | undefined>;
  appData: string;
  executable: string;
  packaged: boolean;
  portableMarker: boolean;
}) {
  const explicitPortableDir = input.env.KNORVIA_PORTABLE_DIR?.trim();
  const portable = Boolean(explicitPortableDir || input.portableMarker);
  const explicitBase = input.env.KNORVIA_DATA_BASE_DIR?.trim();
  for (const path of [explicitPortableDir, explicitBase]) {
    if (path && !isAbsolute(path)) throw new Error("Knorvia data directory must be absolute");
  }
  const base = portable
    ? join(explicitPortableDir || dirname(input.executable), "data")
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
