// SPDX-License-Identifier: Apache-2.0
// shared-02 合同测试：公开入口面与常量快照（B47–B52）。
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "node:test";

import {
  barrel,
  runtimeEnvEntry,
  modelSelectionEntry,
  accountProviderStateEntry,
  configSchemaEntry,
  repoRoot,
  entryLabel,
} from "./entry.mjs";

const appendix = JSON.parse(
  readFileSync(fileURLToPath(new URL("../interface-appendix.json", import.meta.url)), "utf8"),
);
const constantsSnapshot = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../fixtures/constants-snapshot.json", import.meta.url)),
    "utf8",
  ),
);
const testIdsSnapshot = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../fixtures/test-ids-snapshot.json", import.meta.url)),
    "utf8",
  ),
);
const scope = JSON.parse(
  readFileSync(fileURLToPath(new URL("../scope-files.json", import.meta.url)), "utf8"),
);

// B49 例外清单：不从根 barrel 暴露的两个名字。
const BARREL_EXCEPTIONS = new Set(["sparseShape", "integratedTerminalShellSelectionSchema"]);

test("B49 根 barrel 可达性：本包全部运行时导出（除两个例外）逐名存在", () => {
  const barrelNames = new Set(Object.keys(barrel));
  let checked = 0;
  for (const file of appendix.files) {
    for (const name of file.runtime) {
      if (BARREL_EXCEPTIONS.has(name)) continue;
      assert.ok(barrelNames.has(name), `${file.path} 的导出 ${name} 应可从根 barrel 取到`);
      checked += 1;
    }
  }
  assert.ok(checked >= 700, `应核对至少 700 个运行时导出，实际 ${checked}`);
});

test("B49 两个例外：sparseShape 走子路径、integratedTerminalShell 仅模块路径", () => {
  assert.equal("sparseShape" in barrel, false, "根 barrel 不导出 sparseShape");
  assert.equal(typeof configSchemaEntry.sparseShape, "function");
  assert.equal("integratedTerminalShellSelectionSchema" in barrel, false);
});

test("B50 四个子路径入口导出面与附录一致", () => {
  const entries = [
    ["runtime-env", runtimeEnvEntry, "packages/shared/src/runtimeEnv.ts"],
    ["model-selection", modelSelectionEntry, "packages/shared/src/model-selection.ts"],
    [
      "account-provider-state",
      accountProviderStateEntry,
      "packages/shared/src/account-provider-state.ts",
    ],
    ["config-schema", configSchemaEntry, "packages/shared/src/config-schema.ts"],
  ];
  for (const [label, module, path] of entries) {
    const record = appendix.files.find((file) => file.path === path);
    assert.ok(record, `附录应包含 ${path}`);
    const actual = Object.keys(module)
      .filter((name) => name !== "default")
      .sort();
    assert.deepEqual(actual, [...record.runtime].sort(), `${label} 子路径导出面`);
  }
});

test("B51 模块路径兼容面：58 个模块在当前入口侧全部存在", () => {
  const missing = [];
  for (const entry of scope.files) {
    const rel = entry.path.replace("packages/shared/src/", "");
    const candidate =
      entryLabel === "dist"
        ? join(repoRoot, "packages/shared/dist", rel.replace(/\.ts$/u, ".js"))
        : join(repoRoot, "packages/shared/src", rel);
    if (!existsSync(candidate)) missing.push(candidate);
  }
  assert.deepEqual(missing, [], "全部模块路径应存在");
});

test("B47 频道名与 RPC header 常量快照逐字一致", () => {
  const snapshot = constantsSnapshot;
  assert.equal(barrel.ServiceChannels.File, "file");
  assert.equal(barrel.ServiceChannels.KnorviaSession, "agent-session");
  assert.equal(barrel.ServiceChannels.ProviderSettings, "provider-settings");
  assert.equal(barrel.ServiceChannels.UsageStats, "usage-stats");
  assert.deepEqual(barrel.ServiceChannels, snapshot.ServiceChannels);
  assert.deepEqual(barrel.PlatformChannels, snapshot.PlatformChannels);
  assert.deepEqual(barrel.EmbeddedBrowserWebviewChannels, snapshot.EmbeddedBrowserWebviewChannels);
  assert.deepEqual(barrel.CodingPlanWebviewChannels, snapshot.CodingPlanWebviewChannels);
  assert.deepEqual(barrel.InternalChannels, snapshot.InternalChannels);
  assert.deepEqual(barrel.HostMessageTypes, snapshot.HostMessageTypes);
  assert.deepEqual(barrel.HostResponseTypes, snapshot.HostResponseTypes);
  assert.equal(barrel.KNORVIA_RPC_CLIENT_MODE_HEADER, snapshot.KNORVIA_RPC_CLIENT_MODE_HEADER);
  assert.equal(
    barrel.KNORVIA_RPC_HOST_CAPABILITY_HEADER,
    snapshot.KNORVIA_RPC_HOST_CAPABILITY_HEADER,
  );
});

