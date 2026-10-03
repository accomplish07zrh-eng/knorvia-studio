import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mock, test } from "node:test";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { KnorviaProtocolMessage } from "@knorvia/shared";
import type {
  ProcessTreeSnapshot,
  ProcessTreeTerminatorWaitOptions,
} from "../src/process/processTreeTypes.js";

const calls: Array<{ name: string; args: unknown[] }> = [];
let liveCapture: (
  child: unknown,
  options: ProcessTreeTerminatorWaitOptions,
) => Promise<ProcessTreeSnapshot | undefined> = async () => undefined;
let groupCapture: (group: number) => ProcessTreeSnapshot | undefined = () => undefined;
let exitedCapture: (pid: number) => Promise<ProcessTreeSnapshot | undefined> = async () =>
  undefined;
let treeWait: (
  child: unknown,
  options: ProcessTreeTerminatorWaitOptions,
) => Promise<{ remainingPids: number[] }> = async () => ({ remainingPids: [] });
const logger = { warn: () => undefined };
class FakeEmitter<T> {
  listeners = new Set<(event: T) => void>();
  event = (listener: (event: T) => void) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };
  fire(event: T) {
    for (const listener of this.listeners) listener(event);
  }
  dispose() {
    this.listeners.clear();
  }
}
class FakeStderr {
  constructor(input: unknown, callback?: unknown) {
    calls.push({ name: "stderr", args: [input, callback] });
  }
  waitForDrain(...args: unknown[]) {
    calls.push({ name: "drain", args });
    return Promise.resolve();
  }
}
class FakeInput extends EventEmitter {
  writable = true;
  destroyed = false;
  writes: Array<{ frame: string; done: (error?: Error | null) => void }> = [];
  endFailure?: Error;
  write(frame: string, done: (error?: Error | null) => void) {
    this.writes.push({ frame, done });
    return false;
  }
  end() {
    calls.push({ name: "eof", args: [] });
    if (this.endFailure) throw this.endFailure;
  }
}
class FakeOutput extends EventEmitter {
  resumes = 0;
  resumeFailure?: Error;
  resume() {
    this.resumes++;
    if (this.resumeFailure) throw this.resumeFailure;
  }
}
class FakeChild extends EventEmitter {
  stdin = new FakeInput();
  stdout = new FakeOutput();
  stderr = { synthetic: true };
  pid = 440;
  killed = false;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
}
mock.module("@knorvia/rpc", { namedExports: { Emitter: FakeEmitter } });
mock.module("@knorvia/shared", {
  namedExports: {
    knorviaProtocolMessageSchema: {
      parse: (input: unknown) => {
        if (!input || typeof input !== "object" || !("method" in input))
          throw new Error("synthetic schema rejection");
        return input;
      },
    },
  },
});
mock.module(new URL("../src/logger/serviceLogger.ts", import.meta.url).href, {
  namedExports: {
    createServiceLogger: (scope: string) => {
      assert.equal(scope, "agent-process-tree");
      return logger;
    },
  },
});
mock.module(new URL("../src/agent/agentStderrCollector.ts", import.meta.url).href, {
  namedExports: { AgentStderrCollector: FakeStderr, EXIT_STDERR_DRAIN_MS: 250 },
});
mock.module(new URL("../src/process/processTreeTerminator.ts", import.meta.url).href, {
  namedExports: {
    captureProcessTreeSnapshotAsync: (
      child: unknown,
      options: ProcessTreeTerminatorWaitOptions,
    ) => {
      calls.push({ name: "capture", args: [child, options] });
      return liveCapture(child, options);
    },
    captureProcessGroupSnapshot: (group: number) => {
      calls.push({ name: "group", args: [group] });
      return groupCapture(group);
    },
    captureExitedRootDescendantsSnapshotAsync: (pid: number, options: unknown) => {
      calls.push({ name: "exited", args: [pid, options] });
      return exitedCapture(pid);
    },
    terminateProcessTree: (child: unknown, options: unknown) =>
      calls.push({ name: "terminate", args: [child, options] }),
    terminateProcessTreeAndWait: (child: unknown, options: ProcessTreeTerminatorWaitOptions) => {
      calls.push({ name: "wait", args: [child, options] });
      return treeWait(child, options);
    },
  },
});
const { KnorviaStdioTransport } = await import("../src/agent/stdioTransport.js");
const asChild = (child: FakeChild) => child as unknown as ChildProcessWithoutNullStreams;
const message = (value: object) => value as KnorviaProtocolMessage;
const microtasks = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

