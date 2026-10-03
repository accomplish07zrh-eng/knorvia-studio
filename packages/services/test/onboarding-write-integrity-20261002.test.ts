import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

test("synthetic onboarding writes retain device authority, ordering and queue recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-onboarding-safety-"));
  const keys = [
    "HOME",
    "USERPROFILE",
    "KNORVIA_DATA_BASE_DIR",
    "KNORVIA_HOME",
    "KNORVIA_PORTABLE_DIR",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys)
    process.env[key] = key === "KNORVIA_HOME" || key === "KNORVIA_PORTABLE_DIR" ? "" : root;
  try {
    const { createOnboardingRecordService } =
      await import("../src/onboarding/onboardingRecordService.js");
    const service = createOnboardingRecordService();
    const entry = {
      occupation: null,
      interfaceMode: null,
      memoryEnabled: false,
      proactiveSuggestionsEnabled: null,
      completedAt: "synthetic-first",
    };
    assert.equal(await service.shouldOnboard(), true);
    await Promise.all([
      service.appendRecord("synthetic-device", entry),
      service.appendRecord("different-synthetic-device", {
        ...entry,
        completedAt: "synthetic-second",
      }),
    ]);
    let file = (await service.getRecords())!;
    assert.equal(file.deviceMid, "synthetic-device");
    assert.equal(file.entries.length, 1);
    assert.equal(file.entries[0]!.completedAt, "synthetic-second");
    assert.equal(await service.shouldOnboard(), false);
    await assert.rejects(service.appendRecord("synthetic-device", { ...entry, completedAt: "" }));
    await service.updateRecordPreferences({ memoryEnabled: true });
    assert.equal((await service.getLatestEntry())!.memoryEnabled, true);
    const path = join(root, ".knorvia-studio", "v2", "onboarding-record.json");
    await mkdir(dirname(path), { recursive: true });
    file.entries.push({ ...file.entries[0]!, userId: "synthetic-other", completedAt: "other" });
    file.entries.push({
      ...file.entries[0]!,
      occupation: "unknown-synthetic",
      memoryEnabled: null,
      completedAt: "last",
    });
    await writeFile(path, JSON.stringify(file));
    assert.equal((await service.getLatestEntry())!.completedAt, "last");
    assert.deepEqual(await service.syncSettingsFromRecord(), {
      onboardingOccupation: "other",
      proactiveSuggestionsEnabled: false,
      memoryEnabled: false,
    });
    await service.updateRecordPreferences({ proactiveSuggestionsEnabled: true });
    await service.appendRecord("synthetic-device", { ...entry, completedAt: "replace-first" });
    file = (await service.getRecords())!;
    assert.deepEqual(
      file.entries.map((item) => item.completedAt),
      ["replace-first", "other", "last"],
    );
    assert.equal(file.entries[2]!.proactiveSuggestionsEnabled, true);
    assert.equal(await readFile(path, "utf8"), JSON.stringify(file, null, 2));
    await service.clearRecords();
    assert.equal(await service.getRecords(), null);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await rm(root, { recursive: true, force: true });
  }
});
