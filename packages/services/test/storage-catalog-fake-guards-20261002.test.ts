import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyStoragePath,
  getStorageCategoryCleanability,
  getStorageCleanScopes,
  isProtectedStoragePath,
  normalizeStorageRelativePath,
} from "../src/storage/domain/storageCatalog.js";
import { createStorageService } from "../src/storage/app/storageService.js";
import type { StorageCategoryId } from "@knorvia/shared";

test("synthetic storage root/scope identity and actual catalog preserve lifecycle write guards", async () => {
  const home = { rootId: "home", hasCustomDataBaseDir: true } as const;
  const custom = { rootId: "dataBaseDir", hasCustomDataBaseDir: true } as const;
  assert.equal(normalizeStorageRelativePath("\\v2\\logs\\a//b/"), "v2/logs/a//b");
  assert.deepEqual(classifyStoragePath("v2/logs/old", home), {
    categoryId: "other",
    entryKey: "v2",
  });
  assert.deepEqual(classifyStoragePath("v2/logs/old", custom), {
    categoryId: "logs",
    entryKey: "v2/logs/old",
  });
  assert.deepEqual(classifyStoragePath("v2extra/logs/old", home), {
    categoryId: "other",
    entryKey: "v2extra",
  });
  assert.deepEqual(classifyStoragePath("cli/agents/session/worker/transcript.jsonl", custom), {
    categoryId: "subagentTranscripts",
    entryKey: "cli/agents/session",
  });
  assert.deepEqual(classifyStoragePath("cli/agents/session/worker/output", custom), {
    categoryId: "toolOutputs",
    entryKey: "cli/agents/session",
  });
  assert.deepEqual(classifyStoragePath("feedback/logs/task/deep", custom), {
    categoryId: "logs",
    entryKey: "feedback/logs/task",
  });
  assert.deepEqual(classifyStoragePath("cli/plugins/cache/fake", custom), {
    categoryId: "runtimes",
    entryKey: "cli/plugins/cache",
  });
  assert.deepEqual(classifyStoragePath("v2/checkpoints/s/pending/fake", custom), {
    categoryId: "toolOutputs",
    entryKey: "v2/checkpoints/s/pending/fake",
  });
  assert.deepEqual(classifyStoragePath("v2/setting.json.backup-old", custom), {
    categoryId: "backups",
    entryKey: "v2/setting.json.backup-old",
  });
  assert.deepEqual(classifyStoragePath("agent/unused", custom), {
    categoryId: "other",
    entryKey: "agent",
  });
  for (const basename of [
    "setting.json",
    "setting.json.lock",
    "credentials.json",
    ".credentials.json",
    ".tokens",
    "stdio-tap.json",
  ])
    assert.equal(isProtectedStoragePath(`logs/${basename}`), true);
  assert.equal(isProtectedStoragePath("v2/crash/live/task"), true);
  assert.equal(isProtectedStoragePath("v2/crash/lively/task"), false);
  assert.equal(isProtectedStoragePath("logs/Credentials.json"), false);
  const scopes = getStorageCleanScopes("backups");
  assert.deepEqual(scopes, [
    { prefix: "backup", recursive: true },
    { prefix: "v2/backup", recursive: true },
    { prefix: "v2/migrations", recursive: true },
    { prefix: "cli/db/backup", recursive: true },
    { prefix: "cli/db/backups", recursive: true },
    { prefix: "cli/db", recursive: false },
    { prefix: "cli", recursive: false },
    { prefix: "v2", recursive: false },
  ]);
  scopes[0]!.prefix = "caller mutation";
  scopes.pop();
  assert.equal(getStorageCleanScopes("backups")[0]!.prefix, "backup");
  assert.equal(getStorageCleanScopes("backups").length, 8);
  assert.deepEqual(getStorageCleanScopes("subagentTranscripts"), [
    { prefix: "cli/agents", recursive: true },
  ]);
  for (const category of [
    "sessionStore",
    "toolOutputs",
    "runtimes",
    "config",
    "other",
  ] satisfies StorageCategoryId[]) {
    assert.equal(getStorageCategoryCleanability(category), "none");
    assert.deepEqual(getStorageCleanScopes(category), []);
  }
  assert.equal(getStorageCategoryCleanability("backups"), "confirm");
  assert.equal(
    Reflect.apply(getStorageCategoryCleanability, undefined, ["toString"]),
    Object.prototype.toString,
  );
  assert.equal(
    Reflect.apply(getStorageCategoryCleanability, undefined, ["synthetic-unknown"]),
    undefined,
  );

  let signal: AbortSignal | undefined;
  let complete: ((value: { roots: []; errors: [] }) => void) | undefined;
  let lists = 0;
  let deletes = 0;
  let denyList = false;
  const denied = new Error("synthetic candidate read denied");
  const old = { relativePath: "v2/logs/old.log", bytes: 3, mtimeMs: 0 };
  const service = createStorageService({
    roots: {
      resolveRoots: async () => [
        { id: "home", path: "/synthetic/home-root", hasCustomDataBaseDir: true },
        { id: "dataBaseDir", path: "/synthetic/custom-root", hasCustomDataBaseDir: true },
      ],
    },
    scanRunner: {
      run: (request) => {
        signal = request.signal;
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    },
    cleaner: {
      listCandidates: async (root, scopes) => {
        lists++;
        assert.equal(root, "/synthetic/custom-root");
        assert.deepEqual(scopes.at(-1), { prefix: "computer-use/run", recursive: false });
        if (denyList) throw denied;
        return [
          old,
          { relativePath: "logs/credentials.json", bytes: 9, mtimeMs: 0 },
          { relativePath: "v2/crash/live/fake", bytes: 5, mtimeMs: 0 },
          { relativePath: "cli/plugins/cache/fake", bytes: 5, mtimeMs: 0 },
        ];
      },
      deleteFiles: async (root, targets, options) => {
        deletes++;
        assert.equal(root, "/synthetic/custom-root");
        assert.deepEqual(targets, [old]);
        assert.deepEqual(options, {
          keepDirectories: getStorageCleanScopes("logs").map((scope) => scope.prefix),
        });
        return { deletedCount: 1, freedBytes: 3, failures: [] };
      },
    },
    now: () => 48 * 60 * 60 * 1000,
  });
  await service.startScan();
  await assert.rejects(
    service.clean({ rootId: "dataBaseDir", categoryId: "config" }),
    /storage category is not cleanable: config/,
  );
  assert.equal(signal?.aborted, false);
  assert.equal(lists, 0);
  assert.equal(deletes, 0);
  assert.deepEqual(await service.clean({ rootId: "dataBaseDir", categoryId: "logs" }), {
    deletedCount: 1,
    freedBytes: 3,
    failures: [],
    skippedCount: 3,
  });
  assert.equal(signal?.aborted, true);
  assert.equal(lists, 1);
  assert.equal(deletes, 1);
  denyList = true;
  await assert.rejects(
    service.clean({ rootId: "dataBaseDir", categoryId: "logs" }),
    (error) => error === denied,
  );
  assert.equal(deletes, 1);
  complete!({ roots: [], errors: [] });
  await Promise.resolve();
  await Promise.resolve();
  service.dispose();
});
