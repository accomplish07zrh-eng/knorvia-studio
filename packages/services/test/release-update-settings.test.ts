import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSettingService } from "../src/setting/settingService.js";

test("release update source and disabled state persist in the isolated local settings file", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-release-settings-"));
  const previousBase = process.env.KNORVIA_DATA_BASE_DIR;
  const previousPortable = process.env.KNORVIA_PORTABLE_DIR;
  process.env.KNORVIA_DATA_BASE_DIR = root;
  process.env.KNORVIA_PORTABLE_DIR = root;
  try {
    const service = createSettingService();
    assert.equal((await service.get()).releaseInfoUrl, "");
    assert.equal((await service.get()).releaseChecksEnabled, true);
    await service.update({ releaseInfoUrl: "https://example.test/releases/latest", releaseChecksEnabled: false });
    const reopened = await createSettingService().get();
    assert.equal(reopened.releaseInfoUrl, "https://example.test/releases/latest");
    assert.equal(reopened.releaseChecksEnabled, false);
    const file = join(root, ".knorvia-studio", "v2", "setting.json");
    assert.equal(JSON.parse(await readFile(file, "utf8")).releaseChecksEnabled, false);
    await assert.rejects(service.update({ releaseInfoUrl: "https://user:secret@example.test/releases" }));
    assert.equal((await createSettingService().get()).releaseInfoUrl, reopened.releaseInfoUrl);
  } finally {
    if (previousBase === undefined) delete process.env.KNORVIA_DATA_BASE_DIR;
    else process.env.KNORVIA_DATA_BASE_DIR = previousBase;
    if (previousPortable === undefined) delete process.env.KNORVIA_PORTABLE_DIR;
    else process.env.KNORVIA_PORTABLE_DIR = previousPortable;
    await rm(root, { recursive: true, force: true });
  }
});
