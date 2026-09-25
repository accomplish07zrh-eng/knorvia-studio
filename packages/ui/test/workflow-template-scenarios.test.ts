import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeStepOutputs,
  resolveStudioWorkflowParams,
  validateStudioWorkflow,
  validateStudioWorkflowPermissions,
  type StudioOutputRef,
  type StudioWorkflowDefinition,
} from "@knorvia/services";
import { validateWorkflowGraph } from "../src/studio/workflow/graph.js";
import { workflowDefinition } from "../src/studio/workflow/workflowDrafts.js";
import {
  createWorkflowGraph,
  TASK_TEMPLATES,
  type StudioWorkflow,
  type TaskTemplate,
} from "../src/studio/workflow/types.js";
import {
  TEMPLATE_SCENARIOS,
  fixtureDeliverables,
  mediaRefProblem,
  PLACEHOLDER_PATTERN,
  scenarioOutputNames,
  type ScenarioFixture,
  type ScenarioLanguage,
} from "../src/studio/workflow/templateScenarios.js";
import {
  decodeWorkflowFile,
  encodeWorkflowFile,
  WORKFLOW_FILE_VERSION,
  WorkflowFileError,
} from "../src/studio/workflow/workflowFiles.js";

const LANGUAGES = ["zh", "en"] as const;

function scenarioWorkflow(template: TaskTemplate, language: ScenarioLanguage): StudioWorkflow {
  return {
    ...createWorkflowGraph(template, language),
    id: `template-${template}-${language}`,
    name: `${template}-${language}`,
    workspacePath: "C:/example",
    workspaceMode: "isolated",
    updatedAt: 0,
  };
}
function definitionOf(
  template: TaskTemplate,
  language: ScenarioLanguage,
): StudioWorkflowDefinition {
  return workflowDefinition(scenarioWorkflow(template, language));
}
function parametersOf(template: TaskTemplate) {
  const specs = new Map<
    string,
    { name: string; type: string; default?: string; required?: boolean }
  >();
  for (const step of TEMPLATE_SCENARIOS[template].steps)
    for (const param of step.params ?? []) if (!specs.has(param.name)) specs.set(param.name, param);
  return [...specs.values()];
}
function sampleValue(type: string): string {
  return type === "number" ? "1" : type === "boolean" ? "true" : "fixture";
}
function stepOutputs(fixture: ScenarioFixture, key: string): StudioOutputRef[] {
  return fixture.steps.find((step) => step.key === key)?.outputs ?? [];
}

test("every scenario template is a valid graph for zh and en", () => {
  for (const language of LANGUAGES) {
    for (const template of TASK_TEMPLATES) {
      const graph = createWorkflowGraph(template, language);
      assert.deepEqual(validateWorkflowGraph(graph), [], `${template}:${language}`);
      assert.deepEqual(validateStudioWorkflow(definitionOf(template, language)), [], template);
      const ids = new Set(graph.nodes.map((node) => node.id));
      assert.equal(ids.size, graph.nodes.length, template);
      assert.equal(graph.nodes.filter((node) => node.data.kind === "agent").length, 2, template);
    }
  }
});

test("template parameters resolve with defaults and reject missing or invalid values", () => {
  for (const template of TASK_TEMPLATES) {
    const definition = definitionOf(template, "zh");
    const specs = parametersOf(template);
    const required = specs.filter(
      (param) => param.required === true && param.default === undefined,
    );
    assert.ok(required.length > 0, template);
    // 缺必填且无默认值：排队前拒绝，并指名参数。
    const missing = resolveStudioWorkflowParams(definition, {});
    for (const param of required)
      assert.ok(
        missing.issues.some((issue) => issue.includes(param.name)),
        `${template}:${param.name}`,
      );
    // 只填必填项：默认值补齐，未提交的可选参数不报错。
    const provided = Object.fromEntries(
      required.map((param) => [param.name, sampleValue(param.type)]),
    );
    const resolved = resolveStudioWorkflowParams(definition, provided);
    assert.deepEqual(resolved.issues, [], template);
    for (const param of specs)
      if (param.default !== undefined)
        assert.equal(resolved.values[param.name], param.default, param.name);
    // 类型形状：number / boolean 的提交值必须能解释成对应类型。
    const typed = specs.find((param) => param.type !== "text");
    if (typed) {
      const invalid = resolveStudioWorkflowParams(definition, {
        ...provided,
        [typed.name]: typed.type === "number" ? "abc" : "yes",
      });
      assert.ok(
        invalid.issues.some((issue) => issue.includes(typed.name)),
        `${template}:${typed.name}`,
      );
    }
  }
});

