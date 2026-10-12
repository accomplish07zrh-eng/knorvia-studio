// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// contracts-03 契约测试：类型面（B6）。
// 本包 5 个文件里有 3 个是纯类型/纯声明（skills/index.ts、telemetry 的两份端口与取值表类型、
// 包根的类型再导出），运行时测试断言不到它们，所以这里用"编译期断言"：
// 在**当前入口模式**（source 或 dist）下生成一个 TS 用例文件，用仓库自带 tsc 编译：
//   - 正向用例必须编译通过（类型名、字段名与字段类型都符合契约）；
//   - 反向用例用 @ts-expect-error 固定"必须报错"（类型放宽时这些行会变成未使用指令而报错）。
// 用例文件写在包目录内，保证 node_modules / types 解析与真实构建一致；跑完即删。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { entryFacts } from "./entry.mjs";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const caseFile = join(entryFacts.packageRoot, `.contract-03-types.${process.pid}.case.ts`);
// 一律用 .js 说明符：source 模式下 nodenext 解析到 src/*.ts，dist 模式下解析到 dist/*.d.ts。
const entryDir = entryFacts.mode === "dist" ? "dist" : "src";

const cases = `
import type {
  SkillConfig,
  SkillContent,
  SkillDiagnostic,
  SkillDiagnosticCode,
  SkillDiagnosticSeverity,
  SkillDiscoverRequest,
  SkillLoadOutcome,
  SkillLoadRequest,
  SkillMetadata,
  SkillOperationOptions,
  SkillPolicy,
  SkillPort,
  SkillRoot,
  SkillScope,
  SkillSource,
  SkillTelemetryMetadata,
} from "./${entryDir}/skills/index.js";
import {
  AgentTelemetryOperation,
  TELEMETRY_SCHEMA_VERSION,
} from "./${entryDir}/telemetry/agent-execution.js";
import {
  ModelApiActorKind,
  ModelApiOperation,
  ModelFailureExceptionKind,
  mapModelApiOperationToAgentOperation,
  resolveModelApiCallObservation,
} from "./${entryDir}/telemetry/index.js";
import { formatLocalIsoDate } from "./${entryDir}/time/local-date.js";

// ---- 正向用例：契约里的名字、字段与字段类型都能按文档使用 ----
const scope: SkillScope = "user";
const source: SkillSource = "plugin";
const severity: SkillDiagnosticSeverity = "warning";
const code: SkillDiagnosticCode = "skill_not_found";
const root: SkillRoot = { path: "/skills", scope: "project", source: "agents", priority: 1 };
const withPlugin: SkillRoot = {
  path: "/plugins/acme/skills",
  scope: "user",
  source: "plugin",
  priority: 2,
  pluginId: "acme@1.0.0",
};
const policy: SkillPolicy = { allowImplicitInvocation: true };
const telemetryMeta: SkillTelemetryMetadata = { qualifiedName: "acme:review", pluginId: "acme" };
const metadata: SkillMetadata = {
  name: "review",
  description: "review pull requests",
  path: "/skills/review/SKILL.md",
  directory: "/skills/review",
  rootPath: "/skills",
  scope: "user",
  source: "agents",
  safeToAutoLoad: false,
  frontmatterKeys: ["name", "description"],
  policy,
};
const diagnostic: SkillDiagnostic = {
  code: "skill_too_large",
  severity: "error",
  message: "too large",
  path: "/skills/big/SKILL.md",
  skillName: "big",
};
const outcome: SkillLoadOutcome = { skills: [metadata], diagnostics: [diagnostic], totalDiscovered: 1 };
const content: SkillContent = {
  metadata,
  content: "body",
  baseDirectory: "/skills/review",
  bytesRead: 4,
  sizeBytes: 4,
  truncated: false,
};
const config: SkillConfig = { enabled: true, includeInstructions: false, metadataBudget: 4096, roots: ["/skills"] };
const discoverRequest: SkillDiscoverRequest = { workingDirectory: "/workspace", roots: [root] };
const loadRequest: SkillLoadRequest = { name: "review", workingDirectory: "/workspace", maxBytes: 1024 };
const options: SkillOperationOptions = { signal: new AbortController().signal };
const port: SkillPort = {
  discoverSkills: async (request: SkillDiscoverRequest, operationOptions?: SkillOperationOptions) => {
    void [request, operationOptions];
    return outcome;
  },
  loadSkill: async (request: SkillLoadRequest, operationOptions?: SkillOperationOptions) => {
    void [request, operationOptions];
    return content;
  },
};
const version: 6 = TELEMETRY_SCHEMA_VERSION;
const agentStep: "agent_step" = AgentTelemetryOperation.AgentStep;
const mapped: string = mapModelApiOperationToAgentOperation(ModelApiOperation.WebSearch);
const actorKind: "tool" = ModelApiActorKind.Tool;
const failureKind: "validation" = ModelFailureExceptionKind.Validation;
const resolved = resolveModelApiCallObservation("main_turn", undefined);
const resolvedOperation: ModelApiOperation = resolved.operation;
const resolvedActorKind: ModelApiActorKind = resolved.actorKind;
const resolvedCallId: string = resolved.logicalCallId;
const formatted: string = formatLocalIsoDate(new Date(2026, 0, 5));

// ---- 反向用例：放宽类型会让 @ts-expect-error 变成未使用指令，编译随之失败 ----
// @ts-expect-error SkillScope 只接受 project/user/system/admin
const badScope: SkillScope = "workspace";
// @ts-expect-error SkillSource 只接受 agents/knorvia/bundled/plugin/remote
const badSource: SkillSource = "marketplace";
// @ts-expect-error 诊断等级只有 warning / error
const badSeverity: SkillDiagnosticSeverity = "info";
// @ts-expect-error 诊断码是封闭联合，不接受任意字符串
const badCode: SkillDiagnosticCode = "skill_unknown_problem";
// @ts-expect-error SkillRoot.priority 必填
const badRoot: SkillRoot = { path: "/p", scope: "user", source: "agents" };
// @ts-expect-error SkillMetadata.name 必填
const badMetadata: SkillMetadata = { description: "d" };
// @ts-expect-error SkillContent.truncated 必须显式给出
const badContent: SkillContent = {
  metadata,
  content: "body",
  baseDirectory: "/skills/review",
  bytesRead: 4,
  sizeBytes: 4,
};
// @ts-expect-error SkillConfig.metadataBudget 是 number
const badConfig: SkillConfig = { enabled: true, includeInstructions: true, metadataBudget: "4096", roots: [] };
// @ts-expect-error TELEMETRY_SCHEMA_VERSION 是字面量 6
const badVersion: 5 = TELEMETRY_SCHEMA_VERSION;
// @ts-expect-error ModelApiOperation 没有 web_search_v2 这个取值
const badOperation: ModelApiOperation = "web_search_v2";
// @ts-expect-error ModelFailureExceptionKind 没有 parse_error
const badFailure: ModelFailureExceptionKind = "parse_error";
// @ts-expect-error formatLocalIsoDate 只接受 Date
const badDate = formatLocalIsoDate("2026-01-05");

void [
  scope, source, severity, code, root, withPlugin, policy, telemetryMeta, metadata, diagnostic,
  outcome, content, config, discoverRequest, loadRequest, options, port, version, agentStep,
  mapped, actorKind, failureKind, resolvedOperation, resolvedActorKind, resolvedCallId, formatted,
  badScope, badSource, badSeverity, badCode, badRoot, badMetadata, badContent, badConfig,
  badVersion, badOperation, badFailure, badDate,
];
`;

test("B6 类型面：正向用例通过编译、反向用例必须报错", () => {
  writeFileSync(caseFile, cases);
  try {
    const tsc = join(repoRoot, "node_modules", "typescript", "bin", "tsc");
    let output = "";
    let failed = false;
    try {
      output = execFileSync(
        process.execPath,
        [
          tsc,
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
      `类型用例编译失败（入口模式 ${entryFacts.mode}）：\n${output.trim().split("\n").slice(0, 20).join("\n")}`,
    );
  } finally {
    rmSync(caseFile, { force: true });
  }
});
