// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { Event } from "@knorvia/rpc";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { studioImageCodec } from "../src/studio-runtime/adapters/imageCodec.js";
import { connectStudioRpc } from "./fixtures/studio-rpc.integration.js";
import { seedLegacyStudioDatabase } from "./fixtures/studio-legacy-v010.integration.js";
import {
  independentImages,
  independentImageInput,
  independentBudgetImage,
} from "./fixtures/studio-independent-images.integration.js";

import type {
  IStudioRuntimeService,
  StudioCommand,
  StudioImageInput,
} from "../src/studio-runtime/contract.js";

const syntheticModel = "synthetic-vision-model";
async function host(path: string, seed = true, capability: "image" | "text" | "unknown" = "image") {
  const old = seed ? await seedLegacyStudioDatabase(path, join(path, "..", "project")) : undefined;
  const db = new StudioDatabase(path);
  let nativeCalls = 0;
  let id = 0;
  const owner = new StudioRuntimeService({
    db,
    images: studioImageCodec,
    clock: {
      now: Date.now,
      id: () => `integration-image-id-${++id}`,
      delay: (ms, signal) => delay(ms, undefined, { signal }),
    },
    kernels: {
      adapter: () => ({
        run: async () => {
          nativeCalls++;
          throw new Error("Read/admission acceptance cannot dispatch a model");
        },
      }),
      options: async () => ({
        defaultModel: syntheticModel,
        models: [
          {
            id: syntheticModel,
            label: "Synthetic",
            reasoning: [],
            ...(capability === "unknown"
              ? {}
              : { inputModalities: capability === "image" ? ["text", "image"] : ["text"] }),
          },
        ],
      }),
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    workspaces: {
      prepare: async ({ sourcePath }) => sourcePath,
      changes: async () => [],
      apply: async () => {},
    },
    onDidChange: Event.None,
    notify: () => {},
  });
  const rpc = connectStudioRpc(owner);
  return {
    db,
    old,
    service: rpc.service,
    nativeCalls: () => nativeCalls,
    close: async () => {
      rpc.close();
      await owner.disposeAllAndWait();
    },
  };
}
function command(
  attachments: StudioImageInput[],
  id = "same-image-command",
  text = "",
): Extract<StudioCommand, { type: "send" }> {
  return {
    type: "send",
    kind: "chat",
    commandId: id,
    targetId: "legacy-chat",
    text,
    imageModel: syntheticModel,
    kernelConfig: { model: syntheticModel, permission: "read-only", executablePath: "" },
    attachments,
  };
}
const timeline = (
  service: IStudioRuntimeService,
  target: string,
  run: string | undefined,
  image?: string,
  cid?: string,
) => service.timeline(target, undefined, run, image, cid);

test("new image-only admission on genuine old schema preserves records and exposes content only via owner-bound fourth/fifth RPC arguments", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-new-image-rpc-integration-"));
  const owned: Awaited<ReturnType<typeof host>>[] = [];
  t.after(async () => {
    for (const runtime of owned) await runtime.close();
    await rm(root, { recursive: true, force: true });
  });
  const one = await host(join(root, "a.sqlite"));
  owned.push(one);
  const two = await host(join(root, "b.sqlite"));
  owned.push(two);
  const data = await independentImages();
  const a = independentImageInput(data.baselinePng!, "same-image-id", "合成截图.png");
  const b = independentImageInput(data.workingPng!, "same-image-id", "合成截图.png");
  const first = command([a]);
  const second = command([b]);
  const accepted = await one.service.command(first);
  const other = await two.service.command(second);
  assert.equal(accepted.imageRejection, undefined);
  assert.equal(other.imageRejection, undefined);
  assert.equal(accepted.id, other.id);
  for (const service of [one.service, two.service]) {
    assert.equal(JSON.stringify(await service.overview()).includes("dataBase64"), false);
    assert.equal(
      JSON.stringify(await service.timeline("legacy-chat")).includes("dataBase64"),
      false,
    );
  }
  const image = await timeline(one.service, "legacy-chat", accepted.id, "same-image-id");
  assert.equal(image.image!.input!.dataBase64, a.dataBase64);
  const otherImage = await timeline(two.service, "legacy-chat", other.id, "same-image-id");
  assert.equal(otherImage.image!.input!.dataBase64, b.dataBase64);
  assert.notEqual(image.image!.input!.sha256, otherImage.image!.input!.sha256);
  const receipt = await timeline(one.service, "legacy-chat", undefined, undefined, first.commandId);
  assert.deepEqual(receipt.admission, { commandId: first.commandId, runId: accepted.id });
  await assert.rejects(timeline(one.service, "other-chat", accepted.id, "same-image-id"));
  await assert.rejects(timeline(one.service, "legacy-chat", "legacy-run", "same-image-id"));
  assert.equal(
    (await timeline(one.service, "other-chat", undefined, undefined, first.commandId)).admission,
    undefined,
  );
  assert.equal(one.nativeCalls(), 0);
  assert.equal(two.nativeCalls(), 0);
  const raw = new DatabaseSync(join(root, "a.sqlite"), { readOnly: true });
  try {
    for (const row of one.old!.rows) {
      const current = raw
        .prepare("SELECT value FROM studio_entities WHERE kind=? AND id=?")
        .get(row.kind, row.id)!;
      if (row.kind === "conversation") {
        const value = JSON.parse(String(current.value));
        const old = JSON.parse(row.value);
        assert.ok(value.updatedAt >= old.updatedAt);
        assert.deepEqual({ ...value, updatedAt: old.updatedAt }, old);
      } else assert.equal(current.value, row.value);
    }
  } finally {
    raw.close();
  }
});

