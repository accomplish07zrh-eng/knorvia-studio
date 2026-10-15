// SPDX-License-Identifier: Apache-2.0
// shared-02 合同测试：运行时环境（B6–B11）。
import assert from "node:assert/strict";
import { test } from "node:test";

import { barrel, runtimeEnvEntry } from "./entry.mjs";

const {
  normalizeKnorviaEnv,
  normalizeKnorviaProductFlavor,
  mapKnorviaEnvToArmsRumEnv,
  KNORVIA_ENV,
  KNORVIA_PRODUCT_FLAVOR,
  KNORVIA_APP_VERSION_ENV,
  KNORVIA_BUILD_COMMIT_ID_ENV,
  KNORVIA_TELEMETRY_ENABLED,
  KNORVIA_TELEMETRY_REPORT_ENDPOINT,
  KNORVIA_ARMS_RUM_ENDPOINT,
} = barrel;

const {
  KNORVIA_RUNTIME_ENV_KEY,
  KNORVIA_HTTP_PROXY_ENV_KEY,
  KNORVIA_NO_PROXY_ENV_KEY,
  KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
  KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY,
  KNORVIA_REMOTE_NO_PROXY_ENV_KEY,
  KNORVIA_AGENT_CA_CERT_ENV_KEY,
  KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY,
  KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV,
  KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY,
  KNORVIA_CUA_BROKER_SOCKET_ENV_KEY,
  KNORVIA_CUA_NODE_REPL_HOST_ENV_KEY,
  KNORVIA_CUA_DEV_MODE_ENV_KEY,
  KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY,
  normalizeKnorviaRuntimeEnv,
  resolveKnorviaRuntimeEnv,
  isCuaDevModeRequested,
  isKnorviaCuaInternalFeatureEnabled,
  shouldSanitizeKnorviaRuntimeEnvKey,
  sanitizeKnorviaRuntimeEnv,
  sanitizeKnorviaRuntimeEnvInPlace,
  getCapturedKnorviaCuaBrokerCredentials,
  resetCapturedKnorviaCuaBrokerCredentialsForTest,
  readKnorviaAgentTelemetryEnv,
  getCapturedKnorviaAgentTelemetryEnv,
  resetCapturedKnorviaAgentTelemetryEnvForTest,
  readKnorviaToolEnvPassthroughEnv,
  buildKnorviaToolEnvPassthroughEnv,
  shouldCaptureKnorviaToolEnvPassthroughKey,
} = runtimeEnvEntry;

test("B6 normalizeKnorviaEnv / normalizeKnorviaProductFlavor / mapKnorviaEnvToArmsRumEnv", () => {
  assert.equal(normalizeKnorviaEnv(" TEST "), "test");
  assert.equal(normalizeKnorviaEnv("production"), "production");
  assert.equal(normalizeKnorviaEnv(undefined), "production");
  assert.equal(normalizeKnorviaProductFlavor("preview", "production"), "preview");
  assert.equal(normalizeKnorviaProductFlavor(" PRODUCTION ", "test"), "production");
  assert.equal(normalizeKnorviaProductFlavor(undefined, "production"), "production");
  assert.equal(normalizeKnorviaProductFlavor(undefined, "test"), "preview");
  assert.equal(mapKnorviaEnvToArmsRumEnv("development"), "local");
  assert.equal(
    mapKnorviaEnvToArmsRumEnv("production"),
    KNORVIA_ENV === "production" ? "prod" : "local",
  );
});

test("B6 环境身份常量：遥测关闭与端点为空是硬事实", () => {
  assert.equal(KNORVIA_TELEMETRY_ENABLED, false);
  assert.equal(KNORVIA_TELEMETRY_REPORT_ENDPOINT, "");
  assert.equal(KNORVIA_ARMS_RUM_ENDPOINT, "");
  assert.equal(KNORVIA_APP_VERSION_ENV, "KNORVIA_APP_VERSION");
  assert.equal(KNORVIA_BUILD_COMMIT_ID_ENV, "KNORVIA_BUILD_COMMIT_ID");
  assert.ok(["test", "production"].includes(KNORVIA_ENV));
  assert.ok(["production", "preview"].includes(KNORVIA_PRODUCT_FLAVOR));
});

