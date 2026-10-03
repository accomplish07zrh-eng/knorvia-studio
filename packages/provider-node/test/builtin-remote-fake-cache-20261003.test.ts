import assert from "node:assert/strict";
import { test } from "node:test";
import type { NodeKnorviaBuiltinProviderConfigSource } from "../src/builtin-provider-config-source.js";
import type { KnorviaBuiltinRelease } from "../src/builtin-release.js";
import type {
  KnorviaBuiltinRefreshEvent,
  KnorviaBuiltinRemoteSynchronizerOptions,
} from "../src/builtin-remote-synchronizer.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let turn = 0; turn < 30; turn++) await Promise.resolve();
}

test("synthetic fetch, control cache and clock preserve leases, failure identity, endpoint generations and cancellation phases", async (t) => {
  const files = new Map<string, string>();
  const writes: { path: string; text: string }[] = [];
  let readError: unknown;
  let atomicError: unknown;
  let atomicFailures = 0;
  let uuid = 0;
  let lockDepth = 0;
  const tails = new Map<string, Promise<void>>();
  t.mock.module("node:crypto", { namedExports: { randomUUID: () => `synthetic-lease-${++uuid}` } });
  t.mock.module("node:fs/promises", {
    namedExports: {
      async readFile(path: string, encoding: string) {
        assert.equal(encoding, "utf8");
        if (readError) throw readError;
        if (!files.has(path))
          throw Object.assign(new Error("synthetic missing control"), { code: "ENOENT" });
        return files.get(path)!;
      },
    },
  });
  t.mock.module("@knorvia/shared/node", {
    namedExports: {
      async atomicWritePrivateTextFile(path: string, text: string) {
        writes.push({ path, text });
        if (atomicFailures-- > 0) throw atomicError;
        files.set(path, text);
      },
      withFileLock<T>(path: string, action: () => Promise<T>) {
        const pending = (tails.get(path) ?? Promise.resolve()).then(async () => {
          lockDepth++;
          try {
            return await action();
          } finally {
            lockDepth--;
          }
        });
        tails.set(
          path,
          pending.then(
            () => {},
            () => {},
          ),
        );
        return pending;
      },
    },
  });
  const { KnorviaBuiltinRemoteSynchronizer: Synchronizer } =
    await import("../src/builtin-remote-synchronizer.js");
  const value = { schemaVersion: 1, revision: 7 } as KnorviaBuiltinRelease;
  let endpoint = " synthetic-endpoint ";
  let now = 100;
  let gate = deferred<KnorviaBuiltinRelease | null>();
  let signal!: AbortSignal;
  let fetchCount = 0;
  let applyCount = 0;
  let applyGate: ReturnType<typeof deferred<"updated" | "unchanged" | "stale">> | undefined;
  let result: "updated" | "unchanged" | "stale" = "updated";
  const events: KnorviaBuiltinRefreshEvent[] = [];
  let throwReport = false;
  const fakeSource = {
    async applyRemoteRelease(release: KnorviaBuiltinRelease) {
      assert.equal(this, fakeSource);
      assert.equal(release, value);
      applyCount++;
      return applyGate ? await applyGate.promise : result;
    },
  };
  const options: KnorviaBuiltinRemoteSynchronizerOptions = {
    source: fakeSource as unknown as NodeKnorviaBuiltinProviderConfigSource,
    controlFilePath: "synthetic/control",
    resolveEndpointKey() {
      assert.equal(this, options);
      return endpoint;
    },
    async fetchRelease(key, abortSignal) {
      assert.equal(this, options);
      assert.equal(key, endpoint.trim());
      assert.equal(lockDepth, 0);
      fetchCount++;
      signal = abortSignal;
      return await gate.promise;
    },
    onRefreshResult(event) {
      assert.equal(this, options);
      events.push(event);
      assert.equal(Object.isFrozen(event), false);
      if (throwReport) throw new Error("synthetic reporting");
    },
    now: function () {
      assert.equal(this, synchronizer);
      return now;
    },
    leaseDurationMs: 20,
    successIntervalMs: 50,
    failureBaseDelayMs: 10,
    failureMaxDelayMs: 15,
  };
  const synchronizer = new Synchronizer(options);
  function control() {
    return JSON.parse(files.get(options.controlFilePath)!) as Record<string, unknown>;
  }
  function put(input: Record<string, unknown>) {
    files.set(options.controlFilePath, JSON.stringify(input));
  }
  const pending = synchronizer.refresh();
  assert.equal(synchronizer.refresh({ force: true }), pending);
  await flush();
  assert.equal(fetchCount, 1);
  assert.equal(signal.aborted, false);
  assert.deepEqual(control(), {
    schemaVersion: 1,
    endpointKey: "synthetic-endpoint",
    leaseId: "synthetic-lease-1",
    leaseUntil: 120,
    nextEligibleAt: 0,
    failureCount: 0,
  });
  assert.deepEqual(Object.keys(control()), [
    "schemaVersion",
    "endpointKey",
    "leaseId",
    "leaseUntil",
    "nextEligibleAt",
    "failureCount",
  ]);
  gate.resolve(value);
  assert.equal(await pending, "updated");
  assert.equal(applyCount, 1);
  assert.deepEqual(events, [{ result: "updated", revision: 7 }]);
  assert.deepEqual(control(), {
    schemaVersion: 1,
    endpointKey: "synthetic-endpoint",
    leaseUntil: 0,
    nextEligibleAt: 150,
    failureCount: 0,
  });
  assert.equal(files.get(options.controlFilePath), JSON.stringify(control(), null, 2));
  assert.equal(files.get(options.controlFilePath)!.endsWith("\n"), false);
  assert.equal(await synchronizer.refresh(), "skipped");
  assert.deepEqual(events.at(-1), { result: "skipped", reason: "not-due" });
  assert.equal(fetchCount, 1);
  put({ ...control(), leaseId: "synthetic-other", leaseUntil: 130, extra: "preserve" });
  const live = files.get(options.controlFilePath);
  assert.equal(await synchronizer.refresh({ force: true }), "skipped");
  assert.deepEqual(events.at(-1), { result: "skipped", reason: "lease-held" });
  assert.equal(files.get(options.controlFilePath), live);
  now = 200;
  gate = deferred();
  result = "stale";
  throwReport = true;
  const forced = synchronizer.refresh({ force: true });
  await flush();
  gate.resolve(value);
  assert.equal(await forced, "stale");
  assert.equal(control().failureCount, 0);
  assert.equal(control().nextEligibleAt, 250);
  throwReport = false;

  now = 300;
  const fetchError = new Error("synthetic fetch failure");
  gate = deferred();
  const failed = synchronizer.refresh();
  await flush();
  gate.reject(fetchError);
  await assert.rejects(failed, (error) => error === fetchError);
  assert.equal(control().failureCount, 1);
  assert.equal(control().nextEligibleAt, 310);
  now = 310;
  gate = deferred();
  const failedAgain = synchronizer.refresh();
  await flush();
  gate.reject(fetchError);
  await assert.rejects(failedAgain, (error) => error === fetchError);
  assert.equal(control().failureCount, 2);
  assert.equal(control().nextEligibleAt, 325);
  now = 325;
  gate = deferred();
  const missing = synchronizer.refresh();
  await flush();
  gate.resolve(null);
  assert.equal(await missing, "missing");
  assert.deepEqual(events.at(-1), { result: "missing" });
  assert.equal(control().failureCount, 0);

  endpoint = "synthetic-new";
  put({ ...control(), failureCount: 9, leaseId: "old", leaseUntil: 9999, nextEligibleAt: 9999 });
  gate = deferred();
  const changed = synchronizer.refresh();
  await flush();
  assert.equal(control().failureCount, 0);
  assert.equal(control().nextEligibleAt, 0);
  const beforeApply = applyCount;
  endpoint = "synthetic-newer";
  gate.resolve(value);
  assert.equal(await changed, "skipped");
  assert.equal(applyCount, beforeApply);
  assert.deepEqual(events.at(-1), { result: "skipped", reason: "endpoint-changed" });
  assert.equal(control().endpointKey, "synthetic-new");
  assert.equal(control().nextEligibleAt, now + 50);

  files.set(options.controlFilePath, "invalid synthetic JSON");
  gate = deferred();
  const corrupt = synchronizer.refresh();
  await flush();
  assert.equal(control().endpointKey, "synthetic-newer");
  const replacement = {
    schemaVersion: 1,
    endpointKey: "synthetic-newer",
    leaseId: "replacement",
    leaseUntil: 777,
    nextEligibleAt: 888,
    failureCount: 4,
    extra: "keep",
  };
  put(replacement);
  const replacedText = files.get(options.controlFilePath);
  gate.resolve(null);
  assert.equal(await corrupt, "missing");
  assert.equal(files.get(options.controlFilePath), replacedText);
  put({ ...replacement, failureCount: -1 });
  gate = deferred();
  const invalid = synchronizer.refresh();
  await flush();
  gate.resolve(null);
  assert.equal(await invalid, "missing");
  assert.equal(control().failureCount, 0);
  // JSON 数字溢出仍是 number；保持原控制文件校验语义，不扩展为有限数修复。
  files.set(
    options.controlFilePath,
    '{"schemaVersion":1,"endpointKey":"synthetic-newer","leaseUntil":1e999,"nextEligibleAt":0,"failureCount":0}',
  );
  assert.equal(await synchronizer.refresh({ force: true }), "skipped");
  assert.deepEqual(events.at(-1), { result: "skipped", reason: "lease-held" });
  const ioError = new Error("synthetic control IO");
  readError = ioError;
  const beforeWrites = writes.length,
    beforeReports = events.length;
  await assert.rejects(synchronizer.refresh({ force: true }), (error) => error === ioError);
  assert.equal(writes.length, beforeWrites);
  assert.equal(events.length, beforeReports);
  readError = undefined;
  endpoint = " ";
  await assert.rejects(synchronizer.refresh(), {
    message: "Knorvia Studio Built-in 远端 Endpoint 不能为空",
  });
  endpoint = "synthetic-newer";
  const forceError = new Error("synthetic force getter");
  assert.throws(
    () =>
      synchronizer.refresh({
        get force(): boolean {
          throw forceError;
        },
      }),
    (error) => error === forceError,
  );

  put({
    schemaVersion: 1,
    endpointKey: "synthetic-newer",
    leaseUntil: 0,
    nextEligibleAt: 0,
    failureCount: 3,
  });
  gate = deferred();
  const cancelled = synchronizer.refresh();
  await flush();
  const aborted = signal;
  synchronizer.dispose();
  assert.equal(aborted.aborted, true);
  gate.resolve(value);
  assert.equal(await cancelled, "disposed");
  assert.equal(control().failureCount, 3);
  assert.equal(control().nextEligibleAt, now);
  assert.equal(control().leaseUntil, 0);
  const disposedOne = synchronizer.refresh(),
    disposedTwo = synchronizer.refresh();
  assert.notEqual(disposedOne, disposedTwo);
  assert.equal(await disposedOne, "disposed");
  await disposedTwo;

  // 新实例仍保留原 options 及其接收者；时钟在构造时捕获。
  let late!: InstanceType<typeof Synchronizer>;
  const lateOptions: KnorviaBuiltinRemoteSynchronizerOptions = {
    ...options,
    controlFilePath: "synthetic/late-control",
    resolveEndpointKey() {
      assert.equal(this, lateOptions);
      return "synthetic-late";
    },
    async fetchRelease(_key, abortSignal) {
      assert.equal(this, lateOptions);
      signal = abortSignal;
      return value;
    },
    now: function () {
      assert.equal(this, late);
      return now;
    },
    onRefreshResult(event) {
      events.push(event);
    },
  };
  late = new Synchronizer(lateOptions);
  applyGate = deferred();
  const latePending = late.refresh();
  await flush();
  const reports = events.length;
  late.dispose();
  applyGate.resolve("updated");
  assert.equal(await latePending, "updated");
  assert.equal(events.length, reports);
  assert.deepEqual(JSON.parse(files.get(lateOptions.controlFilePath)!), {
    schemaVersion: 1,
    endpointKey: "synthetic-late",
    leaseUntil: 0,
    nextEligibleAt: now + 50,
    failureCount: 0,
  });
  applyGate = undefined;

  const initialGate = deferred<string>();
  const initial = new Synchronizer({
    ...lateOptions,
    resolveEndpointKey: () => initialGate.promise,
  });
  const initialPending = initial.refresh();
  const initialWrites = writes.length;
  initial.dispose();
  initialGate.resolve("synthetic-start");
  assert.equal(await initialPending, "disposed");
  assert.equal(writes.length, initialWrites);
  // 完成写入失败会被失败清理替换；保留实际错误身份和第二次清理。
  let finishing!: InstanceType<typeof Synchronizer>;
  const finishOptions = {
    ...lateOptions,
    controlFilePath: "synthetic/finish-control",
    now: function () {
      assert.equal(this, finishing);
      return now;
    },
    resolveEndpointKey: () => "synthetic-finish",
    fetchRelease: async () => {
      atomicFailures = 1;
      return null;
    },
  };
  finishing = new Synchronizer(finishOptions);
  atomicError = new Error("synthetic finish failure");
  await assert.rejects(finishing.refresh(), (error) => error === atomicError);
  assert.equal(JSON.parse(files.get(finishOptions.controlFilePath)!).failureCount, 1);
  finishing.dispose();
});
