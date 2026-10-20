// SPDX-License-Identifier: Apache-2.0
// B4 凭据存储：密文格式、损坏留证、读改写与变更通知。
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { importDeep, servicesNode } from "./entry.mjs";
import {
  encPrefix,
  knorviaDataRoot,
  makeTempRoot,
  pathExists,
  readText,
  writeText,
} from "./helpers.mjs";

const { createCredentialService } = servicesNode;
const { createCredentialCipherProvider } = await importDeep(
  "credential/providers/credentialCipherProvider.ts",
);

const credentialsPath = (root) => join(knorviaDataRoot(root), "v2", "credentials.json");
const fixturePath = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

describe("B4 凭据密文格式", () => {
  it("enc:v1 前缀、随机 IV 与可逆解密；非前缀值原样透传", () => {
    const cipher = createCredentialCipherProvider({ env: { KNORVIA_CREDENTIAL_SECRET: "s1" } });
    const first = cipher.encrypt("hello");
    const second = cipher.encrypt("hello");
    assert.ok(first.startsWith(encPrefix));
    assert.notEqual(first, second);
    assert.equal(cipher.decrypt(first), "hello");
    assert.equal(cipher.decrypt(second), "hello");
    assert.equal(cipher.decrypt("plain-value"), "plain-value");
  });

  it("格式/长度/密钥错误都抛同一稳定 code，原因是可读文本", () => {
    const cipher = createCredentialCipherProvider({ env: { KNORVIA_CREDENTIAL_SECRET: "s1" } });
    const other = createCredentialCipherProvider({ env: { KNORVIA_CREDENTIAL_SECRET: "s2" } });
    const sample = cipher.encrypt("value");
    const payload = sample.slice(encPrefix.length);
    const [iv, tag, body] = payload.split(".");

    const cases = [
      ["enc:v1:only-one-part", "密文格式非法"],
      [`enc:v1:${iv}.${tag}`, "密文格式非法"],
      [`enc:v1:${iv}.${tag}.${body}.extra`, "密文格式非法"],
      [`enc:v1:${iv.slice(0, 4)}.${tag}.${body}`, "IV 长度非法"],
      [`enc:v1:${iv}.${tag.slice(0, 4)}.${body}`, "AuthTag 长度非法"],
    ];
    for (const [value, reason] of cases) {
      assert.throws(
        () => cipher.decrypt(value),
        (error) =>
          error.code === "KNORVIA_CREDENTIAL_DECRYPT_FAILED" && error.message.includes(reason),
        value,
      );
    }
    assert.throws(
      () => other.decrypt(sample),
      (error) =>
        error.code === "KNORVIA_CREDENTIAL_DECRYPT_FAILED" &&
        error.message.includes("密钥不匹配或密文已损坏"),
    );
  });
});

describe("B4 凭据服务", () => {
  it("缺失文件读为空；save 加密落盘、load 解密、delete 移除并通知", async (t) => {
    const root = await makeTempRoot(t);
    const mutations = [];
    const service = createCredentialService({
      onDidMutate: (event) => mutations.push(event),
    });

    assert.equal(await service.load("api-key"), null);

    await service.save("api-key", "secret-value");
    assert.deepEqual(mutations, [{ operation: "save", key: "api-key" }]);
    const raw = JSON.parse(await readText(credentialsPath(root)));
    assert.ok(raw["api-key"].startsWith(encPrefix));
    assert.ok(!raw["api-key"].includes("secret-value"));
    assert.equal(await service.load("api-key"), "secret-value");

    await service.delete("api-key");
    assert.deepEqual(mutations, [
      { operation: "save", key: "api-key" },
      { operation: "delete", key: "api-key" },
    ]);
    assert.deepEqual(JSON.parse(await readText(credentialsPath(root))), {});
    assert.equal(await service.load("api-key"), null);
  });

  it("读改写保留其他键；空键被 schema 拒绝", async (t) => {
    const root = await makeTempRoot(t);
    const service = createCredentialService();
    await service.save("a", "1");
    await service.save("b", "2");
    assert.equal(await service.load("a"), "1");
    assert.equal(await service.load("b"), "2");
    assert.deepEqual(Object.keys(JSON.parse(await readText(credentialsPath(root)))).sort(), [
      "a",
      "b",
    ]);
    await assert.rejects(() => service.save("", "x"));
  });

  it("损坏 JSON 拒绝覆盖：抛 corrupt 错误并留下内容摘要备份", async (t) => {
    const root = await makeTempRoot(t);
    const file = credentialsPath(root);
    await writeText(file, "{not json");
    const service = createCredentialService();
    await assert.rejects(
      () => service.save("a", "1"),
      (error) => error.message === `Knorvia Studio credentials are corrupt: ${file}`,
    );
    assert.equal(await readText(file), "{not json");
    const names = await readdir(join(knorviaDataRoot(root), "v2"));
    assert.ok(names.some((name) => /^credentials\.json\.corrupt-[0-9a-f]{24}\.bak$/u.test(name)));
    assert.equal(await pathExists(file), true);
  });
});