test("parameters, outputs and permissions survive an import/export round trip", () => {
  const signature = (definition: StudioWorkflowDefinition) =>
    definition.nodes.map((node) => ({
      kind: node.data.kind,
      prompt: node.data.prompt,
      params: node.data.params,
      outputNames: node.data.outputNames,
      permission: node.data.permission,
      creationModelId: node.data.creationModelId,
    }));
  for (const language of LANGUAGES) {
    for (const template of TASK_TEMPLATES) {
      const workflow = scenarioWorkflow(template, language);
      const text = encodeWorkflowFile(workflow);
      assert.equal(JSON.parse(text).version, WORKFLOW_FILE_VERSION, template);
      const imported = decodeWorkflowFile(text, "");
      // 导入永远重铸身份，但定义内容逐节点保留。
      assert.notEqual(imported.workflow.id, workflow.id);
      assert.deepEqual(imported.issues, [], `${template}:${language}`);
      assert.deepEqual(signature(imported.workflow), signature(workflow), template);
    }
  }
});

test("import rejects unsupported envelopes and unknown parameter or permission fields", () => {
  const original = JSON.parse(encodeWorkflowFile(scenarioWorkflow("releaseCheck", "zh"))) as {
    version: number;
    workflow: {
      nodes: Array<{ data: { params?: Record<string, unknown>[]; permission?: string } }>;
    };
  };
  const withParams = (source: typeof original) => {
    const node = source.workflow.nodes.find((item) => item.data.params?.length);
    assert.ok(node, "the release check template must declare parameters");
    return node as { data: { params: Record<string, unknown>[]; permission?: string } };
  };
  const mutations: Array<
    [string, (source: typeof original) => void, "fileVersion" | "fileInvalid"]
  > = [
    [
      "envelope version",
      (source) => {
        source.version = WORKFLOW_FILE_VERSION + 1;
      },
      "fileVersion",
    ],
    [
      "unknown parameter type",
      (source) => {
        withParams(source).data.params[0]!.type = "color";
      },
      "fileInvalid",
    ],
    [
      "unknown parameter field",
      (source) => {
        withParams(source).data.params[0]!.hint = "ui-only";
      },
      "fileInvalid",
    ],
    [
      "unknown permission",
      (source) => {
        withParams(source).data.permission = "admin";
      },
      "fileInvalid",
    ],
  ];
  for (const [name, mutate, code] of mutations) {
    const source = structuredClone(original);
    mutate(source);
    assert.throws(
      () => decodeWorkflowFile(JSON.stringify(source)),
      (error: unknown) => error instanceof WorkflowFileError && error.code === code,
      name,
    );
  }
  // 旧信封版本仍按旧语义读取，模板数据不需要迁移。
  for (const version of [1, 2, WORKFLOW_FILE_VERSION])
    assert.equal(
      decodeWorkflowFile(JSON.stringify({ ...original, version })).workflow.nodes.length,
      original.workflow.nodes.length,
      `version ${version}`,
    );
});

