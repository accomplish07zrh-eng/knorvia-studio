// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Event } from "@knorvia/rpc";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { createStudioWorkspaceManager } from "../src/studio-runtime/adapters/workspaceManager.js";
import { connectStudioRpc } from "./fixtures/studio-rpc.integration.js";
import { seedLegacyStudioDatabase } from "./fixtures/studio-legacy-v010.integration.js";

import { independentImages } from "./fixtures/studio-independent-images.integration.js";
const fixtures = await independentImages();
const bytes = (name: string): Buffer => Buffer.from(fixtures[name]!.dataBase64, "base64");
const hash = (value: Buffer | null) =>
  value === null ? null : createHash("sha256").update(value).digest("hex");
const originals = new Map([
  ["modified.png", bytes("baselinePng")],
  ["deleted.jpg", bytes("staticJpeg")],
]);
const outputs = new Map([
  ["modified.png", bytes("workingPng")],
  ["added.jpg", bytes("orientedJpeg")],
]);

async function fixture(t: Pick<TestContext, "after">, variant = false) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-compare-rpc-integration-"));
  const source = join(root, "project");
  await mkdir(source);
  for (const [path, value] of originals) await writeFile(join(source, path), value);
  await writeFile(join(source, "dirty.txt"), "Uncommitted original user text\n");
  const snapshots = join(root, "snapshots");
  const workspaces = createStudioWorkspaceManager(snapshots);
  const working = await workspaces.prepare({
    runId: "physical-run",
    stepId: "physical-step",
    sourcePath: source,
    mode: "isolated",
  });
  await rm(join(working, "deleted.jpg"));
  for (const [path, value] of outputs)
    await writeFile(
      join(working, path),
      variant && path === "modified.png" ? bytes("sourcePng") : value,
    );
  const dbPath = join(root, "studio.sqlite");
  await seedLegacyStudioDatabase(dbPath, source);
  const db = new StudioDatabase(dbPath);
  db.transaction(() => {
    db.write(
      "run",
      "review-run",
      {
        id: "review-run",
        targetId: "review-group",
        kind: "group",
        state: "succeeded",
        attempt: 1,
        input: "Synthetic owned output",
        checkpoint: { steps: {}, values: {}, completedRounds: 0 },
        createdAt: 1,
        updatedAt: 1,
      },
      "review-group",
    );
    db.write(
      "workspace",
      "review-run:review-step",
      { runId: "physical-run", stepId: "physical-step", sourcePath: source, path: working },
      "review-run",
    );
  });
  const owner = new StudioRuntimeService({
    db,
    workspaces,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => delay(ms, undefined, { signal }),
    },
    kernels: {
      adapter: () => ({
        run: async () => {
          throw new Error("Read/apply acceptance must never dispatch a model");
        },
      }),
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    onDidChange: Event.None,
    notify: () => {},
  });
  const connection = connectStudioRpc(owner);
  t.after(async () => {
    connection.close();
    await owner.disposeAllAndWait();
    await rm(root, { recursive: true, force: true });
  });
  const projection = await connection.service.workspaceChanges({
    runId: "review-run",
    stepId: "review-step",
  });
  const version = (path: string) => projection.find((change) => change.path === path)!.version!;
  const preview = (path: string) =>
    connection.service.workspaceChanges({
      runId: "review-run",
      stepId: "review-step",
      imagePreview: { path, version: version(path) },
    });
  const apply = (paths: string[]) =>
    connection.service.applyWorkspaceChanges({
      runId: "review-run",
      stepId: "review-step",
      paths,
      reviewedVersions: paths.map((path) => ({ path, version: version(path) })),
    });
  return {
    root,
    source,
    working,
    db,
    service: connection.service,
    projection,
    version,
    preview,
    apply,
  };
}

