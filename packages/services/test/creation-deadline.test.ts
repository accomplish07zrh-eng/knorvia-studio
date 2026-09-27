// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";
import * as storage from "../src/creation/creationStorage.js";

let afterRunningWrite: (() => Promise<void>) | undefined;
let afterOutputWrite: (() => Promise<void>) | undefined;
mock.module(new URL("../src/creation/creationStorage.js", import.meta.url).href, {
  namedExports: {
    ...storage,
    writeRecords: async (path: string, items: unknown[]) => {
      await storage.writeRecords(path, items);
      if (items.some((item) => (item as { status?: string }).status === "running")) {
        await afterRunningWrite?.();
      }
    },
    writeCreationOutput: async (...args: Parameters<typeof storage.writeCreationOutput>) => {
      const result = await storage.writeCreationOutput(...args);
      await afterOutputWrite?.();
      return result;
    },
  },
});
const { createCreationService } = await import("../src/creation/creationService.js");

function gate() {
  const reached = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  return {
    reached: reached.promise,
    release: () => resume.resolve(),
    wait: () => {
      reached.resolve();
      return resume.promise;
    },
  };
}

async function terminal(service: ReturnType<typeof createCreationService>, id: string) {
  for (let count = 0; count < 100; count++) {
    const job = await service.getJob(id);
    if (job && !["queued", "running"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Task remained ${(await service.getJob(id))?.status} after deadline`);
}

for (const boundary of ["running", "output", "cancelled-output"] as const) {
  test(`deadline during ${boundary} persistence reaches a terminal state`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "knorvia-deadline-"));
    const pause = gate();
    let submissions = 0;
    const service = createCreationService({
      rootDir: root,
      runTimeoutMs: 100,
      credentials: { load: async () => null, save: async () => {}, delete: async () => {} },
      fetchImpl: async () => {
        submissions++;
        return Response.json({
          asset:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=",
        });
      },
    });
    t.after(async () => {
      pause.release();
      afterRunningWrite = undefined;
      afterOutputWrite = undefined;
      t.mock.timers.reset();
      await rm(root, { recursive: true, force: true });
    });
    const model = await service.saveModel({
      name: "Deadline fixture",
      kind: "image",
      protocol: "json-api",
      baseUrl: "http://127.0.0.1:1",
      model: "fixture",
      enabled: true,
      apiMapping: {
        requestPath: "/image",
        requestTemplate: '{"prompt":"{{prompt}}"}',
        outputPath: "asset",
      },
    });
    if (boundary === "running") afterRunningWrite = pause.wait;
    else afterOutputWrite = pause.wait;
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const job = await service.createJob({
      requestId: `deadline-${boundary}`,
      modelId: model.id,
      kind: "image",
      prompt: "A test",
    });
    await pause.reached;
    if (boundary === "cancelled-output") await service.cancelJob(job.id);
    else t.mock.timers.tick(100);
    pause.release();
    t.mock.timers.reset();
    const finished = await terminal(service, job.id);
    assert.equal(
      finished.status,
      boundary === "running" ? "failed" : boundary === "output" ? "interrupted" : "cancelled",
    );
    assert.equal(submissions, boundary === "running" ? 0 : 1);
    assert.deepEqual(finished.outputs, []);
    // cancelled 已先落盘，等待同一运行器完成其文件清理。
    if (boundary !== "running") {
      const outputs = join(root, "assets");
      for (let count = 0; count < 100 && (await readdir(outputs)).length; count++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.deepEqual(await readdir(outputs), []);
    }
  });
}
