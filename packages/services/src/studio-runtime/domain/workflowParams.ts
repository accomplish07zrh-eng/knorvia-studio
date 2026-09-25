/**
 * 工作流参数、输出声明与节点权限约束（T07）。
 *
 * 纯函数：不导入 Node 内置模块，也不导入服务实现。编辑器与执行器共用这一份判定，
 * 因此"界面显示为通过"与"执行器认为合法"不会各说各话。
 * 见 specs/knorvia-host-references.md 第 4 节与第 6 节。
 */
import type {
  StudioWorkflowDefinition,
  StudioWorkflowNode,
  StudioWorkflowNodeData,
  StudioWorkflowParam,
  StudioWorkflowParamValues,
} from "../workflowTypes.js";
import { STUDIO_WORKFLOW_PARAM_TYPES } from "../workflowTypes.js";
import type { StudioKernelId, StudioPermission } from "../kernelTypes.js";
import { kernelCapabilities } from "./kernelPolicy.js";

const PARAM_TYPES = new Set<string>(STUDIO_WORKFLOW_PARAM_TYPES);
const PARAM_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const OUTPUT_NAME = /^[a-z][a-z0-9-]{0,63}$/;
export const STUDIO_WORKFLOW_PARAM_LIMIT = 12;
export const STUDIO_WORKFLOW_OUTPUT_LIMIT = 32;
const PARAM_LABEL_LIMIT = 80;
const PARAM_VALUE_LIMIT = 4000;
const PARAM_VALUES_LIMIT = 32;
/** 权限严格度：只读最严格，完全访问最宽松；"询问"位于两者之间。 */
const PERMISSION_RANK: Record<StudioPermission, number> = {
  "read-only": 0,
  ask: 1,
  "full-access": 2,
};

/** 声明式参数的唯一读取入口：非数组按空处理，避免把坏记录当成"没有参数"。 */
export function studioWorkflowParams(data: StudioWorkflowNodeData): StudioWorkflowParam[] {
  return Array.isArray(data.params) ? (data.params as StudioWorkflowParam[]) : [];
}
export function studioWorkflowOutputNames(data: StudioWorkflowNodeData): string[] {
  return Array.isArray(data.outputNames)
    ? data.outputNames.filter((name): name is string => typeof name === "string")
    : [];
}

/** 节点参数、输出声明与权限字段的结构校验；错误文案带节点 id 便于定位。 */
export function nodeParameterIssues(data: StudioWorkflowNodeData, id: string): string[] {
  const issues: string[] = [];
  if (data.params !== undefined) {
    if (!Array.isArray(data.params) || data.params.length > STUDIO_WORKFLOW_PARAM_LIMIT)
      return [`Invalid node parameters: ${id}.`];
    const names = new Set<string>();
    for (const param of data.params) {
      if (!param || typeof param !== "object" || Array.isArray(param)) {
        issues.push(`Invalid node parameter: ${id}.`);
        continue;
      }
      const value = param as unknown as Record<string, unknown>;
      if (typeof value.name !== "string" || !PARAM_NAME.test(value.name) || names.has(value.name))
        issues.push(`Invalid or duplicate parameter name: ${id}.`);
      else names.add(value.name);
      if (typeof value.type !== "string" || !PARAM_TYPES.has(value.type))
        issues.push(`Unknown parameter type: ${id}.`);
      if (
        value.label !== undefined &&
        (typeof value.label !== "string" || value.label.length > PARAM_LABEL_LIMIT)
      )
        issues.push(`Invalid parameter label: ${id}.`);
      if (
        value.default !== undefined &&
        (typeof value.default !== "string" || value.default.length > PARAM_VALUE_LIMIT)
      )
        issues.push(`Invalid parameter default: ${id}.`);
      if (value.required !== undefined && typeof value.required !== "boolean")
        issues.push(`Invalid parameter required flag: ${id}.`);
    }
  }
  if (data.outputNames !== undefined) {
    if (!Array.isArray(data.outputNames) || data.outputNames.length > STUDIO_WORKFLOW_OUTPUT_LIMIT)
      issues.push(`Invalid node output names: ${id}.`);
    else {
      const names = new Set<string>();
      for (const name of data.outputNames) {
        if (typeof name !== "string" || !OUTPUT_NAME.test(name) || names.has(name))
          issues.push(`Invalid or duplicate output name: ${id}.`);
        else names.add(name);
      }
    }
  }
  if (
    data.permission !== undefined &&
    (typeof data.permission !== "string" || !(data.permission in PERMISSION_RANK))
  )
    issues.push(`Invalid node permission: ${id}.`);
  return issues;
}