test("B48 test-ids 快照：全部字符串常量逐字一致且无重复值", () => {
  for (const [file, expected] of Object.entries(testIdsSnapshot)) {
    const module = file === "test-ids.ts" ? barrel : barrel;
    const actual = Object.fromEntries(
      Object.entries(module).filter(
        ([name, value]) => name.startsWith("TID_") && typeof value === "string" && name in expected,
      ),
    );
    assert.deepEqual(actual, expected, `${file} 的 TID 常量`);
  }
  const allValues = Object.values(testIdsSnapshot["test-ids.ts"]);
  assert.equal(allValues.length, Object.keys(testIdsSnapshot["test-ids.ts"]).length);
  assert.equal(barrel.testId("file-tree-item", "/home/user"), "file-tree-item-/home/user");
});

test("B47/B48 其余常量快照（供应商、资源包、遥测、错误码）逐字一致", () => {
  assert.deepEqual(barrel.BUILTIN_MODEL_PROVIDER_IDS, constantsSnapshot.BUILTIN_MODEL_PROVIDER_IDS);
  assert.deepEqual(
    barrel.BUILTIN_PROVIDER_TEMPLATE_IDS,
    constantsSnapshot.BUILTIN_PROVIDER_TEMPLATE_IDS,
  );
  assert.deepEqual(
    barrel.MODEL_PROVIDER_FAMILY_SPECS,
    constantsSnapshot.MODEL_PROVIDER_FAMILY_SPECS,
  );
  assert.deepEqual(barrel.OFFICIAL_GLM_MODEL_IDS, constantsSnapshot.OFFICIAL_GLM_MODEL_IDS);
  assert.deepEqual(barrel.OFF_PEAK_TERMINAL_STATUSES, constantsSnapshot.OFF_PEAK_TERMINAL_STATUSES);
  assert.equal(
    barrel.OFF_PEAK_TICKET_EXPIRED_MARKER,
    constantsSnapshot.OFF_PEAK_TICKET_EXPIRED_MARKER,
  );
  assert.deepEqual(barrel.OFF_PEAK_PROVIDER_IDS, constantsSnapshot.OFF_PEAK_PROVIDER_IDS);
  assert.deepEqual(
    barrel.REMOTE_RESOURCE_PACKAGE_IDS,
    constantsSnapshot.REMOTE_RESOURCE_PACKAGE_IDS,
  );
  assert.deepEqual(
    barrel.ACTIVE_REMOTE_RESOURCE_PACKAGE_IDS,
    constantsSnapshot.ACTIVE_REMOTE_RESOURCE_PACKAGE_IDS,
  );
  assert.deepEqual(
    barrel.REQUIRED_REMOTE_RESOURCE_PACKAGE_IDS,
    constantsSnapshot.REQUIRED_REMOTE_RESOURCE_PACKAGE_IDS,
  );
  assert.deepEqual(
    barrel.OPTIONAL_REMOTE_RESOURCE_PACKAGE_IDS,
    constantsSnapshot.OPTIONAL_REMOTE_RESOURCE_PACKAGE_IDS,
  );
  assert.deepEqual(barrel.REMOTE_ASSET_INSTALL_MODES, constantsSnapshot.REMOTE_ASSET_INSTALL_MODES);
  assert.equal(
    barrel.DEFAULT_REMOTE_ASSET_INSTALL_MODE,
    constantsSnapshot.DEFAULT_REMOTE_ASSET_INSTALL_MODE,
  );
  assert.deepEqual(
    runtimeEnvEntry.KNORVIA_RUNTIME_ENV_KEY,
    constantsSnapshot.RUNTIME_ENV_KEYS.KNORVIA_RUNTIME_ENV_KEY,
  );
  assert.deepEqual(
    {
      KNORVIA_RUNTIME_ENV_KEY: runtimeEnvEntry.KNORVIA_RUNTIME_ENV_KEY,
      KNORVIA_HTTP_PROXY_ENV_KEY: runtimeEnvEntry.KNORVIA_HTTP_PROXY_ENV_KEY,
      KNORVIA_NO_PROXY_ENV_KEY: runtimeEnvEntry.KNORVIA_NO_PROXY_ENV_KEY,
      KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY:
        runtimeEnvEntry.KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
      KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY: runtimeEnvEntry.KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY,
      KNORVIA_REMOTE_NO_PROXY_ENV_KEY: runtimeEnvEntry.KNORVIA_REMOTE_NO_PROXY_ENV_KEY,
      KNORVIA_AGENT_CA_CERT_ENV_KEY: runtimeEnvEntry.KNORVIA_AGENT_CA_CERT_ENV_KEY,
      KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY: runtimeEnvEntry.KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY,
      KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV:
        runtimeEnvEntry.KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV,
      KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY: runtimeEnvEntry.KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY,
      KNORVIA_CUA_BROKER_SOCKET_ENV_KEY: runtimeEnvEntry.KNORVIA_CUA_BROKER_SOCKET_ENV_KEY,
      KNORVIA_CUA_NODE_REPL_HOST_ENV_KEY: runtimeEnvEntry.KNORVIA_CUA_NODE_REPL_HOST_ENV_KEY,
      KNORVIA_CUA_DEV_MODE_ENV_KEY: runtimeEnvEntry.KNORVIA_CUA_DEV_MODE_ENV_KEY,
      KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY: runtimeEnvEntry.KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY,
    },
    constantsSnapshot.RUNTIME_ENV_KEYS,
  );
  assert.equal(
    barrel.KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE,
    constantsSnapshot.KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE,
  );
  assert.equal(
    barrel.DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR_ERROR_CODE,
    constantsSnapshot.DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR_ERROR_CODE,
  );
  assert.equal(
    barrel.SKILL_SYNC_SIZE_LIMIT_ERROR_CODE,
    constantsSnapshot.SKILL_SYNC_SIZE_LIMIT_ERROR_CODE,
  );
  assert.equal(
    barrel.KNORVIA_AGENT_PROVIDER_NOT_READY_CODE,
    constantsSnapshot.KNORVIA_AGENT_PROVIDER_NOT_READY_CODE,
  );
  assert.equal(
    barrel.KNORVIA_AGENT_PROVIDER_NOT_READY_REASON,
    constantsSnapshot.KNORVIA_AGENT_PROVIDER_NOT_READY_REASON,
  );
  assert.equal(barrel.AUTOMATION_CREATE_LIMIT, constantsSnapshot.AUTOMATION_CREATE_LIMIT);
  assert.equal(
    barrel.AUTOMATION_CREATE_LIMIT_ERROR_CODE,
    constantsSnapshot.AUTOMATION_CREATE_LIMIT_ERROR_CODE,
  );
  assert.equal(barrel.TELEMETRY_TEXT_MAX_LENGTH, constantsSnapshot.TELEMETRY_TEXT_MAX_LENGTH);
  assert.equal(barrel.STORAGE_MORE_ENTRIES_PATH, constantsSnapshot.STORAGE_MORE_ENTRIES_PATH);
  assert.deepEqual(barrel.STORAGE_CATEGORY_IDS, constantsSnapshot.STORAGE_CATEGORY_IDS);
  assert.deepEqual(barrel.MEDIA_PREVIEW_FORMATS, constantsSnapshot.MEDIA_PREVIEW_FORMATS);
  assert.deepEqual(barrel.SHORTCUT_COMMANDS, constantsSnapshot.SHORTCUT_COMMANDS);
  assert.equal(barrel.DEFAULT_LOCALE, constantsSnapshot.DEFAULT_LOCALE);
  assert.equal(barrel.KNORVIA_ENV, constantsSnapshot.ENV.KNORVIA_ENV);
  assert.equal(barrel.KNORVIA_PRODUCT_FLAVOR, constantsSnapshot.ENV.KNORVIA_PRODUCT_FLAVOR);
  assert.equal(barrel.KNORVIA_APP_VERSION_ENV, constantsSnapshot.ENV.KNORVIA_APP_VERSION_ENV);
  assert.equal(
    barrel.KNORVIA_BUILD_COMMIT_ID_ENV,
    constantsSnapshot.ENV.KNORVIA_BUILD_COMMIT_ID_ENV,
  );
  assert.equal(barrel.KNORVIA_TELEMETRY_ENABLED, constantsSnapshot.ENV.KNORVIA_TELEMETRY_ENABLED);
  assert.equal(
    barrel.KNORVIA_TELEMETRY_REPORT_ENDPOINT,
    constantsSnapshot.ENV.KNORVIA_TELEMETRY_REPORT_ENDPOINT,
  );
  assert.equal(barrel.KNORVIA_ARMS_RUM_ENDPOINT, constantsSnapshot.ENV.KNORVIA_ARMS_RUM_ENDPOINT);
  assert.equal(barrel.ESTIMATED_TOKEN_CHAR_DIVISOR, constantsSnapshot.ESTIMATED_TOKEN_CHAR_DIVISOR);
  assert.deepEqual(barrel.APP_USAGE_RANGES, constantsSnapshot.APP_USAGE_RANGES);
  assert.equal(barrel.MCP_USAGE_QUOTA_LIMIT_TYPE, constantsSnapshot.MCP_USAGE_QUOTA_LIMIT_TYPE);
});
