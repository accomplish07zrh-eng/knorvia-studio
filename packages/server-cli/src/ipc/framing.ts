import { MAX_CONTROL_FRAME_BYTES } from "../contracts.js";

export function encodeJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export class JsonLineDecoder {
  private pending = "";
  private readonly options: { maxFrameBytes?: number };

  public constructor(options: { maxFrameBytes?: number } = {}) {
    this.options = options;
  }

  public push(chunk: string | Uint8Array): unknown[] {
    this.pending += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    if (
      Buffer.byteLength(this.pending, "utf8") > this.maximum() &&
      !this.pending.includes("\n")
    ) {
      throw new Error("JSONL frame exceeds maximum size");
    }

    const batch = this.pending;
    const values: unknown[] = [];
    let cursor = 0;
    for (let end = batch.indexOf("\n"); end !== -1; end = batch.indexOf("\n", cursor)) {
      const line = batch.slice(cursor, end).trim();
      cursor = end + 1;
      // 失败帧也已被消费；保留其后的原始尾部，避免下一次 push 重放已处理的命令。
      this.pending = batch.slice(cursor);
      if (line.length === 0) continue;
      if (Buffer.byteLength(line, "utf8") > this.maximum()) {
        throw new Error("JSONL frame exceeds maximum size");
      }
      try {
        values.push(JSON.parse(line) as unknown);
      } catch (cause) {
        throw new Error("Invalid JSONL frame", { cause });
      }
    }
    return values;
  }

  public finish(): void {
    if (this.pending.trim().length !== 0) throw new Error("Incomplete JSONL frame");
  }

  private maximum(): number {
    return this.options.maxFrameBytes ?? MAX_CONTROL_FRAME_BYTES;
  }
}
