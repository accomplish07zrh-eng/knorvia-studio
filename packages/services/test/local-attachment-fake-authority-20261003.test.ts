import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { PromptAttachmentStageParams } from "../src/prompt-attachment-transfer/promptAttachmentTransfer.js";

const statCalls: unknown[] = [];
let readSize: (path: unknown) => Promise<unknown> = async () => ({ size: 11 });
mock.module("node:fs/promises", {
  namedExports: {
    stat: (path: unknown) => {
      statCalls.push(path);
      return readSize(path);
    },
  },
});

interface LifetimeOptions {
  onDidRemoveLastListener: () => void;
}
const allocations: FakeEmitter[] = [];
let constructionFailure: Error | undefined;
class FakeEmitter {
  readonly listeners = new Set<() => void>();
  reads = 0;
  disposals = 0;
  disposalFailure: Error | undefined;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return {
      dispose: () => {
        if (this.listeners.delete(listener) && this.listeners.size === 0) {
          this.options.onDidRemoveLastListener();
        }
      },
    };
  };
  constructor(readonly options: LifetimeOptions) {
    assert.deepEqual(Object.keys(options), ["onDidRemoveLastListener"]);
    if (constructionFailure) throw constructionFailure;
    allocations.push(this);
  }
  get event() {
    this.reads++;
    return this.subscribe;
  }
  dispose(): void {
    this.disposals++;
    this.listeners.clear();
    if (this.disposalFailure) throw this.disposalFailure;
  }
}
mock.module("@knorvia/rpc", { namedExports: { Emitter: FakeEmitter } });
const { createLocalPromptAttachmentTransferService } =
  await import("../src/prompt-attachment-transfer/promptAttachmentTransferService.js");

function params(sizeBytes?: number): PromptAttachmentStageParams {
  return {
    operationId: "synthetic-operation",
    sessionId: "synthetic-session",
    workspacePath: "/synthetic/workspace",
    workspaceIdentity: "synthetic-workspace-identity",
    remoteSessionId: "synthetic-remote-session",
    localPath: "/synthetic/local-path",
    fileName: "synthetic.bin",
    mime: "application/octet-stream",
    sizeBytes,
  };
}

