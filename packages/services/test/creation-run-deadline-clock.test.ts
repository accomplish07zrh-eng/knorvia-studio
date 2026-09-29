// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { mock, test } from "node:test";
import type { CreationJob } from "../src/creation/contract.js";
import { createRunDeadlineClock } from "./creation-run-deadline-clock-fixture.js";

const realSetTimeout = setTimeout;
const realClearTimeout = clearTimeout;
const evidence: Array<Record<string, unknown>> = [];
let activeFault:
  | {
      jobsPath: string;
      requestId: string;
      injections: number;
      matchingRenames: number;
    }
  | undefined;
mock.module("node:fs/promises", {
  namedExports: {
    ...fs,
    rename: async (...args: Parameters<typeof fs.rename>) => {
      const [source, destination] = args;
      const fault = activeFault;
      if (
        fault &&
        typeof source === "string" &&
        typeof destination === "string" &&
        resolve(destination) === fault.jobsPath &&
        dirname(resolve(source)) === dirname(fault.jobsPath) &&
        resolve(source).startsWith(`${fault.jobsPath}.`) &&
        source.endsWith(".tmp")
      ) {
        const records = JSON.parse(await fs.readFile(source, "utf8")) as { items: CreationJob[] };
        const failed = records.items.find(
          (job) => job.requestId === fault.requestId && job.status === "failed",
        );
        if (failed && /生成服务返回 400/u.test(failed.error ?? "")) {
          fault.matchingRenames++;
          if (fault.injections === 0) {
            fault.injections++;
            throw Object.assign(new Error("owned failed-terminal fixture"), { code: "EPERM" });
          }
        }
      }
      return fs.rename(...args);
    },
  },
});
const { createCreationService } = await import("../src/creation/creationService.js");

async function fixtureRoot() {
  return fs.mkdtemp(join(tmpdir(), "knorvia-run-deadline-clock-"));
}
async function removeFixture(root: string) {
  const target = resolve(root);
  const within = relative(resolve(tmpdir()), target);
  assert.ok(
    isAbsolute(target) &&
      within.startsWith("knorvia-run-deadline-clock-") &&
      !within.startsWith(`..${sep}`) &&
      !isAbsolute(within) &&
      !within.includes(sep),
  );
  await fs.rm(target, { recursive: true, force: true });
}
async function terminal(service: ReturnType<typeof createCreationService>, id: string) {
  const startedAt = Date.now();
  let last: CreationJob | null = null;
  for (;;) {
    last = await service.getJob(id);
    if (last && !["queued", "running"].includes(last.status)) return last;
    if (Date.now() - startedAt >= 1000) throw new Error(`1000ms terminal budget: ${last?.status}`);
    await new Promise((done) => realSetTimeout(done, 10));
  }
}
async function withinBudget<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = realSetTimeout(() => reject(new Error("1000ms submission gate")), 1000);
      }),
    ]);
  } finally {
    realClearTimeout(timer);
  }
}
async function modelFor(service: ReturnType<typeof createCreationService>) {
  return service.saveModel({
    name: "Deadline fixture",
    kind: "image",
    protocol: "json-api",
    baseUrl: "http://127.0.0.1:1",
    model: "fixture",
    enabled: true,
    apiMapping: {
      requestPath: "/generate",
      requestTemplate: '{"prompt":"{{prompt}}"}',
      outputPath: "asset",
    },
  });
}
const credentials = { load: async () => null, save: async () => {}, delete: async () => {} };

test("run deadline dependency owns one exact budget and cancels after a known failure", async () => {
  const root = await fixtureRoot();
  const clock = createRunDeadlineClock();
  let submissions = 0;
  const service = createCreationService({
    rootDir: root,
    credentials,
    runTimeoutMs: 500,
    scheduleRunDeadline: clock.scheduleRunDeadline,
    fetchImpl: async () => {
      submissions++;
      return new Response("rejected", { status: 400 });
    },
  });
  try {
    const model = await modelFor(service);
    const job = await service.createJob({
      requestId: "known-failure",
      kind: "image",
      modelId: model.id,
      prompt: "Frame",
    });
    const finished = await terminal(service, job.id);
    assert.equal(finished.status, "failed");
    assert.match(finished.error ?? "", /生成服务返回 400/u);
    assert.equal(submissions, 1);
    await withinBudget(clock.settled());
    assert.deepEqual(clock.snapshot(), {
      now: 0,
      cancelled: 1,
      fired: 0,
      pending: 0,
      delays: [500],
    });
  } finally {
    await removeFixture(root);
  }
});

