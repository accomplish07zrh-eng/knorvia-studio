// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  syntheticPng,
  workspaceImageFixture,
  imageHash,
  pngChunk,
} from "./studio-workspace-image-fixture.js";

test("invalid PNG compression header is rejected even when a browser can recover a blank frame", async (t) => {
  const valid = syntheticPng();
  const broken = Buffer.concat([
    valid.subarray(0, 33),
    pngChunk("IDAT", Buffer.from("not zlib pixels")),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  const f = await workspaceImageFixture(t, [{ path: "broken.png", before: valid, after: broken }]);
  assert.deepEqual((await f.read()).imagePreview?.after, {
    kind: "unsupported",
    reason: "invalid-format",
  });
});

test("growth after stat uses bounded reads and never returns changed image bytes", async (t) => {
  const f = await workspaceImageFixture(t);
  const path = join(f.working, f.files[0]!.path);
  const identity = await fs.stat(path);
  const handle = await fs.open(path, "r");
  const prototype = Object.getPrototypeOf(handle);
  const original = prototype.read;
  await handle.close();
  let grew = false;
  let allocated = 0;
  t.mock.method(prototype, "read", async function (this: typeof handle, ...args: unknown[]) {
    const info = await this.stat();
    if (!grew && info.ino === identity.ino && info.dev === identity.dev) {
      grew = true;
      allocated = (args[0] as Buffer).length;
      await fs.appendFile(path, Buffer.alloc(25 * 1024 * 1024));
    }
    return original.apply(this, args);
  });
  await assert.rejects(f.read(), /changed while reading/i);
  assert.equal(grew, true);
  assert.equal(allocated, identity.size + 1);
  assert.deepEqual(await fs.readFile(join(f.source, f.files[0]!.path)), f.files[0]!.before);
});

test("a stale file in a batch rejects all image writes and duplicate or out-of-scope versions", async (t) => {
  const f = await workspaceImageFixture(t, [
    { path: "one.png", before: syntheticPng(), after: syntheticPng(4, 3) },
    { path: "two.png", before: syntheticPng(5, 4), after: syntheticPng(7, 3) },
  ]);
  const paths = f.files.map((file) => file.path);
  const reviewedVersions = paths.map((path) => ({ path, version: f.version(path) }));
  await fs.writeFile(join(f.working, "two.png"), syntheticPng(9, 4));
  await assert.rejects(
    f.service.applyWorkspaceChanges({ runId: "original", stepId: "step", paths, reviewedVersions }),
    /reviewed|version/i,
  );
  for (const file of f.files)
    assert.deepEqual(await fs.readFile(join(f.source, file.path)), file.before);
  await assert.rejects(
    f.service.applyWorkspaceChanges({
      runId: "original",
      stepId: "step",
      paths,
      reviewedVersions: [reviewedVersions[0]!, reviewedVersions[0]!],
    }),
    /versions/i,
  );
  await assert.rejects(
    f.service.applyWorkspaceChanges({
      runId: "original",
      stepId: "step",
      paths: ["one.png"],
      reviewedVersions: [reviewedVersions[1]!],
    }),
    /outside/i,
  );
});

test("JPEG without a quantization table and multi-picture JPEG are explicit unsupported results", async (t) => {
  const missingTable = Buffer.from([
    255, 216, 255, 192, 0, 17, 8, 0, 2, 0, 3, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 255, 218, 0, 12, 3,
    1, 0, 2, 0, 3, 0, 0, 63, 0, 0, 0, 255, 217,
  ]);
  const f = await workspaceImageFixture(t, [
    { path: "broken.jpg", before: null, after: missingTable },
    {
      path: "multiple.jpg",
      before: null,
      after: Buffer.from([255, 216, 255, 226, 0, 6, 77, 80, 70, 0, 255, 217]),
    },
  ]);
  assert.deepEqual((await f.read("broken.jpg")).imagePreview?.after, {
    kind: "unsupported",
    reason: "invalid-format",
  });
  assert.deepEqual((await f.read("multiple.jpg")).imagePreview?.after, {
    kind: "unsupported",
    reason: "multiple-images",
  });
});

test("workspace ownership is rechecked after an asynchronous image read", async (t) => {
  const f = await workspaceImageFixture(t);
  const original = f.workspaces.changes.bind(f.workspaces);
  let release!: () => void;
  let readStarted!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    readStarted = resolve;
  });
  f.workspaces.changes = async (...args) => {
    const result = await original(...args);
    readStarted();
    await paused;
    return result;
  };
  const pending = f.read();
  await started;
  f.db.transaction(() =>
    f.db.write(
      "workspace",
      "original:step",
      {
        runId: "other-run",
        stepId: "image-step",
        sourcePath: f.source,
        path: f.working,
      },
      "original",
    ),
  );
  release();
  await assert.rejects(pending, /ownership|binding|changed/i);
});

