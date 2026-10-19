// SPDX-License-Identifier: Apache-2.0
// shared-04 合同测试：反馈工单常量、脱敏与 onboarding 记录（B29–B31）。
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadModule, entryLabel } from "./entry.mjs";
import { assertJsonEqual, readFixture } from "./fixtures.mjs";

const fixture = readFixture("feedback.json");
const feedback = await loadModule("feedback.ts");
const privacy = await loadModule("feedbackPrivacy.ts");
const onboarding = await loadModule("onboardingRecord.ts");

test(`B29 feedback 常量：12 模块、4 类型、3 严重度与框架 sentinel（${entryLabel}）`, () => {
  assertJsonEqual(
    {
      modules: feedback.FEEDBACK_TICKET_MODULES,
      types: feedback.FEEDBACK_TICKET_TYPES,
      severities: feedback.FEEDBACK_TICKET_SEVERITIES,
      defaultFramework: feedback.DEFAULT_FEEDBACK_TICKET_FRAMEWORK,
      frameworkNone: feedback.FEEDBACK_FRAMEWORK_NONE,
      frameworkOptions: feedback.FEEDBACK_TICKET_FRAMEWORK_OPTIONS,
      frameworks: feedback.FEEDBACK_TICKET_FRAMEWORKS,
    },
    fixture.constants,
  );
  assert.equal(feedback.FEEDBACK_TICKET_MODULES.length, 12);
  assert.equal(feedback.FEEDBACK_FRAMEWORK_NONE, "none");
  assert.equal(feedback.DEFAULT_FEEDBACK_TICKET_FRAMEWORK, "agent");
  assertJsonEqual(feedback.FEEDBACK_TICKET_FRAMEWORKS[0], { value: "none", label: "未指定" });
});

test("B30 feedbackPrivacy：敏感键、诊断键、URL 路径与私钥逐字脱敏", () => {
  for (const entry of fixture.redaction) {
    assert.equal(
      privacy.redactFeedbackText(entry.input, entry.options),
      entry.output,
      `${JSON.stringify(entry.input)} ${JSON.stringify(entry.options)}`,
    );
  }
  assert.equal(
    privacy.redactFeedbackText('{"apiKey":"abc","content":"hello"}'),
    '{"apiKey":"[REDACTED]","content":"hello"}',
  );
  assert.equal(privacy.redactFeedbackText("password=x"), "password=[REDACTED]");
  assert.equal(privacy.redactFeedbackText("/home/me/x"), "[USER_PATH]");
});

test("B31 onboardingRecord：version 1、deviceMid 非空、跳过记 null", () => {
  for (const entry of fixture.onboarding.file) {
    assert.equal(
      onboarding.onboardingRecordFileSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
  for (const entry of fixture.onboarding.entry) {
    assert.equal(
      onboarding.onboardingRecordEntrySchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
  assert.equal(
    onboarding.onboardingRecordFileSchema.safeParse({ version: 1, deviceMid: "d", entries: [] })
      .success,
    true,
  );
  assert.equal(
    onboarding.onboardingRecordEntrySchema.safeParse({
      userId: null,
      occupation: null,
      interfaceMode: null,
      memoryEnabled: null,
      proactiveSuggestionsEnabled: null,
      completedAt: "t",
      uploadState: "pending",
    }).success,
    true,
  );
});
