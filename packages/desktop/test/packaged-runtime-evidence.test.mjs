import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { packagedRuntimeEvidence } from "../../../scripts/packaged-runtime-evidence.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-package-evidence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function file(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return path;
}

async function packageFiles(directory) {
  await file(join(directory, "resources", "app.asar"), "abc");
  await file(join(directory, "resources", "knorvia", "knorvia.cjs"), "");
  return file(join(directory, "Knorvia Studio.exe"), "hello");
}

test("a complete external package reports canonical paths and known SHA-256 digests", async (t) => {
  const root = await fixture(t);
  const directory = join(root, "standalone");
  const executable = await packageFiles(directory);
  const evidence = await packagedRuntimeEvidence(executable);
  assert.equal(evidence.packageRoot, resolve(directory));
  assert.equal(evidence.resourcesPath, join(resolve(directory), "resources"));
  assert.deepEqual(evidence.executable, {
    path: resolve(executable),
    sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  });
  assert.deepEqual(evidence.appAsar, {
    path: join(resolve(directory), "resources", "app.asar"),
    sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  });
  assert.deepEqual(evidence.cli, {
    path: join(resolve(directory), "resources", "knorvia", "knorvia.cjs"),
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  });
});

for (const entry of ["dist/knorvia.cjs", "src/main.ts"]) {
  test(`rejects an ancestor repository with ${entry}, regardless of the package cwd`, async (t) => {
    const root = await fixture(t);
    await file(join(root, "apps", "cli", "packages", "cli", entry), "source runtime");
    const executable = await packageFiles(
      join(root, "packages", "desktop", "dist", "win-unpacked"),
    );
    await assert.rejects(
      packagedRuntimeEvidence(executable),
      /Copy the complete packaged directory outside the repository/,
    );
  });
}

test("resolves a directory link before checking repository ancestors", async (t) => {
  const root = await fixture(t);
  const repository = join(root, "repository");
  const directory = join(repository, "dist");
  await file(join(repository, "apps", "cli", "packages", "cli", "src", "main.ts"), "source");
  await packageFiles(directory);
  const linked = join(root, "outside-looking-package");
  await symlink(directory, linked, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(
    packagedRuntimeEvidence(join(linked, "Knorvia Studio.exe")),
    /repository CLI/,
  );
});

for (const missing of ["resources/app.asar", "resources/knorvia/knorvia.cjs"]) {
  test(`rejects an incomplete package missing ${missing}`, async (t) => {
    const root = await fixture(t);
    const executable = await packageFiles(root);
    await rm(join(root, missing));
    await assert.rejects(packagedRuntimeEvidence(executable), /Incomplete packaged runtime/);
  });
}

test("rejects a resources junction into another directory instead of a complete copy", async (t) => {
  const root = await fixture(t);
  const directory = join(root, "package");
  const elsewhere = join(root, "other-resources");
  await file(join(elsewhere, "app.asar"), "abc");
  await file(join(elsewhere, "knorvia", "knorvia.cjs"), "");
  const executable = await file(join(directory, "Knorvia Studio.exe"), "hello");
  await symlink(
    elsewhere,
    join(directory, "resources"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(packagedRuntimeEvidence(executable), /outside the copied package/);
});