describe("B4 凭据存储往返（旧写 → 新读 → 新写 → 旧读）", () => {
  it("旧实现写的 enc:v1 金样能被当前 provider 读回原文；当前写出的密文保持同一线格式", async () => {
    const fixture = JSON.parse(await readFile(fixturePath("credential-enc-v1.json"), "utf8"));
    const cipher = createCredentialCipherProvider({
      env: { KNORVIA_CREDENTIAL_SECRET: fixture.secret },
    });
    // 旧写 → 新读：固定 secret 与固定 IV 的历史密文必须逐字可解。
    for (const sample of fixture.samples) {
      assert.equal(cipher.decrypt(sample.ciphertext), sample.plaintext);
    }
    // 新写 → 旧读：新密文仍是 enc:v1:<iv>.<tag>.<body> 三段 base64url，旧 provider 同 secret 可解。
    for (const sample of fixture.samples) {
      const written = cipher.encrypt(sample.plaintext);
      const parts = written.slice(encPrefix.length).split(".");
      assert.equal(parts.length, 3);
      assert.equal(Buffer.from(parts[0], "base64url").length, 12);
      assert.equal(Buffer.from(parts[1], "base64url").length, 16);
      assert.equal(cipher.decrypt(written), sample.plaintext);
    }
  });

  it("金样落盘为 credentials.json 后 load 可读；save 新值不破坏旧条目", async (t) => {
    const root = await makeTempRoot(t);
    const fixture = JSON.parse(await readFile(fixturePath("credential-enc-v1.json"), "utf8"));
    const file = credentialsPath(root);
    // 旧写：把历史密文直接落盘成旧格式文件。
    const legacy = Object.fromEntries(
      fixture.samples.map((sample, index) => [`legacy-${index}`, sample.ciphertext]),
    );
    await writeText(file, `${JSON.stringify(legacy, null, 2)}\n`);

    const service = createCredentialService({
      cipherProvider: createCredentialCipherProvider({
        env: { KNORVIA_CREDENTIAL_SECRET: fixture.secret },
      }),
    });
    // 新读
    for (const [index, sample] of fixture.samples.entries()) {
      assert.equal(await service.load(`legacy-${index}`), sample.plaintext);
    }
    // 新写
    await service.save("fresh", "brand-new");
    // 旧读：新写入的条目仍能被同一 secret 的 provider 解开，旧条目原样保留。
    const onDisk = JSON.parse(await readText(file));
    for (const [index, sample] of fixture.samples.entries()) {
      assert.equal(onDisk[`legacy-${index}`], sample.ciphertext, "旧条目逐字不变");
    }
    assert.equal(
      createCredentialCipherProvider({
        env: { KNORVIA_CREDENTIAL_SECRET: fixture.secret },
      }).decrypt(onDisk.fresh),
      "brand-new",
    );
  });
});
