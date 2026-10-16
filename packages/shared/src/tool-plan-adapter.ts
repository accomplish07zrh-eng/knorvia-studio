// SPDX-License-Identifier: Apache-2.0
// 计划步骤投影。空的 todos 数组会挡住后面的 plan/steps，畸形步骤则整表作废。
import type { KnorviaPlanStep } from "./task-types-core.js";
import { asPlainRecord, trimmedText } from "./internal-s03/value-shape.js";

const TODO_PLAN_TOOL_PATTERN = new RegExp(
  String.raw`(?:^|[_\s-])(?:todo[_\s-]*(?:read|write)|update[_\s-]*plan)(?:$|[_\s-])`,
  "i",
);

const COLLECTION_KEYS = ["todos", "plan", "steps", "items"] as const;
const STEP_TITLE_KEYS = ["content", "step", "title", "text", "activeForm"] as const;
const OUTPUT_NESTED_KEYS = ["content", "output", "result"] as const;
const PLAN_STEP_STATUSES = ["pending", "in_progress", "completed"] as const;
const CHILD_SOURCE = "subagent";
const NO_PLAN = null;

type PlanStepStatus = (typeof PLAN_STEP_STATUSES)[number];

type PlanToolLabel = {
  title?: /* 工具标题，参与 todo/plan 指纹 */ string;
  kind?: /* 工具种类，参与同一指纹 */ string;
};

type PlanInputQuery = PlanToolLabel & {
  input: /* 先取第一个非空集合；空数组不继续往后找 */ unknown;
};

type PlanOutputQuery = PlanToolLabel & {
  output: /* 再看 content、output、result 里的字符串化 JSON */ unknown;
};

function noPlan<T>(): T | null {
  return NO_PLAN;
}

function absent(): undefined {
  return undefined;
}

function parseLooseJson(text: string): unknown {
  try {
    // 集合字段有时是字符串化 JSON，语法错误就不当成集合
    const decoded: unknown = JSON.parse(text);
    return decoded;
  } catch {
    return absent();
  }
}

function planToolLabel(params: PlanToolLabel): string {
  return [params.title, params.kind].filter(Boolean).join(" ");
}

function titleFromRecord(record: Record<string, unknown>): string | undefined {
  for (const key of STEP_TITLE_KEYS) {
    const title = trimmedText(record[key]);
    if (title !== undefined) return title;
  }
  return absent();
}

function statusFromValue(value: unknown): PlanStepStatus | null {
  const text = trimmedText(value);
  const normalized = text?.replaceAll("-", "_").toLowerCase();
  const known = PLAN_STEP_STATUSES.find((status) => status === normalized);
  return known ?? NO_PLAN;
}

function statusForBareString(index: number): PlanStepStatus {
  return index === 0 ? "in_progress" : "pending";
}

function readStep(value: unknown, index: number): KnorviaPlanStep | null {
  if (typeof value === "string") {
    const title = trimmedText(value);
    if (!title) return noPlan();
    const step: KnorviaPlanStep = {
      id: title,
      title,
      status: statusForBareString(index),
    };
    return step;
  }
  const record = asPlainRecord(value);
  const title = record ? titleFromRecord(record) : undefined;
  const status = record ? statusFromValue(record.status) : NO_PLAN;
  if (record === undefined || title === undefined || status === NO_PLAN) return noPlan();
  const step: KnorviaPlanStep = {
    id: trimmedText(record.id) ?? title,
    title,
    status,
  };
  return step;
}

function firstCollection(value: unknown): unknown[] | undefined {
  const decoded = typeof value === "string" ? parseLooseJson(value) : value;
  const record = asPlainRecord(decoded);
  if (record === undefined) return absent();
  for (const key of COLLECTION_KEYS) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return absent();
}

function stepsFromValue(value: unknown): KnorviaPlanStep[] | null {
  const collection = firstCollection(value);
  if (!collection?.length) return noPlan();
  const steps: KnorviaPlanStep[] = [];
  for (let index = 0; index < collection.length; index += 1) {
    const step = readStep(collection[index], index);
    if (step === NO_PLAN) return noPlan();
    steps.push(step);
  }
  return steps;
}

function pushDecoded(bucket: unknown[], value: unknown): void {
  bucket.push(value);
  const text = typeof value === "string" ? value : undefined;
  if (text !== undefined) {
    const parsed = parseLooseJson(text);
    if (parsed !== undefined) bucket.push(parsed);
  }
}

function outputCandidates(output: unknown): unknown[] {
  const bucket: unknown[] = [];
  pushDecoded(bucket, output);
  const record = asPlainRecord(output);
  if (record === undefined) return bucket;
  for (const key of OUTPUT_NESTED_KEYS) {
    if (key in record) pushDecoded(bucket, record[key]);
  }
  return bucket;
}

function childProjection(record: Record<string, unknown>): boolean {
  const sourceIsChild = trimmedText(record.source) === CHILD_SOURCE;
  const hasParentCall = trimmedText(record.parentToolCallId) !== undefined;
  const hasParentUse = trimmedText(record.parentToolUseId) !== undefined;
  return sourceIsChild || hasParentCall || hasParentUse;
}

export function isTodoPlanToolName(value: string | null | undefined): boolean {
  const label = typeof value === "string" ? value.trim() : "";
  return TODO_PLAN_TOOL_PATTERN.test(label);
}

export function isMainAgentToolProjectionSource(...candidates: unknown[]): boolean {
  const child = candidates.some((candidate) => {
    const record = asPlainRecord(candidate);
    return record !== undefined && childProjection(record);
  });
  return !child;
}

function labelMatches(params: PlanToolLabel): boolean {
  return isTodoPlanToolName(planToolLabel(params));
}

export function extractPlanStepsFromToolInput(params: PlanInputQuery): KnorviaPlanStep[] | null {
  if (!labelMatches(params)) return noPlan();
  return stepsFromValue(params.input);
}

export function extractPlanStepsFromToolOutput(params: PlanOutputQuery): KnorviaPlanStep[] | null {
  if (!labelMatches(params)) return noPlan();
  let found: KnorviaPlanStep[] | null = NO_PLAN;
  for (const candidate of outputCandidates(params.output)) {
    found = stepsFromValue(candidate);
    if (found !== NO_PLAN) break;
  }
  return found;
}
