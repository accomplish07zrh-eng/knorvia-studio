import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const serviceUrl = new URL("../src/setting/settingService.ts", import.meta.url).href;

async function removeTestFolder(folder: string) {
  const target = resolve(folder);
  const withinTemp = relative(resolve(tmpdir()), target);
  assert.ok(withinTemp.startsWith("knorvia-setting-") && !withinTemp.includes(sep));
  await rm(target, { recursive: true, force: true });
}

async function locationWithEnvironment(env: NodeJS.ProcessEnv, attemptMove: boolean) {
  // paths 模块在进程启动时固定环境；每种启动配置使用独立子进程，绝不改真实设置。
  const script = `
    const { createSettingService } = await import(${JSON.stringify(serviceUrl)});
    const service = createSettingService();
    const location = await service.getDataLocation();
    let error;
    if (${JSON.stringify(attemptMove)}) {
      try { await service.updateDataBaseDir(process.env.LOCATION_TEST_TARGET); }
      catch (cause) { error = cause.message; }
    }
    process.stdout.write(JSON.stringify({ location, error }));
  `;
  const result = await run(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { env, timeout: 15_000 },
  );
  return JSON.parse(result.stdout) as {
    location: { baseDir: string; dataRootDir: string; readOnlyReason: string | null };
    error?: string;
  };
}

test("portable and environment locations report actual paths and reject migration before any copy", async () => {
  const folder = await mkdtemp(join(tmpdir(), "knorvia-setting-location-"));
  const target = join(folder, "must-not-be-created");
  try {
    for (const portable of [true, false]) {
      const result = await locationWithEnvironment(
        {
          ...process.env,
          HOME: folder,
          USERPROFILE: folder,
          KNORVIA_DATA_BASE_DIR: folder,
          KNORVIA_HOME: join(folder, "ignored-root"),
          KNORVIA_PORTABLE_DIR: portable ? folder : "",
          LOCATION_TEST_TARGET: target,
        },
        true,
      );
      assert.equal(result.location.baseDir, folder);
      assert.equal(result.location.dataRootDir, join(folder, ".knorvia-studio"));
      assert.equal(result.location.readOnlyReason, portable ? "portable" : "environment");
      assert.match(result.error ?? "", portable ? /便携版/ : /固定数据目录/);
      assert.deepEqual(await readdir(folder), []);
    }
  } finally {
    await removeTestFolder(folder);
  }
});

test("an explicit application root is reported directly without appending the product folder again", async () => {
  const folder = await mkdtemp(join(tmpdir(), "knorvia-setting-root-"));
  try {
    const root = join(folder, "selected-application-root");
    const result = await locationWithEnvironment(
      {
        ...process.env,
        HOME: folder,
        USERPROFILE: folder,
        KNORVIA_DATA_BASE_DIR: "",
        KNORVIA_HOME: root,
        KNORVIA_PORTABLE_DIR: "",
        LOCATION_TEST_TARGET: join(folder, "must-not-be-created"),
      },
      true,
    );
    assert.equal(result.location.dataRootDir, root);
    assert.equal(result.location.readOnlyReason, "environment");
    assert.match(result.error ?? "", /固定数据目录/);
    assert.deepEqual(await readdir(folder), []);
  } finally {
    await removeTestFolder(folder);
  }
});

test("an unfixed runtime reports its real default without changing data", async () => {
  const folder = await mkdtemp(join(tmpdir(), "knorvia-setting-default-"));
  try {
    const result = await locationWithEnvironment(
      {
        ...process.env,
        HOME: folder,
        USERPROFILE: folder,
        KNORVIA_DATA_BASE_DIR: "",
        KNORVIA_HOME: "",
        KNORVIA_PORTABLE_DIR: "",
      },
      false,
    );
    assert.equal(result.location.baseDir, folder);
    assert.equal(result.location.dataRootDir, join(folder, ".knorvia-studio"));
    assert.equal(result.location.readOnlyReason, null);
    assert.deepEqual(await readdir(folder), []);
  } finally {
    await removeTestFolder(folder);
  }
});
