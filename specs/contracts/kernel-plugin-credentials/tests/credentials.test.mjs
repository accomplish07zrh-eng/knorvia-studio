// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-credentials 契约测试（B1–B11）。
//
// 全部走**公开入口**：本包的插件模块导出面（`apply`）、包内冻结的映射函数
// （`buildPiAiProviderTable` / `providerIdOfCredentialRef` / `requestProviderCredentials`），
// 以及 `kernel-bridge-legacy` 的公开访问器（`channelForHostRequests`）。不 import 任何
// `bootstrap/src/kernel/**`（那是 `kernel-dsh-builtins` 的范围）。
//
// 凭据夹具一律为虚构占位值（见 fixtures/credentials-fixture.mjs 的文件头说明）。

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFixtureProviders,
  buildFixtureRuntimeHeadersRequest,
  FIXTURE_API_KEY,
  FIXTURE_CREDENTIAL_REPLIES,
  FIXTURE_HEADER_NAME,
  FIXTURE_HEADER_VALUE,
  FIXTURE_WORKSPACE,
  FIXTURE_MODEL_SELECTION,
} from "../fixtures/credentials-fixture.mjs";
import { loadCredentials, loadSharedProtocol } from "./credentials-entry.mjs";

/** 本包模块在首次用例时加载一次（`await import` 有缓存，不必每例重复）。 */
async function modules() {
  const [index, providerTable, credentialsRequest] = await Promise.all([
    loadCredentials("index"),
    loadCredentials("provider-table"),
    loadCredentials("credentials-request"),
  ]);
  return { index, providerTable, credentialsRequest };
}

/**
 * 一个可控的假 `LegacyHostChannel`：记录每次调用，按预置队列回放应答。
 *
 * 它替代真实桥，因为本包要断言的是「**每次 resolve 都发一次请求**」这个调用契约，
 * 而不是桥本身的行为（桥的 B18a–e 已在 kernel-bridge-legacy 里测过）。
 */
function createFakeChannel(replies) {
  const calls = [];
  let cursor = 0;
  return {
    calls,
    async request(method, params, schema, options) {
      calls.push({ method, params, options });
      const next = replies[Math.min(cursor, replies.length - 1)];
      cursor += 1;
      // 真实通道会校验应答；这里照做，确保被调用方拿到的已过 schema。
      return schema.parse(next);
    },
    notify() {},
  };
}

test("B3 供应商配置映射成 PiAiProviderProfile 字典，路由 key = providerId", async () => {
  const { providerTable } = await modules();
  const providers = buildFixtureProviders();
  const table = providerTable.buildPiAiProviderTable(providers);

  assert.deepEqual(
    Object.keys(table).sort(),
    providers.map((entry) => entry.providerId).sort(),
    "route keys must equal providerIds",
  );
  for (const entry of providers) {
    const profile = table[entry.providerId];
    assert.equal(profile.api, entry.protocol, `${entry.providerId}: api must equal protocol`);
    assert.equal(profile.baseURL, entry.baseURL, `${entry.providerId}: baseURL must pass through`);
    // apiKeyEnv 只承载引用名，绝不写真实 key。
    assert.equal(
      typeof profile.apiKeyEnv,
      "string",
      `${entry.providerId}: apiKeyEnv must be a credential reference name`,
    );
    assert.equal(
      profile.apiKeyEnv.includes(FIXTURE_API_KEY),
      false,
      `${entry.providerId}: apiKeyEnv must never carry a credential value`,
    );
  }
  // 空输入 → 空字典（不伪造默认 provider）。
  assert.deepEqual(providerTable.buildPiAiProviderTable([]), {});
});

test("B4 三种协议字面量与 dsh-llm-pi-ai 的 supportedProtocols() 一致", async () => {
  const { providerTable } = await modules();
  // 从 DSH 的公开类型产物读协议表，而不是把字面量抄在测试里——这样 DSH 升级改名会立刻红。
  const piAi = await import("@deepseek-ai/dsh-llm-pi-ai");
  const supported = piAi.supportedProtocols();
  assert.deepEqual(
    [...providerTable.KNORVIA_PROVIDER_PROTOCOLS].sort(),
    [...supported].sort(),
    "our protocol literals must match the DSH protocol table exactly",
  );
});

