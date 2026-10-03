import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { Readable } from "node:stream";

type Listener = (...args: unknown[]) => void;
const steps: string[] = [];
class FakeSignals {
  readonly handlers = new Map<string, Array<{ listener: Listener; once: boolean }>>();
  constructor(readonly label: string) {}
  on(event: string, listener: Listener): this {
    steps.push(`${this.label}.on:${event}`);
    const handlers = this.handlers.get(event) ?? [];
    handlers.push({ listener, once: false });
    this.handlers.set(event, handlers);
    return this;
  }
  once(event: string, listener: Listener): this {
    steps.push(`${this.label}.once:${event}`);
    const handlers = this.handlers.get(event) ?? [];
    handlers.push({ listener, once: true });
    this.handlers.set(event, handlers);
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    for (const handler of Array.from(this.handlers.get(event) ?? [])) {
      if (handler.once) {
        const live = this.handlers.get(event)!;
        live.splice(live.indexOf(handler), 1);
      }
      handler.listener(...args);
    }
  }
}
class FakeInput extends FakeSignals {
  constructor(
    readonly destroyedFlag = false,
    readonly endedFlag = false,
  ) {
    super("input");
  }
  get destroyed(): boolean {
    steps.push("input.destroyed");
    return this.destroyedFlag;
  }
  get readableEnded(): boolean {
    steps.push("input.readableEnded");
    return this.endedFlag;
  }
}
class FakeReader extends FakeSignals {
  closeCount = 0;
  closeFailure: Error | undefined;
  constructor() {
    super("reader");
  }
  close(): void {
    steps.push("reader.close");
    this.closeCount++;
    if (this.closeFailure) throw this.closeFailure;
    this.emit("close");
  }
}
const readers: FakeReader[] = [];
let constructionFailure: Error | undefined;
mock.module("node:readline", {
  namedExports: {
    createInterface: (options: { input: unknown }) => {
      steps.push("createInterface");
      assert.deepEqual(Object.keys(options), ["input"]);
      assert.ok(options.input instanceof FakeInput);
      if (constructionFailure) throw constructionFailure;
      const reader = new FakeReader();
      readers.push(reader);
      return reader;
    },
  },
});
const { AgentStderrCollector, EXIT_STDERR_DRAIN_MS } =
  await import("../src/agent/agentStderrCollector.js");
interface FakeTimer {
  callback: () => void;
  delay: number | undefined;
  unref: () => void;
}

