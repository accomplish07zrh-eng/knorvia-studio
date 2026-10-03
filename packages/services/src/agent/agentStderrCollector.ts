import { createInterface } from "node:readline";
import type { Readable } from "node:stream";

export const EXIT_STDERR_DRAIN_MS = 250;

export class AgentStderrCollector {
  private readonly drain: Promise<void>;
  private readonly reader: ReturnType<typeof createInterface>;
  private readonly complete: () => void;
  private completed = false;
  private deadline = Infinity;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(input: Readable, onLine?: (line: string) => void) {
    let resolveDrain = () => {};
    this.drain = new Promise<void>((resolve) => {
      resolveDrain = resolve;
    });

    this.complete = () => {
      if (this.completed) return;
      this.completed = true;
      if (this.timer) clearTimeout(this.timer);
      this.reader.close();
      resolveDrain();
    };

    this.reader = createInterface({ input });
    this.reader.on("line", (line: string) => onLine?.(line));
    this.reader.once("close", this.complete);
    this.reader.on("error", this.complete);
    input.on("error", this.complete);
    input.once("close", this.complete);

    if (input.destroyed || input.readableEnded) this.complete();
  }

  waitForDrain(timeoutMs = EXIT_STDERR_DRAIN_MS): Promise<void> {
    const requestedDeadline = Date.now() + timeoutMs;
    if (!this.completed && requestedDeadline < this.deadline) {
      this.deadline = requestedDeadline;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(this.complete, Math.max(0, timeoutMs));
    }
    return this.drain;
  }
}
