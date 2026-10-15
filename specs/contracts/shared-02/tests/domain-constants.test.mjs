// SPDX-License-Identifier: Apache-2.0
// shared-02 合同测试：领域常量与配置 schema（B40–B46、B52）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { barrel, loadModule } from "./entry.mjs";

const {
  AUTOMATION_CREATE_LIMIT,
  AUTOMATION_CREATE_LIMIT_ERROR_CODE,
  isAutomationCreateLimitError,
  parseAutomationRunId,
  OFF_PEAK_TERMINAL_STATUSES,
  isOffPeakTerminalStatus,
  OFF_PEAK_TICKET_EXPIRED_MARKER,
  OFF_PEAK_PROVIDER_IDS,
  resolveOffPeakProviderId,
  ESTIMATED_TOKEN_CHAR_DIVISOR,
  APP_USAGE_RANGES,
  appUsageSnapshotSchema,
  MCP_USAGE_QUOTA_LIMIT_TYPE,
  DEFAULT_LOCALE,
  isUserCommand,
  isPluginCommand,
  appSettingsSchema,
  appSettingsPatchSchema,
  appSettingsOccupationEnum,
  localeSchema,
  KNORVIA_VERSION,
  KNORVIA_COMMIT,
  KNORVIA_BUILD_TIME,
  isDataBaseDirForbiddenWindowsInstallDirError,
  formatZodError,
  nonEmptyStringSchema,
  sshConnectOptionsSchema,
  wslConnectOptionsSchema,
  dockerConnectOptionsSchema,
  knorviaProviderSchema,
} = barrel;

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const constantsSnapshot = JSON.parse(readFileSync(`${fixturesDir}constants-snapshot.json`, "utf8"));

test("B40 定时任务限制与 runId 解析", () => {
  assert.equal(AUTOMATION_CREATE_LIMIT, 20);
  assert.equal(AUTOMATION_CREATE_LIMIT_ERROR_CODE, "AUTOMATION_CREATE_LIMIT_REACHED");
  assert.equal(isAutomationCreateLimitError("AUTOMATION_CREATE_LIMIT_REACHED"), true);
  assert.equal(
    isAutomationCreateLimitError(new Error("x AUTOMATION_CREATE_LIMIT_REACHED y")),
    true,
  );
  assert.equal(isAutomationCreateLimitError("other"), false);
  assert.deepEqual(parseAutomationRunId("auto-1:1760000000000"), {
    automationId: "auto-1",
    trigger: "schedule",
    scheduledAt: 1_760_000_000_000,
  });
  assert.deepEqual(parseAutomationRunId("auto-1:manual:abc"), {
    automationId: "auto-1",
    trigger: "manual",
  });
  assert.equal(parseAutomationRunId("auto-1:manual:"), null, "manual 段为空拒绝");
  assert.equal(parseAutomationRunId("auto-1:0"), null, "scheduledAt 必须为正");
  assert.equal(parseAutomationRunId("auto-1:-5"), null);
  assert.equal(parseAutomationRunId("auto-1:1.5"), null, "非安全整数拒绝");
  assert.equal(parseAutomationRunId("auto-1:NaN"), null);
  assert.equal(parseAutomationRunId("no-separator"), null);
  assert.equal(parseAutomationRunId(":123"), null, "automationId 为空拒绝");
});

test("B41 闲时常量：终态表、票据标记与 provider ID", () => {
  assert.deepEqual(OFF_PEAK_TERMINAL_STATUSES, ["completed", "failed", "cancelled"]);
  assert.equal(isOffPeakTerminalStatus("completed"), true);
  assert.equal(isOffPeakTerminalStatus("running"), false);
  assert.equal(OFF_PEAK_TICKET_EXPIRED_MARKER, "off-peak-ticket-expired");
  assert.deepEqual(OFF_PEAK_PROVIDER_IDS, {
    zai: "account:zai-offpeak-idle-plan",
    bigmodel: "account:bigmodel-offpeak-idle-plan",
  });
  assert.equal(resolveOffPeakProviderId("zai"), "account:zai-offpeak-idle-plan");
  assert.equal(resolveOffPeakProviderId("bigmodel"), "account:bigmodel-offpeak-idle-plan");
});

