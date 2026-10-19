// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { providerNode, readFixture, readFixtureText } from "./entry.mjs";

const {
  NodePersonalProviderConfigRepository,
  NodeModelSelectionConfigRepository,
  decodeProviderConfigFile,
  encodeProviderConfigFile,
} = providerNode;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, label = "condition", timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await delay(5);
  }
}

const fixtureUpdate = () =>
  decodeProviderConfigFile(readFixture("provider-config", "old-write.json"));
const canonical = (update) => JSON.stringify(encodeProviderConfigFile(update), null, 2);
const expectedRevision = (update) =>
  createHash("sha256")
    .update(JSON.stringify(encodeProviderConfigFile(update)))
    .digest("hex");

async function withTempDir(run) {
  const directory = await mkdtemp(join(tmpdir(), "pk02-repo-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("B23 构造校验与空目录读取", async () => {
  await withTempDir(async (directory) => {
    const filePath = join(directory, "provider_config.json");
    assert.throws(() => new NodePersonalProviderConfigRepository({ filePath: "   " }), {
      message: "Personal Provider Config filePath 不能为空",
    });
    assert.throws(
      () => new NodePersonalProviderConfigRepository({ filePath, pollingIntervalMs: 0 }),
      { message: "Personal Provider Config pollingIntervalMs 必须大于 0" },
    );
    assert.throws(
      () => new NodePersonalProviderConfigRepository({ filePath, pollingIntervalMs: -1 }),
      { message: "Personal Provider Config pollingIntervalMs 必须大于 0" },
    );

    const repository = new NodePersonalProviderConfigRepository({
      filePath,
      pollingIntervalMs: false,
    });
    const snapshot = await repository.read();
    assert.equal(existsSync(filePath), false, "无可导入内容时不创建文件");
    assert.deepEqual(snapshot.providers.toJSON(), []);
    assert.deepEqual(snapshot.models.toPersonalJSON(), {
      providerModelRules: [],
      manualProviderModelRules: [],
    });
    assert.deepEqual(snapshot.providerOrder, []);
    assert.equal(snapshot.defaultModelSelection, undefined);
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(
      snapshot.revision,
      expectedRevision({
        providers: snapshot.providers,
        models: snapshot.models,
        providerOrder: [],
      }),
    );
    repository.dispose();
  });
});

test("B23 非规范键序文件在读取时原地规范化，revision 稳定", async () => {
  await withTempDir(async (directory) => {
    const filePath = join(directory, "provider_config.json");
    const fixture = readFixture("provider-config", "old-write.json");
    const reordered = {
      config: {
        defaultModelSelection: fixture.config.defaultModelSelection,
        modelConfigRules: fixture.config.modelConfigRules,
        providerConfigRules: fixture.config.providerConfigRules,
        providerOrder: fixture.config.providerOrder,
      },
      schemaVersion: fixture.schemaVersion,
    };
    await writeFile(filePath, JSON.stringify(reordered), "utf8");
    const repository = new NodePersonalProviderConfigRepository({
      filePath,
      pollingIntervalMs: false,
    });
    const snapshot = await repository.read();
    assert.equal(
      await readFile(filePath, "utf8"),
      readFixtureText("provider-config", "old-write.json"),
      "键序不一致时在锁内重写为规范格式",
    );
    assert.equal(snapshot.revision, expectedRevision(fixtureUpdate()));
    const again = await repository.read();
    assert.equal(again.revision, snapshot.revision);
    repository.dispose();
  });
});

test("B23 importLegacy 在锁内导入并写入", async () => {
  await withTempDir(async (directory) => {
    const filePath = join(directory, "provider_config.json");
    let imports = 0;
    const repository = new NodePersonalProviderConfigRepository({
      filePath,
      pollingIntervalMs: false,
      importLegacy: async () => {
        imports++;
        return fixtureUpdate();
      },
    });
    const snapshot = await repository.read();
    assert.equal(imports, 1);
    assert.equal(
      await readFile(filePath, "utf8"),
      readFixtureText("provider-config", "old-write.json"),
    );
    assert.equal(snapshot.revision, expectedRevision(fixtureUpdate()));
    assert.equal((await repository.read()).revision, snapshot.revision);
    assert.equal(imports, 1, "已有文件不再导入");
    repository.dispose();
  });
});

test("B23 读取/解析错误走 onRecovery 并返回空快照", async () => {
  await withTempDir(async (directory) => {
    const filePath = join(directory, "provider_config.json");
    await writeFile(filePath, "{ not json", "utf8");
    const events = [];
    const repository = new NodePersonalProviderConfigRepository({
      filePath,
      pollingIntervalMs: false,
      onRecovery: (event) => {
        events.push(event);
        throw new Error("recovery callback failure");
      },
    });
    const snapshot = await repository.read();
    assert.equal(events.length, 1);
    assert.equal(Object.isFrozen(events[0]), true);
    assert.ok(events[0].error instanceof SyntaxError);
    assert.deepEqual(snapshot.providers.toJSON(), []);
    assert.deepEqual(snapshot.providerOrder, []);
    repository.dispose();
  });
});

test("B23 update 原子写、事件与 transform 抛错", async () => {
  await withTempDir(async (directory) => {
    const filePath = join(directory, "provider_config.json");
    const repository = new NodePersonalProviderConfigRepository({
      filePath,
      pollingIntervalMs: false,
    });
    const reasons = [];
    const unsubscribe = repository.onDidChange((reason) => reasons.push(reason));
    await repository.read();

    const next = await repository.update((current) => ({
      ...current,
      providerOrder: [...current.providerOrder, "personal-openai"],
    }));
    assert.deepEqual(next.providerOrder, ["personal-openai"]);
    assert.deepEqual(reasons, ["updated"]);
    const text = await readFile(filePath, "utf8");
    assert.equal(text, canonical(next));
    assert.equal(text.endsWith("\n"), false, "无尾随换行");
    assert.equal(next.revision, expectedRevision(next));

    const before = text;
    await assert.rejects(
      repository.update(() => {
        throw new Error("transform boom");
      }),
      { message: "transform boom" },
    );
    assert.equal(await readFile(filePath, "utf8"), before, "transform 抛错不写文件");
    assert.deepEqual(reasons, ["updated"]);

    unsubscribe();
    unsubscribe();
    await repository.update((current) => ({ ...current }));
    assert.deepEqual(reasons, ["updated"], "取消订阅后不再收到事件");

    repository.dispose();
    repository.dispose();
    await assert.rejects(repository.read(), {
      message: "NodePersonalProviderConfigRepository 已 dispose",
    });
    await assert.rejects(
      repository.update((current) => current),
      {
        message: "NodePersonalProviderConfigRepository 已 dispose",
      },
    );
    assert.throws(() => repository.onDidChange(() => {}), {
      message: "NodePersonalProviderConfigRepository 已 dispose",
    });
  });
});

test("B23 并发 update 由文件锁串行化", async () => {
  await withTempDir(async (directory) => {
    const filePath = join(directory, "provider_config.json");
    const repository = new NodePersonalProviderConfigRepository({
      filePath,
      pollingIntervalMs: false,
    });
    await Promise.all([
      repository.update((current) => ({
        ...current,
        providerOrder: [...current.providerOrder, "a"],
      })),
      repository.update((current) => ({
        ...current,
        providerOrder: [...current.providerOrder, "b"],
      })),
    ]);
    const document = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(document.config.providerOrder.slice().sort(), ["a", "b"]);
    assert.equal((await repository.read()).providerOrder.length, 2);
    repository.dispose();
  });
});

test("B24 轮询发现外部 revision 变化并去重，dispose 后静默", async () => {
  await withTempDir(async (directory) => {
    const filePath = join(directory, "provider_config.json");
    const first = fixtureUpdate();
    await writeFile(filePath, canonical(first), "utf8");
    const repository = new NodePersonalProviderConfigRepository({
      filePath,
      pollingIntervalMs: 5,
    });
    const reasons = [];
    repository.onDidChange((reason) => reasons.push(reason));
    await repository.read();
    assert.equal(reasons.length, 0);

    const second = {
      ...first,
      providerOrder: [...first.providerOrder, "poll-target"],
    };
    await writeFile(filePath, canonical(second), "utf8");
    await waitFor(() => reasons.includes("poll-changed"), "poll-changed");
    assert.equal(reasons.filter((reason) => reason === "poll-changed").length, 1);
    await delay(30);
    assert.equal(
      reasons.filter((reason) => reason === "poll-changed").length,
      1,
      "同一 revision 不重复通知",
    );

    repository.dispose();
    await writeFile(
      filePath,
      canonical({ ...second, providerOrder: [...second.providerOrder, "after-dispose"] }),
      "utf8",
    );
    await delay(30);
    assert.equal(reasons.filter((reason) => reason === "poll-changed").length, 1);
  });
});

test("B24 同一错误期只回调一次 onPollingError，成功后重置", async () => {
  await withTempDir(async (directory) => {
    const filePath = join(directory, "provider_config.json");
    const first = fixtureUpdate();
    await writeFile(filePath, canonical(first), "utf8");
    let errors = 0;
    const repository = new NodePersonalProviderConfigRepository({
      filePath,
      pollingIntervalMs: 5,
      onPollingError: () => {
        errors++;
        throw new Error("polling error callback failure");
      },
    });
    const reasons = [];
    repository.onDidChange((reason) => reasons.push(reason));
    await repository.read();

    await writeFile(filePath, "{ broken", "utf8");
    await waitFor(() => reasons.includes("poll-error"), "first poll-error");
    await delay(30);
    assert.equal(errors, 1, "同一错误期只回调一次");
    assert.equal(reasons.filter((reason) => reason === "poll-error").length, 1);

    await writeFile(filePath, canonical({ ...first, providerOrder: ["recovered"] }), "utf8");
    await waitFor(() => reasons.includes("poll-changed"), "recovered poll-changed");

    await writeFile(filePath, "{ broken again", "utf8");
    await waitFor(
      () => reasons.filter((reason) => reason === "poll-error").length === 2,
      "second poll-error",
    );
    await delay(30);
    assert.equal(errors, 2);
    repository.dispose();
  });
});

function fakePersonalRepository(initialSelection) {
  let snapshot = {
    revision: "r0",
    providers: { toJSON: () => [] },
    models: { toPersonalJSON: () => ({}) },
    providerOrder: [],
    defaultModelSelection: initialSelection,
  };
  const listeners = new Set();
  let updates = 0;
  return {
    listeners,
    get updateCount() {
      return updates;
    },
    disposed: false,
    async read() {
      return snapshot;
    },
    async update(transform) {
      updates++;
      const value = transform(snapshot);
      snapshot = { ...snapshot, ...value, revision: `r${updates}` };
      for (const listener of listeners) listener("updated");
      return snapshot;
    },
    onDidChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      this.disposed = true;
    },
  };
}