test("the code review scenario refuses to queue on a kernel without real read-only", () => {
  const definition = definitionOf("codeReview", "zh");
  const fixture = TEMPLATE_SCENARIOS.codeReview.failure;
  // 失败夹具是"排队前被拒绝"：没有任何步骤记录，也没有交付。
  assert.equal(fixture.state, "failed");
  assert.deepEqual(fixture.steps, []);
  const issues = validateStudioWorkflowPermissions(definition, undefined);
  assert.ok(issues.length > 0);
  const pattern = new RegExp(fixture.errorPattern!);
  assert.ok(
    issues.some((issue) => pattern.test(issue)),
    issues.join("\n"),
  );
  // 正常夹具的前提：具备真实只读沙箱的内核（codex ≥ 0.151.0）才能排队。
  const capable: StudioWorkflowDefinition = {
    ...definition,
    nodes: definition.nodes.map((node) => ({ ...node, data: { ...node.data, kernel: "codex" } })),
  };
  assert.deepEqual(validateStudioWorkflowPermissions(capable, undefined, { codex: "0.151.0" }), []);
  // 版本低于核验下限时同样失败关闭。
  assert.ok(validateStudioWorkflowPermissions(capable, undefined, { codex: "0.100.0" }).length > 0);
});

test("the delivery pack fails closed instead of shipping an unverified illustration", () => {
  const scenario = TEMPLATE_SCENARIOS.contentPack;
  const normal = fixtureDeliverables(scenario, scenario.normal);
  assert.deepEqual(normal.delivered, scenarioOutputNames(scenario));
  assert.deepEqual(normal.unverified, []);
  // 媒体产物必须是真实的创作输出引用，不能是文本或内联图片。
  const illustration = stepOutputs(scenario.normal, "illustration")[0]!;
  assert.equal(mediaRefProblem(illustration), undefined);
  assert.equal(illustration.kind, "creation-output");
  const failure = fixtureDeliverables(scenario, scenario.failure);
  assert.equal(scenario.failure.state, "failed");
  assert.equal(failure.delivered.includes("illustration-output"), false);
  assert.ok(failure.unverified.includes("illustration-output"));
  assert.equal(failure.delivered.includes("delivery-pack"), false);
  const failedStep = scenario.failure.steps.find((step) => step.key === "illustration")!;
  assert.ok(failedStep.error && failedStep.error.length > 0);
  assert.match(failedStep.error, new RegExp(scenario.failure.errorPattern!));
  assert.equal(failedStep.outputs, undefined);
  // 任何夹具都不允许出现占位内容。
  for (const fixture of [scenario.normal, scenario.failure])
    for (const step of fixture.steps)
      assert.doesNotMatch(JSON.stringify(step.outputs ?? []), PLACEHOLDER_PATTERN, step.key);
});

test("every fixture uses the structured output contract and stays explainable", () => {
  for (const template of TASK_TEMPLATES) {
    const scenario = TEMPLATE_SCENARIOS[template];
    assert.deepEqual(
      scenario.normal.steps.map((step) => step.key),
      scenario.steps.map((step) => step.key),
      template,
    );
    for (const fixture of [scenario.normal, scenario.failure]) {
      const keys = new Set(scenario.steps.map((step) => step.key));
      for (const step of fixture.steps) assert.ok(keys.has(step.key), `${template}:${step.key}`);
      for (const step of fixture.steps) {
        if (!step.outputs?.length) continue;
        const verdict = decodeStepOutputs(step);
        assert.equal(verdict.kind, "ok", `${template}:${step.key}`);
        assert.deepEqual(verdict.kind === "ok" ? verdict.refs : undefined, step.outputs);
      }
      // 失败夹具必须给出可读原因，且不能被当成完成的交付。
      if (fixture.state === "failed") {
        assert.equal(fixture.resultKnown, true, template);
        assert.ok(fixture.errorKind !== "none", template);
        const deliverables = fixtureDeliverables(scenario, fixture);
        assert.ok(
          deliverables.unverified.length > 0,
          `${template} must not report a complete delivery`,
        );
        if (fixture.errorPattern) {
          const pattern = new RegExp(fixture.errorPattern);
          assert.ok(
            fixture.steps.some((step) => step.error && pattern.test(step.error)) ||
              fixture.steps.length === 0,
            template,
          );
        }
      } else {
        assert.deepEqual(fixtureDeliverables(scenario, fixture).unverified, [], template);
      }
    }
  }
});
