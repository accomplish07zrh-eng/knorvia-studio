import assert from "node:assert/strict";
import { mock, test } from "node:test";
const candidate = { relativePath: "logs/old.log", bytes: 3, mtimeMs: 0 };
mock.module(new URL("../src/storage/domain/storageCatalog.ts", import.meta.url).href, {
  namedExports: {
    getStorageCategoryCleanability: (id: string) => (id === "config" ? "none" : "safe"),
    getStorageCleanScopes: () => [{ prefix: "logs", recursive: true }],
  },
});
mock.module(new URL("../src/storage/domain/cleanPlan.ts", import.meta.url).href, {
  namedExports: { planStorageClean: () => ({ targets: [candidate], skippedCount: 2 }) },
});
const { createStorageService } = await import("../src/storage/app/storageService.js");
test("fake storage lifecycle denies protected category before cancellation and forwards authorized clean plan", async () => {
  let scans = 0;
  let cleanCalls = 0;
  let signal: AbortSignal | undefined;
  let complete: ((value: { roots: []; errors: [] }) => void) | undefined;
  const service = createStorageService({
    roots: {
      resolveRoots: async () => [
        { id: "home", path: "/synthetic/root", hasCustomDataBaseDir: false },
      ],
    },
    scanRunner: {
      run: ({ signal: nextSignal }) => {
        scans++;
        signal = nextSignal;
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    },
    cleaner: {
      listCandidates: async (root, scopes) => {
        cleanCalls++;
        assert.equal(root, "/synthetic/root");
        assert.deepEqual(scopes, [{ prefix: "logs", recursive: true }]);
        return [candidate];
      },
      deleteFiles: async (root, targets, options) => {
        cleanCalls++;
        assert.equal(root, "/synthetic/root");
        assert.equal(targets[0], candidate);
        assert.deepEqual(options, { keepDirectories: ["logs"] });
        return { deletedCount: 1, freedBytes: 3, failures: [] };
      },
    },
    now: () => 7,
  });
  const { jobId } = await service.startScan();
  assert.equal(jobId, "scan-1");
  assert.equal(scans, 1);
  await assert.rejects(
    service.clean({ rootId: "home", categoryId: "config" }),
    /storage category is not cleanable: config/,
  );
  assert.equal(signal?.aborted, false);
  assert.equal(cleanCalls, 0);
  const result = await service.clean({ rootId: "home", categoryId: "logs" });
  assert.equal(signal?.aborted, true);
  assert.deepEqual(result, { deletedCount: 1, freedBytes: 3, failures: [], skippedCount: 2 });
  complete!({ roots: [], errors: [] });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal((await service.getSnapshot())?.status, "cancelled");
  service.dispose();
});
