import assert from "node:assert/strict";
import test from "node:test";
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  backgroundFileError,
  normalizeAppearance,
} from "../src/appearance/preferences.js";
import { createAppearancePreferenceStore } from "../src/store/appearancePreferenceStore.js";

function fixture(prepare: (file: File) => Promise<Blob> = async () => new Blob(["image"])) {
  const values = new Map<string, string>();
  const images = new Map<string, Blob>();
  const revoked: string[] = [];
  let fail = false;
  let sequence = 0;
  const options = {
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (fail) throw new Error("quota");
        values.set(key, value);
      },
    },
    images: {
      read: async (id: string) => images.get(id),
      write: async (id: string, blob: Blob) => {
        images.set(id, blob);
      },
      remove: async (id: string) => {
        images.delete(id);
      },
    },
    prepare,
    createUrl: () => `blob:fixture-${++sequence}`,
    revokeUrl: (url: string) => revoked.push(url),
    id: () => `image-${++sequence}`,
  };
  return {
    store: createAppearancePreferenceStore(options),
    options,
    values,
    images,
    revoked,
    fail: () => {
      fail = true;
    },
  };
}
const file = new File(["image"], "landscape.png", { type: "image/png" });

test("appearance defaults, corrupted values and supported image limits", () => {
  assert.deepEqual(normalizeAppearance(null), DEFAULT_APPEARANCE);
  const invalid = normalizeAppearance({
    transparency: 900,
    readingOpacity: -2,
    glassEnabled: "true",
    imageId: "file:///secret",
  });
  assert.equal(invalid.transparency, 85);
  assert.equal(invalid.readingOpacity, 65);
  assert.equal(invalid.glassEnabled, false);
  assert.equal(invalid.imageId, null);
  assert.equal(normalizeAppearance({ transparency: NaN }).transparency, 62);
  assert.equal(backgroundFileError(21 * 1024 * 1024, new Uint8Array([255, 216, 255])), "tooLarge");
  assert.equal(backgroundFileError(3, new Uint8Array([255, 216, 255])), null);
  assert.equal(backgroundFileError(4, new Uint8Array([60, 115, 118, 103])), "invalidImage");
});

test("glass toggles retain values; reset leaves background and enablement intact", async () => {
  const f = fixture();
  await f.store.getState().replaceImage(file);
  f.store.getState().update({ glassEnabled: true, transparency: 74, readingOpacity: 95 });
  f.store.getState().update({ glassEnabled: false });
  assert.equal(f.store.getState().preferences.transparency, 74);
  f.store.getState().resetGlass();
  const prefs = f.store.getState().preferences;
  assert.equal(prefs.transparency, 62);
  assert.equal(prefs.readingOpacity, 86);
  assert.equal(prefs.glassEnabled, false);
  assert.equal(prefs.backgroundEnabled, true);
  assert.ok(prefs.imageId);
  assert.deepEqual(createAppearancePreferenceStore(f.options).getState().preferences, prefs);
});

test("failed persistence keeps the old image and removes the unsuccessful replacement", async () => {
  const f = fixture();
  await f.store.getState().replaceImage(file);
  const old = f.store.getState().preferences;
  f.fail();
  await f.store.getState().replaceImage(file);
  assert.deepEqual(f.store.getState().preferences, old);
  assert.equal(f.store.getState().error, "saveFailed");
  assert.deepEqual([...f.images.keys()], [old.imageId]);
  f.store.getState().update({ transparency: 20 });
  assert.equal(f.store.getState().preferences.transparency, 62);
});

test("out-of-order decoding and removal cannot resurrect a discarded background", async () => {
  const finish: Array<(value: Blob) => void> = [];
  const f = fixture(() => new Promise((resolve) => finish.push(resolve)));
  const first = f.store.getState().replaceImage(file);
  const second = f.store.getState().replaceImage(new File(["b"], "second.png"));
  finish[1](new Blob(["second"]));
  await second;
  const keptId = f.store.getState().preferences.imageId;
  finish[0](new Blob(["first"]));
  await first;
  assert.equal(f.store.getState().preferences.imageId, keptId);
  const pending = f.store.getState().replaceImage(file);
  f.store.getState().removeImage();
  finish[2](new Blob(["late"]));
  await pending;
  assert.equal(f.store.getState().preferences.imageId, null);
  assert.equal(f.store.getState().imageUrl, null);
  assert.equal(f.images.size, 0);
});

test("another window's background survives an unrelated local slider update", async () => {
  const f = fixture();
  const another = createAppearancePreferenceStore(f.options);
  await another.getState().replaceImage(file);
  f.store.getState().update({ glassEnabled: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.store.getState().preferences.imageId, another.getState().preferences.imageId);
  assert.ok(f.store.getState().imageUrl);
  f.store.getState().update({ backgroundEnabled: false });
  assert.equal(f.store.getState().imageUrl, null);
  assert.ok(f.revoked.length);
  assert.equal(JSON.parse(f.values.get(APPEARANCE_KEY)!).backgroundEnabled, false);
  assert.equal(f.images.size, 1, "disabling preserves the selected image");
});

test("turning background off cancels a pending replacement and broken JSON can be reset", async () => {
  let complete!: (value: Blob) => void;
  const f = fixture(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const upload = f.store.getState().replaceImage(file);
  f.store.getState().update({ backgroundEnabled: false });
  complete(new Blob(["discarded"]));
  await upload;
  assert.equal(f.store.getState().preferences.imageId, null);
  assert.equal(f.images.size, 0);
  f.values.set(APPEARANCE_KEY, "broken JSON");
  f.store.getState().resetGlass();
  assert.equal(f.store.getState().error, null);
  assert.deepEqual(JSON.parse(f.values.get(APPEARANCE_KEY)!), DEFAULT_APPEARANCE);
});
