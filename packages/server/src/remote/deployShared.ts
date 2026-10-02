import { access } from "node:fs/promises";
import { join } from "node:path";
import type { StdioStream } from "./backend.js";
import { quotePosixPathArg } from "@knorvia/server/remote/posixShell.js";
import type { RemoteAssetNetworkPort } from "@knorvia/server/remote/remoteAssetNetwork.js";

export const REMOTE_BASE = "~/.knorvia-studio/server";

export interface RemoteAssetDeployOptions {
  signal?: AbortSignal;
  releaseDir?: string | null;
  resolveReleaseDir?: (
    componentIds?: string[],
    options?: { forceRefresh?: boolean },
  ) => Promise<string | null>;
  resolveComponentSha256?: (componentId: string) => Promise<string | null>;
  remoteCdnBaseUrl?: string;
  remoteCdnBaseUrls?: string[];
  remoteCacheDir?: string;
  manifestRequestTimeoutMs?: number;
  remoteAssetNetwork?: RemoteAssetNetworkPort;
}

export interface DeployLoggers {
  log: (...args: unknown[]) => void;
  logWarn: (...args: unknown[]) => void;
}

export async function fileExists(...pathParts: string[]): Promise<boolean> {
  const path = join(...pathParts);
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveFirstExistingPath(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

export function formatOptionalValue(value?: string): string {
  return value && value.trim().length > 0 ? value : "<empty>";
}

export function formatOptionalValues(values?: string[]): string {
  const formatted = values?.map((value) => value.trim()).filter((value) => value.length > 0);
  return formatted?.length ? formatted.join(", ") : "<empty>";
}

export function buildRemoteMoveCommand(source: string, target: string): string {
  return `command mv -f ${quotePosixPathArg(source)} ${quotePosixPathArg(target)}`;
}

export function buildRemoteChmodExecutableCommand(file: string): string {
  return `command chmod +x ${quotePosixPathArg(file)}`;
}

export function buildRemoteExecutableReplaceCommand(source: string, target: string): string {
  return `${buildRemoteChmodExecutableCommand(source)} && ${buildRemoteMoveCommand(source, target)}`;
}

export function createRemoteAssetPlaceholderError(
  platformArch: string,
  options: RemoteAssetDeployOptions,
  resourceLabel: string,
): Error {
  return new Error(
    `[deploy] ${resourceLabel} missing for ${platformArch}. Development should read from mock-cdn/releases; production should download and cache remote assets from CDN (remoteCdnBaseUrl=${formatOptionalValue(options.remoteCdnBaseUrl)}, remoteCdnBaseUrls=${formatOptionalValues(options.remoteCdnBaseUrls)}, remoteCacheDir=${formatOptionalValue(options.remoteCacheDir)}).`,
  );
}

export function waitForClose(stream: StdioStream): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    stream.stderr.on("data", (chunk) => {
      if (stderr.length < 2048) stderr += chunk.toString();
    });
    stream.onClose((code) => {
      if (code === 0) {
        resolve();
      } else {
        const detail = stderr.trim();
        reject(
          new Error(
            `[deploy] remote command failed with exit code ${code}${detail ? `: ${detail}` : ""}`,
          ),
        );
      }
    });
  });
}
