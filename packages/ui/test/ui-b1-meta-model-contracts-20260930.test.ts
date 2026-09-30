// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  encodeCustomModelValue as sharedEncode,
  decodeCustomModelValue as sharedDecode,
  type KnorviaTaskMeta,
} from "@knorvia/shared";

function target(name: string) {
  return process.env.KNORVIA_UI_B1_LIB_DIR
    ? pathToFileURL(resolve(process.env.KNORVIA_UI_B1_LIB_DIR, `${name}.ts`)).href
    : new URL(`../src/lib/${name}.js`, import.meta.url).href;
}
const { mergeTaskWithOptimisticMeta: merge, mergeTaskMetaCandidates: mergeAll } = await import(
  target("taskMetaMerge")
);
const { encodeCustomModelValue: encode, decodeCustomModelValue: decode } = await import(
  target("customModelValue")
);

function task(fields: Partial<KnorviaTaskMeta> = {}): KnorviaTaskMeta {
  return {
    taskId: "fixture",
    traceId: "fixture-trace" as KnorviaTaskMeta["traceId"],
    title: "Title",
    workspacePath: "/fixture",
    createdAt: 1,
    updatedAt: 1,
    mode: "default" as KnorviaTaskMeta["mode"],
    ...fields,
  };
}

test("B1 task metadata: latest time wins, same time uses raw optimistic title length", () => {
  const persisted = task({ title: "Server", updatedAt: 10 });
  assert.equal(
    merge(persisted, task({ title: "Longer optimistic", updatedAt: 9 })).title,
    "Server",
  );
  assert.equal(merge(persisted, task({ title: "Short", updatedAt: 11 })).title, "Short");
  assert.equal(
    merge(persisted, task({ title: "Longer optimistic", updatedAt: 10 })).title,
    "Longer optimistic",
  );
  assert.equal(merge(persisted, task({ title: "Equal!", updatedAt: 10 })).title, "Server");
  assert.equal(merge(task({ title: "A" }), task({ title: " B " })).title, " B ");
});

test("B1 task metadata: placeholders cannot erase a real optimistic title", () => {
  for (const title of ["", "  ", "New session", " NEW SESSION "]) {
    assert.equal(
      merge(task({ title, updatedAt: 20 }), task({ title: "Real title", updatedAt: 10 })).title,
      "Real title",
    );
    assert.equal(
      merge(task({ title: "Real title", updatedAt: 10 }), task({ title, updatedAt: 20 })).title,
      "Real title",
    );
  }
  assert.equal(
    merge(
      task({ title: "Generated title", updatedAt: 20 }),
      task({ title: "Optimistic title", updatedAt: 10 }),
    ).title,
    "Generated title",
  );
});

test("B1 task metadata: manual title survives both base orientations", () => {
  const manual = task({ title: "User title", updatedAt: 10, titleOverridden: true });
  const generated = task({ title: "Generated title", updatedAt: 20, titleOverridden: false });
  assert.equal(merge(generated, manual).title, "User title");
  assert.equal(merge(manual, generated).title, "User title");
  assert.equal(merge(generated, manual).titleOverridden, true);
  assert.equal(
    merge(task({ title: "Newer manual", updatedAt: 30, titleOverridden: true }), manual).title,
    "Newer manual",
  );
  assert.equal(
    merge(task({ titleOverridden: false, updatedAt: 30 }), task({})).titleOverridden,
    false,
  );
});

test("B1 task metadata: nullish fallback preserves status, model and shared references", () => {
  const summary = {
    fileCount: 1,
    additions: 2,
    deletions: 3,
  } as unknown as KnorviaTaskMeta["changeSummary"];
  const older = task({
    updatedAt: 1,
    model: "Model",
    provider: "knorvia",
    status: "running",
    changeSummary: summary,
  });
  const newer = task({ updatedAt: 2 });
  const result = merge(older, newer);
  assert.equal(result.model, "Model");
  assert.equal(result.provider, "knorvia");
  assert.equal(result.status, "running");
  assert.equal(result.changeSummary, summary);
  assert.equal(merge(older, task({ updatedAt: 2, model: "" })).model, "");
});

