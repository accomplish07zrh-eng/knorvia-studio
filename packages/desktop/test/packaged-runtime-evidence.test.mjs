import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  packagedMaterialEvidence,
  packagedRuntimeEvidence,
} from "../../../scripts/packaged-runtime-evidence.mjs";

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
  // Windows runner 的 tmpdir 可能是 RUNNER~1 短名称；resolve 不会将它展开。
  // 契约返回 realpath，预期也应使用物理路径，保留精确路径与目录逃逸检查。
  const canonicalDirectory = await realpath(directory);
  assert.equal(evidence.packageRoot, canonicalDirectory);
  assert.equal(evidence.resourcesPath, join(canonicalDirectory, "resources"));
  assert.deepEqual(evidence.executable, {
    path: await realpath(executable),
    sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  });
  assert.deepEqual(evidence.appAsar, {
    path: join(canonicalDirectory, "resources", "app.asar"),
    sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  });
  assert.deepEqual(evidence.cli, {
    path: join(canonicalDirectory, "resources", "knorvia", "knorvia.cjs"),
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

const abcSha256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

async function materialFixture(t) {
  const root = await fixture(t);
  const directory = join(root, "artifact");
  await packageFiles(directory);
  await file(join(directory, "resources/tool.node"), "hello");
  await file(join(directory, "resources/NOTICE.txt"), "abc");
  const selection = {
    schemaVersion: 1,
    files: [
      { id: "runtime", kind: "runtime", path: "resources/app.asar", noticeIds: ["notice"] },
      { id: "native", kind: "native", path: "resources/tool.node", noticeIds: ["notice"] },
      { id: "notice", kind: "notice", path: "resources/NOTICE.txt", sha256: abcSha256 },
    ],
    excluded: [
      {
        id: "other-platform",
        path: "resources/other.node",
        policyRef: "synthetic-policy#target-only",
        reason: "Synthetic other-platform exclusion",
      },
    ],
  };
  return { root, directory, selection };
}

test("selected material evidence hashes runtime/native/notices and distinguishes policy exclusion", async (t) => {
  const { directory, selection } = await materialFixture(t);
  const report = await packagedMaterialEvidence(directory, selection);
  assert.equal(report.ok, true);
  assert.equal(report.scope, "selected-files-only");
  assert.equal(report.artifactRoot, await realpath(directory));
  assert.deepEqual(report.errors, []);
  assert.deepEqual(
    report.files.map((entry) => entry.status),
    ["present", "present", "present"],
  );
  assert.deepEqual(
    report.files.map((entry) => entry.sha256),
    [abcSha256, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", abcSha256],
  );
  assert.equal(report.files[2].expectedSha256, abcSha256);
  assert.equal(
    report.files[2].canonicalPath,
    await realpath(join(directory, "resources/NOTICE.txt")),
  );
  assert.deepEqual(report.excluded, [{ ...selection.excluded[0], status: "excluded-by-policy" }]);
});

for (const missing of ["resources/NOTICE.txt", "resources/tool.node"]) {
  test(`missing selected material ${missing} fails without becoming policy-excluded`, async (t) => {
    const { directory, selection } = await materialFixture(t);
    await rm(join(directory, missing));
    const report = await packagedMaterialEvidence(directory, selection);
    assert.equal(report.ok, false);
    assert.equal(report.files.find((entry) => entry.path === missing).status, "missing");
    assert.equal(report.excluded.length, 1);
    assert.equal(report.files.filter((entry) => entry.sha256).length, 2);
  });
}

test("changed notice bytes fail while retaining their observed digest", async (t) => {
  const { directory, selection } = await materialFixture(t);
  await file(join(directory, "resources/NOTICE.txt"), "");
  const report = await packagedMaterialEvidence(directory, selection);
  assert.equal(report.ok, false);
  assert.equal(report.files[2].status, "digest-mismatch");
  assert.equal(
    report.files[2].sha256,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("unselected notice references fail even with another valid notice present", async (t) => {
  const { directory, selection } = await materialFixture(t);
  selection.files[1].noticeIds = ["missing-notice"];
  const report = await packagedMaterialEvidence(directory, selection);
  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /native.*missing-notice/);
  assert.equal(report.files[2].status, "present");
});

for (const [name, mutate] of [
  [
    "empty selection",
    (plan) => {
      plan.files = [];
    },
  ],
  [
    "missing notice selection",
    (plan) => {
      plan.files.pop();
    },
  ],
  [
    "missing expected notice digest",
    (plan) => {
      delete plan.files[2].sha256;
    },
  ],
  [
    "missing notice references",
    (plan) => {
      plan.files[0].noticeIds = [];
    },
  ],
  [
    "duplicate IDs",
    (plan) => {
      plan.files[1].id = "runtime";
    },
  ],
  [
    "duplicate paths ignoring case",
    (plan) => {
      plan.excluded[0].path = "RESOURCES/TOOL.NODE";
    },
  ],
  [
    "traversal",
    (plan) => {
      plan.files[0].path = "../outside";
    },
  ],
  [
    "Windows drive path",
    (plan) => {
      plan.files[0].path = "C:/outside";
    },
  ],
  [
    "unknown required field",
    (plan) => {
      plan.files[0].requiredNoticeIds = ["omitted"];
    },
  ],
  [
    "unknown schema field",
    (plan) => {
      plan.requiredFiles = [];
    },
  ],
  [
    "exclusion without policy",
    (plan) => {
      delete plan.excluded[0].policyRef;
    },
  ],
]) {
  test(`invalid material selection rejects ${name}`, async (t) => {
    const { directory, selection } = await materialFixture(t);
    mutate(selection);
    await assert.rejects(
      packagedMaterialEvidence(directory, selection),
      /Invalid material selection/,
    );
  });
}

for (const dangling of [false, true]) {
  test(`policy-excluded ${dangling ? "dangling link" : "file"} present in artifact fails`, async (t) => {
    const { root, directory, selection } = await materialFixture(t);
    const excluded = join(directory, selection.excluded[0].path);
    if (dangling) {
      await symlink(
        join(root, "missing"),
        excluded,
        process.platform === "win32" ? "junction" : "dir",
      );
    } else {
      await file(excluded, "unexpected");
    }
    const report = await packagedMaterialEvidence(directory, selection);
    assert.equal(report.ok, false);
    assert.equal(report.excluded[0].status, "unexpected-present");
  });
}

test("exclusion requires contained parents even when the descendant is absent", async (t) => {
  const { root, directory, selection } = await materialFixture(t);
  const elsewhere = join(root, "separate-disposable-directory");
  await mkdir(elsewhere);
  const linkType = process.platform === "win32" ? "junction" : "dir";
  await symlink(elsewhere, join(directory, "external-link"), linkType);
  selection.excluded[0].path = "external-link/missing/tool.node";
  const escaped = await packagedMaterialEvidence(directory, selection);
  assert.equal(escaped.ok, false);
  assert.equal(escaped.excluded[0].status, "invalid-input");
  assert.match(escaped.excluded[0].error, /outside the copied package/);

  await symlink(join(directory, "resources"), join(directory, "internal-link"), linkType);
  selection.excluded[0].path = "internal-link/missing/tool.node";
  const contained = await packagedMaterialEvidence(directory, selection);
  assert.equal(contained.ok, true);
  assert.equal(contained.excluded[0].status, "excluded-by-policy");
});

test("portable selections reject Windows device names in files and excluded parents", async (t) => {
  const { directory, selection } = await materialFixture(t);
  for (const [entry, path] of [
    [selection.files[0], "resources/nUl.txt"],
    [selection.excluded[0], "resources/CON/missing.node"],
    [selection.excluded[0], "resources/COM¹.txt"],
  ]) {
    const original = entry.path;
    entry.path = path;
    await assert.rejects(
      packagedMaterialEvidence(directory, selection),
      /non-portable relative path/,
    );
    entry.path = original;
  }
});

test("selected material escaping through a directory link is not hashed", async (t) => {
  const { root, directory, selection } = await materialFixture(t);
  const elsewhere = join(root, "outside");
  await file(join(elsewhere, "NOTICE.txt"), "abc");
  await symlink(
    elsewhere,
    join(directory, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  selection.files[2].path = "linked/NOTICE.txt";
  const report = await packagedMaterialEvidence(directory, selection);
  assert.equal(report.ok, false);
  assert.equal(report.files[2].status, "invalid-input");
  assert.equal(report.files[2].sha256, undefined);
  assert.match(report.files[2].error, /outside the copied package/);
});

test("material CLI hashes exact selection bytes and emits incomplete evidence with nonzero exit", async (t) => {
  const { root, directory, selection } = await materialFixture(t);
  const bytes = `${JSON.stringify(selection, null, 2)}\n`;
  const selectionPath = await file(join(root, "selection.json"), bytes);
  const script = fileURLToPath(
    new URL("../../../scripts/packaged-runtime-evidence.mjs", import.meta.url),
  );
  const run = () => promisify(execFile)(process.execPath, [script, directory, selectionPath]);
  const report = JSON.parse((await run()).stdout);
  assert.equal(report.ok, true);
  assert.equal(report.selectionSha256, createHash("sha256").update(bytes).digest("hex"));
  await rm(join(directory, "resources/NOTICE.txt"));
  await assert.rejects(run(), (error) => {
    assert.equal(error.code, 1);
    const failed = JSON.parse(error.stdout);
    assert.equal(failed.ok, false);
    assert.equal(failed.files[2].status, "missing");
    return true;
  });
});