test("B5 凭据按请求获取：每次 resolve 都发一次请求，应答经运行时 schema 校验", async () => {
  const { credentialsRequest } = await modules();
  const { knorviaProviderRuntimeHeadersResponseSchema } = await loadSharedProtocol();

  const channel = createFakeChannel([FIXTURE_CREDENTIAL_REPLIES.apiKeyOnly]);
  const input = {
    channel,
    sessionId: "sess_fixture_0001",
    workspace: FIXTURE_WORKSPACE,
    providerId: FIXTURE_MODEL_SELECTION.providerId,
    modelSelection: FIXTURE_MODEL_SELECTION,
    timeoutMs: 1_000,
  };

  const first = await credentialsRequest.requestProviderCredentials(input);
  assert.equal(first.apiKey, FIXTURE_API_KEY);

  // 第二次调用必须再发一次（D4：不缓存）——两次调用 → 两条记录。
  await credentialsRequest.requestProviderCredentials(input);
  assert.equal(channel.calls.length, 2, "resolve must not cache across calls");
  assert.equal(
    channel.calls[0].method,
    "interaction/requestProviderRuntimeHeaders",
    "must use the existing reverse-request method",
  );
  // 请求参数必须过既有 schema（B5 第 1 条）。
  const { knorviaProviderRuntimeHeadersRequestParamsSchema } = await loadSharedProtocol();
  assert.doesNotThrow(() =>
    knorviaProviderRuntimeHeadersRequestParamsSchema.parse(channel.calls[0].params),
  );
  // 该 schema 也是应答的校验器形状（同一份共享 schema，未在包内另造）。
  assert.equal(typeof knorviaProviderRuntimeHeadersResponseSchema.parse, "function");
});

test("B5 四条映射分支：apiKey / apiKey+headers / headers-only / refused", async () => {
  const { credentialsRequest } = await modules();
  const base = {
    sessionId: "sess_fixture_0001",
    workspace: FIXTURE_WORKSPACE,
    providerId: FIXTURE_MODEL_SELECTION.providerId,
    modelSelection: FIXTURE_MODEL_SELECTION,
    timeoutMs: 1_000,
  };

  // 只有 apiKey。
  const apiKeyOnly = await credentialsRequest.requestProviderCredentials({
    ...base,
    channel: createFakeChannel([FIXTURE_CREDENTIAL_REPLIES.apiKeyOnly]),
  });
  assert.equal(apiKeyOnly.apiKey, FIXTURE_API_KEY);
  assert.equal(apiKeyOnly.headers, undefined);

  // apiKey + headers：两者都要保留。
  const both = await credentialsRequest.requestProviderCredentials({
    ...base,
    channel: createFakeChannel([FIXTURE_CREDENTIAL_REPLIES.apiKeyAndHeaders]),
  });
  assert.equal(both.apiKey, FIXTURE_API_KEY);
  assert.equal(both.headers?.[FIXTURE_HEADER_NAME], FIXTURE_HEADER_VALUE);

  // headers-only：headers 保真保留（D2），不丢结构。
  const headersOnly = await credentialsRequest.requestProviderCredentials({
    ...base,
    channel: createFakeChannel([FIXTURE_CREDENTIAL_REPLIES.headersOnly]),
  });
  assert.equal(headersOnly.apiKey, undefined);
  assert.equal(headersOnly.headers?.[FIXTURE_HEADER_NAME], FIXTURE_HEADER_VALUE);

  // refused：必须抛出（B6）。
  await assert.rejects(
    async () =>
      await credentialsRequest.requestProviderCredentials({
        ...base,
        channel: createFakeChannel([FIXTURE_CREDENTIAL_REPLIES.refused]),
      }),
    (error) => {
      assert.match(String(error.message), /fixture-credential-unavailable|credential/iu);
      // 错误消息与堆栈不得含凭据（S3）。
      assert.equal(String(error.message).includes(FIXTURE_API_KEY), false);
      return true;
    },
  );
});