test("synthetic stderr ports preserve raw data, shared drain identity, deadline and committed failure lifetimes without streams or processes", async (context) => {
  let now = 1000;
  let clockReads = 0;
  let unrefs = 0;
  let returnZeroTimer = false;
  let clearFailure: Error | undefined;
  const timers: FakeTimer[] = [];
  const clears: unknown[] = [];
  context.mock.method(Date, "now", () => {
    clockReads++;
    return now;
  });
  context.mock.method(globalThis, "setTimeout", (callback: () => void, delay?: number) => {
    const timer = {
      callback,
      delay,
      unref: () => {
        unrefs++;
      },
    };
    timers.push(timer);
    if (returnZeroTimer) {
      returnZeroTimer = false;
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return timer as unknown as ReturnType<typeof setTimeout>;
  });
  context.mock.method(globalThis, "clearTimeout", (timer: unknown) => {
    clears.push(timer);
    if (clearFailure) throw clearFailure;
  });
  assert.equal(EXIT_STDERR_DRAIN_MS, 250);
  assert.equal(AgentStderrCollector.length, 2);
  assert.equal(AgentStderrCollector.prototype.waitForDrain.length, 0);
  const input = new FakeInput();
  const lines: unknown[] = [];
  const startSteps = steps.length;
  const collector = new AgentStderrCollector(input as unknown as Readable, (line) => {
    lines.push(line);
  });
  const reader = readers.at(-1)!;
  assert.deepEqual(steps.slice(startSteps), [
    "createInterface",
    "reader.on:line",
    "reader.once:close",
    "reader.on:error",
    "input.on:error",
    "input.once:close",
    "input.destroyed",
    "input.readableEnded",
  ]);
  const finish = reader.handlers.get("close")?.[0]?.listener;
  assert.equal(reader.handlers.get("error")?.[0]?.listener, finish);
  assert.equal(input.handlers.get("error")?.[0]?.listener, finish);
  assert.equal(input.handlers.get("close")?.[0]?.listener, finish);
  reader.emit("line", "  synthetic-diagnostic\0line  ");
  assert.deepEqual(lines, ["  synthetic-diagnostic\0line  "]);
  const drained = collector.waitForDrain();
  const firstTimer = timers.at(-1)!;
  assert.equal(firstTimer.callback, finish);
  assert.equal(firstTimer.delay, 250);
  assert.equal(collector.waitForDrain(250), drained);
  now = 1020;
  assert.equal(collector.waitForDrain(500), drained);
  assert.equal(timers.length, 1);
  assert.equal(collector.waitForDrain(200), drained);
  const shortened = timers.at(-1)!;
  assert.equal(shortened.delay, 200);
  assert.deepEqual(clears, [firstTimer]);
  now = 1021;
  assert.equal(collector.waitForDrain(199), drained);
  assert.equal(timers.length, 2);
  shortened.callback();
  await drained;
  assert.equal(reader.closeCount, 1);
  assert.deepEqual(clears, [firstTimer, shortened]);
  input.emit("error", new Error("synthetic input error after drain"));
  reader.emit("error", new Error("synthetic reader error after drain"));
  assert.equal(reader.closeCount, 1);
  const readsBeforeDoneWait = clockReads;
  assert.equal(collector.waitForDrain(-100), drained);
  assert.equal(clockReads, readsBeforeDoneWait + 1);
  assert.equal(timers.length, 2);
  reader.emit("line", "synthetic-late-line");
  assert.deepEqual(lines, ["  synthetic-diagnostic\0line  ", "synthetic-late-line"]);

  for (const flags of [
    [true, false],
    [false, true],
  ] as const) {
    const flaggedInput = new FakeInput(...flags);
    const begin = steps.length;
    const flagged = new AgentStderrCollector(flaggedInput as unknown as Readable);
    const flaggedReader = readers.at(-1)!;
    assert.equal(flaggedReader.closeCount, 1);
    const flagSteps = steps.slice(begin);
    assert.equal(flagSteps.includes("input.readableEnded"), !flags[0]);
    const before: number = timers.length;
    await flagged.waitForDrain();
    assert.equal(timers.length, before);
  }

  const lineError = new Error("synthetic callback failure");
  const errorInput = new FakeInput();
  const errorCollector = new AgentStderrCollector(errorInput as unknown as Readable, () => {
    throw lineError;
  });
  const errorReader = readers.at(-1)!;
  assert.throws(
    () => errorReader.emit("line", "synthetic-line"),
    (error: unknown) => error === lineError,
  );
  const errorDrain = errorCollector.waitForDrain();
  let errorDrainResolved = false;
  void errorDrain.then(() => {
    errorDrainResolved = true;
  });
  await Promise.resolve();
  assert.equal(errorDrainResolved, false);
  errorInput.emit("error", lineError);
  await errorDrain;
  assert.equal(errorReader.closeCount, 1);

  const infiniteInput = new FakeInput();
  const infinite = new AgentStderrCollector(infiniteInput as unknown as Readable);
  const beforeIgnored = timers.length;
  const infinityDrain = infinite.waitForDrain(Infinity);
  assert.equal(infinite.waitForDrain(NaN), infinityDrain);
  assert.equal(timers.length, beforeIgnored);
  infiniteInput.emit("close");
  await infinityDrain;
  const negativeInput = new FakeInput();
  const negative = new AgentStderrCollector(negativeInput as unknown as Readable);
  const negativeDrain = negative.waitForDrain(-5);
  const negativeTimer = timers.at(-1)!;
  assert.equal(negativeTimer.delay, 0);
  negativeTimer.callback();
  await negativeDrain;

  const zeroInput = new FakeInput();
  const zero = new AgentStderrCollector(zeroInput as unknown as Readable);
  returnZeroTimer = true;
  const zeroDrain = zero.waitForDrain(500);
  const oldZeroTimer = timers.at(-1)!;
  const beforeZeroClear = clears.length;
  assert.equal(zero.waitForDrain(100), zeroDrain);
  assert.equal(clears.length, beforeZeroClear);
  oldZeroTimer.callback();
  await zeroDrain;

  const nativeError = new Error("synthetic native timer/reader failure");
  const replacementInput = new FakeInput();
  const replacement = new AgentStderrCollector(replacementInput as unknown as Readable);
  const replacementDrain = replacement.waitForDrain(250);
  const retainedTimer = timers.at(-1)!;
  clearFailure = nativeError;
  assert.throws(
    () => replacement.waitForDrain(100),
    (error: unknown) => error === nativeError,
  );
  clearFailure = undefined;
  const afterFailedReplacement = timers.length;
  assert.equal(replacement.waitForDrain(100), replacementDrain);
  assert.equal(timers.length, afterFailedReplacement);
  retainedTimer.callback();
  await replacementDrain;

  const failedInput = new FakeInput();
  const failed = new AgentStderrCollector(failedInput as unknown as Readable);
  const pendingDrain = failed.waitForDrain();
  const failedReader = readers.at(-1)!;
  const failedTimer = timers.at(-1)!;
  clearFailure = nativeError;
  assert.throws(
    () => failedTimer.callback(),
    (error: unknown) => error === nativeError,
  );
  clearFailure = undefined;
  let pendingResolved = false;
  void pendingDrain.then(() => {
    pendingResolved = true;
  });
  failedInput.emit("close");
  await Promise.resolve();
  assert.equal(pendingResolved, false);
  assert.equal(failedReader.closeCount, 0);
  const beforeFailedWait = timers.length;
  assert.equal(failed.waitForDrain(0), pendingDrain);
  assert.equal(timers.length, beforeFailedWait);

  const closeInput = new FakeInput();
  const closeFailureCollector = new AgentStderrCollector(closeInput as unknown as Readable);
  const closeReader = readers.at(-1)!;
  closeReader.closeFailure = nativeError;
  const closeDrain = closeFailureCollector.waitForDrain();
  const closeTimer = timers.at(-1)!;
  assert.throws(
    () => closeTimer.callback(),
    (error: unknown) => error === nativeError,
  );
  closeReader.closeFailure = undefined;
  closeInput.emit("error", nativeError);
  let closeResolved = false;
  void closeDrain.then(() => {
    closeResolved = true;
  });
  await Promise.resolve();
  assert.equal(closeResolved, false);
  assert.equal(closeReader.closeCount, 1);
  assert.equal(closeFailureCollector.waitForDrain(), closeDrain);
  constructionFailure = nativeError;
  assert.throws(
    () => new AgentStderrCollector(new FakeInput() as unknown as Readable),
    (error: unknown) => error === nativeError,
  );
  constructionFailure = undefined;
  assert.equal(unrefs, 0);
});
