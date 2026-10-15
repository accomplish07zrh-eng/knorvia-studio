// SPDX-License-Identifier: Apache-2.0
// shared-02 合同测试：遥测脱敏（B18–B21）。
import assert from "node:assert/strict";
import { test } from "node:test";

import { barrel } from "./entry.mjs";

const {
  resolveSafeTelemetryHostname,
  sanitizeTelemetryErrorMessage,
  sanitizeTelemetryEventDetail,
  collectTelemetryRendererContext,
  TELEMETRY_TEXT_MAX_LENGTH,
  TELEMETRY_SAFE_BUILTIN_MODEL_IDS,
  redactTelemetryText,
  redactTelemetryUrl,
  resolveTelemetryProviderScope,
  resolveTelemetryModelId,
  sanitizeTelemetryModelValue,
  BUILTIN_MODEL_PROVIDER_IDS,
  OFFICIAL_GLM_MODEL_IDS,
} = barrel;

test("B18 resolveSafeTelemetryHostname：仅 http/https、小写、非法返回空串", () => {
  assert.equal(resolveSafeTelemetryHostname("https://API.Example.COM/path"), "api.example.com");
  assert.equal(resolveSafeTelemetryHostname(" http://host:8080/x "), "host");
  assert.equal(resolveSafeTelemetryHostname("ftp://host"), "");
  assert.equal(resolveSafeTelemetryHostname("not a url"), "");
  assert.equal(resolveSafeTelemetryHostname(null), "");
});

test("B18 sanitizeTelemetryErrorMessage 与事件详情脱敏", () => {
  assert.equal(sanitizeTelemetryErrorMessage("secret failure"), "[redacted]");
  assert.equal(sanitizeTelemetryErrorMessage(""), "");
  assert.equal(sanitizeTelemetryErrorMessage(undefined), "");
  const detail = sanitizeTelemetryEventDetail("any_element", {
    error_msg: "boom",
    keep: "v",
  });
  assert.deepEqual(detail, { error_msg: "[redacted]", keep: "v" });
  const login = sanitizeTelemetryEventDetail("app_login_ck", {
    login_url: "https://z.ai/login",
    keep: "v",
  });
  assert.deepEqual(login, { login_url: "z.ai", keep: "v" });
  const bare = sanitizeTelemetryEventDetail("app_login_ck", { login_url: "z.ai" });
  assert.deepEqual(bare, { login_url: "z.ai" });
  const garbage = sanitizeTelemetryEventDetail("app_login_ck", { login_url: "%%%" });
  assert.deepEqual(garbage, { login_url: "" });
});

test("B18 collectTelemetryRendererContext：默认值与显式覆盖", () => {
  const explicit = collectTelemetryRendererContext({
    intlLocale: "zh-CN",
    timeZone: "Asia/Shanghai",
    screen: { width: 1360, height: 900 },
  });
  assert.deepEqual(explicit, {
    clientTimezone: "Asia/Shanghai",
    clientLanguage: "zh-CN",
    screenResolution: "1360x900",
  });
  const fallback = collectTelemetryRendererContext({ screen: { width: 0, height: 0 } });
  assert.match(fallback.screenResolution, /^\d+x\d+$/u);
  assert.equal(typeof fallback.clientTimezone, "string");
});

test("B19 脱敏长度常量与安全名单构成", () => {
  assert.equal(TELEMETRY_TEXT_MAX_LENGTH, 2048);
  for (const id of OFFICIAL_GLM_MODEL_IDS) {
    assert.ok(TELEMETRY_SAFE_BUILTIN_MODEL_IDS.has(id.toLowerCase()), id);
  }
  for (const legacy of ["charglm-4", "codegeex-4", "emohaa"]) {
    assert.ok(TELEMETRY_SAFE_BUILTIN_MODEL_IDS.has(legacy), legacy);
  }
  assert.equal(TELEMETRY_SAFE_BUILTIN_MODEL_IDS.size, OFFICIAL_GLM_MODEL_IDS.length + 3);
});

test("B19 redactTelemetryText：URL、令牌、邮箱、路径、控制字符与截断", () => {
  assert.equal(redactTelemetryText(null), "");
  assert.equal(redactTelemetryText(""), "");
  assert.equal(
    redactTelemetryText("see https://api.example.com/v1?key=abc now"),
    "see https://api.example.com/v1 now",
    "URL 查询串整体丢弃（只留 protocol//host+route）",
  );
  assert.ok(!redactTelemetryText("see https://api.example.com/v1?key=abc now").includes("key=abc"));
  assert.ok(redactTelemetryText("Bearer abcdef123456").includes("Bearer {redacted}"));
  assert.equal(
    redactTelemetryText("token: sk-abcdefghijklmnop"),
    "token: {redacted}",
    "键值规则先于 sk- 规则命中",
  );
  assert.ok(
    redactTelemetryText("sk-abcdefghijklmnop").includes("{secret}"),
    "裸 sk- 令牌按 {secret}",
  );
  assert.ok(redactTelemetryText(`key ghp_${"a".repeat(20)}`).includes("{secret}"));
  assert.ok(redactTelemetryText(`aws AKIA${"A".repeat(16)}`).includes("{secret}"));
  assert.ok(redactTelemetryText("mail user@example.com").includes("{email}"));
  assert.ok(redactTelemetryText("file /Users/alice/secret.txt").includes("{path}"));
  assert.ok(redactTelemetryText("file C:\\Users\\bob\\x.txt").includes("{path}"));
  assert.ok(redactTelemetryText("file /tmp/xyz cache").includes("{path}"));
  const control = redactTelemetryText(`a${String.fromCharCode(7)}b${String.fromCharCode(9)}c`);
  assert.equal(control, "a b c", "控制字符压成空格、制表符并入空白折叠");
  const long = redactTelemetryText("x".repeat(5000));
  assert.equal(long.length, 2048);
  const custom = redactTelemetryText("x".repeat(100), { maxLength: 10 });
  assert.equal(custom.length, 10);
});