test("binary projection and requested image pair are the exact owned baseline and working bytes", async (t) => {
  const f = await workspaceImageFixture(t);
  const changes = await f.service.workspaceChanges({ runId: "original", stepId: "step" });
  assert.deepEqual(
    changes.find((change) => change.path === f.files[0]!.path)?.version,
    f.version(),
  );
  const change = await f.read();
  assert.deepEqual(change.imagePreview?.version, f.version());
  for (const [side, bytes] of [
    ["before", f.files[0]!.before],
    ["after", f.files[0]!.after],
  ] as const) {
    const image = change.imagePreview![side];
    assert.equal(image?.kind, "image");
    if (image?.kind !== "image") throw new Error("Expected verified image bytes");
    assert.equal(image.mediaType, "image/png");
    assert.deepEqual(Buffer.from(image.dataBase64, "base64"), bytes);
    assert.equal(image.totalBytes, bytes!.length);
  }
  assert.notEqual(change.imagePreview?.before, change.imagePreview?.after);
  assert.deepEqual(await fs.readFile(join(f.source, f.files[0]!.path)), f.files[0]!.before);
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "dirty source\nold\n");
  assert.equal(f.calls.length, 0);
});

test("added and deleted images have a proven absent side rather than blank successful bytes", async (t) => {
  const f = await workspaceImageFixture(t, [
    { path: "new.png", before: null, after: syntheticPng() },
    { path: "deleted.png", before: syntheticPng(), after: null },
  ]);
  assert.equal((await f.read("new.png")).imagePreview?.before, null);
  assert.equal((await f.read("deleted.png")).imagePreview?.after, null);
  assert.equal((await f.read("new.png")).imagePreview?.after?.kind, "image");
  assert.equal((await f.read("deleted.png")).imagePreview?.before?.kind, "image");
});

test("same filename in different directories and Hosts never aliases a preview", async (t) => {
  const files = [
    { path: "a/same.png", before: syntheticPng(), after: syntheticPng(4, 3) },
    { path: "b/same.png", before: syntheticPng(6, 2), after: syntheticPng(7, 3) },
  ];
  const one = await workspaceImageFixture(t, files);
  const two = await workspaceImageFixture(t, [{ ...files[0]!, after: syntheticPng(8, 2) }]);
  assert.notDeepEqual(
    (await one.read("a/same.png")).imagePreview,
    (await one.read("b/same.png")).imagePreview,
  );
  await assert.rejects(
    two.service.workspaceChanges({
      runId: "original",
      stepId: "step",
      imagePreview: { path: "a/same.png", version: one.version("a/same.png") },
    }),
    /version|changed/i,
  );
  assert.equal((await two.read()).imagePreview?.after?.kind, "image");
});

test("changed source, changed output, missing file and tampered baseline reject old versions", async (t) => {
  const f = await workspaceImageFixture(t);
  const path = f.files[0]!.path;
  await fs.writeFile(join(f.source, path), syntheticPng(9, 2));
  await assert.rejects(f.read(), /source.*changed|version/i);
  await fs.writeFile(join(f.source, path), f.files[0]!.before!);
  await fs.writeFile(join(f.working, path), syntheticPng(9, 3));
  await assert.rejects(f.read(), /version|changed/i);
  await fs.rm(join(f.working, path));
  await assert.rejects(f.read(), /version|changed|missing/i);
  await fs.writeFile(join(f.working, path), f.files[0]!.after!);
  const baseline = join(dirname(f.working), "baseline", path);
  await fs.writeFile(baseline, syntheticPng(8, 3));
  await assert.rejects(f.read(), /baseline|version/i);
});

