import assert from "node:assert/strict";
import { mock, test } from "node:test";

test("synthetic Markdown keeps identity, permission fields and structured metadata", async () => {
  const selection = { model: { kind: "builtin", modelId: "synthetic-model" } };
  mock.module("@knorvia/shared", {
    namedExports: {
      createAgentStateId: (input: { name: string; scope: string; source: string }) =>
        `${input.source}:${input.scope}:${input.name}`,
      parseSubagentMarkdownSelection: () => selection,
      formatSubagentMarkdownModel: () => "synthetic-model",
    },
  });
  const { parseSubagentMarkdown: parse, serializeSubagentMarkdown: serialize } =
    await import("../src/subagents/subagentMarkdown.js");
  const config = {
    name: "synthetic-agent",
    description: "synthetic description",
    systemPrompt: "  synthetic prompt \n",
    permissionMode: "plan" as const,
    maxTurns: 3,
    background: false,
    injectAgentsMd: false,
    tools: ["Bash(echo synthetic, *)", "Read"],
    disallowedTools: ["Write"],
    skills: ["synthetic-skill"],
    mcpServers: [{ name: "synthetic-port", config: { type: "stdio", command: "never-run" } }],
  };
  const content = serialize(config);
  assert.ok(
    content.startsWith('---\nname: "synthetic-agent"\ndescription: "synthetic description"\n'),
  );
  assert.ok(content.endsWith("---\n\nsynthetic prompt\n"));
  const result = parse({
    content: "\uFEFF" + content.replace(/\n/g, "\r\n"),
    path: "/synthetic/agent.md",
    scope: "workspace",
  }).agent;
  assert.deepEqual(result, {
    id: "user:workspace:synthetic-agent",
    name: config.name,
    description: config.description,
    systemPrompt: "synthetic prompt",
    modelSelection: selection,
    tools: config.tools,
    disallowedTools: config.disallowedTools,
    skills: config.skills,
    permissionMode: "plan",
    maxTurns: 3,
    background: false,
    injectAgentsMd: false,
    mcpServers: config.mcpServers,
    path: "/synthetic/agent.md",
    scope: "workspace",
    source: "user",
    enabled: true,
    readOnly: false,
  });
  assert.equal(
    parse({ content: "prompt only", path: "/synthetic/none.md", scope: "user" }).diagnostic?.code,
    "agent_missing_frontmatter",
  );
  assert.equal(
    parse({
      content: "---\ndescription: synthetic\n---\nprompt",
      path: "/synthetic/missing.md",
      scope: "user",
    }).diagnostic?.code,
    "agent_missing_required_frontmatter",
  );
  assert.equal(
    parse({
      content: content.replace("permissionMode: plan", "permissionMode: bypass"),
      path: "/synthetic/agent.md",
      scope: "built-in",
    }).agent?.permissionMode,
    undefined,
  );
});
