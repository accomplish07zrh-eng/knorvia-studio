import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants } from "node:fs";

import { prependPathEntries } from "./runtimeToolResolver.js";

interface LoginShellExecutionOptions {
  encoding: "utf8";
  windowsHide: boolean;
  timeout: number;
  maxBuffer: number;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export type LoginShellExecutor = (
  shellPath: string,
  shellArgs: string[],
  options: LoginShellExecutionOptions,
) => Promise<string>;

const bootstrapPath =
  process.platform === "darwin"
    ? "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    : "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const startMarker = "__KNORVIA_LOGIN_ENV_START__\0";
const endMarker = "__KNORVIA_LOGIN_ENV_END__\0";
const shellCommand =
  "printf '%s\\0' '__KNORVIA_LOGIN_ENV_START__'; env -0; printf '%s\\0' '__KNORVIA_LOGIN_ENV_END__'";
const defaultTimeoutMs = 4000;
const outputLimitBytes = 2097152;

let syncSnapshot: Record<string, string> | null | undefined;

export function buildShellBootstrapPath(currentPath: string | undefined): string {
  return prependPathEntries(currentPath, bootstrapPath.split(":"));
}

function resolveShell(baseEnv: NodeJS.ProcessEnv): string | null {
  for (const candidate of [baseEnv.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"]) {
    if (!candidate) continue;
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function shellArguments(shellPath: string): string[] {
  const flag = shellPath.endsWith("/zsh") || shellPath.endsWith("/bash") ? "-ilc" : "-lc";
  return [flag, shellCommand];
}

function executionOptions(baseEnv: NodeJS.ProcessEnv): LoginShellExecutionOptions {
  return {
    encoding: "utf8",
    windowsHide: true,
    timeout: defaultTimeoutMs,
    maxBuffer: outputLimitBytes,
    env: {
      ...baseEnv,
      PATH: buildShellBootstrapPath(baseEnv.PATH),
      TERM: "dumb",
      CI: "1",
    },
  };
}

function killProcessTree(child: ChildProcess): void {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Fall through to the direct child when the process group is unavailable.
    }
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // The process may already have exited.
  }
}

const executeLoginShell: LoginShellExecutor = (shellPath, shellArgs, options) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(shellPath, shellArgs, {
      env: options.env,
      windowsHide: options.windowsHide,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let outputBytes = 0;
    let settled = false;

    const kill = (): void => {
      killProcessTree(child);
      child.stdout?.destroy();
      child.stderr?.destroy();
    };
    const settle = (error?: Error): void => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(stdout);
    };
    const onAbort = (): void => {
      kill();
      settle(new Error(`login shell environment capture timed out after ${options.timeout}ms`));
    };
    const receive = (chunk: Buffer | string, append: boolean): void => {
      const decoded = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      outputBytes += Buffer.byteLength(decoded);
      if (outputBytes > options.maxBuffer) {
        kill();
        settle(new Error(`login shell environment capture exceeded ${options.maxBuffer} bytes`));
        return;
      }
      if (append) stdout += decoded;
    };

    child.stdout?.on("data", (chunk: Buffer | string) => receive(chunk, true));
    child.stderr?.on("data", (chunk: Buffer | string) => receive(chunk, false));
    child.once("error", (error) => settle(error));
    child.once("close", (code, signal) => {
      if (code === 0) settle();
      else {
        settle(
          new Error(
            `login shell environment capture exited with code ${code ?? "null"}, signal ${signal ?? "none"}`,
          ),
        );
      }
    });
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
  });

function parseSnapshot(output: string): Record<string, string> | null {
  const start = output.lastIndexOf(startMarker);
  const end = output.lastIndexOf(endMarker);
  if (start < 0 || end <= start) return null;

  const snapshot: Record<string, string> = {};
  const entries = output.slice(start + startMarker.length, end).split("\0");
  for (const entry of entries) {
    if (!entry) continue;
    const separator = entry.indexOf("=");
    if (separator <= 0) continue;
    const key = entry.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    snapshot[key] = entry.slice(separator + 1);
  }
  return snapshot;
}

export async function captureLoginShellEnvSnapshot(
  options: {
    baseEnv?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    shellPath?: string | null;
    executeShell?: LoginShellExecutor;
    timeoutMs?: number;
  } = {},
): Promise<Record<string, string> | null> {
  const baseEnv = options.baseEnv ?? process.env;
  const platform = options.platform ?? process.platform;
  if (platform === "win32" || baseEnv.VITEST) return null;

  const shellPath = options.shellPath === undefined ? resolveShell(baseEnv) : options.shellPath;
  if (!shellPath) return null;

  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const controller = new AbortController();
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  try {
    const execution = (options.executeShell ?? executeLoginShell)(
      shellPath,
      shellArguments(shellPath),
      {
        ...executionOptions(baseEnv),
        timeout: timeoutMs,
        signal: controller.signal,
      },
    );
    const deadline = new Promise<string>((_resolve, reject) => {
      deadlineTimer = setTimeout(() => {
        controller.abort();
        reject(new Error(`login shell environment capture timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return parseSnapshot(await Promise.race([execution, deadline]));
  } catch {
    return null;
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }
}

export function captureLoginShellEnvSnapshotSync(
  baseEnv: NodeJS.ProcessEnv,
): Record<string, string> | null {
  if (syncSnapshot !== undefined) return syncSnapshot;
  if (process.platform === "win32" || process.env.VITEST) {
    syncSnapshot = null;
    return syncSnapshot;
  }

  const shellPath = resolveShell(baseEnv);
  if (!shellPath) {
    syncSnapshot = null;
    return syncSnapshot;
  }
  try {
    const output = execFileSync(shellPath, shellArguments(shellPath), executionOptions(baseEnv));
    syncSnapshot = parseSnapshot(output);
  } catch {
    syncSnapshot = null;
  }
  return syncSnapshot;
}
