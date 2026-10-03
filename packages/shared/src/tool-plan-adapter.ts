import type { KnorviaPlanStep } from "./task-types-core.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStatus(value: unknown): KnorviaPlanStep["status"] | null {
  const status = readString(value)?.replace(/-/g, "_").toLowerCase();
  if (status === "pending" || status === "in_progress" || status === "completed") {
    return status;
  }
  return null;
}

function parsePlanStep(value: unknown, index: number): KnorviaPlanStep | null {
  if (typeof value === "string") {
    const title = readString(value);
    if (title === undefined) return null;
    return {
      id: title,
      title,
      status: index === 0 ? "in_progress" : "pending",
    };
  }

  if (!isRecord(value)) return null;
  const title =
    readString(value.content) ||
    readString(value.step) ||
    readString(value.title) ||
    readString(value.text) ||
    readString(value.activeForm);
  if (title === undefined) return null;
  const status = readStatus(value.status);
  if (status === null) return null;
  const id = readString(value.id) || title;
  return { id, title, status };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function readCollection(value: unknown): unknown[] | undefined {
  const record = typeof value === "string" ? parseJson(value) : value;
  if (!isRecord(record)) return undefined;
  for (const key of ["todos", "plan", "steps", "items"]) {
    const collection = record[key];
    if (Array.isArray(collection)) return collection;
  }
  return undefined;
}

function extractPlanSteps(value: unknown): KnorviaPlanStep[] | null {
  const collection = readCollection(value);
  if (collection === undefined || collection.length === 0) return null;
  const steps = collection
    .map(parsePlanStep)
    .filter((step): step is KnorviaPlanStep => step !== null);
  return steps.length === collection.length ? steps : null;
}

export function isTodoPlanToolName(value: string | null | undefined): boolean {
  return (
    typeof value === "string" &&
    /(?:^|[_\s-])(?:todo[_\s-]*(?:read|write)|update[_\s-]*plan)(?:$|[_\s-])/i.test(value.trim())
  );
}

export function isMainAgentToolProjectionSource(...candidates: unknown[]): boolean {
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    if (readString(candidate.source) === "subagent") return false;
    if (readString(candidate.parentToolCallId) || readString(candidate.parentToolUseId)) {
      return false;
    }
  }
  return true;
}

export function extractPlanStepsFromToolInput(params: {
  title?: string;
  kind?: string;
  input: unknown;
}): KnorviaPlanStep[] | null {
  const fingerprint = [params.title, params.kind].filter(Boolean).join(" ");
  if (!isTodoPlanToolName(fingerprint)) return null;
  return extractPlanSteps(params.input);
}

export function extractPlanStepsFromToolOutput(params: {
  title?: string;
  kind?: string;
  output: unknown;
}): KnorviaPlanStep[] | null {
  const fingerprint = [params.title, params.kind].filter(Boolean).join(" ");
  if (!isTodoPlanToolName(fingerprint)) return null;

  const output = params.output;
  const candidates: unknown[] = [output];
  if (typeof output === "string") {
    const parsed = parseJson(output);
    if (parsed !== undefined) candidates.push(parsed);
  }
  if (isRecord(output)) {
    for (const key of ["content", "output", "result"]) {
      const value = output[key];
      candidates.push(value);
      if (typeof value === "string") {
        const parsed = parseJson(value);
        if (parsed !== undefined) candidates.push(parsed);
      }
    }
  }

  for (const candidate of candidates) {
    const steps = extractPlanSteps(candidate);
    if (steps !== null) return steps;
  }
  return null;
}
