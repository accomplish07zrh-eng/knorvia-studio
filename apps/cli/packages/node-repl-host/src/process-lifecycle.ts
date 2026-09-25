import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const guarded = new WeakSet<object>();
export function installNodeReplProcessGuards(input: {
  onOutputClosed(error: Error): void;
  process: Pick<NodeJS.Process, "on">;
  writeStderr(text: string): void;
}): void {
  if (guarded.has(input.process)) return;
  guarded.add(input.process);
  let stopped = false;
  const handle = (reason: unknown) => {
    if (stopped) return;
    const error = reason instanceof Error ? reason : new Error(String(reason));
    if (
      ["EPIPE", "EIO", "ENXIO", "EBADF", "ERR_STREAM_DESTROYED"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    ) {
      stopped = true;
      input.onOutputClosed(error);
      return;
    }
    try {
      input.writeStderr(`Knorvia execution host: ${error.stack ?? error.message}\n`);
    } catch (failure) {
      stopped = true;
      input.onOutputClosed(failure instanceof Error ? failure : new Error(String(failure)));
    }
  };
  input.process.on("unhandledRejection", handle);
  input.process.on("uncaughtException", handle);
}

export function installNodeReplShutdownTriggers(input: {
  process: Pick<NodeJS.Process, "once">;
  shutdown(): void;
  stdin: Pick<NodeJS.ReadStream, "once">;
}): void {
  let stopped = false;
  const close = () => {
    if (!stopped) {
      stopped = true;
      input.shutdown();
    }
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) input.process.once(signal, close);
  for (const event of ["end", "close"]) input.stdin.once(event, close);
}

export async function isDirectMcpEntrypoint(
  moduleUrl: string,
  executable: string | undefined,
): Promise<boolean> {
  if (!executable) return false;
  try {
    const paths = await Promise.all([realpath(fileURLToPath(moduleUrl)), realpath(executable)]);
    return paths[0] === paths[1];
  } catch {
    return false;
  }
}
