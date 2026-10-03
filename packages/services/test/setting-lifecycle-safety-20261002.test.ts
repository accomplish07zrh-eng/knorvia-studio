import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSettingService } from "../src/setting/settingService.js";
import { createObservableSettingService } from "../src/setting/observableSettingService.js";
import { withSettingsWriteQueueTimeout } from "../src/setting/settingsWriteQueue.js";

test("queued disjoint patches preserve disk format, normalization and read-after-write", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-settings-lifecycle-"));
  const previous = process.env.KNORVIA_DATA_BASE_DIR;
  process.env.KNORVIA_DATA_BASE_DIR = root;
  try {
    const service = createSettingService();
    const first = service.update({ terminalFontFamily: "  Synthetic Mono  " });
    const second = service.update({
      locale: "en-US",
      recentProjects: [
        "synthetic-a",
        "synthetic-a",
        ...Array.from({ length: 12 }, (_, i) => `p${i}`),
      ],
    });
    const visible = await service.get();
    await Promise.all([first, second]);
    assert.equal(visible.terminalFontFamily, "Synthetic Mono");
    assert.equal(visible.localePreference, "en-US");
    assert.deepEqual(visible.recentProjects, [
      "synthetic-a",
      ...Array.from({ length: 9 }, (_, i) => `p${i}`),
    ]);
    await service.update({ terminalFontFamily: "  " });
    const file = join(root, ".knorvia-studio", "v2", "setting.json");
    const raw = await readFile(file, "utf8");
    const saved = JSON.parse(raw);
    assert.equal("terminalFontFamily" in saved, false);
    assert.equal(raw, JSON.stringify(saved, null, 2));
    assert.equal((await createSettingService().get()).localePreference, "en-US");
    await assert.rejects(service.update({ locale: "invalid" as never }));
    await service.update({ releaseChecksEnabled: false });
    assert.equal((await service.get()).releaseChecksEnabled, false);
  } finally {
    if (previous === undefined) delete process.env.KNORVIA_DATA_BASE_DIR;
    else process.env.KNORVIA_DATA_BASE_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("observers see post-completion patch keys and preserve failure identity", async () => {
  const failure = new Error("synthetic write failure");
  const base = createSettingService();
  let fail = false;
  base.update = async (patch) => {
    await Promise.resolve();
    if (fail) throw failure;
    patch.releaseChecksEnabled = false;
  };
  const observed = createObservableSettingService(base);
  const events: unknown[] = [];
  const unsubscribe = observed.onDidUpdate((event) => {
    assert.equal(Object.isFrozen(event), true);
    assert.equal(Object.isFrozen(event.keys), true);
    events.push(event.keys);
  });
  await observed.update({ locale: "en-US" });
  assert.deepEqual(events, [["locale", "releaseChecksEnabled"]]);
  fail = true;
  await assert.rejects(observed.update({}), (error) => error === failure);
  assert.equal(events.length, 1);
  unsubscribe();
  fail = false;
  await observed.update({});
  assert.equal(events.length, 1);
});

test("write deadline invalidates preparation but never expires an entered commit", async (t) => {
  const previous = process.env.KNORVIA_SETTING_WRITE_QUEUE_TIMEOUT_MS;
  process.env.KNORVIA_SETTING_WRITE_QUEUE_TIMEOUT_MS = "17";
  let fire: (() => void) | undefined;
  let cleared = false;
  let expired = false;
  const handle = { unref() {} };
  t.mock.method(globalThis, "setTimeout", (callback: () => void, ms: number) => {
    assert.equal(ms, 17);
    fire = callback;
    return handle;
  });
  t.mock.method(globalThis, "clearTimeout", () => {
    cleared = true;
    fire = undefined;
  });
  try {
    const timedOut = withSettingsWriteQueueTimeout(
      () => new Promise(() => {}),
      () => {
        expired = true;
      },
    );
    const rejection = assert.rejects(timedOut, /settingService update timed out after 17ms/);
    fire!();
    await rejection;
    assert.equal(expired, true);
    assert.equal(cleared, true);
    expired = false;
    const failure = new Error("synthetic commit failure");
    await assert.rejects(
      withSettingsWriteQueueTimeout(
        async (enterCommit) => {
          enterCommit();
          assert.equal(fire, undefined);
          throw failure;
        },
        () => {
          expired = true;
        },
      ),
      (error) => error === failure,
    );
    assert.equal(expired, false);
    assert.throws(
      () =>
        withSettingsWriteQueueTimeout(
          () => {
            throw failure;
          },
          () => {
            expired = true;
          },
        ),
      (error) => error === failure,
    );
  } finally {
    if (previous === undefined) delete process.env.KNORVIA_SETTING_WRITE_QUEUE_TIMEOUT_MS;
    else process.env.KNORVIA_SETTING_WRITE_QUEUE_TIMEOUT_MS = previous;
  }
});
