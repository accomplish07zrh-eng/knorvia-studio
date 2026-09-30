// SPDX-License-Identifier: MIT
// Independent reimplementation; review pending.

import { spawn } from "node:child_process";

export interface BrowserOpenResult {
  command: string;
  opened: boolean;
  reason?: string;
}

export interface BrowserOpenOptions {
  platform?: NodeJS.Platform;
  spawnProcess?: typeof spawn;
  timeoutMs?: number;
}

const DEFAULT_SETTLE_TIMEOUT_MS = 1_000;

function selectBrowserCommand(platform: NodeJS.Platform, url: string): [string, string[]] {
  if (platform === "darwin") {
    return ["open", [url]];
  }
  if (platform === "win32") {
    return ["cmd.exe", ["/c", "start", "", url]];
  }
  return ["xdg-open", [url]];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function openUrlInBrowser(
  url: string,
  options: BrowserOpenOptions = {},
): Promise<BrowserOpenResult> {
  const platform = options.platform ?? process.platform;
  const [command, args] = selectBrowserCommand(platform, url);
  const spawnProcess = options.spawnProcess ?? spawn;
  let child: ReturnType<typeof spawn>;

  try {
    child = spawnProcess(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
  } catch (error) {
    return { command, opened: false, reason: errorMessage(error) };
  }

  return await new Promise<BrowserOpenResult>((resolve) => {
    let settled = false;
    let deadline: NodeJS.Timeout;

    const cleanup = (): void => {
      clearTimeout(deadline);
      child.removeAllListeners("spawn");
      child.removeAllListeners("error");
    };
    const settleOpened = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      child.unref();
      resolve({ command, opened: true });
    };
    const settleError = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ command, opened: false, reason: error.message });
    };

    child.once("spawn", settleOpened);
    child.once("error", settleError);
    deadline = setTimeout(settleOpened, options.timeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS);
  });
}
