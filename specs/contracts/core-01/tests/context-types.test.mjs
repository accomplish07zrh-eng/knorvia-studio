// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：X13 context 类型面（B6 式编译期用例）。
// 在当前入口模式（source/dist）下生成一个 TS 用例文件放在 core 包目录内，用仓库自带 tsc 编译：
// 正向用例必须通过，反向用例用 @ts-expect-error 固定"必须报错"（类型放宽时该指令会变成未使用而报错）。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const packageRoot = fileURLToPath(new URL("../../../../apps/cli/packages/core/", import.meta.url));
const entryDir = process.env.KNORVIA_CORE_ENTRY === "dist" ? "dist" : "src";
const caseFile = join(packageRoot, `.core-01-context-types.${process.pid}.case.ts`);

const cases = `
import type {
  ContextBuildResult,
  ContextBuilderConfig,
  ContextCacheHint,
  ContextInjectionTarget,
  ContextMetaUserAttachment,
  ContextSection,
  ContextSource,
  OutputStylePromptConfig,
  PresentationSurface,
  WorkflowActorContext,
} from "./${entryDir}/context/index.js";

const injection: ContextInjectionTarget = "meta_user";
const cacheHint: ContextCacheHint = "dynamic";
const surface: PresentationSurface = "knorvia_desktop";
const source: ContextSource = "current_date";

const section: ContextSection = {
  name: "Current Date",
  source: "current_date",
  injectionTarget: "meta_user",
  cacheHint: "dynamic",
  chars: 1,
  tokens: 1,
  content: "x",
  preview: "x",
};

const style: OutputStylePromptConfig = { name: "review", prompt: "be terse" };
const actor: WorkflowActorContext = { name: "a", persona: "p" };
const emptyActor: WorkflowActorContext = {};

const attachment: ContextMetaUserAttachment = { source: "context_prefix", content: "x" };
const result: ContextBuildResult = {
  sections: [section],
  totalChars: 1,
  totalTokens: 1,
  systemMessages: [],
  metaUserAttachments: [attachment],
};

// EnvInfo 必填：cwd / platform / shell / osVersion / nodeVersion（isGitRepository 可选）。
const envInfo = {
  cwd: "/w",
  platform: "linux",
  shell: "/bin/bash",
  osVersion: "Linux 6.0",
  nodeVersion: "v24.0.0",
  isGitRepository: false,
};
const config: ContextBuilderConfig = { workingDirectory: "/w", envInfo };
const configWithExtras: ContextBuilderConfig = {
  workingDirectory: "/w",
  envInfo,
  currentDate: "2026-01-05",
  skillMetadataBudget: 1000,
  workflowActor: actor,
  outputStyle: style,
};

// @ts-expect-error ContextInjectionTarget 只有 system / meta_user
const badInjection: ContextInjectionTarget = "user";
// @ts-expect-error ContextCacheHint 只有 stable / dynamic
const badCacheHint: ContextCacheHint = "volatile";
// @ts-expect-error PresentationSurface 只有 terminal / knorvia_desktop
const badSurface: PresentationSurface = "web";
// @ts-expect-error ContextSection 缺少 chars
const badSection: ContextSection = {
  name: "n",
  source: "current_date",
  injectionTarget: "system",
  cacheHint: "stable",
  tokens: 1,
  content: "x",
  preview: "x",
};
// @ts-expect-error OutputStylePromptConfig 需要 prompt
const badStyle: OutputStylePromptConfig = { name: "review" };
// @ts-expect-error ContextBuilderConfig 需要 envInfo
const badConfig: ContextBuilderConfig = { workingDirectory: "/w" };
// @ts-expect-error ContextBuildResult 需要 metaUserAttachments
const badResult: ContextBuildResult = { sections: [], totalChars: 0, totalTokens: 0, systemMessages: [] };

void [injection, cacheHint, surface, source, style, emptyActor, result, configWithExtras,
  badInjection, badCacheHint, badSurface, badSection, badStyle, badConfig, badResult];
`;

test("X13 context 类型面：正向用例通过编译、反向用例必须报错", () => {
  writeFileSync(caseFile, cases);
  try {
    let output = "";
    let failed = false;
    try {
      output = execFileSync(
        process.execPath,
        [
          join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
          "--noEmit",
          "--strict",
          "--skipLibCheck",
          "--module",
          "nodenext",
          "--moduleResolution",
          "nodenext",
          "--target",
          "esnext",
          "--types",
          "node",
          caseFile,
        ],
        { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      );
    } catch (error) {
      failed = true;
      output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }
    assert.equal(
      failed,
      false,
      `类型用例编译失败（入口 ${entryDir}）：\n${output.trim().split("\n").slice(0, 12).join("\n")}`,
    );
  } finally {
    rmSync(caseFile, { force: true });
  }
});
