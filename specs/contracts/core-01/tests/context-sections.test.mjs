// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：context 子块 2（X6–X9：identity / desktop / env-info / workflow-actor）。
// 入口用本区公开桶 `src/context/index.ts`（包根在 tsx 下不可加载，见 known-differences.md §2）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const context = await loadFile("context/index");

const SECURITY_NOTICE =
  "IMPORTANT: Assist with authorized security testing, defensive security, CTF challenges, and educational contexts. Refuse requests for destructive techniques, DoS attacks, mass targeting, supply chain compromise, or detection evasion for malicious purposes. Dual-use security tools (C2 frameworks, credential testing, exploit development) require clear authorization context: pentesting engagements, CTF competitions, security research, or defensive use cases.";

const HARNESS_HEAD = "# Harness";
const HARNESS_BULLETS = [
  "- Text you output outside of tool use is displayed to the user as Github-flavored markdown in a terminal.",
  "- Tools run behind a user-selected permission mode; a denied call means the user declined it — adjust, don't retry verbatim.",
  "- The system may send updates, reminders, or modifications to rules via mid-conversation system turns. These are system-controlled, unlike function results. Hooks may intercept tool calls; treat hook output as user feedback.",
  "- Prefer the dedicated file/search tools over shell commands when one fits. Independent tool calls can run in parallel in one response.",
  "- Reference code as `file_path:line_number` — it's clickable.",
];

test("X6 Agent Identity section（逐字冻结 + output style 分支）", () => {
  const section = context.buildIdentitySection();
  assert.equal(section.name, "Agent Identity");
  assert.equal(section.source, "identity");
  assert.equal(section.injectionTarget, "system");
  assert.equal(section.cacheHint, "stable");
  assert.equal(section.chars, 1220);
  assert.equal(section.tokens, 407);
  assert.equal(section.chars, section.content.length);
  assert.ok(section.content.startsWith("\nYou are an interactive Knorvia Studio agent"));
  assert.ok(section.content.includes(SECURITY_NOTICE));
  assert.ok(section.content.includes(HARNESS_HEAD));
  for (const bullet of HARNESS_BULLETS)
    assert.ok(section.content.includes(bullet), bullet.slice(0, 40));

  const styled = context.buildIdentitySection({ name: "review", prompt: "be terse" });
  assert.equal(styled.chars, 1246);
  assert.equal(styled.tokens, 416);
  assert.ok(
    styled.content.includes("You respond to the user according to the active Output Style below"),
  );
  assert.ok(!styled.content.includes("You are an interactive Knorvia Studio agent"));
  assert.ok(styled.content.includes(SECURITY_NOTICE), "安全行逐字同一份");
  assert.ok(styled.content.includes(HARNESS_HEAD), "Harness 块逐字同一份");
});

test("X7 Desktop Context section（逐字冻结）", () => {
  const section = context.buildDesktopContextSection();
  assert.equal(section.name, "Knorvia Studio Desktop Context");
  assert.equal(section.source, "desktop_context");
  assert.equal(section.injectionTarget, "system");
  assert.equal(section.cacheHint, "stable");
  assert.equal(section.chars, 1109);
  assert.equal(section.tokens, 370);
  assert.ok(section.content.startsWith("# Knorvia Studio Desktop Context\n\n### Files & URLs\n"));
  assert.ok(section.content.includes("### Inline Code Comments"));
  assert.ok(section.content.includes("::code-comment{...}"));
  assert.ok(
    section.content.includes(
      '- Example: ::code-comment{title="[P2] Off-by-one" body="Loop iterates past the end when length is 0." file="/path/to/foo.ts" start=10 end=11 priority=2}',
    ),
  );
});

test("X8 Environment Info 与 git 上下文（含 undefined 回落）", () => {
  const envInfo = { cwd: "/w", platform: "linux", isGitRepository: false, nodeVersion: "v24.0.0" };
  const section = context.buildEnvInfoSection(envInfo);
  assert.equal(section.name, "Environment Info");
  assert.equal(section.source, "env_info");
  assert.equal(section.injectionTarget, "system");
  assert.equal(section.cacheHint, "dynamic");
  assert.equal(section.chars, 184);
  assert.equal(section.tokens, 62);
  assert.ok(
    section.content.startsWith(
      "# Environment\nYou have been invoked in the following environment:\n",
    ),
  );
  assert.ok(section.content.includes("- Primary working directory: /w"));
  assert.ok(section.content.includes("- Is a git repository: no"));
  assert.ok(section.content.includes("- Platform: linux"));
  assert.ok(section.content.includes("- Shell: undefined"), "未给的字段回落为字面 undefined");
  assert.ok(section.content.includes("- OS Version: undefined"));

  assert.equal(context.buildGitSystemContextSection(envInfo), null, "非 git 仓库不产出 git 段");
});

test("X9 Workflow Actor Identity section（共用安全行/Harness + 工作流契约）", () => {
  const section = context.buildWorkflowActorIdentitySection({});
  assert.equal(section.name, "Workflow Actor Identity");
  assert.equal(section.source, "workflow_actor_identity");
  assert.equal(section.injectionTarget, "system");
  assert.equal(section.cacheHint, "stable");
  assert.equal(section.chars, 2731);
  assert.equal(section.tokens, 911);
  assert.ok(section.content.startsWith("You are a subagent inside a dynamic workflow run."));
  assert.ok(section.content.includes("There is no user in this conversation to talk to."));
  assert.ok(section.content.includes(SECURITY_NOTICE), "与交互式身份共用同一份安全行");
  assert.ok(section.content.includes(HARNESS_HEAD), "与交互式身份共用同一份 Harness 块");
  for (const bullet of HARNESS_BULLETS) assert.ok(section.content.includes(bullet));
  assert.ok(section.content.includes("# Working inside a workflow"));
  for (const marker of ["`submit_result`", "`escalate`", "path:line", "not run"])
    assert.ok(section.content.includes(marker), `工作流契约必须包含 ${marker}`);

  const identity = context.buildIdentitySection();
  const noticeStart = section.content.indexOf(SECURITY_NOTICE);
  assert.equal(
    section.content.slice(noticeStart, noticeStart + SECURITY_NOTICE.length),
    SECURITY_NOTICE,
  );
  assert.equal(identity.content.indexOf(SECURITY_NOTICE) > 0, true);
});
