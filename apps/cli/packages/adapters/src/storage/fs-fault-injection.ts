// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export const KNORVIA_E2E_FS_FAULTS_ENV = "KNORVIA_E2E_FS_FAULTS";
export const KNORVIA_E2E_FS_FAULTS_ALLOW_ENV = "KNORVIA_E2E_FS_FAULTS_ALLOW";

type Operation =
  | "appendFile"
  | "any"
  | "mkdir"
  | "rename"
  | "rm"
  | "sqliteOpen"
  | "sqliteRun"
  | "writeFile";

interface Rule {
  id: string;
  code: string;
  message: string | undefined;
  operations: Set<Operation> | undefined;
  pathEndsWith: string | undefined;
  pathIncludes: string | undefined;
  expression: RegExp | undefined;
  maximum: number;
  consumed: number;
}

type FaultError = Error & {
  code: string;
  path: string;
  syscall: Operation;
  knorviaFsFaultId: string;
};

const OPERATIONS = new Set<Operation>([
  "appendFile",
  "any",
  "mkdir",
  "rename",
  "rm",
  "sqliteOpen",
  "sqliteRun",
  "writeFile",
]);
let cachedRules: Rule[] | undefined;

function invalidRule(index: number, detail: string): Error {
  return new Error(`Invalid fs fault rule at index ${index}: ${detail}`);
}

function optionalString(
  fields: Record<string, unknown>,
  name: string,
  index: number,
): string | undefined {
  const value = fields[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw invalidRule(index, `${name} must be a string`);
  return value;
}

function requiredString(fields: Record<string, unknown>, name: string, index: number): string {
  const value = fields[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidRule(index, `${name} must be a non-empty string`);
  }
  return value.trim();
}

function operationSet(value: unknown, index: number): Set<Operation> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidRule(index, "operations must be a non-empty array");
  }
  const selected = new Set<Operation>();
  for (const operation of value) {
    if (!OPERATIONS.has(operation as Operation)) {
      throw invalidRule(index, `unsupported operation ${String(operation)}`);
    }
    selected.add(operation as Operation);
  }
  return selected;
}

function slashes(path: string): string {
  return path.replace(/\\/g, "/");
}

function normalizeRule(fields: Record<string, unknown>, index: number): Rule {
  const maximum = fields.maxMatches === undefined ? 1 : fields.maxMatches;
  if (typeof maximum !== "number" || !Number.isInteger(maximum) || maximum < 0) {
    throw invalidRule(index, "maxMatches must be a non-negative integer");
  }
  const regexSource = optionalString(fields, "pathRegex", index);
  const code = requiredString(fields, "code", index);
  const id = requiredString(fields, "id", index);
  const message = optionalString(fields, "message", index);
  const operations = operationSet(fields.operations, index);
  const ending = optionalString(fields, "pathEndsWith", index);
  const inclusion = optionalString(fields, "pathIncludes", index);
  const expression = regexSource === undefined ? undefined : new RegExp(regexSource);
  return {
    id,
    code,
    message,
    operations,
    pathEndsWith: ending === undefined ? undefined : slashes(ending),
    pathIncludes: inclusion === undefined ? undefined : slashes(inclusion),
    expression,
    maximum,
    consumed: 0,
  };
}

function initializeRules(): Rule[] {
  const raw = (process.env[KNORVIA_E2E_FS_FAULTS_ENV] ?? "").trim();
  if (!raw) return [];
  if (process.env.KNORVIA_ENV !== "test" && process.env[KNORVIA_E2E_FS_FAULTS_ALLOW_ENV] !== "1") {
    return [];
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid ${KNORVIA_E2E_FS_FAULTS_ENV}: ${(error as Error).message}`);
  }
  if (!Array.isArray(decoded)) {
    throw new Error(`Invalid ${KNORVIA_E2E_FS_FAULTS_ENV}: expected a JSON array`);
  }
  // 先完成全部对象形态检查，后续条目的形态错误必须先于前项字段错误。
  for (let index = 0; index < decoded.length; index++) {
    const item: unknown = decoded[index];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw invalidRule(index, "rule must be an object");
    }
  }
  return (decoded as Record<string, unknown>[]).map(normalizeRule);
}

export function maybeThrowStorageFsFault(input: { operation: Operation; path: string }): void {
  // 完整初始化成功才落缓存；失败后下一次调用仍可读取更新后的环境。
  const rules = cachedRules ?? (cachedRules = initializeRules());
  for (const rule of rules) {
    if (rule.maximum > 0 && rule.consumed >= rule.maximum) continue;
    if (rule.operations && !rule.operations.has("any") && !rule.operations.has(input.operation)) {
      continue;
    }
    const path = slashes(input.path);
    if (rule.pathEndsWith !== undefined && !path.endsWith(rule.pathEndsWith)) continue;
    if (rule.pathIncludes !== undefined && !path.includes(rule.pathIncludes)) continue;
    if (rule.expression && !rule.expression.test(path)) continue;
    const error = new Error(
      rule.message ?? `Injected fs fault ${rule.code} for ${input.operation}: ${input.path}`,
    ) as FaultError;
    error.code = rule.code;
    error.path = input.path;
    error.syscall = input.operation;
    error.knorviaFsFaultId = rule.id;
    rule.consumed++;
    throw error;
  }
}
