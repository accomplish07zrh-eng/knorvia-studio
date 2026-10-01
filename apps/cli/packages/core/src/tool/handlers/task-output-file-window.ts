import { open } from "node:fs/promises";

type WindowEdge = "head" | "tail";
interface OutputWindow {
  available: boolean;
  content: string;
  truncated: boolean;
}
interface ReadWindow {
  bytes: Buffer;
  omitted: number;
}
const unavailable = (): OutputWindow => ({ available: false, content: "", truncated: false });

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Task output wait aborted", "AbortError");
}

async function captureWindow(
  path: string,
  signal: AbortSignal,
  limit: number,
  edge: WindowEdge,
): Promise<ReadWindow> {
  throwIfAborted(signal);
  const file = await open(path, "r");
  try {
    const { size } = await file.stat();
    const length = Math.min(size, limit);
    if (length === 0) return { bytes: Buffer.alloc(0), omitted: 0 };
    const window = {
      start: edge === "tail" ? size - length : 0,
      cursor: 0,
      buffer: Buffer.allocUnsafe(length),
    };
    while (window.cursor !== length) {
      const remaining = length - window.cursor;
      const { bytesRead } = await file.read(
        window.buffer,
        window.cursor,
        remaining,
        window.start + window.cursor,
      );
      if (bytesRead === 0) break;
      window.cursor += bytesRead;
    }
    throwIfAborted(signal);
    return { bytes: window.buffer.subarray(0, window.cursor), omitted: size - window.cursor };
  } finally {
    await file.close();
  }
}

/** 两个消费者共用同一有界读取和释放路径；仅头尾选取与尾部省略行不同。 */
export async function readTaskOutputWindow(
  path: string | undefined,
  signal: AbortSignal,
  limit: number,
  edge: WindowEdge,
): Promise<OutputWindow> {
  if (!path) return unavailable();
  try {
    const read = await captureWindow(path, signal, limit, edge);
    const prefix =
      edge === "tail" && read.omitted > 0
        ? `[${Math.round(read.omitted / 1024)}KB of earlier output omitted]\n`
        : "";
    return {
      available: true,
      content: prefix + read.bytes.toString("utf8"),
      truncated: read.omitted > 0,
    };
  } catch (error) {
    throwIfAborted(signal);
    if (error instanceof Error && error.name === "AbortError") throw error;
    return unavailable();
  }
}