test("B1 task metadata: own unreadAt clears even when optimistic metadata is older", () => {
  const persisted = task({ updatedAt: 20, unreadAt: 50 });
  const omitted = task({ updatedAt: 10 });
  assert.equal(merge(persisted, omitted).unreadAt, 50);
  assert.equal(merge(persisted, task({ updatedAt: 10, unreadAt: undefined })).unreadAt, undefined);
  assert.equal(merge(persisted, task({ updatedAt: 10, unreadAt: 0 })).unreadAt, 0);
  const inherited = Object.assign(Object.create({ unreadAt: 100 }), omitted);
  assert.equal(merge(persisted, inherited).unreadAt, 50);
  inherited.updatedAt = 30;
  assert.equal(merge(persisted, inherited).unreadAt, 100);
});

test("B1 task metadata: only base unknown fields copy, including enumerable symbols", () => {
  const marker = Symbol("marker");
  const base = Object.freeze(
    Object.assign(task({ updatedAt: 20, target: null }), {
      futureField: "base",
      [marker]: "symbol",
    }),
  );
  const fallback = Object.freeze(
    Object.assign(task({ updatedAt: 10 }), { onlyFallback: "excluded", futureField: "fallback" }),
  );
  const result = merge(base, fallback);
  assert.equal(result.futureField, "base");
  assert.equal(result.onlyFallback, undefined);
  assert.equal(result[marker], "symbol");
  assert.equal(result.target, null);
  assert.notEqual(result, base);
  assert.deepEqual(Object.keys(merge(task(), task())).slice(-6), [
    "changeSummary",
    "model",
    "provider",
    "titleOverridden",
    "status",
    "unreadAt",
  ]);
});

test("B1 task metadata: candidate order preserves accumulator ownership and references", () => {
  const first = task({ title: "First", unreadAt: undefined });
  const second = task({ title: "Other", unreadAt: 20 });
  assert.equal(mergeAll(null, undefined), undefined);
  assert.equal(mergeAll(null, first, undefined), first);
  assert.equal(mergeAll(first, second).title, "Other");
  assert.equal(mergeAll(first, second).unreadAt, undefined);
  assert.equal(mergeAll(second, first).unreadAt, 20);
});

test("B1 task metadata: no implicit cross-workspace or task identity filtering", () => {
  const base = task({ updatedAt: 3, workspaceIdentity: "remote-a", taskId: "a" });
  const fallback = task({
    updatedAt: 1,
    workspaceIdentity: "remote-b",
    taskId: "b",
    model: "Fallback",
  });
  assert.equal(merge(base, fallback).workspaceIdentity, "remote-a");
  assert.equal(merge(base, fallback).taskId, "a");
  assert.equal(merge(base, fallback).model, "Fallback");
});

test("B1 task metadata: malformed title failure remains public", () => {
  assert.throws(() => merge(task(), task({ title: undefined })), TypeError);
});

test("B1 custom model: adapter preserves the shared codec for all boundary fixtures", () => {
  for (const provider of ["", "provider", "builtin:glm", "a:b", "路径 🌙", "%bad", "p/q?"]) {
    for (const model of [undefined, "", "model", "a:b:c", "模型 🌙", "%", " m "]) {
      const encoded = encode(provider, model);
      assert.equal(encoded, sharedEncode(provider, model));
      assert.deepEqual(decode(encoded), sharedDecode(encoded));
    }
  }
  for (const value of [
    "",
    "ordinary",
    "CUSTOM:p:m",
    "custom:",
    "custom:p:",
    "custom:%ZZ:%E0",
    "custom:builtin:glm:model:extra",
    "custom:p:m:extra",
  ]) {
    assert.deepEqual(decode(value), sharedDecode(value));
  }
  assert.deepEqual(decode("custom:provider"), { providerId: "provider" });
  assert.deepEqual(decode("custom:provider:"), { providerId: "provider", modelName: "" });
  assert.deepEqual(decode("custom:builtin:glm:model:extra"), {
    providerId: "builtin:glm",
    modelName: "model:extra",
  });
  assert.equal(encode("provider", ""), "custom:provider");
});

test("B1 custom model: shared public failure boundaries are retained", () => {
  assert.throws(() => encode("\uD800"), URIError);
  assert.throws(() => decode(undefined), TypeError);
});
