import assert from "node:assert/strict";
import { test } from "node:test";
import { redactDiagnosticText, redactDiagnosticValue } from "../src/diagnosticSecrets.js";

test("diagnostic text hides common credentials and private-key blocks", () => {
  const samples = [
    "apiKey=sk-abcdefghijklmnopqrstuvwxyz123456",
    "Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz123456",
    "https://local.example.test/path?token=fake-query-secret",
    "-----BEGIN OPENSSH PRIVATE KEY-----\nFAKE_PRIVATE_MATERIAL\n-----END OPENSSH PRIVATE KEY-----",
  ];
  const result = redactDiagnosticText(samples.join("\n"));
  for (const marker of [
    "sk-abcdefghijklmnopqrstuvwxyz",
    "ghp_abcdef",
    "fake-query-secret",
    "FAKE_PRIVATE_MATERIAL",
  ]) {
    assert.equal(result.includes(marker), false);
  }
  assert.match(result, /local\.example\.test/);
});

test("diagnostic objects redact nested keys, error causes and cycles without changing the source", () => {
  const input: Record<string, unknown> = {
    operation: "scan",
    authToken: "opaque-value",
    nested: { sshPassword: "fake-password", detail: "Bearer fake-bearer-value" },
    failure: new Error("API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456"),
  };
  input.self = input;
  const safe = JSON.stringify(redactDiagnosticValue(input));
  assert.match(safe, /scan/);
  for (const marker of [
    "opaque-value",
    "fake-password",
    "fake-bearer-value",
    "sk-abcdefghijklmnopqrstuvwxyz",
  ]) {
    assert.equal(safe.includes(marker), false);
  }
  assert.equal(input.authToken, "opaque-value");
});