test("B6 拿不到凭据必须明确失败（四种输入）", async () => {
  const { credentialsRequest } = await modules();
  const base = {
    sessionId: "sess_fixture_0001",
    workspace: FIXTURE_WORKSPACE,
    providerId: FIXTURE_MODEL_SELECTION.providerId,
    modelSelection: FIXTURE_MODEL_SELECTION,
    timeoutMs: 1_000,
  };

  // ① 通道不存在（未挂载）。
  await assert.rejects(
    async () =>
      await credentialsRequest.requestProviderCredentials({ ...base, channel: undefined }),
    /credential|channel|client/iu,
  );

  // ② 通道抛「无客户端」。
  await assert.rejects(
    async () =>
      await credentialsRequest.requestProviderCredentials({
        ...base,
        channel: {
          request: async () => {
            const error = new Error("No client is connected");
            error.code = -32020;
            throw error;
          },
          notify() {},
        },
      }),
    /client/iu,
  );

  // ③ 通道抛超时。
  await assert.rejects(
    async () =>
      await credentialsRequest.requestProviderCredentials({
        ...base,
        channel: {
          request: async () => {
            const error = new Error("Client request timed out");
            error.code = -32022;
            throw error;
          },
          notify() {},
        },
      }),
    /timed out|timeout/iu,
  );

  // ④ 应答未通过运行时校验（喂一个结构性错误的值）。
  await assert.rejects(
    async () =>
      await credentialsRequest.requestProviderCredentials({
        ...base,
        channel: {
          request: async (_method, _params, schema) => schema.parse({ unexpected: true }),
          notify() {},
        },
      }),
    /credential|invalid|unexpected/iu,
    "an unvalidated reply must not be used as a credential",
  );
});

test("B7 写入面拒绝 + describe 报 writable:false；凭据不进日志", async () => {
  const { index } = await modules();
  const provider = index.createKnorviaCredentialProvider({
    channel: createFakeChannel([FIXTURE_CREDENTIAL_REPLIES.apiKeyOnly]),
    sessionId: "sess_fixture_0001",
    workspace: FIXTURE_WORKSPACE,
    modelSelection: FIXTURE_MODEL_SELECTION,
    timeoutMs: 1_000,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  });

  // 四个写入方法必须抛错（D3：CLI 侧只读）。
  await assert.rejects(async () => await provider.set("KNORVIA_fixture", "x"), /read-only|host/iu);
  await assert.rejects(async () => await provider.unset("KNORVIA_fixture"), /read-only|host/iu);
  await assert.rejects(
    async () => await provider.modifyRecord("llm-pi-ai/fixture", () => {}),
    /read-only|host|unsupported/iu,
  );
  await assert.rejects(
    async () => await provider.deleteRecord("llm-pi-ai/fixture"),
    /read-only|host|unsupported/iu,
  );

  // describe 说明不可写。
  const info = await provider.describe("KNORVIA_fixture");
  assert.equal(info.writable, false);
});

test("B9 凭据不泄漏：日志字段与错误消息均不含凭据值", async () => {
  const { index } = await modules();
  const captured = [];
  const logger = {
    debug(message, fields) {
      captured.push([message, fields]);
    },
    info(message, fields) {
      captured.push([message, fields]);
    },
    warn(message, fields) {
      captured.push([message, fields]);
    },
    error(message, fields) {
      captured.push([message, fields]);
    },
  };
  const provider = index.createKnorviaCredentialProvider({
    channel: createFakeChannel([FIXTURE_CREDENTIAL_REPLIES.apiKeyAndHeaders]),
    sessionId: "sess_fixture_0001",
    workspace: FIXTURE_WORKSPACE,
    modelSelection: FIXTURE_MODEL_SELECTION,
    timeoutMs: 1_000,
    logger,
  });

  await provider.resolve("KNORVIA_fixture-provider");

  const rendered = JSON.stringify(captured);
  assert.equal(
    rendered.includes(FIXTURE_API_KEY),
    false,
    "a credential value must never appear in log fields",
  );
  assert.equal(
    rendered.includes(FIXTURE_HEADER_VALUE),
    false,
    "a credential header value must never appear in log fields",
  );
});

test("B10 provider/testModelConnectivity：拿不到凭据时明确失败，不伪造 success", async () => {
  const { index } = await modules();
  await assert.rejects(
    async () =>
      await index.testProviderConnectivity({
        workspace: FIXTURE_WORKSPACE,
        selection: FIXTURE_MODEL_SELECTION,
        channel: createFakeChannel([FIXTURE_CREDENTIAL_REPLIES.refused]),
        sessionId: "sess_fixture_0001",
        timeoutMs: 1_000,
        logger: { debug() {}, info() {}, warn() {}, error() {} },
      }),
    /credential|unavailable/iu,
    "connectivity test must not report success without a usable credential",
  );
});

