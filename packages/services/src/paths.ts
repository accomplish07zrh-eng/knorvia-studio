import { getKnorviaDataRootDir } from "./dataLocationOwner.js";
export {
  setDataBaseDir,
  getDataBaseDir,
  getKnorviaDataRootDir,
  copyDataDirectory,
} from "./dataLocationOwner.js";

import { createHash } from "node:crypto";
import { join, win32 } from "node:path";
import { DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR_ERROR_CODE } from "@knorvia/shared";
export const KNORVIA_WINDOWS_APP_INSTALL_DIR_ENV = "KNORVIA_WINDOWS_APP_INSTALL_DIR";

interface DataBaseDirTargetValidationOptions {
  platform?: NodeJS.Platform | string;
  env?: Record<string, string | undefined>;
  appInstallDir?: string | null;
}

type DataBaseDirTargetValidationResult =
  | { ok: true }
  | {
      ok: false;
      code: typeof DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR_ERROR_CODE;
      forbiddenDir: string;
    };

/** 非项目对话共享的真实工作目录；默认 ~/.knorvia-studio/workspace/default。 */
export function getConversationWorkspaceDir(): string {
  return join(getKnorviaDataRootDir(), "workspace", "default");
}

/** {dataBaseDir}/.knorvia-studio/v2 */
export function getAppConfigDir(): string {
  return join(getKnorviaDataRootDir(), "v2");
}

function readEnvValue(env: Record<string, string | undefined>, key: string): string | undefined {
  const direct = env[key]?.trim();
  if (direct) {
    return direct;
  }

  const lowerKey = key.toLowerCase();
  for (const [candidateKey, value] of Object.entries(env)) {
    if (candidateKey.toLowerCase() !== lowerKey) {
      continue;
    }
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
}

function normalizeWindowsComparablePath(pathValue: string): string | null {
  const trimmed = pathValue.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = win32.normalize(trimmed).replace(/[\\/]+$/, "");
  if (!normalized) {
    return null;
  }

  return win32
    .resolve(normalized)
    .replace(/[\\/]+$/, "")
    .toLowerCase();
}

function isWindowsPathEqualOrInside(pathValue: string, rootValue: string): boolean {
  const normalizedPath = normalizeWindowsComparablePath(pathValue);
  const normalizedRoot = normalizeWindowsComparablePath(rootValue);
  if (!normalizedPath || !normalizedRoot) {
    return false;
  }

  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}\\`);
}

function collectWindowsForbiddenAppInstallDirs(
  options: Required<Pick<DataBaseDirTargetValidationOptions, "env">> &
    Pick<DataBaseDirTargetValidationOptions, "appInstallDir">,
): string[] {
  const env = options.env;
  const programFiles = readEnvValue(env, "ProgramFiles");
  const programFilesX86 = readEnvValue(env, "ProgramFiles(x86)");
  const programW6432 = readEnvValue(env, "ProgramW6432");
  const localAppData = readEnvValue(env, "LOCALAPPDATA");
  const candidates = [
    options.appInstallDir,
    readEnvValue(env, KNORVIA_WINDOWS_APP_INSTALL_DIR_ENV),
    programFiles ? win32.join(programFiles, "Knorvia Studio") : null,
    programFilesX86 ? win32.join(programFilesX86, "Knorvia Studio") : null,
    programW6432 ? win32.join(programW6432, "Knorvia Studio") : null,
    localAppData ? win32.join(localAppData, "Programs", "Knorvia Studio") : null,
  ];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of candidates) {
    const normalized =
      typeof candidate === "string" ? normalizeWindowsComparablePath(candidate) : null;
    if (!candidate || !normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(candidate);
  }

  return result;
}

export function validateDataBaseDirTarget(
  targetBaseDir: string,
  options: DataBaseDirTargetValidationOptions = {},
): DataBaseDirTargetValidationResult {
  if ((options.platform ?? process.platform) !== "win32") {
    return { ok: true };
  }

  for (const forbiddenDir of collectWindowsForbiddenAppInstallDirs({
    env: options.env ?? process.env,
    appInstallDir: options.appInstallDir ?? null,
  })) {
    if (isWindowsPathEqualOrInside(targetBaseDir, forbiddenDir)) {
      return {
        ok: false,
        code: DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR_ERROR_CODE,
        forbiddenDir,
      };
    }
  }

  return { ok: true };
}

export function getExportLogStageDir(): string {
  return join(getKnorviaDataRootDir(), "export-log-stage");
}

export function getExportLogDir(): string {
  return join(getKnorviaDataRootDir(), "export-log");
}

export function getFeedbackRootDir(): string {
  return join(getKnorviaDataRootDir(), "feedback");
}

export function getFeedbackAttachmentDir(): string {
  return join(getFeedbackRootDir(), "attachments");
}

export function getFeedbackLogArchiveDir(): string {
  return join(getFeedbackRootDir(), "logs");
}

export function getGitCheckpointIndexRootDir(): string {
  return join(getKnorviaDataRootDir(), "git-checkpoint-index");
}

/** ~/.knorvia-studio/v2/tasks-index.sqlite */
export function getTasksIndexDatabasePath(): string {
  return join(getAppConfigDir(), "tasks-index.sqlite");
}

/** workspace 级身份键：远程优先使用 workspaceIdentity，本地回退 workspacePath。 */
function getWorkspaceKey(workspacePath: string, workspaceIdentity?: string): string {
  return workspaceIdentity?.trim() || workspacePath;
}

/** 与 Knorvia session 持久化一致：使用 workspaceKey 的 SHA-256 前 12 位 */
export function getWorkspaceHash(workspacePath: string, workspaceIdentity?: string): string {
  return createHash("sha256")
    .update(getWorkspaceKey(workspacePath, workspaceIdentity))
    .digest("hex")
    .slice(0, 12);
}

/** ~/.knorvia-studio/v2/sessions/{workspaceHash} */
function getTaskSessionDir(workspacePath: string, workspaceIdentity?: string): string {
  return join(getAppConfigDir(), "sessions", getWorkspaceHash(workspacePath, workspaceIdentity));
}

/** ~/.knorvia-studio/v2/sessions/{workspaceHash}/{taskId}.json */
export function getLegacyTaskSessionSnapshotPath(
  workspacePath: string,
  taskId: string,
  workspaceIdentity?: string,
): string {
  return join(getTaskSessionDir(workspacePath, workspaceIdentity), `${taskId}.json`);
}

/** ~/.knorvia-studio/v2/sessions/{workspaceHash}/{taskId}.deleted.json */
export function getLegacyDeletedTaskSessionSnapshotPath(
  workspacePath: string,
  taskId: string,
  workspaceIdentity?: string,
): string {
  return join(getTaskSessionDir(workspacePath, workspaceIdentity), `${taskId}.deleted.json`);
}
