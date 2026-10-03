import {
  KNORVIA_VERSION,
  formatZodError,
  helloMessageSchema,
  type HelloAckMessage,
  type HelloMessage,
} from "@knorvia/shared";
import type { StdioStream } from "./backend.js";

export interface HandshakeResult {
  hello: HelloMessage;
  remaining: Buffer | null;
}

export function performHandshake(
  stream: StdioStream,
  clientId: string,
  timeoutMs = 10000,
): Promise<HandshakeResult> {
  return new Promise<HandshakeResult>((resolve, reject) => {
    let settled = false;
    let pending = "";
    let stdoutHistory = "";
    let stderrHistory = "";

    function failureText(prefix: string, code?: number): string {
      const parts: string[] = [];
      if (code !== undefined) parts.push(`exit code ${code}`);
      const stderr = stderrHistory.trim();
      const stdout = stdoutHistory.trim();
      if (stderr) parts.push(`stderr: ${JSON.stringify(stderr)}`);
      if (stdout) parts.push(`stdout: ${JSON.stringify(stdout)}`);
      return parts.length ? `${prefix} (${parts.join("; ")})` : prefix;
    }

    function fail(prefix: string, code?: number): void {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(failureText(prefix, code)));
    }

    function receiveStderr(chunk: Buffer): void {
      stderrHistory = (stderrHistory + chunk.toString("utf-8")).slice(-2048);
    }

    function receiveStdout(chunk: Buffer): void {
      const text = chunk.toString("utf-8");
      pending += text;
      stdoutHistory = (stdoutHistory + text).slice(-2048);

      while (true) {
        const newline = pending.indexOf("\n");
        if (newline === -1) return;
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (!line.startsWith("{")) continue;

        try {
          const message: unknown = JSON.parse(line);
          const parsed = helloMessageSchema.safeParse(message);
          if (parsed.success) {
            if (settled) return;
            settled = true;
            cleanup();
            const ack: HelloAckMessage = {
              type: "knorvia-hello-ack",
              version: KNORVIA_VERSION,
              clientId,
            };
            stream.stdin.write(`${JSON.stringify(ack)}\n`);
            resolve({
              hello: parsed.data,
              remaining: pending ? Buffer.from(pending, "utf-8") : null,
            });
            return;
          }

          if (
            typeof message === "object" &&
            message !== null &&
            "type" in message &&
            message.type === "knorvia-hello"
          ) {
            fail(`Invalid knorvia-hello: ${formatZodError(parsed.error)}`);
            return;
          }
        } catch {
          // The compatibility boundary also swallows cleanup and ACK errors here.
        }
      }
    }

    const timer = setTimeout(() => {
      fail("Handshake timeout: no knorvia-hello received within timeout");
    }, timeoutMs);
    stream.stdout.on("data", receiveStdout);
    stream.stderr.on("data", receiveStderr);
    const closeSubscription = stream.onClose((code) => {
      fail("Stream closed before handshake completed", code);
    });
    const cleanup = (): void => {
      clearTimeout(timer);
      stream.stdout.removeListener("data", receiveStdout);
      stream.stderr.removeListener("data", receiveStderr);
      closeSubscription.dispose();
    };
  });
}
