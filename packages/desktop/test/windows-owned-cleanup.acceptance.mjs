import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// 必须在云端原生 Windows 显式运行；普通离线测试 glob 不收集 .acceptance.mjs。
if (process.platform !== "win32") throw new Error("Owned cleanup acceptance requires native Windows");
const compiler = process.env.KNORVIA_NSIS_COMPILER;
assert.ok(compiler && isAbsolute(compiler), "Set KNORVIA_NSIS_COMPILER to the actual makensis.exe");
await access(compiler);
const testRoot = dirname(fileURLToPath(import.meta.url));
const resources = resolve(testRoot, "../build");
const source = join(testRoot, "fixtures/windows-owned-cleanup.nsi");
const manifestName = ".knorvia-studio-install-manifest";
const programFiles = ["Knorvia Studio.exe", "resources/runtime/owned.js"];
const preservedFiles = [
  "data/studio/studio.sqlite",
  "data/.knorvia-studio/v2/settings.json",
  "resources/user-storage/studio.sqlite",
  "user-notes.txt",
];

async function put(root, path, bytes) {
  const destination = join(root, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

async function digests(root) {
  return Promise.all(
    preservedFiles.map(async (path) => ({
      path,
      sha256: createHash("sha256").update(await readFile(join(root, path))).digest("hex"),
    })),
  );
}

function run(command, args, root) {
  // 临时文件和日志全部留在夹具；不继承模型凭据或真实应用数据目录。
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: root,
      TMP: root,
    },
  });
}

for (const updated of [false, true]) {
  for (const hasManifest of [true, false]) {
    test(`${updated ? "update" : "ordinary uninstall"}, manifest ${hasManifest ? "present" : "missing"}`, async (t) => {
      const root = await mkdtemp(join(tmpdir(), "knorvia-owned-cleanup-"));
      t.after(() => rm(root, { recursive: true, force: true }));
      const target = join(root, "Studio 夹具 with spaces");
      for (const path of programFiles) await put(target, path, `program:${path}`);
      for (const path of preservedFiles) await put(target, path, `synthetic user bytes:${path}`);
      await mkdir(join(target, "data/empty-user-folder"));
      await put(target, "Uninstall Knorvia Studio.exe", "owned uninstaller sentinel");
      if (hasManifest) {
        await put(
          target,
          manifestName,
          `${programFiles.map((path) => path.replaceAll("/", "\\")).join("\r\n")}\r\n`,
        );
      }
      const before = await digests(target);
      const output = join(root, "cleanup-fixture.exe");
      const compiled = run(compiler, [
        "/INPUTCHARSET",
        "UTF8",
        `/DKNORVIA_FIXTURE_OUTPUT=${output}`,
        `/DKNORVIA_FIXTURE_TARGET=${target}`,
        `/DKNORVIA_FIXTURE_RESOURCES=${resources}`,
        `/DKNORVIA_FIXTURE_UPDATED=${updated ? "1" : "0"}`,
        source,
      ], root);
      assert.equal(
        compiled.status,
        0,
        `${compiled.error ?? ""}\n${compiled.stdout}\n${compiled.stderr}`,
      );
      const executed = run(output, [], root);
      assert.equal(
        executed.status,
        !hasManifest && !updated ? 2 : 0,
        `${executed.error ?? ""}\n${executed.stdout}\n${executed.stderr}`,
      );
      assert.deepEqual(await digests(target), before);
      await access(join(target, "data/empty-user-folder"));
      for (const path of programFiles) {
        if (hasManifest) await assert.rejects(access(join(target, path)), { code: "ENOENT" });
        else assert.equal(await readFile(join(target, path), "utf8"), `program:${path}`);
      }
      if (hasManifest && !updated) {
        await assert.rejects(access(join(target, manifestName)), { code: "ENOENT" });
        await assert.rejects(access(join(target, "Uninstall Knorvia Studio.exe")), { code: "ENOENT" });
        await assert.rejects(access(join(target, "resources/runtime")), { code: "ENOENT" });
      }
    });
  }
}
