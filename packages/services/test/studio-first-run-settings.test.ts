import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSettingService } from "../src/setting/settingService.js";

test("new profiles keep the guide until deferred or an accepted message completes it", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-first-run-new-"));
  const previous = process.env.KNORVIA_DATA_BASE_DIR;
  process.env.KNORVIA_DATA_BASE_DIR = root;
  try {
    const service = createSettingService();
    assert.equal((await service.get()).studioFirstRunGuideStatus, "pending");
    await service.update({ onboardingOccupation: "developer" });
    assert.equal((await createSettingService().get()).studioFirstRunGuideStatus, "pending");
    await service.update({ studioFirstRunGuideStatus: "deferred" });
    assert.equal((await createSettingService().get()).studioFirstRunGuideStatus, "deferred");
    await service.update({ studioFirstRunGuideStatus: "complete" });
    assert.equal((await createSettingService().get()).studioFirstRunGuideStatus, "complete");
  } finally {
    if (previous === undefined) delete process.env.KNORVIA_DATA_BASE_DIR;
    else process.env.KNORVIA_DATA_BASE_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("existing settings files migrate to legacy without showing the new guide", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-first-run-existing-"));
  const previous = process.env.KNORVIA_DATA_BASE_DIR;
  process.env.KNORVIA_DATA_BASE_DIR = root;
  try {
    const file = join(root, ".knorvia-studio", "v2", "setting.json");
    await mkdir(join(root, ".knorvia-studio", "v2"), { recursive: true });
    await writeFile(file, JSON.stringify({ onboardingOccupation: "developer" }));
    assert.equal((await createSettingService().get()).studioFirstRunGuideStatus, "legacy");
    assert.equal(JSON.parse(await readFile(file, "utf8")).studioFirstRunGuideStatus, "legacy");
  } finally {
    if (previous === undefined) delete process.env.KNORVIA_DATA_BASE_DIR;
    else process.env.KNORVIA_DATA_BASE_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
