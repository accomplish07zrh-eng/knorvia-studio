import type { BrowserPageState } from "@knorvia/shared";
import type { ControlledViewWebContents } from "./browserCommandTypes.js";

export const DEFAULT_NAVIGATE_SETTLE_MS = 10000;

export class BrowserNavigationTimeoutError extends Error {
  name = "BrowserNavigationTimeoutError";
}

export function isAllowedBrowserUrl(rawUrl: string): boolean {
  if (rawUrl === "about:blank") {
    return true;
  }
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function now(): number {
  return Date.now();
}

export function readState(wc: ControlledViewWebContents): BrowserPageState {
  let url = "";
  let title = "";
  let canGoBack = false;
  let canGoForward = false;

  try {
    url = wc.getURL();
  } catch {
    url = "";
  }
  try {
    title = wc.getTitle();
  } catch {
    title = "";
  }
  try {
    canGoBack = wc.canGoBack();
  } catch {
    canGoBack = false;
  }
  try {
    canGoForward = wc.canGoForward();
  } catch {
    canGoForward = false;
  }

  return { url, title, canGoBack, canGoForward };
}

export async function settleNavigation(
  loadPromise: Promise<void>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException("aborted", "AbortError");
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  const timeout = new Promise<void>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new BrowserNavigationTimeoutError("Navigation timed out after " + timeoutMs + "ms"));
    }, timeoutMs);
  });

  const aborted = new Promise<void>((_resolve, reject) => {
    onAbort = () => {
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

  try {
    await Promise.race([loadPromise, timeout, aborted]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    if (onAbort) {
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