test("query rejects unauthorized run/step, path traversal, credential paths, links and malformed versions", async (t) => {
  const f = await workspaceImageFixture(t);
  for (const path of [
    "../outside.png",
    "/tmp/outside.png",
    "a\\b.png",
    "image.png:private",
    ".env.png",
  ])
    await assert.rejects(
      f.service.workspaceChanges({
        runId: "original",
        stepId: "step",
        imagePreview: { path, version: f.version() },
      }),
    );
  await assert.rejects(
    f.service.workspaceChanges({
      runId: "unknown",
      stepId: "step",
      imagePreview: { path: f.files[0]!.path, version: f.version() },
    }),
  );
  await assert.rejects(
    f.service.workspaceChanges({
      runId: "original",
      stepId: "unknown",
      imagePreview: { path: f.files[0]!.path, version: f.version() },
    }),
  );
  await assert.rejects(
    f.service.workspaceChanges({
      runId: "original",
      stepId: "step",
      imagePreview: { path: f.files[0]!.path, version: { ...f.version(), afterHash: "bad" } },
    }),
  );
  const outside = join(f.root, "outside");
  await fs.mkdir(outside);
  await fs.writeFile(join(outside, "sample.png"), f.files[0]!.after!);
  await fs.rm(join(f.working, "images"), { recursive: true });
  await fs.symlink(outside, join(f.working, "images"), "junction");
  await assert.rejects(f.read(), /links|redirect|regular/i);
  await fs.rm(join(f.working, "images"));
  await fs.mkdir(join(f.working, "images"));
  await fs.link(join(outside, "sample.png"), join(f.working, "images/sample.png"));
  await assert.rejects(f.read(), /unlinked|regular/i);
});

test("25 MiB image read boundary is distinct from media preview and isolation admission", async (t) => {
  const f = await workspaceImageFixture(t);
  const limit = 25 * 1024 * 1024;
  const path = f.files[0]!.path;
  const bytes = syntheticPng(5, 4, [20, 80, 160], limit - f.files[0]!.after!.length - 12);
  assert.equal(bytes.length, limit);
  await fs.writeFile(join(f.working, path), bytes);
  const params = {
    runId: "original",
    stepId: "step",
    imagePreview: { path, version: { ...f.version(), afterHash: imageHash(bytes) } },
  };
  const result = (await f.service.workspaceChanges(params))[0]!.imagePreview?.after;
  assert.equal(result?.kind, "image");
  if (result?.kind === "image") assert.equal(result.totalBytes, limit);
  await fs.appendFile(join(f.working, path), Buffer.from([0]));
  await assert.rejects(f.service.workspaceChanges(params), /25 MiB|too large/i);
});

test("animation and corrupt structure have explicit results; unsupported formats do not return image bytes", async (t) => {
  const f = await workspaceImageFixture(t, [
    { path: "animated.png", before: syntheticPng(), after: syntheticPng(4, 3, [1, 2, 3], 0, true) },
    { path: "broken.png", before: syntheticPng(), after: Buffer.from("not an image") },
    { path: "unsupported.gif", before: null, after: Buffer.from("GIF89a") },
  ]);
  assert.deepEqual((await f.read("animated.png")).imagePreview?.after, {
    kind: "unsupported",
    reason: "animated",
  });
  assert.deepEqual((await f.read("broken.png")).imagePreview?.after, {
    kind: "unsupported",
    reason: "invalid-format",
  });
  await assert.rejects(f.read("unsupported.gif"), /unsupported.*format/i);
});

test("apply rejects changed reviewed image before any write or journal and accepts the exact restored pair", async (t) => {
  const f = await workspaceImageFixture(t);
  const path = f.files[0]!.path;
  const params = {
    runId: "original",
    stepId: "step",
    paths: [path],
    reviewedVersions: [{ path, version: f.version() }],
  };
  await f.read();
  await fs.writeFile(join(f.working, path), syntheticPng(9, 9));
  await assert.rejects(f.service.applyWorkspaceChanges(params), /reviewed|version|changed/i);
  assert.deepEqual(await fs.readFile(join(f.source, path)), f.files[0]!.before);
  assert.equal(
    (await fs.readdir(dirname(f.working))).some((file) => file.startsWith("apply-")),
    false,
  );
  await fs.writeFile(join(f.working, path), f.files[0]!.after!);
  await f.service.applyWorkspaceChanges(params);
  assert.deepEqual(await fs.readFile(join(f.source, path)), f.files[0]!.after);
});
