// SPDX-License-Identifier: Apache-2.0
// shared-04 合同测试：官方 MCP 认证、OAuth、模型配置与套餐身份（B41–B49）。
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadModule, entryLabel } from "./entry.mjs";
import { assertJsonEqual, readFixture, rehydrate } from "./fixtures.mjs";

const fixture = readFixture("auth-model.json");
const auth = await loadModule("official-mcp-auth.ts");
const toolError = await loadModule("official-mcp-tool-error.ts");
const oauth = await loadModule("oauth.ts");
const modelConfig = await loadModule("model-config.ts");
const modelExecution = await loadModule("model-execution.ts");
const provisioning = await loadModule("provider-provisioning.ts");
const plan = await loadModule("plan-identity.ts");

test(`B41 official-mcp-auth 常量与保留头识别（${entryLabel}）`, () => {
  assertJsonEqual(
    {
      headerNames: auth.OFFICIAL_MCP_AUTH_HEADER_NAMES,
      metaKey: auth.OFFICIAL_MCP_AUTH_META_KEY,
      failureReasons: [...auth.OFFICIAL_MCP_AUTH_FAILURE_REASONS],
      portFailureReasons: [...auth.OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS],
      reservedHeaders: [...auth.OFFICIAL_MCP_RESERVED_HEADER_NAMES].sort(),
    },
    fixture.officialMcpAuth.constants,
  );
  assert.equal(fixture.officialMcpAuth.constants.reservedHeaders.length, 8);
  for (const entry of fixture.officialMcpAuth.reserved) {
    assertJsonEqual(
      auth.findOfficialMcpReservedHeaders(entry.input),
      entry.output,
      JSON.stringify(entry.input),
    );
  }
  for (const entry of fixture.officialMcpAuth.isReserved) {
    assert.equal(auth.isOfficialMcpReservedHeaderName(entry.input), entry.output, entry.input);
  }
});

test("B42 official-mcp-auth 身份摘要只保留组织/项目/目标类型", () => {
  for (const entry of fixture.officialMcpAuth.identitySummary) {
    assertJsonEqual(
      auth.summarizeOfficialMcpIdentityHeaders(entry.input),
      entry.output,
      JSON.stringify(entry.input),
    );
  }
});

test("B43 official-mcp-auth 来源信任：https origin、回环 dev 白名单与未解析", async () => {
  for (const entry of fixture.officialMcpAuth.trust) {
    assertJsonEqual(
      auth.isOfficialMcpOriginTrusted(entry.input),
      entry.output,
      JSON.stringify(entry.input),
    );
  }
  const registry = auth.createOfficialMcpTrustedOriginRegistry({
    devTrustedOriginsRaw: "http://127.0.0.1:3000",
    resolveKnorviaApiOrigin: async () => "https://api.knorvia.test",
  });
  assertJsonEqual(
    await registry.isTrusted({ mcpKey: "k", origin: "http://127.0.0.1:3000", pluginId: "p" }),
    { detail: "ok", trusted: true },
  );
  assertJsonEqual(
    await registry.isTrusted({
      mcpKey: "k",
      origin: "https://api.knorvia.test/other",
      pluginId: "p",
    }),
    { detail: "ok", trusted: true },
  );
  const failing = auth.createOfficialMcpTrustedOriginRegistry({
    resolveKnorviaApiOrigin: () => {
      throw new Error("x");
    },
  });
  assertJsonEqual(await failing.isTrusted({ mcpKey: "k", origin: "https://a", pluginId: "p" }), {
    detail: "knorvia_origin_unresolved",
    trusted: false,
  });
});

test("B44 official-mcp-tool-error：仅两种错误码、strict 对象与 trim", () => {
  for (const entry of fixture.toolError) {
    assertJsonEqual(toolError.parseOfficialMcpToolError(entry.input), entry.output, entry.input);
  }
  assertJsonEqual(
    toolError.parseOfficialMcpToolError(
      '{"error_code":"quota_exceeded","message":" m ","request_id":"r"}',
    ),
    {
      code: "quota_exceeded",
      message: "m",
      requestId: "r",
    },
  );
});

test("B45 oauth：provider id、解密错误码优先与文案回退", () => {
  assertJsonEqual(
    {
      bigmodelProviderId: oauth.BIGMODEL_PROVIDER_ID,
      zaiProviderId: oauth.ZAI_PROVIDER_ID,
      decryptPrefix: oauth.CREDENTIAL_DECRYPT_ERROR_PREFIX,
      decryptCode: oauth.CREDENTIAL_DECRYPT_ERROR_CODE,
    },
    fixture.oauth.constants,
  );
  for (const entry of fixture.oauth.isDecryptError) {
    assert.equal(
      oauth.isCredentialDecryptError(rehydrate(entry.input)),
      entry.output,
      JSON.stringify(entry.input),
    );
  }
  assert.equal(oauth.CREDENTIAL_DECRYPT_ERROR_CODE, "KNORVIA_CREDENTIAL_DECRYPT_FAILED");
  assert.equal(oauth.CREDENTIAL_DECRYPT_ERROR_PREFIX, "凭据解密失败：");
});

test("B46 model-config schema：宽松顶层、完整配置 strict 与枚举选项", () => {
  for (const entry of fixture.modelConfig.data) {
    assert.equal(
      modelConfig.modelConfigDataSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
  for (const entry of fixture.modelConfig.complete) {
    assert.equal(
      modelConfig.completeModelConfigDataSchema.safeParse(entry.input).success,
      entry.success,
    );
  }
  for (const entry of fixture.modelConfig.enumOption) {
    assert.equal(
      modelConfig.enumOptionSpecDataSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
});

test("B47 model-execution：selectionScope 两值，requestAuth 允许空 apiKey", () => {
  for (const entry of fixture.modelExecution) {
    assert.equal(
      modelExecution.modelExecutionSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
});

test("B48 provider-provisioning：凭据键正则不 trim、触发/范围枚举与信封 strict", () => {
  for (const entry of fixture.provisioning.key) {
    assert.equal(
      provisioning.isProviderProvisioningAccountCredentialKey(entry.input),
      entry.output,
      entry.input,
    );
  }
  assertJsonEqual(
    [...provisioning.providerProvisioningTriggerSchema.options],
    fixture.provisioning.trigger,
  );
  assertJsonEqual(
    [...provisioning.providerProvisioningCredentialScopeSchema.options],
    fixture.provisioning.scope,
  );
  for (const entry of fixture.provisioning.envelope) {
    assert.equal(
      provisioning.providerProvisioningEnvelopeSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
});

test("B49 plan-identity：coding plan 优先、TTL 内外与 no_plan 短路", () => {
  for (const entry of fixture.planIdentity) {
    assertJsonEqual(
      plan.resolvePlanIdentitySnapshot(entry.input),
      entry.output,
      JSON.stringify(entry.input),
    );
  }
});