test("B43 用量统计常量与快照 schema", () => {
  assert.equal(ESTIMATED_TOKEN_CHAR_DIVISOR, 3);
  assert.deepEqual(APP_USAGE_RANGES, ["all", "7d", "30d"]);
  assert.equal(MCP_USAGE_QUOTA_LIMIT_TYPE, "MCP_USAGE_LIMIT");
  assert.equal(constantsSnapshot.ESTIMATED_TOKEN_CHAR_DIVISOR, 3);
  const snapshot = appUsageSnapshotSchema.safeParse({
    range: "7d",
    generatedAt: 1_760_000_000_000,
    timeZone: "UTC",
    source: "agent-db",
    summary: {
      totalTokens: 10,
      inputTokens: 4,
      outputTokens: 6,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cacheHitRate: 0,
      totalSessions: 1,
      totalTurns: 2,
      toolCallCount: 0,
      toolErrorRate: 0,
      modelErrorRate: 0,
      avgTimeToFirstTokenMs: null,
      avgTurnDurationMs: null,
      activeDays: 1,
      currentStreakDays: 1,
      longestSessionMs: 0,
      longestStreakDays: 1,
      peakDayTokens: 10,
      favoriteModel: null,
    },
    heatmap: { startDate: null, endDate: null, maxTokens: 0, weeks: [] },
    dailyModelUsage: [],
    models: [],
    tools: [],
  });
  assert.equal(
    snapshot.success,
    true,
    `合法快照应通过：${snapshot.success ? "" : snapshot.error.message}`,
  );
  assert.equal(appUsageSnapshotSchema.safeParse({ range: "7d" }).success, false, "缺必填字段拒绝");
});

test("B46/B52 DEFAULT_LOCALE 与构建期版本常量（非构建环境回退值）", () => {
  assert.equal(DEFAULT_LOCALE, "zh-CN");
  assert.equal(KNORVIA_VERSION, "0.0.0-dev", "非构建环境回退值");
  assert.equal(KNORVIA_COMMIT, "unknown");
  assert.equal(KNORVIA_BUILD_TIME, "unknown");
});

test("B14 数据目录错误码判定：code 或 message 包含", () => {
  assert.equal(
    isDataBaseDirForbiddenWindowsInstallDirError({
      code: "DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR",
    }),
    true,
  );
  assert.equal(
    isDataBaseDirForbiddenWindowsInstallDirError(
      new Error("boom DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR"),
    ),
    true,
  );
  assert.equal(isDataBaseDirForbiddenWindowsInstallDirError(new Error("other")), false);
});

test("B44 formatZodError 与基础 schema", () => {
  const failed = sshConnectOptionsSchema.safeParse({
    kind: "ssh",
    host: "",
    username: "u",
    port: 70000,
  });
  assert.equal(failed.success, false);
  const message = formatZodError(failed.error);
  assert.ok(message.includes("host:"), message);
  assert.ok(message.includes("port:"), message);
  assert.ok(message.includes("; "), "多 issue 用分号连接");
  const rootFailed = localeSchema.safeParse("xx");
  assert.equal(rootFailed.success, false);
  assert.equal(formatZodError(rootFailed.error).startsWith("<root>:"), true);
  assert.equal(nonEmptyStringSchema.safeParse("  x ").data, "x");
  assert.equal(nonEmptyStringSchema.safeParse("   ").success, false);
  assert.equal(
    sshConnectOptionsSchema.safeParse({ kind: "ssh", host: "h", username: "u", port: 22 }).success,
    true,
  );
  assert.equal(
    sshConnectOptionsSchema.safeParse({ kind: "ssh", host: "h", username: "u", port: 0 }).success,
    false,
  );
  assert.equal(wslConnectOptionsSchema.safeParse({ kind: "wsl" }).success, true);
  assert.equal(
    dockerConnectOptionsSchema.safeParse({ kind: "docker", container: "c" }).success,
    true,
  );
  assert.equal(knorviaProviderSchema.safeParse("knorvia").success, true);
});

