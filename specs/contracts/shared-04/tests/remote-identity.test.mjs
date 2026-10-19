// SPDX-License-Identifier: Apache-2.0
// shared-04 合同测试：远端、网络与工作区身份（B1、B2、B4–B8、B10、B11）。
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadModule, entryLabel } from "./entry.mjs";
import { assertJsonEqual, readFixture, rehydrate } from "./fixtures.mjs";

const fixture = readFixture("remote-identity.json");
const endpoint = await loadModule("endpointHostname.ts");
const intranet = await loadModule("intranetDefaults.ts");
const identity = await loadModule("remote-workspace-identity.ts");
const usage = await loadModule("remoteUsageTelemetry.ts");
const remoteApp = await loadModule("remoteAppConfig.ts");
const help = await loadModule("helpAppConfig.ts");
const openrouter = await loadModule("openrouter-attribution.ts");
const wsl = await loadModule("wslUserValidation.ts");

test(`B1 endpointHostname：只接受 http(s) 并小写主机名（${entryLabel}）`, () => {
  for (const [input, output] of fixture.endpointHostname) {
    assert.equal(endpoint.resolveSafeEndpointHostname(input), output, JSON.stringify(input));
  }
});

test("B2 intranetDefaults：环境变量覆盖、默认端口与精确缺参文案", () => {
  assertJsonEqual(
    {
      machineHost: intranet.INTRANET_MACHINE_HOST,
      assetBaseUrl: intranet.INTRANET_ASSET_BASE_URL,
      depsBaseUrl: intranet.INTRANET_DEPS_BASE_URL,
      probeServiceUrl: intranet.INTRANET_PROBE_SERVICE_URL,
      assetPort: intranet.INTRANET_ASSET_SERVICE_PORT,
      probePort: intranet.INTRANET_PROBE_SERVICE_PORT,
      probePath: intranet.INTRANET_PROBE_SERVICE_PATH,
    },
    fixture.intranet.constants,
  );
  for (const entry of fixture.intranet.resolve) {
    assert.equal(
      intranet.resolveIntranetMachineHost(entry.env),
      entry.host,
      JSON.stringify(entry.env),
    );
    if (entry.deps.startsWith("Configure ")) {
      assert.throws(() => intranet.resolveIntranetDepsBaseUrl(entry.env), { message: entry.deps });
    } else {
      assert.equal(
        intranet.resolveIntranetDepsBaseUrl(entry.env),
        entry.deps,
        JSON.stringify(entry.env),
      );
    }
  }
  assert.throws(() => intranet.resolveIntranetDepsBaseUrl({}), {
    message:
      "Configure KNORVIA_DEPS_BASE_URL or INTRANET_MACHINE_HOST in .env before downloading internal dependencies",
  });
});

test("B4 remote identity 构造：SSH 小写主机、WSL 可选 user、路径归一", () => {
  for (const entry of fixture.identities.build) {
    assert.equal(identity.buildRemoteWorkspaceIdentity(entry.path, entry.target), entry.output);
  }
});

test("B5 remote identity 解析：非法与本地返回 null，路径保留冒号", () => {
  for (const entry of fixture.identities.parse) {
    assertJsonEqual(identity.parseRemoteWorkspaceIdentity(entry.input), entry.output, entry.input);
  }
  for (const entry of fixture.identities.isRemote) {
    assert.equal(identity.isRemoteWorkspaceIdentity(entry.input), entry.output, entry.input);
  }
});

test("B6 remoteUsageTelemetry：详情、连接结果遥测信封", () => {
  for (const entry of fixture.usage.detail) {
    assertJsonEqual(usage.resolveWorkspaceTelemetryDetail(entry.input), entry.output);
  }
  for (const entry of fixture.usage.telemetry) {
    assertJsonEqual(usage.buildRemoteWorkspaceConnectResultTelemetry(entry.input), entry.output);
  }
});

test("B7 remoteUsageTelemetry 错误分类优先序：auth → deploy → host_start → attach → relay → connect", () => {
  for (const entry of fixture.usage.classify) {
    assert.equal(usage.classifyRemoteUsageError(rehydrate(entry.input)), entry.output);
  }
});

