// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import type { IStudioRuntimeService, StudioWorkspaceChange } from "@knorvia/services";
import {
  WorkspaceImageController,
  studioImageNaturalSize,
} from "../src/studio/runtime/workspaceImageController.js";
import { workspaceImageFixture } from "../../services/test/studio-workspace-image-fixture.js";

async function settled(controller: WorkspaceImageController) {
  for (let attempt = 0; attempt < 200 && controller.getSnapshot().phase === "loading"; attempt++)
    await sleep(5);
  assert.notEqual(controller.getSnapshot().phase, "loading");
}
const request = (f: Awaited<ReturnType<typeof workspaceImageFixture>>) => ({
  runId: "original",
  stepId: "step",
  imagePreview: { path: f.files[0]!.path, version: f.version() },
});
function deferred() {
  let resolve!: (value: StudioWorkspaceChange[]) => void;
  const promise = new Promise<StudioWorkspaceChange[]>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test("late file/run/Host responses cannot replace another scoped image view", async (t) => {
  const one = await workspaceImageFixture(t);
  const two = await workspaceImageFixture(t);
  const first = deferred();
  const second = deferred();
  const old = new WorkspaceImageController(
    { workspaceChanges: () => first.promise } as unknown as IStudioRuntimeService,
    request(one),
  );
  old.activate();
  old.deactivate();
  const current = new WorkspaceImageController(
    { workspaceChanges: () => second.promise } as unknown as IStudioRuntimeService,
    { ...request(two), runId: "other-run" },
  );
  assert.equal(current.getSnapshot().pair, undefined);
  current.activate();
  second.resolve([await two.read()]);
  await settled(current);
  assert.equal(current.getSnapshot().phase, "ready");
  const pair = current.getSnapshot().pair;
  first.resolve([await one.read()]);
  await sleep(10);
  assert.equal(old.getSnapshot().pair, undefined);
  assert.equal(current.getSnapshot().pair, pair);
});
test("repeated close/open ignores the old read and releases the stored image bytes", async (t) => {
  const f = await workspaceImageFixture(t);
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const controller = new WorkspaceImageController(
    {
      workspaceChanges: () => (++calls === 1 ? first.promise : second.promise),
    } as unknown as IStudioRuntimeService,
    request(f),
  );
  controller.activate();
  controller.deactivate();
  controller.activate();
  second.resolve([await f.read()]);
  await settled(controller);
  first.resolve([]);
  await sleep(10);
  assert.equal(controller.getSnapshot().phase, "ready");
  assert.equal(controller.getSnapshot().error, undefined);
  controller.deactivate();
  assert.equal(controller.getSnapshot().pair, undefined);
});
test("old Host, different returned version and malformed bytes are explicit errors", async (t) => {
  const f = await workspaceImageFixture(t);
  const image = await f.read();
  for (const result of [
    [{ ...image, imagePreview: undefined }],
    [{ ...image, imagePreview: { ...image.imagePreview!, version: undefined } }],
    [
      {
        ...image,
        imagePreview: { ...image.imagePreview!, version: { ...f.version(), sourceHash: null } },
      },
    ],
    [
      {
        ...image,
        imagePreview: {
          ...image.imagePreview!,
          after: { kind: "image", mediaType: "image/svg+xml", dataBase64: "AA==", totalBytes: 1 },
        },
      },
    ],
  ]) {
    const controller = new WorkspaceImageController(
      { workspaceChanges: async () => result } as unknown as IStudioRuntimeService,
      request(f),
    );
    controller.activate();
    await settled(controller);
    assert.equal(controller.getSnapshot().phase, "error");
    assert.ok(controller.getSnapshot().error);
    assert.equal(controller.getSnapshot().pair, undefined);
  }
});
test("broken complete is not displayable; natural size comes from positive decoded display dimensions", () => {
  assert.equal(
    studioImageNaturalSize({
      naturalWidth: 0,
      naturalHeight: 0,
      complete: true,
    } as HTMLImageElement),
    undefined,
  );
  assert.equal(studioImageNaturalSize({ naturalWidth: 2, naturalHeight: 0 }), undefined);
  assert.deepEqual(studioImageNaturalSize({ naturalWidth: 2, naturalHeight: 3 }), {
    width: 2,
    height: 3,
  });
});