/** 更严格的一方：只读最严格，完全访问最宽松。 */
export function stricterStudioPermission(
  left: StudioPermission | undefined,
  right: StudioPermission | undefined,
): StudioPermission {
  if (!left) return right ?? "ask";
  if (!right) return left;
  return PERMISSION_RANK[left] <= PERMISSION_RANK[right] ? left : right;
}

/** 实际执行要求 = 节点要求 ∩ 运行授权 = 两者中更严格的一方。 */
export function studioWorkflowNodeRequirement(
  node: StudioWorkflowNode,
  authorisation: StudioPermission | undefined,
): { kernel: StudioKernelId; permission: StudioPermission } {
  return {
    kernel: node.data.kernel,
    permission: stricterStudioPermission(
      node.data.permission as StudioPermission | undefined,
      authorisation,
    ),
  };
}

/**
 * 排队前的权限核验：要求的能力必须在**真实能力**（可带已发现版本）上成立。
 *
 * 只读要求永远不能由提示词满足，因此必须在这里——运行开始之前——拒绝，
 * 而不是派发之后降级。
 */
export function validateStudioWorkflowPermissions(
  definition: StudioWorkflowDefinition,
  authorisation: StudioPermission | undefined,
  versions?: Partial<Record<string, string>>,
): string[] {
  const issues: string[] = [];
  for (const node of definition.nodes) {
    if (!["agent", "creation"].includes(node.data.kind)) continue;
    const { kernel, permission } = studioWorkflowNodeRequirement(node, authorisation);
    if (permission === "ask") continue;
    const capabilities = kernelCapabilities(kernel, versions?.[kernel] ?? undefined);
    const supported = permission === "read-only" ? capabilities.readOnly : capabilities.fullAccess;
    if (!supported)
      issues.push(
        `Node ${node.id} requires ${permission}, but ${kernel} cannot guarantee it; the run was not queued.`,
      );
  }
  return issues;
}

/**
 * 提交时解析参数：默认值 + 提交值合并，缺必填且无默认值时拒绝。
 * 解析结果随即被冻结进运行记录，此后不再读取界面草稿。
 */
export function resolveStudioWorkflowParams(
  definition: StudioWorkflowDefinition,
  provided: unknown,
): { values: StudioWorkflowParamValues; issues: string[] } {
  const issues: string[] = [];
  const values: StudioWorkflowParamValues = {};
  if (provided !== undefined) {
    if (!provided || typeof provided !== "object" || Array.isArray(provided))
      return { values, issues: ["Invalid workflow parameters."] };
    const entries = Object.entries(provided as Record<string, unknown>);
    if (entries.length > PARAM_VALUES_LIMIT) return { values, issues: ["Too many parameters."] };
    for (const [name, value] of entries) {
      if (typeof value !== "string" || value.length > PARAM_VALUE_LIMIT) {
        issues.push(`Invalid parameter value: ${name}.`);
        continue;
      }
      values[name] = value;
    }
  }
  if (issues.length) return { values, issues };
  for (const node of definition.nodes) {
    for (const param of studioWorkflowParams(node.data)) {
      const submitted = values[param.name];
      if (submitted === undefined) {
        if (param.default !== undefined) values[param.name] = param.default;
        else if (param.required === true)
          issues.push(`Parameter ${param.name} is required by node ${node.id}.`);
        continue;
      }
      const problem = parameterValueProblem(param, submitted);
      if (problem) issues.push(`Parameter ${param.name}${problem}`);
    }
  }
  return { values, issues };
}

/** 类型形状校验：字符串承载，但 number/boolean 必须真的能解释成对应类型。 */
function parameterValueProblem(param: StudioWorkflowParam, value: string): string | undefined {
  if (param.type === "number" && (!value.trim() || !Number.isFinite(Number(value))))
    return " must be a number.";
  if (param.type === "boolean" && !["true", "false"].includes(value))
    return " must be true or false.";
  return undefined;
}