test("B25 Model Selection 仓储委托共享仓储", async () => {
  const initial = { providerId: "personal-openai", modelId: "gpt-x" };
  const personal = fakePersonalRepository(initial);
  const repository = new NodeModelSelectionConfigRepository({ personalRepository: personal });
  assert.equal(await repository.read(), initial);

  const reasons = [];
  const unsubscribe = repository.onDidChange((reason) => reasons.push(reason));
  const selection = {
    providerId: "personal-openai",
    modelId: "gpt-x",
    options: { reasoningLevel: "high" },
  };
  assert.equal(await repository.saveConfiguredDefault(selection), selection);
  assert.equal(await repository.read(), selection);
  assert.deepEqual(reasons, ["updated"]);
  assert.equal(personal.updateCount, 1);

  unsubscribe();
  unsubscribe();
  assert.equal(personal.listeners.size, 0);

  const second = { providerId: "personal-openai", modelId: "gpt-x" };
  repository.onDidChange(() => {});
  repository.dispose();
  assert.equal(personal.listeners.size, 0, "dispose 取消自己的订阅");
  assert.equal(personal.disposed, false, "不 dispose 共享 Personal Repository");
  await assert.rejects(repository.read(), {
    message: "NodeModelSelectionConfigRepository 已 dispose",
  });
  await assert.rejects(repository.saveConfiguredDefault(second), {
    message: "NodeModelSelectionConfigRepository 已 dispose",
  });
  assert.throws(() => repository.onDidChange(() => {}), {
    message: "NodeModelSelectionConfigRepository 已 dispose",
  });
});

test("B25 真实仓储写入 defaultModelSelection 并持久化", async () => {
  await withTempDir(async (directory) => {
    const filePath = join(directory, "provider_config.json");
    const personal = new NodePersonalProviderConfigRepository({
      filePath,
      pollingIntervalMs: false,
    });
    const repository = new NodeModelSelectionConfigRepository({ personalRepository: personal });
    assert.equal(await repository.read(), undefined);
    const selection = {
      providerId: "personal-openai",
      modelId: "gpt-x",
      options: { reasoningLevel: "high" },
    };
    assert.deepEqual(await repository.saveConfiguredDefault(selection), selection);
    const document = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(document.config.defaultModelSelection, selection);
    assert.deepEqual(await repository.read(), selection);
    assert.equal(await repository.saveConfiguredDefault(undefined), undefined);
    assert.deepEqual(await repository.read(), undefined);
    assert.equal(
      "defaultModelSelection" in JSON.parse(await readFile(filePath, "utf8")).config,
      false,
    );
    repository.dispose();
    personal.dispose();
  });
});
