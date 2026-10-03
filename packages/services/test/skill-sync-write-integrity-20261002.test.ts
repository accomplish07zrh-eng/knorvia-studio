import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync, gunzipSync } from "node:zlib";

test("synthetic skill archive writes preserve collisions, limits and path boundaries", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "knorvia-skill-sync-safety-"));
  const variables = [
    "HOME",
    "USERPROFILE",
    "KNORVIA_DATA_BASE_DIR",
    "KNORVIA_HOME",
    "KNORVIA_PORTABLE_DIR",
  ];
  const prior = new Map(variables.map((key) => [key, process.env[key]]));
  try {
    process.env.HOME = fixture;
    process.env.USERPROFILE = fixture;
    process.env.KNORVIA_DATA_BASE_DIR = fixture;
    process.env.KNORVIA_HOME = "";
    process.env.KNORVIA_PORTABLE_DIR = "";
    const { createSkillSyncService } = await import("../src/skill-sync/skillSyncService.js");
    const { createSkillSyncArchive, extractSkillSyncArchive } =
      await import("../src/skill-sync/skillSyncArchive.js");
    const source = join(fixture, "source", "synthetic");
    await mkdir(source, { recursive: true });
    const text = "---\nname: synthetic-safety\ndescription: synthetic fixture\n---\nfixture body\n";
    await writeFile(join(source, "SKILL.md"), text);
    await writeFile(join(source, "payload.txt"), "unchanged synthetic payload");
    const stamp = new Date("2020-01-02T03:04:05Z");
    for (const path of [source, join(source, "SKILL.md"), join(source, "payload.txt")]) {
      await chmod(path, path === source ? 0o755 : 0o644);
      await utimes(path, stamp, stamp);
    }
    const archive = await createSkillSyncArchive([
      { sourcePath: source, archivePath: "nested/synthetic" },
    ]);
    const tar = gunzipSync(archive);
    assert.equal(tar.subarray(257, 263).toString(), "ustar\0");
    assert.equal(tar.subarray(265, 272).toString(), "knorvia");
    assert.equal(
      tar.subarray(-1024).every((value) => value === 0),
      true,
    );
    const extracted = join(fixture, "roundtrip");
    await extractSkillSyncArchive(archive, extracted);
    assert.equal(await readFile(join(extracted, "nested/synthetic/SKILL.md"), "utf8"), text);
    await assert.rejects(
      extractSkillSyncArchive(archive, join(fixture, "limited"), { maxExtractedBytes: 0 }),
      (error: unknown) => {
        const limit = error as Error & { code: string; data: { phase: string } };
        return (
          limit.name === "SkillSyncSizeLimitError" &&
          limit.code === "SKILL_SYNC_SIZE_LIMIT_EXCEEDED" &&
          limit.data.phase === "extracted-content"
        );
      },
    );
    const unsafe = Buffer.from(tar);
    unsafe.fill(0, 0, 100);
    unsafe.write("../outside", 0, 100, "utf8");
    await assert.rejects(
      extractSkillSyncArchive(gzipSync(unsafe), join(fixture, "unsafe")),
      /unsafe skill archive path: \.\.\/outside/,
    );
    await assert.rejects(stat(join(fixture, "outside")), { code: "ENOENT" });

    const common = join(fixture, ".knorvia-studio", "skills");
    const compatibility = join(fixture, ".agents", "skills", "existing");
    await mkdir(compatibility, { recursive: true });
    const original = "---\nname: synthetic-safety\n---\noriginal compatibility bytes\n";
    await writeFile(join(compatibility, "SKILL.md"), original);
    const service = createSkillSyncService();
    const first = await service.importSkillsArchive({ archive });
    assert.equal(first.results[0]?.status, "skipped");
    assert.equal(first.results[0]?.path, compatibility);
    assert.equal(await readFile(join(compatibility, "SKILL.md"), "utf8"), original);
    assert.deepEqual(await readdir(common), []);
    await rm(compatibility, { recursive: true });
    const second = await service.importSkillsArchive({ archive });
    assert.equal(second.results[0]?.status, "synced");
    assert.equal(await readFile(join(common, "nested/synthetic/SKILL.md"), "utf8"), text);
    assert.equal((await service.importSkillsArchive({ archive })).results[0]?.status, "skipped");
    await assert.rejects(
      service.importSkillsArchive({ archive, overwrite: true } as never),
      /overwrite is not supported/,
    );
    await assert.rejects(
      service.listRemoteUserSkillStatuses({ directoryNames: ["../outside"] }),
      /unsafe skill sync path/,
    );
    await assert.rejects(
      service.importSkillsArchive({ archive: gzipSync(unsafe) }),
      /unsafe skill archive path/,
    );
    assert.equal(
      (await readdir(common)).some((name) => name.startsWith(".sync-tmp-")),
      false,
    );
    assert.equal((await service.checkRemoteUserSkillWriteAccess()).ok, true);
    assert.equal(
      (await readdir(common)).some((name) => name.includes("write-access")),
      false,
    );
  } finally {
    for (const [key, value] of prior) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(fixture, { recursive: true, force: true });
  }
});
