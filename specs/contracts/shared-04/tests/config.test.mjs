// SPDX-License-Identifier: Apache-2.0
// shared-04 合同测试：客户端配置、功能开关、菜单与服务权威模式（B19–B25）。
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadModule, entryLabel } from "./entry.mjs";
import { assertJsonEqual, readFixture } from "./fixtures.mjs";

const fixture = readFixture("config.json");
const clientConfig = await loadModule("clientConfig.ts");
const workflow = await loadModule("dynamic-workflow-feature.ts");
const prefs = await loadModule("app-runtime-preferences.ts");
const e2e = await loadModule("e2e-test-bridge.ts");
const launch = await loadModule("launchMarks.ts");
const menu = await loadModule("desktopMenu.ts");
const authority = await loadModule("serviceAuthority.ts");

test(`B19 clientConfig：快照解析与非法响应文案（${entryLabel}）`, () => {
  for (const entry of fixture.clientConfig) {
    if (entry.output.ok) {
      assertJsonEqual(
        clientConfig.parseClientConfigSnapshot(entry.input),
        entry.output.value,
        JSON.stringify(entry.input),
      );
    } else {
      assert.throws(() => clientConfig.parseClientConfigSnapshot(entry.input), {
        message: entry.output.error,
      });
    }
  }
  assert.throws(() => clientConfig.parseClientConfigSnapshot({ code: 1 }), {
    message: "Invalid public client config response",
  });
});

test("B20 dynamic-workflow-feature：override > remote > 默认，非法回退 disabled", () => {
  assertJsonEqual([...workflow.DYNAMIC_WORKFLOW_MODES], fixture.dynamicWorkflow.modes);
  assert.equal(workflow.DEFAULT_DYNAMIC_WORKFLOW_MODE, fixture.dynamicWorkflow.defaultMode);
  assert.equal(workflow.KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV, fixture.dynamicWorkflow.envKey);
  for (const entry of fixture.dynamicWorkflow.resolve) {
    assertJsonEqual(workflow.resolveDynamicWorkflowClientConfig(entry.input), entry.output);
  }
  for (const entry of fixture.dynamicWorkflow.normalize) {
    assert.equal(
      workflow.normalizeDynamicWorkflowMode(entry.input),
      entry.output,
      String(entry.input),
    );
  }
  for (const entry of fixture.dynamicWorkflow.enabled) {
    assert.equal(workflow.isDynamicWorkflowModeEnabled(entry.input), entry.output, entry.input);
  }
  assertJsonEqual(
    workflow.createDynamicWorkflowClientConfig("alwaysOn"),
    fixture.dynamicWorkflow.client,
  );
});

test("B21 app-runtime-preferences：strict 载荷与默认 false", () => {
  assert.equal(
    prefs.APP_RUNTIME_PREFERENCES_CHANGED_BROADCAST_CHANNEL,
    fixture.runtimePreferences.channel,
  );
  assert.equal(prefs.ASK_USER_QUESTION_E2E_CLOCK_SCALE_ENV, fixture.runtimePreferences.envKey);
  fixture.runtimePreferences.parse.forEach((entry, index) => {
    const result = prefs.appRuntimePreferencesChangedBroadcastPayloadSchema.safeParse(entry.input);
    assert.equal(result.success, entry.success, JSON.stringify(entry.input));
    if (entry.success) assertJsonEqual(result.data, entry.data);
    if (index === 0) assert.equal(result.data.modelIoFullRetentionEnabled, false);
  });
});

test("B22 e2e-test-bridge：旗标必须恰为 1 且 runId 非空", () => {
  for (const entry of fixture.e2e) {
    assert.equal(
      e2e.shouldEnableE2ETestBridge(entry.input),
      entry.output,
      JSON.stringify(entry.input),
    );
  }
});

test("B23 launchMarks：查询键、序列化与四项有限数字校验", () => {
  assert.equal(launch.LAUNCH_MARKS_QUERY_KEY, fixture.launchMarks.queryKey);
  for (const entry of fixture.launchMarks.serialize) {
    assert.equal(launch.serializeLaunchMarks(entry.input), entry.output);
    assertJsonEqual(launch.parseLaunchMarks(entry.output), entry.input);
  }
  for (const entry of fixture.launchMarks.parse) {
    assertJsonEqual(launch.parseLaunchMarks(entry.input), entry.output, String(entry.input));
  }
});

test("B24 desktopMenu：50 个消息 id、zh-CN/en-US 与默认 zh-CN 回退", () => {
  assertJsonEqual(menu.desktopMenuMessageIds, fixture.desktopMenu.ids);
  assert.equal(Object.keys(menu.desktopMenuMessageIds).length, 50);
  assertJsonEqual(
    Object.fromEntries(
      Object.entries(menu.desktopMenuMessages).map(([locale, messages]) => [
        locale,
        Object.keys(messages).length,
      ]),
    ),
    fixture.desktopMenu.localeCounts,
  );
  for (const entry of fixture.desktopMenu.cases) {
    assert.equal(
      menu.getDesktopMenuMessage(entry.locale, entry.id),
      entry.output,
      `${entry.locale}/${entry.id}`,
    );
  }
  const formatInputs = [
    ["zh-CN", "titleBar.menu.app.hide", { appName: "Knorvia Studio" }],
    ["en-US", "titleBar.menu.app.hide", { appName: "Knorvia Studio" }],
    ["en-US", "titleBar.menu.file", {}],
  ];
  formatInputs.forEach(([locale, id, values], index) => {
    assert.equal(
      menu.formatDesktopMenuMessage(locale, id, values),
      fixture.desktopMenu.format[index],
    );
  });
});

test("B25 serviceAuthority：三模式解析、非法原样返回与 provider registry 来源", () => {
  assertJsonEqual([...authority.serviceAuthorityModes], fixture.serviceAuthority.modes);
  assert.equal(authority.SERVICE_AUTHORITY_MODE_ENV, fixture.serviceAuthority.envKey);
  for (const entry of fixture.serviceAuthority.isMode) {
    assert.equal(authority.isServiceAuthorityMode(entry.input), entry.output, entry.input);
  }
  for (const entry of fixture.serviceAuthority.parse) {
    assertJsonEqual(
      authority.parseServiceAuthorityMode(entry.input),
      entry.output,
      JSON.stringify(entry.input),
    );
  }
  for (const entry of fixture.serviceAuthority.providerSource) {
    assert.equal(
      authority.shouldUseProviderRegistrySourceForAuthorityMode(entry.input ?? undefined),
      entry.output,
      String(entry.input),
    );
  }
});
