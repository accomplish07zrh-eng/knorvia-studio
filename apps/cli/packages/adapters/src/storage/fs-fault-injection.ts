// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 故障注入：从环境变量读取规则，命中时抛出带 knorviaFsFaultId 的错误。
// 规则 JSON 的字段名、操作名与错误形状都是对外契约，逐字冻结。

export const KNORVIA_E2E_FS_FAULTS_ENV = "KNORVIA_E2E_FS_FAULTS";
export const KNORVIA_E2E_FS_FAULTS_ALLOW_ENV = "KNORVIA_E2E_FS_FAULTS_ALLOW";

/** 文件类操作。 */
type FileOperation = "appendFile" | "mkdir" | "rename" | "rm" | "writeFile";

/** SQLite 类操作。 */
type SqliteOperation = "sqliteOpen" | "sqliteRun";

/** 规则可用的全部操作名（含通配 "any"）。 */
type Operation = FileOperation | SqliteOperation | "any";

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

interface FaultSite {
  operation: Operation;
  path: string;
}

/**
 * 合法操作名与「是否为写操作」的对照表。
 * 用映射而非数组：既表达合法性，也把「只读操作（any）不参与写故障」这一语义写进数据。
 */
const OPERATION_KINDS = {
  appendFile: "write",
  any: "wildcard",
  mkdir: "write",
  rename: "write",
  rm: "write",
  sqliteOpen: "write",
  sqliteRun: "write",
  writeFile: "write",
} as const satisfies Record<Operation, "write" | "wildcard">;

const OPERATIONS = new Set<Operation>(Object.keys(OPERATION_KINDS) as Operation[]);

let cachedRules: Rule[] | undefined;

function invalidRule(index: number, detail: string): Error {
  return new Error(`Invalid fs fault rule at index ${index}: ${detail}`);
}

/** 字段规格：可选（缺席即 undefined、有值必须是字符串）或必填（非空且去空白）。 */
type FieldSpec = "optional" | "required";

/**
 * 按规格读一个字符串字段。
 *
 * 两种规格的差别只有「缺席时怎么办」与「是否拒绝空串」，
 * 收成一个入口后，字段校验的措辞与顺序都集中在这里，不会每个字段各写一遍。
 */
function readString(
  fields: Record<string, unknown>,
  name: string,
  index: number,
  spec: FieldSpec,
): string | undefined {
  const value = fields[name];
  if (value === undefined) {
    if (spec === "optional") return undefined;
    throw invalidRule(index, `${name} must be a non-empty string`);
  }
  if (typeof value !== "string") {
    throw invalidRule(
      index,
      spec === "optional" ? `${name} must be a string` : `${name} must be a non-empty string`,
    );
  }
  if (spec === "required" && value.trim() === "") {
    throw invalidRule(index, `${name} must be a non-empty string`);
  }
  return spec === "optional" ? value : value.trim();
}

/** 可选路径字段：统一转成正斜杠；缺席保持 undefined（不构造空串）。 */
function optionalSlashes(
  fields: Record<string, unknown>,
  name: string,
  index: number,
): string | undefined {
  const raw = readString(fields, name, index, "optional");
  return raw === undefined ? undefined : slashes(raw);
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

/** 路径比较统一成正斜杠，Windows 上的 `\` 与 `/` 规则等价。 */
function slashes(path: string): string {
  return path.replace(/\\/g, "/");
}

function normalizeRule(fields: Record<string, unknown>, index: number): Rule {
  const maximum = fields.maxMatches === undefined ? 1 : fields.maxMatches;
  if (typeof maximum !== "number" || !Number.isInteger(maximum) || maximum < 0) {
    throw invalidRule(index, "maxMatches must be a non-negative integer");
  }
  // 字段校验顺序（合同固定）：maxMatches → pathRegex 类型 → code → id → message →
  // operations → pathEndsWith → pathIncludes → 最后才构造正则（原生 SyntaxError）。
  // 三组字段各自走同一个读取器：字符串按规格、操作集合单独校验、路径转正斜杠。
  const regexSource = readString(fields, "pathRegex", index, "optional");
  const code = readString(fields, "code", index, "required") as string;
  const id = readString(fields, "id", index, "required") as string;
  const message = readString(fields, "message", index, "optional");
  const selectedOperations = operationSet(fields.operations, index);
  const ending = optionalSlashes(fields, "pathEndsWith", index);
  const inclusion = optionalSlashes(fields, "pathIncludes", index);
  return {
    id,
    code,
    message,
    operations: selectedOperations,
    pathEndsWith: ending,
    pathIncludes: inclusion,
    expression: regexSource === undefined ? undefined : new RegExp(regexSource),
    maximum,
    consumed: 0,
  };
}

/** 形态检查先行：后续条目的形态错误必须先于前项的字段错误暴露。 */
function assertRuleShapes(decoded: unknown[]): void {
  for (let index = 0; index < decoded.length; index += 1) {
    const item: unknown = decoded[index];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw invalidRule(index, "rule must be an object");
    }
  }
}