test("B7 运行时环境变量名单：14 个键名字面量", () => {
  assert.equal(KNORVIA_RUNTIME_ENV_KEY, "KNORVIA_RUNTIME_ENV");
  assert.equal(KNORVIA_HTTP_PROXY_ENV_KEY, "KNORVIA_HTTP_PROXY");
  assert.equal(KNORVIA_NO_PROXY_ENV_KEY, "KNORVIA_NO_PROXY");
  assert.equal(
    KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
    "KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY",
  );
  assert.equal(KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY, "KNORVIA_REMOTE_HTTP_PROXY");
  assert.equal(KNORVIA_REMOTE_NO_PROXY_ENV_KEY, "KNORVIA_REMOTE_NO_PROXY");
  assert.equal(KNORVIA_AGENT_CA_CERT_ENV_KEY, "KNORVIA_AGENT_CA_CERT");
  assert.equal(KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY, "KNORVIA_TOOL_ENV_PASSTHROUGH_JSON");
  assert.equal(
    KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV,
    "KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED",
  );
  assert.equal(KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY, "KNORVIA_CUA_PRODUCT_HELPER");
  assert.equal(KNORVIA_CUA_BROKER_SOCKET_ENV_KEY, "KNORVIA_CUA_PERMISSION_BROKER_SOCKET");
  assert.equal(KNORVIA_CUA_NODE_REPL_HOST_ENV_KEY, "KNORVIA_CUA_NODE_REPL_HOST");
  assert.equal(KNORVIA_CUA_DEV_MODE_ENV_KEY, "KNORVIA_CUA_DEV_MODE");
  assert.equal(KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY, "KNORVIA_CUA_PLUGIN_AUTHORITY");
});

test("B8 运行时环境归一与 CUA 开关判定", () => {
  assert.equal(normalizeKnorviaRuntimeEnv(" Development "), "development");
  assert.equal(normalizeKnorviaRuntimeEnv("staging"), undefined);
  assert.equal(resolveKnorviaRuntimeEnv({}, "test"), "test");
  assert.equal(resolveKnorviaRuntimeEnv({ KNORVIA_RUNTIME_ENV: "DEVELOPMENT" }), "development");
  assert.equal(isCuaDevModeRequested({ KNORVIA_CUA_DEV_MODE: "On" }), true);
  assert.equal(isCuaDevModeRequested({ KNORVIA_CUA_DEV_MODE: "0" }), false);
  assert.equal(isKnorviaCuaInternalFeatureEnabled({}), true, "缺省开启");
  assert.equal(isKnorviaCuaInternalFeatureEnabled({ KNORVIA_CUA_PRODUCT_HELPER: "off" }), false);
  assert.equal(
    isKnorviaCuaInternalFeatureEnabled({
      KNORVIA_CUA_PRODUCT_HELPER: "off",
      KNORVIA_CUA_DEV_MODE: "1",
    }),
    true,
    "dev 模式压过 product helper 关闭",
  );
});

test("B9 清洗判定：固定名单大小写不敏感 + 包管理器代理模式", () => {
  assert.equal(shouldSanitizeKnorviaRuntimeEnvKey("node_env"), true);
  assert.equal(shouldSanitizeKnorviaRuntimeEnvKey("HTTPS_PROXY"), true);
  assert.equal(shouldSanitizeKnorviaRuntimeEnvKey("OTEL_EXPORTER_OTLP_ENDPOINT"), true);
  assert.equal(shouldSanitizeKnorviaRuntimeEnvKey("KNORVIA_TELEMETRY_USER_ID"), true);
  assert.equal(shouldSanitizeKnorviaRuntimeEnvKey("npm_config_https_proxy"), true);
  assert.equal(shouldSanitizeKnorviaRuntimeEnvKey("pnpm_proxy"), true);
  assert.equal(shouldSanitizeKnorviaRuntimeEnvKey("yarn_cafile"), true);
  assert.equal(shouldSanitizeKnorviaRuntimeEnvKey("PATH"), false);
  assert.equal(shouldSanitizeKnorviaRuntimeEnvKey("npm_config_registry"), false);
});

test("B9 sanitizeKnorviaRuntimeEnv：丢弃清洗键与 undefined，保留其余", () => {
  const sanitized = sanitizeKnorviaRuntimeEnv({
    PATH: "/usr/bin",
    NODE_ENV: "production",
    HTTP_PROXY: "http://x",
    EMPTY: undefined,
    npm_config_proxy: "http://y",
  });
  assert.deepEqual(sanitized, { PATH: "/usr/bin" });
});

test("B9 sanitizeKnorviaRuntimeEnvInPlace：就地删除且保留未命中键", () => {
  const env = { PATH: "/bin", HTTPS_PROXY: "http://p", KEEP: "1" };
  sanitizeKnorviaRuntimeEnvInPlace(env);
  assert.deepEqual(env, { PATH: "/bin", KEEP: "1" });
});

