import assert from "node:assert/strict";
import { test } from "node:test";
import { studioWorkflowParams, validateStudioWorkflow } from "@knorvia/services";
import { validateWorkflowGraph } from "../src/studio/workflow/graph.js";
import { workflowDefinition } from "../src/studio/workflow/workflowDrafts.js";
import { createWorkflowGraph, TASK_TEMPLATES } from "../src/studio/workflow/types.js";
import { EVIDENCE_RULE, TEMPLATE_SCENARIOS } from "../src/studio/workflow/templateScenarios.js";

for (const language of ["zh", "en"] as const) {
  test(`task templates are editable, executable graphs in ${language}`, () => {
    const ids = new Set<string>();
    for (const template of ["releaseCheck", "codeReview", "documentCleanup"] as const) {
      const graph = createWorkflowGraph(template, language);
      assert.deepEqual(validateWorkflowGraph(graph), [], template);
      const definition = workflowDefinition({
        ...graph,
        id: crypto.randomUUID(),
        name: template,
        workspacePath: "C:/example",
        updatedAt: 0,
      });
      assert.deepEqual(validateStudioWorkflow(definition), [], template);
      assert.equal(graph.nodes.filter((node) => node.data.kind === "agent").length, 2);
      for (const node of graph.nodes) {
        assert.equal(ids.has(node.id), false);
        ids.add(node.id);
      }
    }
  });
}

test("scenario templates carry evidence rules, declared parameters and an explicit gate", () => {
  for (const language of ["zh", "en"] as const) {
    for (const template of TASK_TEMPLATES) {
      const graph = createWorkflowGraph(template, language);
      const scenario = TEMPLATE_SCENARIOS[template];
      assert.equal(graph.nodes.filter((node) => node.data.kind === "agent").length, 2, template);
      const declared: string[] = [];
      for (const node of graph.nodes) {
        // 模板永远不默认写入权限；只读是最严格的声明。
        assert.notEqual(node.data.permission, "full-access", `${template}:${language}`);
        if (node.data.kind === "agent")
          assert.ok(
            node.data.prompt.includes(EVIDENCE_RULE[language]),
            `${template}:${language}:${node.data.kind}`,
          );
        for (const param of studioWorkflowParams(node.data)) {
          declared.push(param.name);
          // 参数说明只存在于场景文案里；提示文案不得写进 params（导入白名单会拒绝）。
          assert.ok(scenario.paramText[param.name], `${template}:${param.name}`);
          assert.ok(param.label?.trim(), `${template}:${param.name}`);
        }
      }
      assert.ok(declared.length > 0, template);
    }
  }
});

test("the release check scenario never publishes, pushes or tags", () => {
  for (const language of ["zh", "en"] as const) {
    const graph = createWorkflowGraph("releaseCheck", language);
    const prompts = graph.nodes.map((node) => node.data.prompt).join("\n");
    assert.match(prompts, /npm publish/);
    assert.match(prompts, /git push/);
    assert.match(prompts, /git tag/);
    assert.ok(
      graph.nodes.some((node) => node.data.kind === "approval"),
      language,
    );
  }
});

test("documentation cleanup and the delivery pack gate on the right node kinds", () => {
  const kinds = (template: (typeof TASK_TEMPLATES)[number]) =>
    createWorkflowGraph(template, "zh").nodes.map((node) => node.data.kind);
  // 文档整理：盘点后必须经人工确认才进入修正步骤。
  assert.deepEqual(kinds("documentCleanup"), ["start", "agent", "approval", "agent", "end"]);
  // 交付包：创作节点把文案/参考素材与最终交付清单串起来。
  assert.deepEqual(kinds("contentPack"), ["start", "agent", "creation", "agent", "end"]);
  assert.deepEqual(kinds("releaseCheck"), ["start", "agent", "agent", "approval", "end"]);
  assert.deepEqual(kinds("codeReview"), ["start", "agent", "agent", "end"]);
});