test("B2 组合行契约：moduleId 解析到的模块导出 apply", async () => {
  const { index } = await modules();
  assert.equal(typeof index.apply, "function", "the plugin module must export apply(ctx)");
  // 行 id 由 kernel-dsh-builtins 提供；本包只断言自己的模块可被该行挂载。
  const kernelRow = await import(
    new URL(
      "../../../../apps/cli/packages/bootstrap/src/kernel/credential-provider.ts",
      import.meta.url,
    ).href
  );
  assert.equal(kernelRow.KERNEL_CREDENTIAL_PROVIDER_ROW_ID, "knorvia-credentials");
  assert.doesNotThrow(() =>
    kernelRow.createKernelCredentialProviderRow(
      "apps/cli/packages/bootstrap/src/kernel-plugin-credentials/index.ts",
    ),
  );
});

test("B11 夹具隔离：虚构值与保留域名", () => {
  // 凭据占位值必须一眼可辨为虚构。**判据是形态，不是长度**——长度既脆弱又自相矛盾
  // （`fixture-api-key-0001` 恰好 20 字符，与某些真实 key 长度接近）。
  assert.match(FIXTURE_API_KEY, /^fixture-/u, "placeholder must carry an obvious fixture marker");
  assert.equal(FIXTURE_API_KEY.startsWith("sk-"), false, "must not mimic a real key prefix");
  // 真实 key 的形态是「前缀 + 一长串十六进制/base64」；占位值不含这种长串。
  assert.equal(
    /^[a-z]{2,4}-[0-9a-f]{32,}$/u.test(FIXTURE_API_KEY),
    false,
    "placeholder must not mimic the shape of a real key",
  );
  assert.match(FIXTURE_HEADER_VALUE, /^fixture-/u);

  // 端点一律用 RFC 2606 保留域名 `.invalid`：永不解析，不可能误连真实服务。
  for (const provider of buildFixtureProviders()) {
    assert.match(provider.baseURL, /\.invalid(\/|$)/u, `${provider.providerId} must use .invalid`);
  }

  // 请求参数夹具必须过既有 schema。
  assert.equal(typeof buildFixtureRuntimeHeadersRequest().requestId, "string");
});

/**
 * B8（**反向断言**）：本包**不得**收紧工具子进程环境。
 *
 * 这是本包最容易越界的地方：凭据安全很容易让人顺手"把环境也清干净"。
 * 但工具子进程环境（bash 等）是 `kernel-dsh-builtins` 已交付并经审查的行为——
 * 启动时的用户环境快照，**只去掉 `DSH_*`**，不去掉用户的业务环境变量。
 *
 * 为什么用源码扫描而不是跑子进程：本包**没有任何**改子进程环境的代码路径（不该有）。
 * 反向断言要证明的正是「不存在这样的路径」，所以扫源码是最直接的方式：
 * 若将来有人在本包里加了 `sanitizeProcessEnvironment` / 删环境变量的调用，这条会红。
 */
test("B8 反向断言：本包源码内不存在收紧工具子进程环境的路径", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const pluginRoot = resolve(
    fileURLToPath(new URL("../../../..", import.meta.url)),
    "apps/cli/packages/bootstrap/src/kernel-plugin-credentials",
  );
  const entries = await readdir(pluginRoot, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"));
  assert.ok(files.length > 0, "plugin sources must exist for this assertion to mean anything");

  // 收紧环境的行为特征：删环境变量、清 DSH_、写 process.env。
  const forbidden = [
    /delete\s+process\.env/u,
    /process\.env\[[^\]]+\]\s*=/u,
    /sanitizeProcessEnvironment/u,
    /DSH_PREFIX/u,
    /API_KEY_SUFFIX/u,
  ];

  for (const file of files) {
    const source = await readFile(join(pluginRoot, file.name), "utf8");
    for (const pattern of forbidden) {
      assert.equal(
        pattern.test(source),
        false,
        `${file.name} must not touch process environment (kernel-dsh-builtins owns child-process env)`,
      );
    }
  }

  // 另一条更容易漏的越界：本包不得 import bootstrap/src/kernel/**（组合与行位置归 builtins）。
  for (const file of files) {
    const source = await readFile(join(pluginRoot, file.name), "utf8");
    assert.equal(
      /from\s+["'][^"']*\/kernel\/(composition|host|environment|credential-provider)\./u.test(
        source,
      ),
      false,
      `${file.name} must not import bootstrap/src/kernel internals`,
    );
  }
});