test("B10 CUA broker 凭据捕获：双键齐备才冻结，其一缺失清空，getter 返回副本", () => {
  resetCapturedKnorviaCuaBrokerCredentialsForTest();
  assert.deepEqual(getCapturedKnorviaCuaBrokerCredentials(), {
    socket: undefined,
    pluginAuthority: undefined,
  });
  sanitizeKnorviaRuntimeEnv({
    KNORVIA_CUA_PERMISSION_BROKER_SOCKET: "  unix:///tmp/broker.sock  ",
    KNORVIA_CUA_PLUGIN_AUTHORITY: "auth-1",
    KNORVIA_CUA_PERMISSION_BROKER_REFRESH_MARKER: "m1",
  });
  assert.deepEqual(getCapturedKnorviaCuaBrokerCredentials(), {
    socket: "unix:///tmp/broker.sock",
    pluginAuthority: "auth-1",
    refreshMarker: "m1",
  });
  const copy = getCapturedKnorviaCuaBrokerCredentials();
  copy.pluginAuthority = "mutated";
  assert.equal(
    getCapturedKnorviaCuaBrokerCredentials().pluginAuthority,
    "auth-1",
    "getter 应给副本",
  );
  sanitizeKnorviaRuntimeEnv({ KNORVIA_CUA_PERMISSION_BROKER_SOCKET: "only-socket" });
  assert.equal(getCapturedKnorviaCuaBrokerCredentials().socket, undefined, "单键应清空捕获态");
  resetCapturedKnorviaCuaBrokerCredentialsForTest();
});

test("B10 遥测环境读取/捕获/复位：三个键族、trim 非空、累积合并", () => {
  resetCapturedKnorviaAgentTelemetryEnvForTest();
  const read = readKnorviaAgentTelemetryEnv({
    OTEL_SERVICE_NAME: " knorvia ",
    KNORVIA_TELEMETRY_USER_ID: "u1",
    KNORVIA_MODEL_TELEMETRY_ENABLED: "1",
    KNORVIA_TELEMETRY_BLANK: "   ",
    PATH: "/bin",
  });
  assert.deepEqual(read, {
    OTEL_SERVICE_NAME: "knorvia",
    KNORVIA_TELEMETRY_USER_ID: "u1",
    KNORVIA_MODEL_TELEMETRY_ENABLED: "1",
  });
  assert.deepEqual(getCapturedKnorviaAgentTelemetryEnv(), {}, "read 不写捕获态");
  sanitizeKnorviaRuntimeEnv({ OTEL_SERVICE_NAME: "a" });
  sanitizeKnorviaRuntimeEnv({ KNORVIA_TELEMETRY_USER_ID: "u2" });
  assert.deepEqual(getCapturedKnorviaAgentTelemetryEnv(), {
    OTEL_SERVICE_NAME: "a",
    KNORVIA_TELEMETRY_USER_ID: "u2",
  });
  resetCapturedKnorviaAgentTelemetryEnvForTest();
  assert.deepEqual(getCapturedKnorviaAgentTelemetryEnv(), {});
});

test("B11 工具透传读取：坏 JSON/非对象/非法键名/遥测键一律拒绝", () => {
  assert.deepEqual(readKnorviaToolEnvPassthroughEnv({}), {});
  assert.deepEqual(
    readKnorviaToolEnvPassthroughEnv({ KNORVIA_TOOL_ENV_PASSTHROUGH_JSON: "not json" }),
    {},
  );
  assert.deepEqual(
    readKnorviaToolEnvPassthroughEnv({ KNORVIA_TOOL_ENV_PASSTHROUGH_JSON: "[1,2]" }),
    {},
  );
  assert.deepEqual(
    readKnorviaToolEnvPassthroughEnv({
      KNORVIA_TOOL_ENV_PASSTHROUGH_JSON: JSON.stringify({
        HTTPS_PROXY: "http://good",
        "bad-key": "v",
        OTEL_SERVICE_NAME: "x",
        NUM: 3,
      }),
    }),
    { HTTPS_PROXY: "http://good" },
    "只有可清洗的代理/CA 类键允许透传；遥测键、非法键名、非字符串值拒绝",
  );
});

test("B11 工具透传构建：并入 env 键、排序保证字节稳定、空结果 {}", () => {
  assert.deepEqual(buildKnorviaToolEnvPassthroughEnv({}), {});
  const built = buildKnorviaToolEnvPassthroughEnv({
    HTTPS_PROXY: "http://env-proxy",
    KNORVIA_TOOL_ENV_PASSTHROUGH_JSON: JSON.stringify({
      HTTP_PROXY: "http://json-proxy",
      EXISTING: "0",
    }),
  });
  const parsed = JSON.parse(built.KNORVIA_TOOL_ENV_PASSTHROUGH_JSON);
  assert.deepEqual(Object.keys(parsed), ["HTTP_PROXY", "HTTPS_PROXY"], "按键名排序、env 覆盖 JSON");
  assert.equal(parsed.HTTPS_PROXY, "http://env-proxy");
  assert.equal(parsed.HTTP_PROXY, "http://json-proxy");
  assert.equal("EXISTING" in parsed, false, "不可透传键在读取时已被过滤");
  assert.equal(
    shouldCaptureKnorviaToolEnvPassthroughKey("OTEL_SERVICE_NAME"),
    false,
    "遥测键不透传",
  );
  assert.equal(shouldCaptureKnorviaToolEnvPassthroughKey("NODE_ENV"), false);
  assert.equal(shouldCaptureKnorviaToolEnvPassthroughKey("HTTPS_PROXY"), true);
  assert.equal(shouldCaptureKnorviaToolEnvPassthroughKey("UNRELATED"), false);
});
