import assert from "node:assert/strict";
import { test } from "node:test";
import { studioWorkflowOutputInstruction, studioWorkflowOutputNames } from "@knorvia/services";
import { createWorkflowGraph, TASK_TEMPLATES } from "../src/studio/workflow/types.js";

/**
 * 复核点名的缺口：Host 知道答案必须长什么样，但这份要求没有进入真实模型请求。
 *
 * 这里用**正式内置模板**（不是手工种入的简化工作流）构造图，逐节点核对：
 * 声明了输出的节点必须产出一份能直接附加到请求里的格式要求，且**点名每个输出键**；
 * 没有声明输出的节点不附加任何东西（旧工作流行为不变）。
 *
 * 这个用例之所以能挡住"夹具碰巧答对"：它检查的是模板数据本身有没有把要求转出来，
 * 而不是运行期某个夹具是否恰好返回了正确 JSON。
 */
for (const language of ["zh", "en"] as const) {
  test(`内置模板里每个声明输出的节点都能产出可派发的输出契约（${language}）`, () => {
    let declared = 0;
    for (const template of TASK_TEMPLATES) {
      const graph = createWorkflowGraph(template, language);
      for (const node of graph.nodes) {
        const names = studioWorkflowOutputNames(node.data);
        const instruction = studioWorkflowOutputInstruction(node.data);
        if (!names.length) {
          assert.equal(
            instruction,
            undefined,
            `${template}/${node.id} 未声明输出时不应附加格式要求`,
          );
          continue;
        }
        declared += 1;
        assert.ok(instruction, `${template}/${node.id} 声明了输出，却没有可派发的格式要求`);
        for (const name of names)
          assert.match(
            instruction!,
            new RegExp(name, "u"),
            `${template}/${node.id} 的要求必须点名输出键 ${name}`,
          );
        if (names.length > 1) {
          assert.match(instruction!, /JSON/u, "多输出节点必须明确要求返回 JSON 对象");
          assert.match(instruction!, /键/u, "多输出节点必须说明按名建键");
        }
      }
    }
    assert.ok(declared > 0, "内置模板里应当确实存在声明了输出的节点，否则该用例是空断言");
  });
}
