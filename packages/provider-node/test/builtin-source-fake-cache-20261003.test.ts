import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { test } from "node:test";
import { ModelConfigRules, ProviderConfigMap, ProviderTemplateMap } from "@knorvia/provider";
import type { KnorviaBuiltinRelease } from "../src/builtin-release.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function flush() {
  for (let turn = 0; turn < 40; turn++) await Promise.resolve();
}

test("synthetic release ports preserve trusted cache selection, writes, live observers and disposal phases", async (t) => {
  const files = new Map<string, string>();
  const readErrors = new Map<string, unknown>();
  const releases = new Map<string, KnorviaBuiltinRelease>();
  const tags = new WeakMap<KnorviaBuiltinRelease, string>();
  const writes: { path: string; text: string }[] = [];
  const reads: string[] = [];
  const folders: string[] = [];
  let mkdirError: unknown;
  let lockError: unknown;
  let writeError: unknown;
  let writeGate: ReturnType<typeof deferred<void>> | undefined;
  const tails = new Map<string, Promise<void>>();
  function release(revision: number, tag: string): KnorviaBuiltinRelease {
    const value: KnorviaBuiltinRelease = {
      schemaVersion: 1,
      revision,
      config: {
        providers: ProviderConfigMap.empty(),
        providerTemplates: ProviderTemplateMap.empty(),
        modelConfigRules: ModelConfigRules.empty(),
      },
    };
    tags.set(value, tag);
    releases.set(`${revision}:${tag}`, value);
    return value;
  }
  function encode(value: KnorviaBuiltinRelease) {
    return { schemaVersion: 1, revision: value.revision, syntheticTag: tags.get(value)! };
  }
  function serialize(value: KnorviaBuiltinRelease) {
    return JSON.stringify(encode(value));
  }
  function put(path: string, value: KnorviaBuiltinRelease) {
    files.set(path, JSON.stringify(encode(value)));
  }
  type Watch = {
    callback: (event: string, name: string | Buffer | null) => void;
    error?: () => void;
    closes: number;
    closeError?: Error;
  };
  const watchers: Watch[] = [];
  t.mock.module("node:fs", {
    namedExports: {
      watch(path: string, callback: Watch["callback"]) {
        folders.push(`watch:${path}`);
        const watcher: Watch = { callback, closes: 0 };
        watchers.push(watcher);
        return {
          on(event: string, listener: () => void) {
            assert.equal(event, "error");
            watcher.error = listener;
            return this;
          },
          close() {
            watcher.closes++;
            if (watcher.closeError) throw watcher.closeError;
          },
        };
      },
    },
  });
  t.mock.module("node:fs/promises", {
    namedExports: {
      async mkdir(path: string, options: unknown) {
        folders.push(path);
        assert.deepEqual(options, { recursive: true });
        if (mkdirError) throw mkdirError;
      },
      async readFile(path: string, encoding: string) {
        reads.push(path);
        assert.equal(encoding, "utf8");
        if (readErrors.has(path)) throw readErrors.get(path);
        if (!files.has(path))
          throw Object.assign(new Error("synthetic missing"), { code: "ENOENT" });
        return files.get(path)!;
      },
    },
  });
  t.mock.module("@knorvia/shared/node", {
    namedExports: {
      async atomicWritePrivateTextFile(path: string, text: string) {
        writes.push({ path, text });
        if (writeError) throw writeError;
        if (writeGate) await writeGate.promise;
        files.set(path, text);
      },
      withFileLock<T>(path: string, action: () => Promise<T>) {
        if (lockError) return Promise.reject(lockError);
        const pending = (tails.get(path) ?? Promise.resolve()).then(action);
        tails.set(
          path,
          pending.then(
            () => {},
            () => {},
          ),
        );
        return pending;
      },
    },
  });
  t.mock.module(new URL("../src/builtin-release.ts", import.meta.url).href, {
    namedExports: {
      encodeKnorviaBuiltinRelease: encode,
      serializeKnorviaBuiltinRelease: serialize,
      decodeKnorviaBuiltinRelease(input: { revision: number; syntheticTag: string }) {
        const value = releases.get(`${input.revision}:${input.syntheticTag}`);
        if (!value) throw new Error("synthetic decode invalid");
        return value;
      },
    },
  });
  const {
    NodeKnorviaBuiltinProviderConfigSource: Source,
    createNodeKnorviaBuiltinProviderConfigSource: create,
  } = await import("../src/builtin-provider-config-source.js");
  assert.throws(() => create({ bundledFilePath: " " }), {
    message: "Knorvia Studio Built-in bundledFilePath 不能为空",
  });
  const bundle = release(1, "bundle"),
    active = release(2, "active"),
    newer = release(3, "newer");
  put("synthetic/bundle", bundle);
  put("synthetic/active", active);
  const options = {
    bundledFilePath: " synthetic/bundle ",
    activeFilePath: " synthetic/active ",
    watch: false,
  };
  const source = create(options);
  options.activeFilePath = "synthetic/mutated";
  assert.equal(source.activeFilePath, "synthetic/active");
  assert.deepEqual(Object.keys(source), []);
  const snapshot = await source.read();
  assert.equal(
    snapshot.revision,
    `builtin:2:${createHash("sha256").update(resolve("synthetic/active")).digest("hex")}`,
  );
  assert.equal(snapshot.providers, active.config.providers);
  assert.equal(snapshot.providerTemplates, active.config.providerTemplates);
  assert.equal(snapshot.models, active.config.modelConfigRules);
  assert.deepEqual(Object.keys(snapshot), ["revision", "providers", "providerTemplates", "models"]);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(writes.length, 0);
  assert.equal(watchers.length, 0);
  put("synthetic/other", active);
  const other = new Source({
    bundledFilePath: "synthetic/bundle",
    activeFilePath: "synthetic/other",
    watch: false,
  });
  assert.notEqual((await other.read()).revision, snapshot.revision);
  other.dispose();
  assert.equal(await source.applyRemoteRelease(bundle), "stale");
  assert.equal(await source.applyRemoteRelease(active), "unchanged");
  await assert.rejects(source.applyRemoteRelease(release(2, "conflict")), {
    message: "Knorvia Studio Built-in 相同 revision 2 对应不同内容",
  });
  assert.equal(writes.length, 0);
  const events: string[] = [];
  const late = (reason: string) => events.push(`late:${reason}`);
  let removeSecond = () => {};
  const first = (reason: string) => {
    events.push(`first:${reason}`);
    removeSecond();
    source.onDidChange(late);
  };
  source.onDidChange(first);
  source.onDidChange(first);
  removeSecond = source.onDidChange((reason) => events.push(`second:${reason}`));
  assert.equal(await source.applyRemoteRelease(newer), "updated");
  assert.deepEqual(events, ["first:remote-updated", "late:remote-updated"]);
  assert.deepEqual(writes.at(-1), {
    path: "synthetic/active",
    text: JSON.stringify(encode(newer), null, 2),
  });
  assert.equal(files.get("synthetic/active")!.endsWith("\n"), false);
  const observerError = new Error("synthetic observer");
  const unsubscribe = source.onDidChange(() => {
    throw observerError;
  });
  const fourth = release(4, "fourth");
  await assert.rejects(source.applyRemoteRelease(fourth), (error) => error === observerError);
  assert.equal(files.get("synthetic/active"), JSON.stringify(encode(fourth), null, 2));
  unsubscribe();

  const trusted = release(5, "trusted"),
    conflicting = release(5, "untrusted");
  put("synthetic/bundle", trusted);
  put("synthetic/active", conflicting);
  assert.equal((await source.read()).providers, trusted.config.providers);
  assert.equal(files.get("synthetic/active"), JSON.stringify(encode(trusted), null, 2));
  files.set("synthetic/active", "invalid synthetic JSON");
  assert.equal((await source.read()).providers, trusted.config.providers);
  const cacheFailure = new Error("synthetic cache unavailable");
  mkdirError = cacheFailure;
  const before = reads.length;
  assert.equal((await source.read()).providers, trusted.config.providers);
  assert.deepEqual(reads.slice(before), ["synthetic/bundle"]);
  await assert.rejects(source.applyRemoteRelease(newer), (error) => error === cacheFailure);
  mkdirError = undefined;
  lockError = cacheFailure;
  assert.equal((await source.read()).providers, trusted.config.providers);
  lockError = undefined;
  files.delete("synthetic/active");
  writeError = cacheFailure;
  assert.equal((await source.read()).providers, trusted.config.providers);
  writeError = undefined;
  const bundleError = new Error("synthetic bundle read"),
    activeError = new Error("synthetic active read");
  readErrors.set("synthetic/bundle", bundleError);
  readErrors.set("synthetic/active", activeError);
  await assert.rejects(source.applyRemoteRelease(newer), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.message, "Bundled 与 Active Knorvia Studio Built-in Release 均不可用");
    assert.deepEqual(error.errors, [bundleError, activeError]);
    return true;
  });
  await assert.rejects(source.read(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [bundleError]);
    return true;
  });
  readErrors.clear();
  put("synthetic/bundle", bundle);
  put("synthetic/active", active);
  source.dispose();
  await assert.rejects(source.read(), {
    message: "NodeKnorviaBuiltinProviderConfigSource 已 dispose",
  });
  await assert.rejects(source.applyRemoteRelease(newer), {
    message: "NodeKnorviaBuiltinProviderConfigSource 已 dispose",
  });
  assert.throws(() => source.onDidChange(() => {}), {
    message: "NodeKnorviaBuiltinProviderConfigSource 已 dispose",
  });
  assert.equal(source.activeFilePath, "synthetic/active");

  const watched = new Source({
    bundledFilePath: "synthetic/bundle",
    activeFilePath: "synthetic/watched",
  });
  const watchedEvents: string[] = [];
  watched.onDidChange((reason) => watchedEvents.push(reason));
  await watched.read();
  const watcher = watchers.at(-1)!;
  const beforeOther = reads.length;
  watcher.callback("rename", "other");
  await flush();
  assert.equal(reads.length, beforeOther);
  put("synthetic/watched", newer);
  watcher.callback("rename", null);
  watcher.callback("change", Buffer.from("watched"));
  await flush();
  assert.deepEqual(watchedEvents, ["file-changed"]);
  watcher.error!();
  assert.deepEqual(watchedEvents, ["file-changed", "watch-error"]);
  watched.dispose();
  watched.dispose();
  assert.equal(watcher.closes, 1);
  watcher.callback("change", null);
  watcher.error!();
  await flush();
  assert.deepEqual(watchedEvents, ["file-changed", "watch-error"]);

  const lateSource = new Source({
    bundledFilePath: "synthetic/bundle",
    activeFilePath: "synthetic/late",
    watch: false,
  });
  put("synthetic/late", active);
  await lateSource.read();
  const lateEvents: string[] = [];
  lateSource.onDidChange((reason) => lateEvents.push(reason));
  writeGate = deferred<void>();
  const pending = lateSource.applyRemoteRelease(newer);
  await flush();
  assert.equal(writes.at(-1)!.path, "synthetic/late");
  lateSource.dispose();
  writeGate.resolve();
  assert.equal(await pending, "updated");
  assert.equal(files.get("synthetic/late"), JSON.stringify(encode(newer), null, 2));
  assert.deepEqual(lateEvents, []);
  writeGate = undefined;

  // 单候选选择不读取 revision 与自身比较；保留解码端口的 getter 可观察顺序。
  let revisionReads = 0;
  const getterRelease: KnorviaBuiltinRelease = {
    ...bundle,
    get revision() {
      revisionReads++;
      return 1;
    },
  };
  tags.set(getterRelease, "getter");
  releases.set("1:getter", getterRelease);
  put("synthetic/getter", getterRelease);
  revisionReads = 0;
  const getterSource = new Source({ bundledFilePath: "synthetic/getter", watch: false });
  await getterSource.read();
  assert.equal(revisionReads, 3);
  getterSource.dispose();

  const closeSource = new Source({ bundledFilePath: "synthetic/bundle" });
  const beforeSame = reads.length,
    beforeWrites = writes.length;
  await closeSource.read();
  assert.deepEqual(reads.slice(beforeSame), ["synthetic/bundle"]);
  assert.equal(writes.length, beforeWrites);
  const closeWatcher = watchers.at(-1)!;
  closeWatcher.closeError = new Error("synthetic close");
  assert.throws(
    () => closeSource.dispose(),
    (error) => error === closeWatcher.closeError,
  );
  closeSource.dispose();
  assert.equal(closeWatcher.closes, 1);
  await assert.rejects(closeSource.read(), {
    message: "NodeKnorviaBuiltinProviderConfigSource 已 dispose",
  });
});