function parseFaultSpec(spec: string): unknown[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(spec);
  } catch (cause) {
    const detail = (cause as Error).message;
    throw new Error(`Invalid ${KNORVIA_E2E_FS_FAULTS_ENV}: ${detail}`);
  }
  if (!Array.isArray(decoded)) {
    throw new Error(`Invalid ${KNORVIA_E2E_FS_FAULTS_ENV}: expected a JSON array`);
  }
  assertRuleShapes(decoded);
  return decoded;
}

function initializeRules(): Rule[] {
  const spec = (process.env[KNORVIA_E2E_FS_FAULTS_ENV] ?? "").trim();
  if (!spec) return [];
  const allowedInTest = process.env.KNORVIA_ENV === "test";
  const explicitlyAllowed = process.env[KNORVIA_E2E_FS_FAULTS_ALLOW_ENV] === "1";
  if (!allowedInTest && !explicitlyAllowed) return [];
  const decoded = parseFaultSpec(spec);
  return (decoded as Record<string, unknown>[]).map(normalizeRule);
}

/** 预算与操作门：先于路径访问，操作不匹配时完全不触碰 path（可缺席）。 */
function passesBudgetAndOperation(rule: Rule, fault: FaultSite): boolean {
  if (rule.maximum > 0 && rule.consumed >= rule.maximum) return false;
  if (rule.operations && !rule.operations.has("any") && !rule.operations.has(fault.operation)) {
    return false;
  }
  return true;
}

/** 路径层过滤：后缀 → 包含 → 正则（此时 path 已经是必有的字符串）。 */
function pathMatches(rule: Rule, path: string): boolean {
  if (rule.pathEndsWith !== undefined && !path.endsWith(rule.pathEndsWith)) return false;
  if (rule.pathIncludes !== undefined && !path.includes(rule.pathIncludes)) return false;
  if (rule.expression && !rule.expression.test(path)) return false;
  return true;
}

/** 注入错误：code/syscall 与规则绑定，knorviaFsFaultId 供上层断言来源。 */
function injectedFault(rule: Rule, fault: FaultSite): FaultError {
  const text =
    rule.message ?? `Injected fs fault ${rule.code} for ${fault.operation}: ${fault.path}`;
  const error = new Error(text) as FaultError;
  error.code = rule.code;
  error.path = fault.path;
  error.syscall = fault.operation;
  error.knorviaFsFaultId = rule.id;
  return error;
}

export function maybeThrowStorageFsFault(input: FaultSite): void {
  // 完整初始化成功才落缓存；失败后下一次调用仍可读取更新后的环境。
  const rules = cachedRules ?? (cachedRules = initializeRules());
  for (const rule of rules) {
    if (!passesBudgetAndOperation(rule, input)) continue;
    // 操作匹配后才触碰路径：缺席路径按既有边界抛 TypeError，不做兜底也不消耗预算。
    const path = slashes(input.path);
    if (!pathMatches(rule, path)) continue;
    rule.consumed++;
    throw injectedFault(rule, input);
  }
}
