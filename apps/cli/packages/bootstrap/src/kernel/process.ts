// SPDX-License-Identifier: Apache-2.0
// 进程入口：boot → 就绪行 → 启动协议桥（stdout 只写 NDJSON 协议帧）→ 等待 stdin 结束或信号 → 停桥 → dispose。

import { KERNEL_DSH_VERSION, KERNEL_FAILED_MARKER, KERNEL_READY_MARKER } from "./constants.js";
import { errorMessage } from "./errors.js";
import { bootKernel, type BootKernelOptions, type KernelHost } from "./host.js";
import { callKernelLogger, createStderrKernelLogger, type KernelLogger } from "./logger.js";

export interface RunKernelProcessOptions extends BootKernelOptions {
  readonly input?: NodeJS.ReadableStream;
  readonly output?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
  readonly signals?: Pick<NodeJS.Process, "on" | "off">;
}

type FailureReason = "config" | "boot" | "dispose";

export async function runKernelProcess(options: RunKernelProcessOptions): Promise<number> {
  const stderr = options.stderr ?? process.stderr;
  const logger = options.logger ?? createStderrKernelLogger(stderr);

  let host: KernelHost;
  try {
    host = await bootKernel({ ...options, logger });
  } catch (error) {
    const reason = failureReason(error);
    writeFailure(stderr, reason, error);
    callKernelLogger(logger, "error", "kernel.dsh.boot.failed", {
      reason,
      error: errorMessage(error),
    });
    return 1;
  }

  stderr.write(`${KERNEL_READY_MARKER} engine=dsh dsh=${KERNEL_DSH_VERSION}\n`);

  const input = options.input ?? process.stdin;
  // 协议桥只在 dsh 引擎下动态加载；默认引擎不会走到 runKernelProcess。
  const { runBridge } = await import("../kernel-bridge/entry.js");
  const bridge = runBridge({
    context: host.context,
    input,
    output: options.output ?? process.stdout,
    logger,
  });

  // SIGTERM/SIGINT 或 stdin 结束：停桥（engine.stop()），然后照常 dispose 退出。
  const watcher = watchShutdown(input, options.signals ?? process);
  try {
    await Promise.race([watcher.wait(), bridge.done]);
  } finally {
    watcher.dispose();
    await bridge.stop();
  }

  callKernelLogger(logger, "info", "kernel.dsh.stopping");
  try {
    await host.dispose();
    callKernelLogger(logger, "info", "kernel.dsh.stopped");
    return 0;
  } catch (error) {
    writeFailure(stderr, "dispose", error);
    callKernelLogger(logger, "error", "kernel.dsh.dispose.failed", {
      error: errorMessage(error),
    });
    return 1;
  }
}

function failureReason(error: unknown): FailureReason {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return code === "KERNEL_INVALID_CWD" || code === "KERNEL_CONFIG_FAILED" ? "config" : "boot";
}

function writeFailure(stderr: NodeJS.WritableStream, reason: FailureReason, error: unknown): void {
  stderr.write(`${KERNEL_FAILED_MARKER} engine=dsh reason=${reason}\n`);
  stderr.write(`Error: ${singleLine(errorMessage(error))}\n`);
}

function singleLine(message: string): string {
  return message.replace(/\s*\r?\n\s*/gu, " ").trim();
}

function watchShutdown(
  input: NodeJS.ReadableStream,
  signals: Pick<NodeJS.Process, "on" | "off">,
): { wait(): Promise<void>; dispose(): void } {
  let settled = false;
  let resolveWait: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolveWait = resolve;
  });

  const stop = (): void => {
    if (settled) return;
    settled = true;
    resolveWait?.();
  };
  const onSignal = (): void => stop();

  input.on("end", stop);
  input.on("close", stop);
  input.on("error", stop);
  signals.on("SIGTERM", onSignal);
  signals.on("SIGINT", onSignal);
  if (typeof input.resume === "function") input.resume();
  if ((input as NodeJS.ReadableStream & { readableEnded?: boolean }).readableEnded) stop();

  return {
    wait: () => promise,
    dispose(): void {
      input.off("end", stop);
      input.off("close", stop);
      input.off("error", stop);
      signals.off("SIGTERM", onSignal);
      signals.off("SIGINT", onSignal);
    },
  };
}