test("exact PNG/JPEG snapshot sides and three hashes survive real RPC with two Host owners", async (t) => {
  const one = await fixture(t);
  const two = await fixture(t, true);
  const result = (await one.preview("modified.png"))[0]!;
  assert.deepEqual(result.imagePreview!.version, {
    beforeHash: hash(originals.get("modified.png")!),
    afterHash: hash(outputs.get("modified.png")!),
    sourceHash: hash(originals.get("modified.png")!),
  });
  for (const [side, value] of [
    ["before", originals.get("modified.png")!],
    ["after", outputs.get("modified.png")!],
  ] as const) {
    const image = result.imagePreview![side];
    assert.equal(image!.kind, "image");
    assert.deepEqual(
      Buffer.from(
        (image as Extract<NonNullable<typeof image>, { kind: "image" }>).dataBase64,
        "base64",
      ),
      value,
    );
  }
  assert.equal((await one.preview("added.jpg"))[0]!.imagePreview!.before, null);
  assert.equal((await one.preview("deleted.jpg"))[0]!.imagePreview!.after, null);
  assert.deepEqual(
    Buffer.from(
      ((await one.preview("added.jpg"))[0]!.imagePreview!.after as { dataBase64: string })
        .dataBase64,
      "base64",
    ),
    outputs.get("added.jpg"),
  );
  await assert.rejects(
    two.service.workspaceChanges({
      runId: "review-run",
      stepId: "review-step",
      imagePreview: { path: "modified.png", version: one.version("modified.png") },
    }),
    /version|changed/i,
  );
  await assert.rejects(
    one.service.workspaceChanges({
      runId: "unowned-run",
      stepId: "review-step",
      imagePreview: { path: "modified.png", version: one.version("modified.png") },
    }),
  );
  assert.equal(
    await readFile(join(one.source, "dirty.txt"), "utf8"),
    "Uncommitted original user text\n",
  );
});

test("stale working image prevents a whole RPC apply batch before source writes or journal creation", async (t) => {
  const f = await fixture(t);
  await f.preview("modified.png");
  await writeFile(join(f.working, "modified.png"), bytes("sourcePng"));
  await assert.rejects(f.apply(["added.jpg", "deleted.jpg", "modified.png"]), /reviewed|version/i);
  await assert.rejects(readFile(join(f.source, "added.jpg")), /ENOENT/);
  for (const [path, value] of originals)
    assert.deepEqual(await readFile(join(f.source, path)), value);
  assert.equal(
    (await readdir(dirname(f.working))).some((name) => name.startsWith("apply-")),
    false,
  );
  assert.deepEqual((await readdir(f.source)).sort(), ["deleted.jpg", "dirty.txt", "modified.png"]);
});

test("stale source blocks single-file apply, then exact restored added/deleted/modified versions apply together", async (t) => {
  const f = await fixture(t);
  await f.preview("modified.png");
  await writeFile(join(f.source, "modified.png"), bytes("sourcePng"));
  await assert.rejects(f.apply(["modified.png"]), /reviewed|version|changed/i);
  assert.deepEqual(await readFile(join(f.source, "modified.png")), bytes("sourcePng"));
  assert.equal(
    (await readdir(dirname(f.working))).some((name) => name.startsWith("apply-")),
    false,
  );
  await writeFile(join(f.source, "modified.png"), originals.get("modified.png")!);
  await f.apply(["modified.png", "added.jpg", "deleted.jpg"]);
  for (const [path, value] of outputs)
    assert.deepEqual(await readFile(join(f.source, path)), value);
  await assert.rejects(readFile(join(f.source, "deleted.jpg")), /ENOENT/);
  assert.equal(
    await readFile(join(f.source, "dirty.txt"), "utf8"),
    "Uncommitted original user text\n",
  );
});

test("real Host preview rejects a genuine static PNG beyond the declared edge budget before browser decode", async (t) => {
  const f = await fixture(t);
  const output = bytes("compareEdgeLimitPng");
  await writeFile(join(f.working, "modified.png"), output);
  const result = (
    await f.service.workspaceChanges({
      runId: "review-run",
      stepId: "review-step",
      imagePreview: {
        path: "modified.png",
        version: { ...f.version("modified.png"), afterHash: hash(output) },
      },
    })
  )[0]!;
  assert.equal(
    result.imagePreview!.after!.kind,
    "unsupported",
    "Compressed file size alone is not a decoded-image budget",
  );
});