test("synthetic local attachment protects data and preserves staging/progress lifetime without filesystem or transfer authority", async () => {
  const service = createLocalPromptAttachmentTransferService();
  assert.deepEqual(Object.keys(service), [
    "stage",
    "adopt",
    "cancel",
    "cleanup",
    "onDynamicProgress",
  ]);
  assert.equal(service.stage.length, 1);
  assert.equal(service.onDynamicProgress.length, 1);
  for (const method of [service.adopt, service.cancel, service.cleanup]) {
    assert.equal(method.length, 0);
    const a = method("synthetic-operation");
    const b = method("synthetic-operation");
    assert.ok(a instanceof Promise);
    assert.notEqual(a, b);
    assert.equal(await a, undefined);
    assert.equal(await b, undefined);
  }
  assert.equal(allocations.length, 0);
  assert.equal(statCalls.length, 0);

  for (const size of [1, 0.25, Infinity]) {
    const result = await service.stage(Object.freeze(params(size)));
    assert.deepEqual(Object.keys(result), ["operationId", "ref", "bytes", "staged"]);
    assert.deepEqual(result, {
      operationId: "synthetic-operation",
      ref: "/synthetic/local-path",
      bytes: size,
      staged: false,
    });
  }
  assert.equal(statCalls.length, 0);
  for (const size of [undefined, 0, -0, -1, NaN]) {
    assert.equal((await service.stage(params(size))).bytes, 11);
  }
  assert.deepEqual(
    statCalls,
    Array.from({ length: 5 }, () => "/synthetic/local-path"),
  );
  assert.equal(allocations.length, 0);

  let sizeReads = 0;
  const positive = params();
  Object.defineProperty(positive, "sizeBytes", { get: () => [1, 2, 3][sizeReads++] });
  for (const key of [
    "sessionId",
    "workspacePath",
    "workspaceIdentity",
    "remoteSessionId",
    "fileName",
    "mime",
  ]) {
    Object.defineProperty(positive, key, {
      get: () => {
        throw new Error("unrelated data must stay unread");
      },
    });
  }
  const positivePromise = service.stage(positive);
  positive.operationId = "mutated-after-positive-return";
  positive.localPath = "/synthetic/changed-after-positive";
  assert.equal(sizeReads, 3);
  assert.deepEqual(await positivePromise, {
    operationId: "synthetic-operation",
    ref: "/synthetic/local-path",
    bytes: 3,
    staged: false,
  });

  let completeSize: ((value: unknown) => void) | undefined;
  readSize = () =>
    new Promise((resolve) => {
      completeSize = resolve;
    });
  const pendingParams = params();
  const pendingResult = service.stage(pendingParams);
  const capturedPath = statCalls.at(-1);
  pendingParams.operationId = "synthetic-after-await";
  pendingParams.localPath = "/synthetic/after-await";
  await service.cancel("synthetic-operation");
  await service.cleanup("synthetic-operation");
  assert.equal(capturedPath, "/synthetic/local-path");
  completeSize?.({ size: -4 });
  assert.deepEqual(await pendingResult, {
    operationId: "synthetic-after-await",
    ref: "/synthetic/after-await",
    bytes: -4,
    staged: false,
  });

  const rejection = new Error("synthetic stat rejection");
  readSize = () => Promise.reject(rejection);
  assert.equal((await service.stage(params())).bytes, 0);
  readSize = async () =>
    Object.defineProperty({}, "size", {
      get: () => {
        throw rejection;
      },
    });
  assert.equal((await service.stage(params())).bytes, 0);
  readSize = () => {
    throw rejection;
  };
  await assert.rejects(service.stage(params()), (error: unknown) => error === rejection);
  const getterFailure = params();
  Object.defineProperty(getterFailure, "sizeBytes", {
    get: () => {
      throw rejection;
    },
  });
  const callCount = statCalls.length;
  await assert.rejects(service.stage(getterFailure), (error: unknown) => error === rejection);
  assert.equal(statCalls.length, callCount);

  const progress = service.onDynamicProgress("synthetic-progress");
  const emitter = allocations.at(-1)!;
  assert.equal(service.onDynamicProgress("synthetic-progress"), progress);
  assert.equal(emitter.reads, 2);
  let delivered = 0;
  const first = progress(() => {
    delivered++;
  });
  const second = progress(() => {
    delivered++;
  });
  await service.adopt("synthetic-progress");
  await service.cancel("synthetic-progress");
  await service.cleanup("synthetic-progress");
  assert.equal(emitter.disposals, 0);
  assert.equal(service.onDynamicProgress("synthetic-progress"), progress);
  first.dispose();
  assert.equal(emitter.disposals, 0);
  second.dispose();
  assert.equal(emitter.disposals, 1);
  assert.equal(delivered, 0);
  const newerProgress = service.onDynamicProgress("synthetic-progress");
  assert.notEqual(newerProgress, progress);
  emitter.options.onDidRemoveLastListener();
  assert.equal(emitter.disposals, 2);
  assert.notEqual(service.onDynamicProgress("synthetic-progress"), newerProgress);

  const failureProgress = service.onDynamicProgress("synthetic-cleanup-failure");
  const failedEmitter = allocations.at(-1)!;
  failedEmitter.disposalFailure = rejection;
  assert.throws(
    () => failedEmitter.options.onDidRemoveLastListener(),
    (error: unknown) => error === rejection,
  );
  assert.notEqual(service.onDynamicProgress("synthetic-cleanup-failure"), failureProgress);
  const previousAllocations = allocations.length;
  constructionFailure = rejection;
  assert.throws(
    () => service.onDynamicProgress("synthetic-constructor-failure"),
    (error: unknown) => error === rejection,
  );
  assert.equal(allocations.length, previousAllocations);
  constructionFailure = undefined;
  assert.ok(service.onDynamicProgress("synthetic-constructor-failure"));

  assert.notEqual(service.onDynamicProgress(""), service.onDynamicProgress(" "));
  assert.notEqual(
    service.onDynamicProgress("synthetic\0id"),
    service.onDynamicProgress("syntheticid"),
  );
  const anotherService = createLocalPromptAttachmentTransferService();
  assert.notEqual(
    anotherService.onDynamicProgress("synthetic-progress"),
    service.onDynamicProgress("synthetic-progress"),
  );
  assert.equal(delivered, 0);
});