test("B45 AppSettings：默认值与旧写输入规范化（金样往返）", () => {
  const defaults = appSettingsSchema.safeParse({});
  assert.equal(defaults.success, true);
  const goldenDefaults = JSON.parse(
    readFileSync(`${fixturesDir}old-write/app-settings.defaults.json`, "utf8"),
  );
  assert.deepEqual(defaults.data, goldenDefaults, "默认值与旧实现录制一致");

  const input = JSON.parse(readFileSync(`${fixturesDir}old-write/app-settings.input.json`, "utf8"));
  const parsedGolden = JSON.parse(
    readFileSync(`${fixturesDir}old-write/app-settings.parsed.json`, "utf8"),
  );
  const parsed = appSettingsSchema.safeParse(input);
  assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.message);
  assert.deepEqual(parsed.data, parsedGolden, "规范化结果与旧实现录制一致");
});

test("B45 旧写 → 新读 → 新写 → 旧读：AppSettings 往返字节稳定", () => {
  const parsedGolden = JSON.parse(
    readFileSync(`${fixturesDir}old-write/app-settings.parsed.json`, "utf8"),
  );
  const rewritten = JSON.stringify(JSON.parse(JSON.stringify(parsedGolden)));
  const reread = appSettingsSchema.safeParse(JSON.parse(rewritten));
  assert.equal(reread.success, true);
  assert.deepEqual(reread.data, parsedGolden, "新写→旧读结果与旧写一致（幂等）");
});

test("B45 appSettingsPatchSchema：可缺省可 null、未知键被剥离（非 strict）、旧写 patch 往返", () => {
  assert.equal(appSettingsPatchSchema.safeParse({}).success, true);
  assert.equal(appSettingsPatchSchema.safeParse({ onboardingOccupation: null }).success, true);
  assert.deepEqual(
    appSettingsPatchSchema.safeParse({ bogus: 1 }).data,
    {},
    "非 strict：未知键被剥离而不是报错（旧行为保持原样）",
  );
  const fixture = JSON.parse(
    readFileSync(`${fixturesDir}old-write/app-settings.patch.json`, "utf8"),
  );
  const parsed = appSettingsPatchSchema.safeParse(fixture.input);
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data, fixture.parsed);
  const roundTrip = appSettingsPatchSchema.safeParse(JSON.parse(JSON.stringify(parsed.data)));
  assert.equal(roundTrip.success, true);
  assert.deepEqual(roundTrip.data, fixture.parsed);
});

test("B45 职业枚举 14 值", () => {
  assert.equal(constantsSnapshot.APP_USAGE_RANGES.length, 3);
  for (const value of [
    "office",
    "developer",
    "independent",
    "infrastructure",
    "product",
    "design",
    "student",
    "creator",
    "operations",
    "marketing",
    "finance",
    "accounting",
    "legal",
    "other",
  ]) {
    assert.equal(appSettingsOccupationEnum.safeParse(value).success, true, value);
  }
  assert.equal(appSettingsOccupationEnum.safeParse("bogus").success, false);
});

test("B15 命令来源判别", () => {
  const base = { id: "c1", name: "demo", prompt: "p", content: "c", filePath: "/x", enabled: true };
  const user = {
    ...base,
    source: "user",
    agentSource: "agent",
    location: { source: "knorvia", scope: "user", directoryPath: "/d" },
    scope: "global",
  };
  const plugin = {
    ...base,
    source: "plugin",
    pluginName: "n",
    pluginMarketplace: "m",
    pluginEnabled: true,
    scope: "global",
  };
  assert.equal(isUserCommand(user), true);
  assert.equal(isUserCommand(plugin), false);
  assert.equal(isPluginCommand(plugin), true);
  assert.equal(isPluginCommand(user), false);
});

test("B45 integratedTerminalShellSelectionSchema（模块路径面，仅包内使用）", async () => {
  const module = await loadModule("validationAppSettings");
  assert.equal(typeof module.integratedTerminalShellSelectionSchema, "object");
  const discriminated = module.integratedTerminalShellSelectionSchema;
  assert.equal(discriminated.safeParse({ mode: "auto" }).success, true);
  assert.equal(discriminated.safeParse({ mode: "bogus" }).success, false);
});
