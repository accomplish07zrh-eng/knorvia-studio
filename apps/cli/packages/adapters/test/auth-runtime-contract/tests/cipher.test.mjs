// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { createDecipheriv, createHash } from "node:crypto";
import test from "node:test";
import { authModule, publicFacts } from "../harness/test-context.mjs";

function envelopeParts(value) {
  assert.ok(value.startsWith("enc:v1:"));
  const [iv, tag, ciphertext, ...extra] = value.slice("enc:v1:".length).split(".");
  assert.deepEqual(extra, []);
  return { ciphertext, iv, tag };
}

function decryptIndependently(value, secret) {
  const { ciphertext, iv, tag } = envelopeParts(value);
  const key = createHash("sha256").update(secret, "utf8").digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function thrownBy(operation) {
  try {
    operation();
  } catch (error) {
    return error;
  }
  assert.fail("operation did not throw");
}

test(
  "A-CIP-01 AES-GCM envelope is exact, random, and Unicode-safe",
  { timeout: 5000 },
  async () => {
    const { createKnorviaCredentialCipher } = await authModule();
    const cipher = createKnorviaCredentialCipher({
      env: { KNORVIA_CREDENTIAL_SECRET: " fixed secret " },
    });
    const plaintext = "Knorvia 🔐 雪\u0000line";
    const first = cipher.encrypt(plaintext);
    const second = cipher.encrypt(plaintext);
    assert.notEqual(first, second);
    for (const encoded of [first, second]) {
      const parts = envelopeParts(encoded);
      assert.match(parts.iv, /^[A-Za-z0-9_-]+$/);
      assert.match(parts.tag, /^[A-Za-z0-9_-]+$/);
      assert.match(parts.ciphertext, /^[A-Za-z0-9_-]+$/);
      assert.equal(parts.iv.includes("="), false);
      assert.equal(parts.tag.includes("="), false);
      assert.equal(parts.ciphertext.includes("="), false);
      assert.equal(Buffer.from(parts.iv, "base64url").length, 12);
      assert.equal(Buffer.from(parts.tag, "base64url").length, 16);
      assert.equal(cipher.decrypt(encoded), plaintext);
      assert.equal(decryptIndependently(encoded, "fixed secret"), plaintext);
    }
  },
);

test(
  "A-CIP-02 secret selection trims, falls back exactly, and snapshots options",
  { timeout: 5000 },
  async () => {
    const { createKnorviaCredentialCipher } = await authModule();
    const facts = await publicFacts();
    const configured = createKnorviaCredentialCipher({
      env: { KNORVIA_CREDENTIAL_SECRET: "  complete secret  " },
    });
    const encoded = configured.encrypt("value");
    assert.equal(decryptIndependently(encoded, "complete secret"), "value");
    assert.equal(
      createKnorviaCredentialCipher({
        env: { KNORVIA_CREDENTIAL_SECRET: "complete secret" },
      }).decrypt(encoded),
      "value",
    );
    const mismatch = thrownBy(() =>
      createKnorviaCredentialCipher({ env: { KNORVIA_CREDENTIAL_SECRET: "different" } }).decrypt(
        encoded,
      ),
    );
    assert.equal(mismatch.message, facts.cipher.errors.authentication);
    assert.ok(mismatch.cause instanceof Error);

    const originalProcessSecret = process.env.KNORVIA_CREDENTIAL_SECRET;
    process.env.KNORVIA_CREDENTIAL_SECRET = "must-not-merge";
    try {
      const fallbackSecret = `${facts.cipher.fallbackPrefix}:linux:${process.env.KNORVIA_TEST_FAKE_HOME}:fixture-user`;
      const fromEmptyRecord = createKnorviaCredentialCipher({ env: {} }).encrypt("fallback");
      const fromWhitespace = createKnorviaCredentialCipher({
        env: { KNORVIA_CREDENTIAL_SECRET: " \t " },
      }).encrypt("fallback");
      assert.equal(decryptIndependently(fromEmptyRecord, fallbackSecret), "fallback");
      assert.equal(decryptIndependently(fromWhitespace, fallbackSecret), "fallback");
    } finally {
      if (originalProcessSecret === undefined) delete process.env.KNORVIA_CREDENTIAL_SECRET;
      else process.env.KNORVIA_CREDENTIAL_SECRET = originalProcessSecret;
    }

    process.env.KNORVIA_TEST_FAKE_USERINFO_ERROR = "1";
    try {
      const unknown = createKnorviaCredentialCipher({ env: {} }).encrypt("unknown-user");
      const secret = `${facts.cipher.fallbackPrefix}:linux:${process.env.KNORVIA_TEST_FAKE_HOME}:unknown`;
      assert.equal(decryptIndependently(unknown, secret), "unknown-user");
    } finally {
      delete process.env.KNORVIA_TEST_FAKE_USERINFO_ERROR;
    }
    process.env.KNORVIA_TEST_FAKE_USERNAME = "";
    try {
      const empty = createKnorviaCredentialCipher({ env: {} }).encrypt("empty-user");
      const secret = `${facts.cipher.fallbackPrefix}:linux:${process.env.KNORVIA_TEST_FAKE_HOME}:`;
      assert.equal(decryptIndependently(empty, secret), "empty-user");
    } finally {
      delete process.env.KNORVIA_TEST_FAKE_USERNAME;
    }
  },
);

test(
  "A-CIP-03 prefix detection is lexical and plaintext is identity",
  { timeout: 5000 },
  async () => {
    const { createKnorviaCredentialCipher, isEncryptedKnorviaCredentialValue } = await authModule();
    const cipher = createKnorviaCredentialCipher({ env: { KNORVIA_CREDENTIAL_SECRET: "fixture" } });
    for (const value of ["", "plain", "ENC:v1:a.b.c", " enc:v1:a.b.c"]) {
      assert.equal(isEncryptedKnorviaCredentialValue(value), false);
      assert.equal(cipher.decrypt(value), value);
    }
    assert.equal(isEncryptedKnorviaCredentialValue("enc:v1:not-valid"), true);
  },
);

test(
  "A-CIP-04 decrypt branches preserve exact messages and cause policy",
  { timeout: 5000 },
  async () => {
    const { createKnorviaCredentialCipher } = await authModule();
    const facts = await publicFacts();
    const cipher = createKnorviaCredentialCipher({ env: { KNORVIA_CREDENTIAL_SECRET: "fixture" } });
    const iv = Buffer.alloc(12, 1).toString("base64url");
    const tag = Buffer.alloc(16, 2).toString("base64url");
    const invalid = [
      ["enc:v1:a.b", facts.cipher.errors.format],
      ["enc:v1:a..b", facts.cipher.errors.format],
      [`enc:v1:${Buffer.alloc(11).toString("base64url")}.${tag}.YQ`, facts.cipher.errors.ivLength],
      [`enc:v1:*.${tag}.YQ`, facts.cipher.errors.ivLength],
      [`enc:v1:${iv}.${Buffer.alloc(15).toString("base64url")}.YQ`, facts.cipher.errors.tagLength],
    ];
    for (const [value, message] of invalid) {
      const error = thrownBy(() => cipher.decrypt(value));
      assert.equal(error.message, message);
      assert.equal(Object.hasOwn(error, "cause"), false);
    }
    const valid = cipher.encrypt("corrupt me");
    const parts = envelopeParts(valid);
    const damaged = Buffer.from(parts.ciphertext, "base64url");
    damaged[0] ^= 0xff;
    for (const value of [
      `enc:v1:${parts.iv}.${parts.tag}.${damaged.toString("base64url")}`,
      createKnorviaCredentialCipher({ env: { KNORVIA_CREDENTIAL_SECRET: "other" } }).encrypt(
        "value",
      ),
    ]) {
      const error = thrownBy(() => cipher.decrypt(value));
      assert.equal(error.message, facts.cipher.errors.authentication);
      assert.ok(error.cause instanceof Error);
    }
  },
);

test("A-CIP-05 empty plaintext encrypts but cannot be decrypted", { timeout: 5000 }, async () => {
  const { createKnorviaCredentialCipher } = await authModule();
  const facts = await publicFacts();
  const cipher = createKnorviaCredentialCipher({ env: { KNORVIA_CREDENTIAL_SECRET: "fixture" } });
  const value = cipher.encrypt("");
  const parts = value.slice(facts.cipher.prefix.length).split(".");
  assert.equal(parts.length, 3);
  assert.equal(parts[2], "");
  const error = thrownBy(() => cipher.decrypt(value));
  assert.equal(error.message, facts.cipher.errors.format);
  assert.equal(Object.hasOwn(error, "cause"), false);
});
