import { spawn, type ChildProcess } from "node:child_process";
import { DEFAULT_GIT_COMMAND_TIMEOUT_MS, DEFAULT_GIT_OUTPUT_BYTES } from "../config.js";
import {
  createGitEnvironmentProvider,
  type GitEnvironmentProvider,
} from "./gitEnvironmentProvider.js";

export interface GitCommandExecutionOptions {
  cwd: string;
  args: string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
}

export interface GitCommandExecutionResult {
  binaryPath: string;
  cwd: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  timeoutMs?: number;
  timeoutElapsedMs?: number;
  timeoutCloseDelayMs?: number;
  forceKillAttempted?: boolean;
  orphaned?: boolean;
  outputTruncated: boolean;
}

export interface GitCommandProvider {
  resolveGitBinary(): Promise<string | null>;
  run(options: GitCommandExecutionOptions): Promise<GitCommandExecutionResult>;
}

export function createGitCommandProvider(options?: {
  environmentProvider?: GitEnvironmentProvider;
  platform?: NodeJS.Platform;
  timeoutKillGraceMs?: number;
  timeoutForceKillGraceMs?: number;
}): GitCommandProvider {
  const environmentProvider = options?.environmentProvider ?? createGitEnvironmentProvider();
  const platform = options?.platform ?? process.platform;
  const timeoutKillGraceMs = options?.timeoutKillGraceMs ?? 2000;
  const timeoutForceKillGraceMs = options?.timeoutForceKillGraceMs ?? 2000;

  async function resolveGitBinary(): Promise<string | null> {
    return await environmentProvider.resolveGitBinary();
  }

  function forceKill(child: ChildProcess): void {
    if (platform === "win32" && typeof child.pid === "number") {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      const killerTimeout = setTimeout(() => {
        killer.kill();
      }, 2000);
      const clearKillerTimeout = () => clearTimeout(killerTimeout);
      killer.once("error", clearKillerTimeout);
      killer.once("close", clearKillerTimeout);
      return;
    }
    child.kill("SIGKILL");
  }

  return {
    resolveGitBinary,
    async run(command): Promise<GitCommandExecutionResult> {
      const resolvedBinary = await environmentProvider.resolveGitBinary();
      if (!resolvedBinary) {
        throw new Error("Git binary is not available");
      }
      const binaryPath = resolvedBinary;

      const timeoutMs = command.timeoutMs ?? DEFAULT_GIT_COMMAND_TIMEOUT_MS;
      const maxOutputBytes = command.maxOutputBytes ?? DEFAULT_GIT_OUTPUT_BYTES;
      const env = { ...environmentProvider.createCommandEnv(), ...command.env };
      const started = Date.now();

      return await new Promise<GitCommandExecutionResult>((resolve) => {
        let stdout = "";
        let stderr = "";
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let timedOut = false;
        let timeoutElapsedMs: number | undefined;
        let forceKillAttempted = false;
        let orphaned = false;
        let outputTruncated = false;
        let settled = false;

        const child = spawn(binaryPath, command.args, {
          cwd: command.cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });

        function buildResult(
          exitCode: number | null,
          signal: NodeJS.Signals | null,
        ): GitCommandExecutionResult {
          const durationMs = Date.now() - started;
          return {
            binaryPath,
            cwd: command.cwd,
            args: command.args,
            stdout,
            stderr,
            exitCode,
            signal,
            durationMs,
            timedOut,
            timeoutMs,
            timeoutElapsedMs,
            timeoutCloseDelayMs:
              timedOut && timeoutElapsedMs !== undefined
                ? Math.max(durationMs - timeoutElapsedMs, 0)
                : undefined,
            forceKillAttempted,
            orphaned,
            outputTruncated,
          };
        }

        function settle(result: GitCommandExecutionResult): void {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          child.stdout?.off("data", onStdout);
          child.stderr?.off("data", onStderr);
          child.removeAllListeners("error");
          child.removeAllListeners("close");
          if (result.orphaned) {
            child.stdout?.destroy();
            child.stderr?.destroy();
            child.unref();
          }
          resolve(result);
        }

        function collect(chunk: Buffer, stream: "stdout" | "stderr"): void {
          if (outputTruncated) return;
          const bytes = stream === "stdout" ? stdoutBytes : stderrBytes;
          if (bytes + chunk.byteLength > maxOutputBytes) {
            outputTruncated = true;
            child.kill();
            return;
          }
          if (stream === "stdout") {
            stdout += chunk.toString("utf-8");
            stdoutBytes += chunk.byteLength;
          } else {
            stderr += chunk.toString("utf-8");
            stderrBytes += chunk.byteLength;
          }
        }

        function onStdout(chunk: Buffer): void {
          collect(chunk, "stdout");
        }

        function onStderr(chunk: Buffer): void {
          collect(chunk, "stderr");
        }

        async function onTimeout(): Promise<void> {
          if (settled) return;
          timedOut = true;
          timeoutElapsedMs = Date.now() - started;
          child.kill();
          await new Promise<void>((done) => setTimeout(done, timeoutKillGraceMs));
          if (settled) return;
          forceKillAttempted = true;
          forceKill(child);
          await new Promise<void>((done) => setTimeout(done, timeoutForceKillGraceMs));
          if (settled) return;
          orphaned = true;
          settle(buildResult(null, null));
        }

        const timeout = setTimeout(() => {
          void onTimeout();
        }, timeoutMs);
        child.once("error", (error: unknown) => {
          stderr = error instanceof Error ? error.message : String(error);
          settle(buildResult(-2, null));
        });
        child.stdout?.on("data", onStdout);
        child.stderr?.on("data", onStderr);
        child.once("close", (code, signal) => {
          settle(buildResult(code, signal));
        });
      });
    },
  };
}
