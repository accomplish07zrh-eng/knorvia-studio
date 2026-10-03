import assert from "node:assert/strict";
import test from "node:test";
import type { StorageRootSpec } from "@knorvia/shared";

test("fake classifier accounting keeps totals, folds and independent snapshots", async (t) => {
  const contexts: { rootId: string; hasCustomDataBaseDir: boolean }[] = [];
  const queries: string[] = [];
  t.mock.module("@knorvia/shared", {
    namedExports: {
      STORAGE_CATEGORY_IDS: ["logs", "config", "other"],
      STORAGE_MORE_ENTRIES_PATH: "…",
    },
  });
  t.mock.module("../src/storage/domain/storageCatalog.js", {
    namedExports: {
      classifyStoragePath: (
        path: string,
        context: { rootId: string; hasCustomDataBaseDir: boolean },
      ) => {
        contexts.push({ ...context });
        return {
          categoryId: path.startsWith("config/") ? "config" : "logs",
          entryKey: path.split("/").slice(0, 2).join("/"),
        };
      },
      getStorageCategoryCleanability: (id: string) => {
        queries.push(id);
        return id === "logs" ? "safe" : "none";
      },
    },
  });
  const { createStorageUsageAccumulator } = await import("../src/storage/domain/usageAggregate.js");
  const spec: StorageRootSpec = { id: "home", path: "/synthetic/root", hasCustomDataBaseDir: true };
  const owner = createStorageUsageAccumulator(spec, { maxEntriesPerCategory: 1 });
  for (const [relativePath, bytes] of [
    ["logs/a/one", 7],
    ["logs/a/two", 3],
    ["logs/b/one", 10],
    ["logs/c/one", 4],
    ["config/protected", 2],
  ] as const)
    owner.add({ relativePath, bytes, mtimeMs: 123 });
  const snapshot = owner.snapshot(null);
  assert.equal(snapshot.bytes, 26);
  assert.equal(snapshot.fileCount, 5);
  assert.deepEqual(snapshot.categories[0].entries, [
    { relativePath: "logs/a", bytes: 10, fileCount: 2 },
    { relativePath: "…", bytes: 14, fileCount: 2 },
  ]);
  assert.equal(snapshot.categories[1].cleanability, "none");
  assert.equal(snapshot.categories[2].bytes, 0);
  assert.deepEqual(queries, ["logs", "config", "other"]);
  snapshot.categories[0].entries[0].bytes = 999;
  assert.equal(owner.snapshot(null).categories[0].entries[0].bytes, 10);
  spec.path = "/synthetic/renamed";
  spec.hasCustomDataBaseDir = false;
  owner.add({ relativePath: "logs/d", bytes: 1, mtimeMs: 0 });
  assert.equal(contexts.at(-1)?.hasCustomDataBaseDir, true);
  assert.equal(owner.snapshot(null).path, "/synthetic/renamed");
  const unusual = createStorageUsageAccumulator(spec, { maxEntriesPerCategory: Number.NaN });
  assert.equal(
    unusual.snapshot(null).categories.every((category) => category.entries.length === 0),
    true,
  );
  unusual.add({ relativePath: "logs/a", bytes: 2, mtimeMs: 0 });
  assert.deepEqual(unusual.snapshot(null).categories[0].entries, [
    { relativePath: "…", bytes: 2, fileCount: 1 },
  ]);
  const zero = createStorageUsageAccumulator(spec, { maxEntriesPerCategory: 0 });
  zero.add({ relativePath: "logs/a", bytes: 2, mtimeMs: 0 });
  assert.deepEqual(zero.snapshot(null).categories[0].entries, [
    { relativePath: "…", bytes: 2, fileCount: 1 },
  ]);
});
