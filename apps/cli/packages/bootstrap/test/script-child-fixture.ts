import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

interface ChildFrame {
  kind: string;
  id?: string;
  type?: string;
  payload?: any;
  ok?: boolean;
  value?: any;
  error?: string;
  stack?: string;
}
export interface ChildObservation {
  frames: ChildFrame[];
  stderr: string;
  exitCode: number | null;
}
export type ChildRunner = (input: {
  body: string;
  args?: unknown;
  budgetTotal?: number | null;
  respond?: (request: ChildFrame, send: (message: unknown) => void) => void;
}) => Promise<ChildObservation>;
export type ChildCase = { name: string; run(child: ChildRunner): Promise<unknown> };

const CHILD_TIMEOUT_MS = 10000;

export function childRunner(source: string): ChildRunner {
  return async (input) => {
    const payload = Buffer.from(
      JSON.stringify({ scriptBody: input.body, args: input.args, budgetTotal: input.budgetTotal }),
      "utf8",
    ).toString("base64url");
    const child = spawn(
      process.execPath,
      ["--input-type=module", "--eval", source, "--", payload],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const frames: ChildFrame[] = [];
    let stderr = "";
    const reader = createInterface({ input: child.stdout });
    const send = (message: unknown) =>
      child.stdin.write(typeof message === "string" ? message : JSON.stringify(message) + "\n");
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    let rejectRun!: (error: unknown) => void;
    const failure = new Promise<never>((_resolve, reject) => {
      rejectRun = reject;
    });
    reader.on("line", (line) => {
      try {
        const frame: ChildFrame = JSON.parse(line);
        frames.push(frame);
        if (frame.kind === "request") {
          if (input.respond) input.respond(frame, send);
          else
            send({
              kind: "response",
              id: frame.id,
              ok: true,
              value: { value: frame.payload.prompt, stats: { tokens: { total: 1 } } },
            });
        }
      } catch (error) {
        rejectRun(error);
      }
    });
    const timeout = setTimeout(
      () => rejectRun(new Error("synthetic workflow child timed out")),
      CHILD_TIMEOUT_MS,
    );
    try {
      const exitCode = await Promise.race([
        failure,
        new Promise<number | null>((resolve, reject) => {
          child.on("error", reject);
          child.on("close", resolve);
        }),
      ]);
      assert.equal(exitCode, 0, stderr);
      assert.equal(frames.filter((frame) => frame.kind === "complete").length, 1);
      for (const [index, frame] of frames.filter((frame) => frame.kind === "request").entries()) {
        assert.equal(frame.id, `req_${index + 1}`);
        assert.deepEqual(Object.keys(frame), ["id", "kind", "payload", "type"]);
      }
      return { frames, stderr, exitCode };
    } finally {
      clearTimeout(timeout);
      reader.close();
      child.kill();
    }
  };
}

export function stableChildObservation(result: ChildObservation) {
  return {
    frames: result.frames.map(({ stack, ...frame }) => ({
      ...frame,
      ...(stack === undefined ? {} : { stackPresent: typeof stack === "string" }),
    })),
    invalidResponseLogged: result.stderr.includes("Invalid workflow runner response"),
    syntheticConsoleLogged: result.stderr.includes("synthetic workflow stderr"),
    exitCode: result.exitCode,
  };
}