test("run deadline fires only after submission and the exact 500ms advance", async () => {
  const root = await fixtureRoot();
  const clock = createRunDeadlineClock();
  const submitted = Promise.withResolvers<AbortSignal>();
  let jobId: string | undefined;
  const service = createCreationService({
    rootDir: root,
    credentials,
    runTimeoutMs: 500,
    scheduleRunDeadline: clock.scheduleRunDeadline,
    fetchImpl: async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        assert.ok(signal);
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        submitted.resolve(signal);
      }),
  });
  try {
    const model = await modelFor(service);
    jobId = (
      await service.createJob({
        requestId: "post-submit",
        kind: "image",
        modelId: model.id,
        prompt: "Frame",
      })
    ).id;
    const signal = await withinBudget(submitted.promise);
    clock.advanceBy(499);
    assert.equal(signal.aborted, false);
    clock.advanceBy(1);
    assert.equal(signal.aborted, true);
    assert.match(String(signal.reason), /等待生成服务超时/u);
    assert.equal((await terminal(service, jobId)).status, "interrupted");
    await withinBudget(clock.settled());
    assert.deepEqual(clock.snapshot(), {
      now: 500,
      cancelled: 1,
      fired: 1,
      pending: 0,
      delays: [500],
    });
  } finally {
    if (jobId) {
      await service.cancelJob(jobId);
      await terminal(service, jobId);
    }
    await removeFixture(root);
  }
});

test("owned failed-terminal EPERM retries on real IO time within the original 1000ms", async () => {
  const root = await fixtureRoot();
  const clock = createRunDeadlineClock();
  let submissions = 0;
  let jobId: string | undefined;
  const service = createCreationService({
    rootDir: root,
    credentials,
    runTimeoutMs: 500,
    scheduleRunDeadline: clock.scheduleRunDeadline,
    fetchImpl: async () => {
      submissions++;
      return new Response("rejected", { status: 400 });
    },
  });
  try {
    const model = await modelFor(service);
    activeFault = {
      jobsPath: resolve(root, "jobs.json"),
      requestId: "eperm-failure",
      injections: 0,
      matchingRenames: 0,
    };
    // 只冻结显式 run deadline；一次 EPERM 的生产退避必须仍由真实计时器推进。
    jobId = (
      await service.createJob({
        requestId: "eperm-failure",
        kind: "image",
        modelId: model.id,
        prompt: "Frame",
      })
    ).id;
    const startedAt = Date.now();
    try {
      const finished = await terminal(service, jobId);
      const elapsedMs = Date.now() - startedAt;
      assert.ok(elapsedMs < 1000, "failed terminal must be observed within the original budget");
      assert.equal(finished.status, "failed");
      assert.match(finished.error ?? "", /生成服务返回 400/u);
      assert.equal(submissions, 1);
      assert.equal(activeFault.injections, 1);
      assert.equal(activeFault.matchingRenames, 2);
      assert.equal(clock.snapshot().now, 0);
      await withinBudget(clock.settled());
      evidence.push({
        case: "owned-failed-terminal",
        result: "failed/400",
        elapsedMs,
        submissions,
        ...activeFault,
        clock: clock.snapshot(),
      });
    } catch (error) {
      evidence.push({
        case: "owned-failed-terminal",
        result: String(error),
        elapsedMs: Date.now() - startedAt,
        submissions,
        ...activeFault,
        clock: clock.snapshot(),
      });
      throw error;
    }
  } finally {
    if (jobId) await terminal(service, jobId);
    activeFault = undefined;
    console.log("deadline-clock-evidence", JSON.stringify(evidence));
    await removeFixture(root);
  }
});
