import { rename } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

/** Windows scanners can briefly retain a verified executable after its version process exits. */
export async function publishKernelVersion(
  source: string,
  target: string,
  signal: AbortSignal,
  io = {
    rename,
    delay: (ms: number) => delay(ms, undefined, { signal }),
    platform: process.platform,
  },
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try {
      await io.rename(source, target);
      return;
    } catch (error) {
      if (
        io.platform !== "win32" ||
        attempt >= 9 ||
        !["EPERM", "EBUSY", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")
      )
        throw error;
      await io.delay(Math.min(50 * 2 ** attempt, 500));
    }
  }
}