test("B19 redactTelemetryText 重跑：已脱敏占位符不再二次吞并（旧实现字面行为）", () => {
  // 旧实现事实：`{redacted}` 后紧跟的 `}` 会被键值对规则再吃掉一个 `}`，
  // 两次运行结果不同；按「旧行为保持原样」断言录制到的两次输出。
  const input = "token abc authorization: Bearer zzz user@example.com";
  const once = redactTelemetryText(input);
  assert.equal(once, "token abc authorization: {redacted} {email}");
  assert.equal(redactTelemetryText(once), "token abc authorization: {redacted}} {email}");
});

test("B20 redactTelemetryUrl：协议哨兵、local_file、路由段脱敏与长度上限", () => {
  assert.equal(redactTelemetryUrl(""), "unknown");
  assert.equal(redactTelemetryUrl(undefined), "unknown");
  assert.equal(redactTelemetryUrl("blob:xyz"), "blob");
  assert.equal(redactTelemetryUrl("data:text/plain,x"), "data");
  assert.equal(redactTelemetryUrl("file:///etc/hosts"), "local_file");
  assert.equal(redactTelemetryUrl("/abs/path"), "local_file");
  assert.equal(redactTelemetryUrl("C:\\Users\\x"), "local_file");
  assert.equal(
    redactTelemetryUrl("https://api.example.com/v1/chat"),
    "https://api.example.com/v1/chat",
  );
  assert.equal(redactTelemetryUrl("api.example.com/v1"), "https://api.example.com/v1");
  assert.equal(
    redactTelemetryUrl("https://h.example/user@name/1234567/abcdef0123456789"),
    "https://h.example/{segment}/{segment}/{segment}",
  );
  const longSegment = `https://h.example/${"z".repeat(300)}`;
  const routed = redactTelemetryUrl(longSegment);
  assert.ok(routed.length < longSegment.length, "长段应被截断");
  assert.ok(routed.endsWith(`/${"z".repeat(128)}`), "单段截 128 字符");
  assert.equal(
    redactTelemetryUrl(`https://h.example/${"a".repeat(300)}`),
    "https://h.example/{segment}",
    "16+ 位十六进制段按 {segment} 脱敏",
  );
});

test("B21 供应商 scope 收敛：内置保留、旧 builtin 识别、其余归 custom", () => {
  assert.deepEqual(resolveTelemetryProviderScope(undefined), {
    providerId: "",
    providerScope: "unknown",
  });
  assert.deepEqual(resolveTelemetryProviderScope(BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan), {
    providerId: BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan,
    providerScope: "builtin",
  });
  assert.equal(resolveTelemetryProviderScope("builtin:zai").providerScope, "builtin");
  const custom = resolveTelemetryProviderScope("my-private-endpoint.example");
  assert.deepEqual(custom, { providerId: "custom", providerScope: "custom" });
});

test("B21 模型 ID 收敛：安全名单小写命中、未知归 custom、unknown scope 空串", () => {
  assert.equal(resolveTelemetryModelId("unknown", "any"), "");
  assert.equal(resolveTelemetryModelId("custom", "whatever"), "custom");
  assert.equal(resolveTelemetryModelId("builtin", "GLM-5.3"), "glm-5.3");
  assert.equal(resolveTelemetryModelId("builtin", "private-model"), "custom");
  assert.equal(
    resolveTelemetryModelId("builtin", "x/charglm-4"),
    "charglm-4",
    "provider/model 取裸名",
  );
  assert.equal(
    resolveTelemetryModelId(
      "builtin",
      `custom:${encodeURIComponent("p")}:${encodeURIComponent("GLM-5")}`,
    ),
    "glm-5",
  );
});

test("B21 sanitizeTelemetryModelValue：三种输入形态", () => {
  assert.equal(sanitizeTelemetryModelValue(undefined), "");
  assert.equal(
    sanitizeTelemetryModelValue(`${BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan}/GLM-5`),
    "glm-5",
  );
  assert.equal(sanitizeTelemetryModelValue("custom-provider/my-model"), "custom");
  assert.equal(sanitizeTelemetryModelValue("GLM-5.3"), "glm-5.3", "裸值按 builtin scope");
});
