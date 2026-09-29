// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { api, ambient, directory, thrown } from "./network-config.fixture.js";

test("CA absence is synchronous undefined", () => {
  assert.equal(api.resolveTlsCaCertFile({}), undefined);
  assert.equal(
    api.loadTlsCaCertificates({ caCertFile: " \t ", env: { KNORVIA_AGENT_CA_CERT: " " } }),
    undefined,
  );
});
test("CA path trim and precedence preserve relative tilde literal", () => {
  assert.equal(
    api.resolveTlsCaCertFile({
      caCertFile: " ./owned/../ca.pem ",
      env: { KNORVIA_AGENT_CA_CERT: "env.pem" },
    }),
    "./owned/../ca.pem",
  );
  assert.equal(
    api.resolveTlsCaCertFile({
      caCertFile: "  ",
      env: { KNORVIA_AGENT_CA_CERT: " ~/literal.pem " },
    }),
    "~/literal.pem",
  );
});
test("CA path helper does not read or test file existence", (t) => {
  const read = t.mock.method(fs, "readFileSync", () => {
    throw new Error("unexpected read");
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  assert.equal(
    api.resolveTlsCaCertFile({ caCertFile: "missing-fixture.pem" }),
    "missing-fixture.pem",
  );
  assert.equal(api.loadTlsCaCertificates({}), undefined);
  assert.equal(read.mock.callCount(), 0);
});
test("CA read returns the native Buffer and exact path without text conversion", (t) => {
  const bytes = Buffer.from([0, 255, 10, 13, 254]);
  const read = t.mock.method(fs, "readFileSync", () => bytes);
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  assert.equal(api.loadTlsCaCertificates({ caCertFile: " relative-owned.pem " }), bytes);
  assert.deepEqual(read.mock.calls[0]?.arguments, ["relative-owned.pem"]);
});
test("CA read throws the native error value without env fallback", (t) => {
  const reason = { owned: "native read error" };
  const read = t.mock.method(fs, "readFileSync", () => {
    throw reason;
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  assert.equal(
    thrown(() =>
      api.loadTlsCaCertificates({
        caCertFile: "explicit.pem",
        env: { KNORVIA_AGENT_CA_CERT: "fallback.pem" },
      }),
    ),
    reason,
  );
  assert.equal(read.mock.callCount(), 1);
  assert.deepEqual(read.mock.calls[0]?.arguments, ["explicit.pem"]);
});
test("real CA bytes are unchanged and reread after owned file changes", async (t) => {
  const dir = await directory(t),
    file = join(dir, "owned.pem"),
    first = Buffer.from([0, 128, 255, 10]);
  await writeFile(file, first);
  const a = api.loadTlsCaCertificates({ caCertFile: file });
  assert.ok(Buffer.isBuffer(a));
  assert.deepEqual(a, first);
  await writeFile(file, "second public fixture");
  assert.deepEqual(
    api.loadTlsCaCertificates({ caCertFile: file }),
    Buffer.from("second public fixture"),
  );
  assert.deepEqual(a, first);
});
test("CA env fallback uses current provided env and never validates certificate syntax", async (t) => {
  const dir = await directory(t),
    file = join(dir, "owned.env.pem"),
    env = { KNORVIA_AGENT_CA_CERT: file };
  await writeFile(file, "arbitrary owned bytes");
  assert.deepEqual(api.loadTlsCaCertificates({ env }), Buffer.from("arbitrary owned bytes"));
  env.KNORVIA_AGENT_CA_CERT = "";
  assert.equal(api.loadTlsCaCertificates({ env }), undefined);
});
test("missing explicit CA produces ENOENT synchronously despite valid fallback", async (t) => {
  const dir = await directory(t),
    fallback = join(dir, "fallback.pem"),
    absent = join(dir, "absent.pem");
  await writeFile(fallback, "owned public fallback");
  const error = thrown(() =>
    api.loadTlsCaCertificates({ caCertFile: absent, env: { KNORVIA_AGENT_CA_CERT: fallback } }),
  );
  assert.ok(error instanceof Error);
  assert.equal((error as NodeJS.ErrnoException).code, "ENOENT");
  await writeFile(absent, "later public file");
  assert.deepEqual(
    api.loadTlsCaCertificates({ caCertFile: absent }),
    Buffer.from("later public file"),
  );
});
test("helper does not consult ambient CA environment", (t) => {
  ambient(t, "KNORVIA_AGENT_CA_CERT", "owned-ambient-missing.pem");
  assert.equal(api.resolveTlsCaCertFile({}), undefined);
  assert.equal(api.loadTlsCaCertificates({}), undefined);
});
