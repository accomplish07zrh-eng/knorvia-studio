import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mock, test } from "node:test";

const sockets: FakeSocket[] = [];
const socketFailure = new Error("synthetic socket failure");
class FakeSocket extends EventEmitter {
  calls: string[] = [];
  constructor() {
    super();
    sockets.push(this);
  }
  setTimeout(timeout: number) {
    assert.equal(timeout, 100);
    this.calls.push("timeout");
    return this;
  }
  connect(port: number, host: string) {
    assert.equal(port, 22);
    assert.ok(host.endsWith(".synthetic"));
    this.calls.push("connect");
    queueMicrotask(() => this.emit(host.startsWith("error") ? "error" : "connect", socketFailure));
    return this;
  }
  removeAllListeners(event?: string | symbol) {
    this.calls.push("remove");
    return super.removeAllListeners(event);
  }
  destroy() {
    this.calls.push("destroy");
    return this;
  }
}
const shellCalls: Array<{
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  isExecutable?: (path: string) => boolean;
}> = [];
mock.module("node:net", { namedExports: { Socket: FakeSocket } });
mock.module("node:os", { namedExports: { homedir: () => "/synthetic/home" } });
mock.module(new URL("../src/system/integratedTerminalShells.ts", import.meta.url).href, {
  namedExports: {
    listIntegratedTerminalShellOptions: (options: (typeof shellCalls)[number]) => {
      shellCalls.push(options);
      return [];
    },
  },
});
const { createSystemService } = await import("../src/system/systemService.js");

test("synthetic system ports preserve policy, stable retries, shell authority and exactly-once resources", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 100 });
  let httpCalls = 0;
  let abortSignal: AbortSignal | undefined;
  const fetchPort = mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, options?: RequestInit): Promise<Response> => {
      const url = String(input);
      assert.ok(url.startsWith("https://") && url.includes(".synthetic/"));
      assert.equal(options?.method, "GET");
      assert.ok(options?.signal);
      if (url.includes("abort.synthetic")) {
        abortSignal = options.signal;
        return new Promise((_resolve, reject) =>
          abortSignal!.addEventListener(
            "abort",
            () => {
              const error = new Error("synthetic aborted request");
              error.name = "AbortError";
              reject(error);
            },
            { once: true },
          ),
        );
      }
      assert.deepEqual(options.headers, { "x-knorvia-intranet-token": "synthetic-token" });
      httpCalls++;
      return {
        ok: httpCalls !== 1,
        status: 503,
        json: async () => ({ ok: true, marker: httpCalls === 2 ? "wrong" : "synthetic-expected" }),
      } as Response;
    },
  );
  const environment: NodeJS.ProcessEnv = { PATH: "/synthetic/bin" };
  const forbiddenExecutable = () => {
    throw new Error("retained shell authority must remain delegated");
  };
  let nowCalls = 0;
  const options = {
    env: environment,
    platform: "win32" as const,
    isExecutable: forbiddenExecutable,
    now: () => {
      nowCalls++;
      return 999;
    },
  };
  const service = createSystemService(options);
  try {
    assert.deepEqual(await service.info(), {
      homedir: "/synthetic/home",
      platform: process.platform,
    });
    assert.deepEqual(await service.listIntegratedTerminalShells(), []);
    assert.equal(shellCalls[0]?.env, environment);
    assert.equal(shellCalls[0]?.isExecutable, forbiddenExecutable);
    assert.equal(shellCalls[0]?.platform, "win32");
    const newExecutable = () => {
      throw new Error("updated delegate remains unopened");
    };
    options.isExecutable = newExecutable;
    await service.listIntegratedTerminalShells();
    assert.equal(shellCalls[1]?.isExecutable, newExecutable);
    const result = await service.probeIntranet({
      attempts: 99,
      requiredSuccessCount: 99,
      targets: [
        { kind: "tcp", id: " TCP ", host: " tcp.synthetic ", port: 999999, timeoutMs: 1 },
        {
          kind: "service",
          url: " https://service.synthetic/probe ",
          token: " synthetic-token ",
          expectedMarker: " synthetic-expected ",
          timeoutMs: 1,
        },
        { kind: "tcp", host: "   " },
        { kind: "service", url: "ftp://invalid.synthetic/file" },
      ],
    });
    assert.equal(result.isIntranet, true);
    assert.equal(result.totalTargets, 2);
    assert.equal(result.requiredSuccessCount, 2);
    assert.equal(result.strategy, "mixed");
    assert.equal(result.checkedAt, 999);
    assert.deepEqual(
      result.results.map((item) => item.attemptCount),
      [1, 3],
    );
    assert.deepEqual(
      result.results.map((item) => item.kind),
      ["tcp", "service"],
    );
    assert.equal(httpCalls, 3);
    assert.deepEqual(sockets[0]?.calls, ["timeout", "connect", "remove", "destroy"]);
    sockets[0]!.emit("connect");
    assert.equal(sockets[0]!.calls.filter((call) => call === "destroy").length, 1);
    const empty = await service.probeIntranet({ targets: [], requiredSuccessCount: 0 });
    assert.equal(empty.isIntranet, false);
    assert.equal(empty.requiredSuccessCount, 1);
    assert.equal(empty.strategy, "tcp-connect");
    const pending = service.probeIntranet({
      attempts: 1,
      targets: [
        { kind: "tcp", host: "error.synthetic", timeoutMs: 100 },
        { kind: "service", url: "https://abort.synthetic/probe", timeoutMs: 100 },
      ],
    });
    for (let turn = 0; turn < 30 && !abortSignal; turn++) await Promise.resolve();
    assert.ok(abortSignal);
    assert.equal(abortSignal.aborted, false);
    mock.timers.tick(100);
    const failed = await pending;
    assert.equal(abortSignal.aborted, true);
    assert.deepEqual(
      failed.results.map((item) => item.error),
      ["synthetic socket failure", "timeout(100ms)"],
    );
    assert.deepEqual(sockets[1]?.calls, ["timeout", "connect", "remove", "destroy"]);
    assert.equal(nowCalls, 3);
  } finally {
    fetchPort.mock.restore();
    mock.timers.reset();
  }
});