test("synthetic stdio ports preserve frames, callback backpressure, cleanup deadlines and process authority", async () => {
  const environment = process.env;
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  process.env = { KNORVIA_E2E_COVERAGE: "1" };
  Object.defineProperty(process, "platform", { ...platform, value: "win32" });
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  try {
    const child = new FakeChild();
    const transport = new KnorviaStdioTransport(asChild(child));
    const events: unknown[] = [];
    const closed: unknown[] = [];
    transport.onMessage((event) => events.push(event));
    transport.onClose((event) => closed.push(event));
    assert.equal(transport.kind, "stdio");
    assert.equal(child.stdout.resumes, 0);
    const payload = { method: "synthetic/frame", params: { text: "雪\u2028x\u2029y" } };
    const bytes = Buffer.from(`${JSON.stringify(payload)}\r\n`);
    const split = bytes.indexOf(Buffer.from("雪")) + 1;
    child.stdout.emit("data", " \r\n");
    child.stdout.emit("data", bytes.subarray(0, split));
    assert.equal(events.length, 0);
    child.stdout.emit("data", bytes.subarray(split));
    assert.deepEqual(events, [payload]);
    assert.equal(
      calls.filter((call) =>
        ["capture", "group", "exited", "terminate", "wait"].includes(call.name),
      ).length,
      0,
    );
    let settled = false;
    const first = transport.send(message({ id: 1, method: "synthetic/one" })).then(() => {
      settled = true;
    });
    const writeError = new Error("synthetic write callback");
    const second = transport.send(message({ id: 2, method: "synthetic/two" }));
    const secondCheck = assert.rejects(second, (error) => error === writeError);
    await microtasks();
    assert.equal(settled, false);
    assert.deepEqual(
      child.stdin.writes.map((write) => write.frame),
      ['{"id":1,"method":"synthetic/one"}\n', '{"id":2,"method":"synthetic/two"}\n'],
    );
    child.stdin.writes[1]!.done(writeError);
    await secondCheck;
    assert.equal(settled, false);
    child.stdin.writes[0]!.done();
    await first;
    const serializationError = new Error("synthetic serialization");
    await assert.rejects(
      transport.send(
        message({
          get method() {
            throw serializationError;
          },
        }),
      ),
      (error) => error === serializationError,
    );
    child.stdout.emit("data", '{"method":"synthetic/trailing"}');
    child.stdout.emit("end");
    child.stdout.emit("close");
    assert.deepEqual(events.at(-1), { method: "synthetic/trailing" });
    assert.deepEqual(closed, [{ reason: "stdout_closed" }]);
    child.stdout.emit("data", '{"method":"synthetic/late"}\n');
    await assert.rejects(transport.send(message(payload)), /stdio transport is closed/);
    transport.dispose();
    transport.dispose();
    assert.equal(child.stdout.resumes, 1);
    assert.equal(child.stdout.listenerCount("data"), 0);
    assert.equal(child.stdout.listenerCount("end"), 0);
    assert.equal(child.stdout.listenerCount("error"), 1);
    assert.equal(child.stdin.listenerCount("error"), 1);
    assert.deepEqual(
      calls.filter((call) => call.name === "terminate").map((call) => call.args),
      [[child, {}]],
    );
    assert.deepEqual(
      calls.filter((call) => call.name === "drain").map((call) => call.args),
      [[3250]],
    );
    child.stdin.emit("error", new Error("synthetic late pipe"));

    calls.length = 0;
    const malformed = new FakeChild();
    const parser = new KnorviaStdioTransport(asChild(malformed));
    const parseCloses: unknown[] = [];
    parser.onClose((event) => parseCloses.push(event));
    malformed.stdout.emit("data", '{}\n{"method":"synthetic/skipped"}\n');
    malformed.stdout.emit("end");
    assert.deepEqual(parseCloses, [{ reason: "protocol_parse_error: synthetic schema rejection" }]);
    parser.dispose();

    calls.length = 0;
    const cleanupChild = new FakeChild();
    let finishCapture!: (snapshot: ProcessTreeSnapshot | undefined) => void;
    let captureOptions: ProcessTreeTerminatorWaitOptions | undefined;
    liveCapture = async (_child, options) => {
      captureOptions = options;
      return new Promise((resolve) => {
        finishCapture = resolve;
      });
    };
    treeWait = async () => ({ remainingPids: [445, 445, 446] });
    const cleanup = new KnorviaStdioTransport(asChild(cleanupChild), {
      ownedProcessGroupId: 44,
      ownedProcessStartedAtMs: 12,
    });
    const flight = cleanup.disposeAndWait();
    const failed = assert.rejects(
      flight,
      /runtime process tree cleanup incomplete; remaining pid=445,446$/,
    );
    assert.equal(cleanup.disposeAndWait(), flight);
    assert.equal(
      calls.some((call) => call.name === "eof"),
      false,
    );
    mock.timers.tick(50);
    cleanupChild.exitCode = 0;
    cleanupChild.emit("exit", 0, null);
    assert.equal(captureOptions!.resolveOwnedProcessExitedAtMs!(), 1050);
    finishCapture(undefined);
    await failed;
    assert.deepEqual(
      calls
        .filter((call) => ["capture", "group", "exited", "wait"].includes(call.name))
        .map((call) => call.name),
      ["capture", "wait"],
    );
    const unavailable = {
      rootPid: 440,
      descendantPids: [],
      identities: [],
      identityVerification: "unavailable",
    };
    const options = calls.find((call) => call.name === "wait")!
      .args[1] as ProcessTreeTerminatorWaitOptions;
    assert.deepEqual(options.snapshot, unavailable);
    assert.equal(options.windowsCleanupDeadlineAtMs, 4250);
    assert.equal(options.forceAfterMs, 1950);
    assert.equal(options.ownedProcessExitedAtMs, 1050);
    assert.equal(options.log, logger);
    assert.deepEqual(Object.keys(options), [
      "ownedProcessGroupId",
      "ownedProcessStartedAtMs",
      "ownedProcessExitedAtMs",
      "snapshot",
      "log",
      "windowsTaskkillTimeoutMs",
      "windowsCleanupDeadlineAtMs",
      "forceAfterMs",
    ]);
    calls.length = 0;
    treeWait = async () => ({ remainingPids: [] });
    await cleanup.disposeAndWait();
    assert.equal(
      calls.some((call) => call.name === "capture"),
      false,
    );
    const retryOptions = calls.find((call) => call.name === "wait")!
      .args[1] as ProcessTreeTerminatorWaitOptions;
    assert.equal(retryOptions.snapshot, options.snapshot);
    assert.equal(retryOptions.forceAfterMs, 0);
    assert.equal(retryOptions.windowsCleanupDeadlineAtMs, 2300);

    calls.length = 0;
    const slow = new FakeChild();
    slow.stdin.endFailure = new Error("synthetic EOF failure");
    const snapshot = { rootPid: 440, descendantPids: [441], identities: [] };
    liveCapture = async () => {
      mock.timers.tick(3000);
      return snapshot;
    };
    const slowTransport = new KnorviaStdioTransport(asChild(slow));
    const slowFlight = slowTransport.disposeAndWait();
    await microtasks();
    assert.deepEqual(
      calls
        .filter((call) => ["capture", "eof", "wait"].includes(call.name))
        .map((call) => call.name),
      ["capture", "eof"],
    );
    mock.timers.tick(249);
    await microtasks();
    assert.equal(
      calls.some((call) => call.name === "wait"),
      false,
    );
    mock.timers.tick(1);
    await slowFlight;
    const slowOptions = calls.find((call) => call.name === "wait")!
      .args[1] as ProcessTreeTerminatorWaitOptions;
    assert.equal(slowOptions.forceAfterMs, 0);
    assert.equal(slowOptions.snapshot, snapshot);
    assert.deepEqual(calls.filter((call) => call.name === "drain").at(-1)!.args, [0]);
    assert.equal(slow.listenerCount("exit"), 1);

    Object.defineProperty(process, "platform", { ...platform, value: "linux" });
    calls.length = 0;
    const exited = new FakeChild();
    exited.exitCode = 0;
    const grouped = new KnorviaStdioTransport(asChild(exited), {
      ownedProcessGroupId: 44,
      ownedProcessStartedAtMs: 0,
    });
    await grouped.disposeAndWait();
    assert.deepEqual(
      calls
        .filter((call) => ["capture", "group", "exited", "eof", "wait"].includes(call.name))
        .map((call) => call.name),
      ["group", "wait"],
    );
    const groupedOptions = calls.find((call) => call.name === "wait")!
      .args[1] as ProcessTreeTerminatorWaitOptions;
    assert.equal("windowsCleanupDeadlineAtMs" in groupedOptions, false);
    assert.equal("ownedProcessStartedAtMs" in groupedOptions, false);
    assert.equal("snapshot" in groupedOptions, false);
    assert.deepEqual(calls.filter((call) => call.name === "drain").at(-1)!.args, [undefined]);
    calls.length = 0;
    const authorityError = new Error("synthetic authority port failure");
    treeWait = async () => {
      throw authorityError;
    };
    await assert.rejects(grouped.disposeAndWait(), (error) => error === authorityError);
    assert.equal(
      calls.some((call) => call.name === "drain"),
      false,
    );
    calls.length = 0;
    const localFailure = new Error("synthetic local cleanup failure");
    const localChild = new FakeChild();
    localChild.exitCode = 0;
    localChild.stdout.resumeFailure = localFailure;
    const local = new KnorviaStdioTransport(asChild(localChild));
    await assert.rejects(local.disposeAndWait(), (error) => error === localFailure);
    assert.equal(
      calls.some((call) => ["capture", "exited", "wait", "drain"].includes(call.name)),
      false,
    );
    treeWait = async () => ({ remainingPids: [] });
    await local.disposeAndWait();
    const localOptions = calls.find((call) => call.name === "wait")!
      .args[1] as ProcessTreeTerminatorWaitOptions;
    assert.equal(localOptions.forceAfterMs, 2000);
    assert.equal(localChild.stdout.resumes, 1);
  } finally {
    process.env = environment;
    Object.defineProperty(process, "platform", platform);
    mock.timers.reset();
  }
});
