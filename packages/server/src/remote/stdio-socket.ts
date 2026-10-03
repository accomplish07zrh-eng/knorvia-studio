import { Emitter, VSBuffer, type ISocket } from "@knorvia/rpc";
import type { StdioStream } from "./backend.js";

export function wrapStdioStream(stream: StdioStream): ISocket {
  const data = new Emitter<VSBuffer>();
  const close = new Emitter<void>();
  const end = new Emitter<void>();

  stream.stdout.on("data", (chunk: Buffer) => {
    data.fire(VSBuffer.wrap(new Uint8Array(chunk)));
  });
  stream.stdout.on("end", () => end.fire());
  stream.onClose(() => {
    close.fire();
    end.fire();
  });

  return {
    onData: data.event,
    onClose: close.event,
    onEnd: end.event,
    write(buffer) {
      stream.stdin.write(Buffer.from(buffer.buffer));
    },
    end() {
      stream.stdin.end();
    },
    drain() {
      const stdin = stream.stdin as NodeJS.WritableStream & {
        writableNeedDrain?: boolean;
      };
      if (!stdin.writableNeedDrain) return Promise.resolve();
      return new Promise<void>((resolve) => {
        stream.stdin.once("drain", resolve);
      });
    },
    dispose() {
      stream.stdin.end();
    },
  };
}
