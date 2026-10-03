// Behavioral contract extracted after source exposure; no new license determination.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type {
  SkillContent,
  SkillLoadRequest,
  SkillOperationOptions,
  SkillPort,
} from "@knorvia/contracts";
import type { ToolEntry, ToolExecutionContext } from "../src/tool/types.js";
import { invocation } from "./tool-invocation-fixture.js";

// Test-only switch: unset uses source; "1" verifies the freshly built consumers.
const emitted = process.env.KNORVIA_SKILL_TEST_EMITTED === "1";
const root = emitted ? "../dist/" : "../src/";
export const { skillToolEntry: entry } = (await import(
  new URL(`${root}tool/handlers/skill.${emitted ? "js" : "ts"}`, import.meta.url).href
)) as { skillToolEntry: ToolEntry };
export const { executeToolCall } = await import(
  new URL(`${root}tool/executor/call-runner.${emitted ? "js" : "ts"}`, import.meta.url).href
);
export const handlers = await import(
  new URL(`${root}tool/handlers/index.${emitted ? "js" : "ts"}`, import.meta.url).href
);
export const registryModule = await import(
  new URL(`${root}tool/registry.${emitted ? "js" : "ts"}`, import.meta.url).href
);
export const permissionModule = await import(
  new URL(`${root}permission/service.${emitted ? "js" : "ts"}`, import.meta.url).href
);
export const frozen = JSON.parse(
  await readFile(new URL("./skill-tool-contract.json", import.meta.url), "utf8"),
) as {
  baseline: string;
  entryKeys: string[];
  declaration: Record<string, unknown>;
  outputCases: {
    label: string;
    name: string;
    content: string;
    baseDirectory: string;
    truncated: boolean;
    expected: string;
  }[];
};

export function loaded(overrides: Partial<SkillContent> = {}): SkillContent {
  return {
    metadata: {
      name: "notes",
      qualifiedName: "demo:notes",
      pluginId: "demo@example",
      description: "Example skill",
      path: "/example/skills/notes/SKILL.md",
      directory: "/example/skills/notes",
      rootPath: "/example/skills",
      scope: "project",
      source: "plugin",
      safeToAutoLoad: false,
      frontmatterKeys: ["name", "description"],
    },
    content: "Use the example instructions.",
    baseDirectory: "/example/skills/notes",
    bytesRead: 29,
    sizeBytes: 29,
    truncated: false,
    ...overrides,
  };
}

export function fixture() {
  const timeline: string[] = [];
  const requests: { request: SkillLoadRequest; options?: SkillOperationOptions }[] = [];
  const metadata: unknown[] = [];
  const result = loaded();
  const behavior = {
    async load(): Promise<SkillContent> {
      return result;
    },
  };
  const port: SkillPort = {
    discoverSkills: async () => assert.fail("Skill execution must not rediscover"),
    async loadSkill(request, options) {
      assert.equal(this, port);
      timeline.push("load");
      requests.push({ request, options });
      return behavior.load();
    },
  };
  const controller = new AbortController();
  const context: ToolExecutionContext = {
    toolCallId: "example-call",
    traceId: "example-trace",
    spanId: "example-span",
    parentSpanId: "example-parent",
    abortSignal: controller.signal,
    sessionId: "example-session",
    turnId: "example-turn",
    workingDirectory: "C:\\Example Workspace",
    workspaceRoot: "/example/root",
    skillPort: port,
    recordSkillTelemetryMetadata(value) {
      assert.equal(this, context);
      timeline.push("metadata");
      metadata.push(value);
    },
  };
  return { context, controller, timeline, requests, metadata, result, behavior, port };
}

export function executorFixture() {
  // 保留公共 fixture 的观测包装；直接覆盖 handler 会跳过时间线及上下文记录。
  const { handler, ...declaration } = entry;
  const f = invocation(declaration);
  f.behavior.handler = handler;
  const direct = fixture();
  f.call.input = { skill: "demo:notes", args: "accepted but not injected" };
  f.deps.skillPort = direct.port;
  return {
    ...f,
    direct,
    execute: (options?: Parameters<typeof f.run>[0]) => f.run(options, executeToolCall),
  };
}