test("B8 remoteAppConfig/helpAppConfig：远端优先、显式 false 不回退", () => {
  assertJsonEqual(
    {
      feedbackUrl: remoteApp.getFeedbackUrlFromConfig({ feedback_url: " https://rf " }),
      feedbackApiBase: remoteApp.getFeedbackApiBaseFromConfig({ feedback_api_base: "https://ra" }),
      externalFormTrue: remoteApp.getFeedbackUseExternalFormFromConfig({
        feedback_use_external_form: true,
      }),
      externalFormString: remoteApp.getFeedbackUseExternalFormFromConfig({
        feedback_use_external_form: "true",
      }),
      externalFormFalse: remoteApp.getFeedbackUseExternalFormFromConfig({
        feedback_use_external_form: false,
      }),
      externalFormMissing: remoteApp.getFeedbackUseExternalFormFromConfig({}),
      externalFormNonObject: remoteApp.getFeedbackUseExternalFormFromConfig("x"),
      community: remoteApp.getCommunityUrlsFromConfig({
        community_urls: { "zh-CN": " https://zh ", "en-US": "" },
      }),
      communityNonObject: remoteApp.getCommunityUrlsFromConfig({ community_urls: "x" }),
      communityByLocale: remoteApp.getCommunityUrlFromConfig(
        { community_urls: { "zh-CN": "https://zh" } },
        "zh-CN",
      ),
      communityFromConfigs: remoteApp.getCommunityUrlFromConfigs(
        { community_urls: { "zh-CN": "https://remote" } },
        { community_urls: { "zh-CN": "https://local" } },
        "zh-CN",
      ),
      forceUpdate: remoteApp.getForceUpdateMinimalVersionFromConfig({
        forceUpdate: { minimalVersion: " 1.2.3 " },
      }),
      forceUpdateBlank: remoteApp.getForceUpdateMinimalVersionFromConfig({
        forceUpdate: { minimalVersion: "  " },
      }),
      forceUpdateMissing: remoteApp.getForceUpdateMinimalVersionFromConfig({ forceUpdate: {} }),
    },
    fixture.appConfig.remote,
  );
  const helpInputs = [
    [
      {
        community_urls: { "zh-CN": "https://zh", "en-US": "" },
        feedback_url: "https://rf",
        feedback_use_external_form: false,
      },
      {
        community_urls: { "zh-CN": "https://lzh", "en-US": "https://len" },
        feedback_url: "https://lf",
        feedback_use_external_form: true,
      },
    ],
    [null, "not-object"],
    [{}, {}],
  ];
  helpInputs.forEach(([remote, local], index) => {
    assertJsonEqual(help.resolveHelpAppConfig(remote, local), fixture.appConfig.help[index]);
  });
});

test("B10 openrouter attribution：仅 openrouter.ai 域加头且不覆盖已有键", () => {
  for (const entry of fixture.openrouter.detection) {
    assert.equal(openrouter.isOpenRouterBaseUrl(entry.input), entry.output, entry.input);
  }
  assertJsonEqual(
    [
      openrouter.withOpenRouterAttributionHeaders({ A: "1" }, "https://openrouter.ai"),
      openrouter.withOpenRouterAttributionHeaders(
        { A: "1", "X-OpenRouter-Title": "x" },
        "https://openrouter.ai",
      ),
      openrouter.withOpenRouterAttributionHeaders({ A: "1" }, "https://example.com"),
    ],
    fixture.openrouter.headers,
  );
  assertJsonEqual(openrouter.OPENROUTER_ATTRIBUTION_HEADERS, {
    "X-OpenRouter-Title": "Knorvia Studio",
    "X-OpenRouter-Categories": "programming-app",
  });
});

test("B11 wslUserValidation：trim 后 1–64 且拒绝控制符与 :/\\", () => {
  assert.equal(wsl.WSL_USER_MAX_LENGTH, fixture.wsl.maxLength);
  for (const entry of fixture.wsl.valid) {
    assert.equal(wsl.isValidWslUser(entry.input), entry.output, JSON.stringify(entry.input));
  }
  for (const entry of fixture.wsl.schema) {
    assert.equal(
      wsl.wslUserSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
});
