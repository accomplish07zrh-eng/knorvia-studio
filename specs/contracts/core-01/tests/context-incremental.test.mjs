// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：X12 ContextBuilder 增量方法（addSection/setEnvInfo）与 meta_user attachment。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const context = await loadFile("context/index");
const envInfo = { cwd: "/w", platform: "linux", isGitRepository: false, nodeVersion: "v24.0.0" };

test("X12 ContextBuilder：addSection 追加不去重、setEnvInfo 替换环境段", async () => {
  const builder = context.createContextBuilder({ workingDirectory: "/w", envInfo });
  const base = await builder.build();
  assert.deepEqual(
    base.sections.map((section) => section.source),
    ["cli_prefix", "identity", "dynamic_behavior", "env_info", "context_management"],
    "非 git 仓库的最小配置没有 git 段",
  );

  const extra = context.buildCurrentDateSection("2026-01-05");
  builder.addSection(extra);
  builder.addSection(extra);
  const appended = await builder.build();
  assert.deepEqual(
    appended.sections.map((section) => section.name).slice(-2),
    ["Current Date", "Current Date"],
    "addSection 只追加，不去重",
  );
  assert.equal(appended.sections.length, base.sections.length + 2);

  builder.setEnvInfo({
    cwd: "/other",
    platform: "darwin",
    isGitRepository: true,
    nodeVersion: "v24.1.0",
  });
  const after = await builder.build();
  const env = after.sections.find((section) => section.name === "Environment Info");
  assert.ok(env.content.includes("- Primary working directory: /other"));
  assert.ok(env.content.includes("- Is a git repository: yes"));
  assert.ok(env.content.includes("- Platform: darwin"));
  assert.ok(
    after.sections.some((section) => section.source === "system_context"),
    "git 仓库下会多出 system_context 段",
  );
  assert.equal(after.sections.filter((section) => section.name === "Current Date").length, 2);
});

test("X12 meta_user attachment：来源标记与正文包裹", async () => {
  const builder = context.createContextBuilder({
    workingDirectory: "/w",
    envInfo,
    currentDate: "2026-01-05",
  });
  const result = await builder.build();
  assert.ok(Array.isArray(result.metaUserAttachments));
  assert.equal(result.metaUserAttachments.length, 1);
  const [attachment] = result.metaUserAttachments;
  assert.equal(attachment.source, "context_prefix");
  assert.ok(
    attachment.content.startsWith(
      "As you answer the user's questions, you can use the following context:\n",
    ),
  );
  assert.ok(attachment.content.includes("# currentDate\nToday's date is 2026-01-05."));
  assert.ok(attachment.content.includes("      IMPORTANT: this context may or may not be relevant"));
});
