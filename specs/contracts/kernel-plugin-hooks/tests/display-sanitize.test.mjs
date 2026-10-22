// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// display-sanitize 的契约测试（B4 的 4 条规格）。
//
// 重点：**只脱敏秘密值，其余文本不变** —— 过度脱敏会让命令不可读，
// 而不脱敏会让凭据泄露到 UI。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/display-sanitize.ts");
}

const REDACTED = "••••";

test("B4.1 空串原样返回", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  assert.equal(sanitizeHookDisplayText(""), "");
});

test("B4.2 URL 用户信息：只替换 user:pass，host 与路径保留", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const result = sanitizeHookDisplayText("https://alice:s3cret@example.com/path/to/x");
  assert.ok(result.includes(REDACTED), "应脱敏");
  assert.ok(result.includes("example.com"), "host 必须保留");
  assert.ok(result.includes("/path/to/x"), "路径必须保留");
  assert.equal(result.includes("s3cret"), false, "密码不能出现");
});

test("B4.2 authorization: bearer <token>", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const result = sanitizeHookDisplayText(
    "curl -H 'authorization: bearer abc123xyz' https://api.example.com",
  );
  assert.equal(result.includes("abc123xyz"), false, "token 不能出现");
  assert.ok(result.includes("bearer"), "scheme 词保留");
  assert.ok(result.includes("https://api.example.com"), "普通 URL 保留");
});

test("B4.2 authorization: basic <token>", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const result = sanitizeHookDisplayText("authorization: Basic dXNlcjpwYXNz");
  assert.equal(result.includes("dXNlcjpwYXNz"), false);
});

test("B4.2 authorization = <token>（等号形态）", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const result = sanitizeHookDisplayText("authorization = sk-live-999");
  assert.equal(result.includes("sk-live-999"), false);
});

test("B4.2 查询串中的敏感键值", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const result = sanitizeHookDisplayText("https://api.example.com/v1?api_key=abc123&page=2");
  assert.equal(result.includes("abc123"), false, "api_key 值不能出现");
  assert.ok(result.includes("page=2"), "非敏感参数保留");
  assert.ok(result.includes("https://api.example.com/v1"), "URL 主体保留");
});

test("B4.2 查询串中的 authorization", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const result = sanitizeHookDisplayText("https://x.com/a?authorization=tok123");
  assert.equal(result.includes("tok123"), false);
});

test("B4.2 --敏感键 值 形态", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const result = sanitizeHookDisplayText("deploy --api-key sk-123 --region us-east-1");
  assert.equal(result.includes("sk-123"), false, "api-key 值不能出现");
  assert.ok(result.includes("--region us-east-1"), "非敏感选项保留");
});

test("B4.2 敏感键[:=]值 形态（无引号）", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const result = sanitizeHookDisplayText("password=hunter2 user=alice");
  assert.equal(result.includes("hunter2"), false);
  assert.ok(result.includes("user=alice"), "非敏感键值保留");
});

test("B4.2 敏感键[:=]值 形态（带引号）", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const result = sanitizeHookDisplayText('password="my secret pass" other=ok');
  assert.equal(result.includes("my secret pass"), false);
  assert.ok(result.includes("other=ok"));
});

test("B4.3 敏感键大小写不敏感", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  for (const key of ["PASSWORD", "Password", "API_KEY", "Api_Key"]) {
    const result = sanitizeHookDisplayText(`${key}=secretvalue`);
    assert.equal(result.includes("secretvalue"), false, `${key} 应脱敏`);
  }
});

test("B4.3 前缀/后缀变体（my-api-key / api_key_backup）", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const first = sanitizeHookDisplayText("my-api-key=abc");
  assert.equal(first.includes("abc"), false, "my-api-key 应脱敏");

  const second = sanitizeHookDisplayText("api_key_backup=xyz");
  assert.equal(second.includes("xyz"), false, "api_key_backup 应脱敏");
});

test("B4.3 覆盖 7 个敏感键", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const keys = [
    "access_token",
    "api_key",
    "credential",
    "password",
    "private_key",
    "secret",
    "token",
  ];
  for (const key of keys) {
    const result = sanitizeHookDisplayText(`${key}=value123`);
    assert.equal(result.includes("value123"), false, `${key} 应脱敏`);
  }
});

test("B4.4 非秘密文本不被改写（普通命令）", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const plain = "npm run build --if-present";
  assert.equal(sanitizeHookDisplayText(plain), plain);
});

test("B4.4 非秘密文本不被改写（URL 的 host 与路径）", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const url = "https://api.example.com/v2/users/123?page=2&limit=10";
  assert.equal(sanitizeHookDisplayText(url), url);
});

test("B4.4 非秘密文本不被改写（普通参数）", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const args = "deploy --region us-east-1 --replicas 3 --tag v1.2.3";
  assert.equal(sanitizeHookDisplayText(args), args);
});

test("B4 幂等：脱敏两次结果相同", async () => {
  const { sanitizeHookDisplayText } = await loadPlugin();
  const once = sanitizeHookDisplayText("password=hunter2 api_key=abc");
  const twice = sanitizeHookDisplayText(once);
  assert.equal(twice, once, "已脱敏的文本再脱敏应不变");
});

test("isSensitiveKey：前后缀变体识别", async () => {
  const { isSensitiveKey } = await loadPlugin();
  assert.equal(isSensitiveKey("password"), true);
  assert.equal(isSensitiveKey("my-api-key"), true);
  assert.equal(isSensitiveKey("api_key_backup"), true);
  assert.equal(isSensitiveKey("TOKEN"), true);
  assert.equal(isSensitiveKey("region"), false);
  assert.equal(isSensitiveKey("page"), false);
});