test("inside-budget images persist once, survive reopening and exact CID replay, and reject changed payload without altering old data", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-new-image-budget-integration-"));
  const owned: Awaited<ReturnType<typeof host>>[] = [];
  t.after(async () => {
    for (const runtime of owned) await runtime.close();
    await rm(root, { recursive: true, force: true });
  });
  const path = join(root, "studio.sqlite");
  const first = await host(path);
  owned.push(first);
  const attachments = [
    independentBudgetImage(20261008, "noise-one"),
    independentBudgetImage(20261009, "noise-two"),
  ];
  assert.ok(attachments.every((image) => image.sizeBytes < 2 * 1024 * 1024));
  assert.ok(attachments.reduce((sum, image) => sum + image.sizeBytes, 0) < 4 * 1024 * 1024);
  const request = command(attachments, "budget-command", "Two valid pixel inputs");
  const result = await first.service.command(request);
  assert.equal(result.imageRejection, undefined, result.imageRejection);
  assert.ok(result.id);
  assert.equal(first.db.list("image-content").length, 2);
  const revision = first.db.revision();
  assert.deepEqual(await first.service.command(structuredClone(request)), result);
  assert.equal(first.db.revision(), revision);
  const changed = structuredClone(request);
  changed.text += " changed";
  const rejected = await first.service.command(changed);
  assert.equal(rejected.id, "");
  assert.match(rejected.imageRejection!, /不同操作/);
  assert.equal(first.db.revision(), revision);
  assert.equal(first.nativeCalls(), 0);
  await first.close();
  owned.splice(owned.indexOf(first), 1);
  const reopened = await host(path, false);
  owned.push(reopened);
  assert.deepEqual(await reopened.service.command(structuredClone(request)), result);
  assert.equal(reopened.db.revision(), revision);
  assert.equal(
    (await timeline(reopened.service, "legacy-chat", result.id, "noise-one")).image!.input!
      .dataBase64,
    attachments[0]!.dataBase64,
  );
  assert.equal(reopened.db.list("image-content").length, 2);
  assert.equal(reopened.nativeCalls(), 0);
  assert.deepEqual(
    await reopened.service.command({
      type: "send",
      kind: "chat",
      commandId: "legacy-command",
      targetId: "legacy-chat",
      text: "旧纯文字输入",
    }),
    { id: "legacy-run", revision: 23 },
  );
});

test("APNG, forged byte facts and unknown/non-image models have no durable admission or native dispatch", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-image-rejection-integration-"));
  const owned: Awaited<ReturnType<typeof host>>[] = [];
  t.after(async () => {
    for (const runtime of owned) await runtime.close();
    await rm(root, { recursive: true, force: true });
  });
  const data = await independentImages();
  for (const capability of ["image", "text", "unknown"] as const) {
    const runtime = await host(join(root, `${capability}.sqlite`), true, capability);
    owned.push(runtime);
    const originalRevision = runtime.db.revision();
    const image = independentImageInput(
      capability === "image" ? data.animatedPng! : data.baselinePng!,
      "rejected-image",
    );
    const result = await runtime.service.command(command([image]));
    assert.equal(result.id, "");
    assert.ok(result.imageRejection);
    assert.equal(runtime.db.revision(), originalRevision);
    assert.equal(runtime.db.list("image-content").length, 0);
    assert.equal(runtime.db.list("run").length, 1);
    assert.equal(runtime.nativeCalls(), 0);
    if (capability === "image") {
      const forged = independentImageInput(data.baselinePng!, "forged-image");
      forged.width++;
      const bad = await runtime.service.command(command([forged], "forged-command"));
      assert.equal(bad.id, "");
      assert.ok(bad.imageRejection);
      assert.equal(runtime.db.revision(), originalRevision);
    }
  }
});
