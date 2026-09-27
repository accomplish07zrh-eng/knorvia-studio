// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

interface ProcessOutput {
  onOutputClosed(error: Error): void;
  process: Pick<NodeJS.Process, "on">;
  writeStderr(text: string): void;
}
const OUTPUT_FAILURES = new Set(["EPIPE", "EIO", "ENXIO", "EBADF", "ERR_STREAM_DESTROYED"]);
const supervisors = new WeakMap<object, OutputSupervisor>();

function asError(reason: unknown): Error {
  try {
    return reason instanceof Error ? reason : new Error(String(reason));
  } catch {
    // 原错误观察器对空原型值再次 String 转换会抛错，连关闭路径也会被打断。
    return new Error("Unknown execution host failure");
  }
}

class OutputSupervisor {
  readonly #output: ProcessOutput;
  #closed = false;
  constructor(output: ProcessOutput) {
    this.#output = output;
  }

  receive = (reason: unknown): void => {
    if (this.#closed) return;
    const error = asError(reason);
    let failure: Error | undefined;
    try {
      if (OUTPUT_FAILURES.has((error as NodeJS.ErrnoException).code ?? "")) failure = error;
      else this.#output.writeStderr(`Knorvia execution host: ${error.stack ?? error.message}\n`);
    } catch (reason) {
      failure = asError(reason);
    }
    if (failure) {
      this.#closed = true;
      this.#output.onOutputClosed(failure);
    }
  };
}

export function installNodeReplProcessGuards(input: ProcessOutput): void {
  if (supervisors.has(input.process)) return;
  const owner = new OutputSupervisor(input);
  supervisors.set(input.process, owner);
  for (const event of ["uncaughtException", "unhandledRejection"] as const) {
    input.process.on(event, owner.receive);
  }
}

export function installNodeReplShutdownTriggers(input: {
  process: Pick<NodeJS.Process, "once">;
  shutdown(): void;
  stdin: Pick<NodeJS.ReadStream, "once">;
}): void {
  let pending = true;
  const close = () => {
    if (!pending) return;
    pending = false;
    input.shutdown();
  };
  input.process.once("SIGINT", close);
  input.process.once("SIGTERM", close);
  input.stdin.once("end", close);
  input.stdin.once("close", close);
}

export async function isDirectMcpEntrypoint(
  moduleUrl: string,
  executable: string | undefined,
): Promise<boolean> {
  if (!executable) return false;
  let modulePath: string;
  try {
    modulePath = fileURLToPath(moduleUrl);
  } catch {
    return false;
  }
  const [module, entry] = await Promise.allSettled([realpath(modulePath), realpath(executable)]);
  return (
    module.status === "fulfilled" && entry.status === "fulfilled" && module.value === entry.value
  );
}
