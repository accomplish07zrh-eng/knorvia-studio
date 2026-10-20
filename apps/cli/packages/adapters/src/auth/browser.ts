// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 在系统默认浏览器里打开一个地址。各平台拉起方式不同：Windows 借 cmd 的 start、
// macOS 用 open、其余平台一律 xdg-open。
//
// 判定口径（这一层不做网络探测，只判「进程有没有拉起来」）：
// 一、子进程 detached 且忽略标准流，父进程退出不牵连浏览器；
// 二、看到 spawn 事件即认为拉起成功；
// 三、同步抛出（例如可执行文件不存在）转成 opened=false 加原因；
// 四、等到上限仍没有任何事件时按「已拉起」收尾 —— 个别平台不上报 spawn。
//
// 形状声明在 browser-types.ts，本文件只做再导出。

import { spawn } from "node:child_process";
import type { BrowserOpenOptions, BrowserOpenResult } from "./browser-types.js";

export type { BrowserOpenOptions, BrowserOpenResult } from "./browser-types.js";

/** 等事件的上限（毫秒）：超过就按已拉起收尾。 */
const SETTLE_TIMEOUT_MS = 1_000;

/** 非 Windows / macOS 时的兜底可执行文件。 */
const FALLBACK_LAUNCHER = "xdg-open";

/** 子进程的起法：脱离父进程、三路标准流都不接管、不弹窗。 */
const DETACHED_OPTIONS = { detached: true, stdio: "ignore", windowsHide: true } as const;

/** 按平台定制的拉起方式；表外平台走兜底。 */
const PLATFORM_LAUNCHERS: Record<string, (url: string) => [string, string[]]> = {
  win32: (target) => ["cmd.exe", ["/c", "start", "", target]],
  darwin: (target) => ["open", [target]],
};

/** 一次拉起请求：命令、参数与等待上限。 */
type LaunchRequest = {
  command: string;
  argv: string[];
  timeoutMs: number;
};

/** 从异常里取一句可展示的原因；非 Error 直接字符串化。 */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 按平台挑拉起方式；表里没有就用兜底加单个地址参数。 */
function launcherFor(platform: NodeJS.Platform, url: string): [string, string[]] {
  const customize = PLATFORM_LAUNCHERS[platform];
  if (customize !== undefined) return customize(url);
  return [FALLBACK_LAUNCHER, [url]];
}

/** 组装请求：命令、参数与超时一次取定，后续步骤不再碰 options。 */
function makeRequest(url: string, options: BrowserOpenOptions): LaunchRequest {
  const chosenPlatform = options.platform ?? process.platform;
  const [command, argv] = launcherFor(chosenPlatform, url);
  const request = {} as LaunchRequest;
  request.command = command;
  request.argv = argv;
  request.timeoutMs = options.timeoutMs ?? SETTLE_TIMEOUT_MS;
  return request;
}

/** 拉起子进程；同步抛出交给调用方转成结果。 */
function spawnDetached(request: LaunchRequest, spawnProcess: typeof spawn) {
  return spawnProcess(request.command, request.argv, DETACHED_OPTIONS);
}

/**
 * 等首次结果。三个出口（spawn 事件、error 事件、超时）共用同一段收尾，
 * 用 settled 标记保证只结算一次。
 */
function awaitLaunch(
  launched: ReturnType<typeof spawn>,
  command: string,
  timeoutMs: number,
): Promise<BrowserOpenResult> {
  return new Promise<BrowserOpenResult>((resolve) => {
    let finished = false;
    let deadline: NodeJS.Timeout;

    const cleanup = (): void => {
      clearTimeout(deadline);
      launched.removeAllListeners("spawn");
      launched.removeAllListeners("error");
    };
    const finish = (payload: BrowserOpenResult): void => {
      if (finished) return;
      finished = true;
      cleanup();
      // 只有确实拉起时才脱离父进程；失败路径不需要 unref。
      if (payload.opened) launched.unref();
      resolve(payload);
    };

    launched.once("spawn", () => finish({ command, opened: true }));
    launched.once("error", (failure: Error) =>
      finish({ command, opened: false, reason: failure.message }),
    );
    deadline = setTimeout(() => finish({ command, opened: true }), timeoutMs);
  });
}

/** 对外入口：解析请求 → 拉起 → 等待结果。 */
export async function openUrlInBrowser(
  url: string,
  options: BrowserOpenOptions = {},
): Promise<BrowserOpenResult> {
  const request = makeRequest(url, options);
  const spawnProcess = options.spawnProcess ?? spawn;
  let launched: ReturnType<typeof spawn>;
  try {
    launched = spawnDetached(request, spawnProcess);
  } catch (error) {
    return { command: request.command, opened: false, reason: reasonOf(error) };
  }
  return awaitLaunch(launched, request.command, request.timeoutMs);
}
