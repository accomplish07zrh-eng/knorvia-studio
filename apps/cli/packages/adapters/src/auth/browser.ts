// SPDX-License-Identifier: MIT
// Independent reimplementation; review pending.
//
// 在系统默认浏览器里打开 URL：Linux 用 xdg-open、macOS 用 open、Windows 用 cmd start。
// 形状声明见 browser-types.ts，本文件原样再导出，公开面不变。
//
// 行为约定：
// 一、子进程以 detached + stdio ignore 启动，父进程退出不影响浏览器。
// 二、spawn 事件即视为「已打开」，随后 unref 并释放监听器。
// 三、启动失败返回 opened=false 与原因；超时未报错也按已打开处理（部分平台不报 spawn）。
// 四、只判定「进程是否启动成功」，不判断 URL 是否可达。

import { spawn } from "node:child_process";
import type { BrowserOpenOptions, BrowserOpenResult } from "./browser-types.js";

export type { BrowserOpenOptions, BrowserOpenResult } from "./browser-types.js";

const DEFAULT_SETTLE_TIMEOUT_MS = 1_000;

/** 平台 → 命令与参数：Windows 走 cmd start，其余两个平台各自一条命令。 */
const PLATFORM_COMMANDS: Record<string, (url: string) => [string, string[]]> = {
  win32: (url) => ["cmd.exe", ["/c", "start", "", url]],
  darwin: (url) => ["open", [url]],
};

function browserCommandFor(platform: NodeJS.Platform, url: string): [string, string[]] {
  const build = PLATFORM_COMMANDS[platform];
  return build ? build(url) : ["xdg-open", [url]];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 启动一次 detached 子进程；同步抛出（如 ENOENT）时由调用方转成结果。 */
function spawnDetached(
  command: string,
  argv: string[],
  spawnProcess: typeof spawn,
): ReturnType<typeof spawn> {
  return spawnProcess(command, argv, { detached: true, stdio: "ignore", windowsHide: true });
}

/** 等首次结果：spawn 或 error 先到者胜，超时兜底为「已打开」。 */
function awaitLaunch(
  launched: ReturnType<typeof spawn>,
  command: string,
  timeoutMs: number,
): Promise<BrowserOpenResult> {
  return new Promise<BrowserOpenResult>((resolve) => {
    let done = false;
    let timer: NodeJS.Timeout;

    const release = (): void => {
      clearTimeout(timer);
      launched.removeAllListeners("spawn");
      launched.removeAllListeners("error");
    };
    const opened = (): void => {
      if (done) return;
      done = true;
      release();
      launched.unref();
      resolve({ command, opened: true });
    };
    const failed = (error: Error): void => {
      if (done) return;
      done = true;
      release();
      resolve({ command, opened: false, reason: error.message });
    };

    launched.once("spawn", opened);
    launched.once("error", failed);
    timer = setTimeout(opened, timeoutMs);
  });
}

export async function openUrlInBrowser(
  url: string,
  options: BrowserOpenOptions = {},
): Promise<BrowserOpenResult> {
  const platform = options.platform ?? process.platform;
  const [command, argv] = browserCommandFor(platform, url);
  const spawnProcess = options.spawnProcess ?? spawn;
  let launched: ReturnType<typeof spawn>;
  try {
    launched = spawnDetached(command, argv, spawnProcess);
  } catch (error) {
    return { command, opened: false, reason: describe(error) };
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS;
  return await awaitLaunch(launched, command, timeoutMs);
}
