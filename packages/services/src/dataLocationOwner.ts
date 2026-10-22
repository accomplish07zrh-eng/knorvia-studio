import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * 数据目录的解析与复制。
 *
 * 目录优先级（合同 K-v-4）：
 *   1. `KNORVIA_DATA_BASE_DIR` —— 显式指定的数据根
 *   2. `KNORVIA_HOME`          —— 产品主目录（数据放在其 `data` 子目录下）
 *   3. `HOME` 或系统家目录      —— 兜底（数据放在 `.knorvia-studio` 下）
 *
 * 这三个值在**首次使用时**读取，而不是在模块加载时固化 ——
 * 这样测试可以在调用前注入环境，同一进程内也能观察环境变化。
 */

interface ResolvedDataDirs {
  baseDir: string;
  rootDir: string;
}

let cachedResolution: ResolvedDataDirs | undefined;
let explicitBaseDir: string | null | undefined;

/** 从环境变量解析数据目录（不缓存，供缓存失效后重新计算）。 */
function resolveFromEnvironment(): ResolvedDataDirs {
  const base = process.env.KNORVIA_DATA_BASE_DIR?.trim();
  if (base) return { baseDir: base, rootDir: base };

  const home = process.env.KNORVIA_HOME?.trim();
  if (home) return { baseDir: join(home, "data"), rootDir: home };

  const userHome = process.env.HOME?.trim() || homedir();
  return { baseDir: join(userHome, ".knorvia-studio"), rootDir: join(userHome, ".knorvia-studio") };
}

/** 取当前的数据目录解析结果（带缓存，环境变化时失效）。 */
function currentDirs(): ResolvedDataDirs {
  if (explicitBaseDir !== undefined) {
    const base = explicitBaseDir;
    if (base !== null) return { baseDir: base, rootDir: base };
  } else if (cachedResolution !== undefined) {
    return cachedResolution;
  }
  cachedResolution = resolveFromEnvironment();
  return cachedResolution;
}

/**
 * 显式设置数据根目录；传 `null` 表示恢复「按环境变量解析」。
 *
 * 设置后所有 `get*` 立即反映新值（不重启进程）。
 */
export function setDataBaseDir(dir: string | null): void {
  explicitBaseDir = dir;
  cachedResolution = undefined;
}

/** 当前数据根目录（`KNORVIA_DATA_BASE_DIR` 或推导值）。 */
export function getDataBaseDir(): string {
  return currentDirs().baseDir;
}

/** 产品主目录（`KNORVIA_HOME` 或派生值）。 */
export function getKnorviaDataRootDir(): string {
  return currentDirs().rootDir;
}

/** 递归列出一个目录下的所有文件（跳过子目录本身，返回完整路径）。 */
async function listFilesRecursively(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(directory, entry.name);
      return entry.isDirectory() ? listFilesRecursively(fullPath) : [fullPath];
    }),
  );
  return nested.flat();
}

/**
 * 把旧数据目录整体复制到新位置（用于「用户切换数据根」）。
 *
 * 语义：
 * - 目标目录不存在时逐级创建；
 * - 只复制文件，不复制目录元信息（权限/时间戳由文件系统决定）；
 * - 源目录不存在时静默跳过（首次启动没有旧数据是正常情形）。
 */
export async function copyDataDirectory(oldBaseDir: string, newBaseDir: string): Promise<void> {
  let sourceStat;
  try {
    sourceStat = await stat(oldBaseDir);
  } catch {
    return;
  }
  if (!sourceStat.isDirectory()) return;

  const files = await listFilesRecursively(oldBaseDir);
  await Promise.all(
    files.map(async (sourcePath) => {
      const relativePath = sourcePath.slice(oldBaseDir.length).replace(/^[\\/]/u, "");
      const targetPath = join(newBaseDir, relativePath);
      await mkdir(join(targetPath, ".."), { recursive: true });
      await copyFile(sourcePath, targetPath);
    }),
  );
}
