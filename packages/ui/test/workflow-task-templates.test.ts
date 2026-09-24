import assert from "node:assert/strict";
import { test } from "node:test";
import { validateStudioWorkflow } from "@knorvia/services";
import { validateWorkflowGraph } from "../src/studio/workflow/graph.js";
import { workflowDefinition } from "../src/studio/workflow/workflowDrafts.js";
import { createWorkflowGraph } from "../src/studio/workflow/types.js";

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
