export type FsFaultOperation =
  | "any"
  | "appendFile"
  | "createWriteStream"
  | "mkdir"
  | "open"
  | "readFile"
  | "readdir"
  | "rename"
  | "rm"
  | "sqliteOpen"
  | "sqliteRun"
  | "stat"
  | "writeFile";

export interface FsFaultRuleConfig {
  id: string;
  code: string;
  operations?: readonly FsFaultOperation[];
  pathIncludes?: string;
  pathEndsWith?: string;
  pathRegex?: string;
  maxMatches?: number;
  message?: string;
}

export interface FsFaultCheckInput {
  operation: FsFaultOperation;
  path: string;
}

export interface FsFaultHit {
  id: string;
  code: string;
  operation: FsFaultOperation;
  path: string;
  matchIndex: number;
  matchedAt: string;
}

export interface InjectedFsFaultError extends NodeJS.ErrnoException {
  knorviaFsFaultId: string;
}

export interface FsFaultInjector {
  isEnabled(): boolean;
  maybeThrow(input: FsFaultCheckInput): void;
  getHits(): readonly FsFaultHit[];
  reset(): void;
}

export const KNORVIA_E2E_FS_FAULTS_ENV = "KNORVIA_E2E_FS_FAULTS";
export const KNORVIA_E2E_FS_FAULTS_ALLOW_ENV = "KNORVIA_E2E_FS_FAULTS_ALLOW";

interface ActiveRule {
  id: string;
  code: string;
  operations: Set<FsFaultOperation>;
  maxMatches: number;
  pathIncludes?: string;
  pathEndsWith?: string;
  pathRegex?: RegExp;
  message?: string;
  matches: number;
}

const supportedOperations = new Set<FsFaultOperation>([
  "any",
  "appendFile",
  "createWriteStream",
  "mkdir",
  "open",
  "readFile",
  "readdir",
  "rename",
  "rm",
  "sqliteOpen",
  "sqliteRun",
  "stat",
  "writeFile",
]);

function invalidRule(index: number, reason: string): Error {
  return new Error(`Invalid fs fault rule at index ${index}: ${reason}`);
}

function requiredText(value: unknown, field: string, index: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidRule(index, `${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string, index: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw invalidRule(index, `${field} must be a string`);
  }
  return value;
}

function slashPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function causeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function activateRule(config: FsFaultRuleConfig, index: number): ActiveRule {
  const id = requiredText(config.id, "id", index);
  const code = requiredText(config.code, "code", index);
  const suppliedOperations = config.operations;
  const operationValues = suppliedOperations === undefined ? ["any"] : suppliedOperations;
  if (!Array.isArray(operationValues) || operationValues.length === 0) {
    throw invalidRule(index, "operations must be a non-empty array");
  }
  const operations = new Set<FsFaultOperation>(
    operationValues.map((operation: unknown) => {
      if (
        typeof operation !== "string" ||
        !supportedOperations.has(operation as FsFaultOperation)
      ) {
        throw invalidRule(index, `unsupported operation ${String(operation)}`);
      }
      return operation as FsFaultOperation;
    }),
  );
  const suppliedMaxMatches = config.maxMatches;
  const maxMatches = suppliedMaxMatches === undefined ? 1 : suppliedMaxMatches;
  if (typeof maxMatches !== "number" || !Number.isInteger(maxMatches) || maxMatches < 0) {
    throw invalidRule(index, "maxMatches must be a non-negative integer");
  }
  const suppliedIncludes = optionalText(config.pathIncludes, "pathIncludes", index);
  const pathIncludes = suppliedIncludes === undefined ? undefined : slashPath(suppliedIncludes);
  const suppliedEndsWith = optionalText(config.pathEndsWith, "pathEndsWith", index);
  const pathEndsWith = suppliedEndsWith === undefined ? undefined : slashPath(suppliedEndsWith);
  const regexSource = optionalText(config.pathRegex, "pathRegex", index);
  const message = optionalText(config.message, "message", index);
  let pathRegex: RegExp | undefined;
  if (regexSource !== undefined) {
    try {
      pathRegex = new RegExp(regexSource);
    } catch (error) {
      throw invalidRule(index, `pathRegex is invalid: ${causeMessage(error)}`);
    }
  }
  return {
    id,
    code,
    operations,
    maxMatches,
    pathIncludes,
    pathEndsWith,
    pathRegex,
    message,
    matches: 0,
  };
}

export function createFsFaultInjector(rules: readonly FsFaultRuleConfig[] = []): FsFaultInjector {
  const activeRules = rules.map(activateRule);
  const hits: FsFaultHit[] = [];
  return {
    isEnabled() {
      return activeRules.length > 0;
    },
    maybeThrow(input) {
      for (const rule of activeRules) {
        if (rule.maxMatches !== 0 && rule.matches >= rule.maxMatches) continue;
        if (!rule.operations.has("any") && !rule.operations.has(input.operation)) continue;
        const path = slashPath(input.path);
        if (rule.pathIncludes !== undefined && !path.includes(rule.pathIncludes)) continue;
        if (rule.pathEndsWith !== undefined && !path.endsWith(rule.pathEndsWith)) continue;
        if (rule.pathRegex !== undefined && !rule.pathRegex.test(path)) continue;
        rule.matches += 1;
        hits.push({
          code: rule.code,
          id: rule.id,
          matchIndex: rule.matches,
          matchedAt: new Date().toISOString(),
          operation: input.operation,
          path: input.path,
        });
        const errorOperation = input.operation;
        const errorPath = input.path;
        const error = new Error(
          rule.message ?? `Injected fs fault ${rule.code} for ${errorOperation}: ${errorPath}`,
        ) as InjectedFsFaultError;
        error.code = rule.code;
        error.path = errorPath;
        error.syscall = errorOperation;
        error.knorviaFsFaultId = rule.id;
        throw error;
      }
    },
    getHits() {
      return [...hits];
    },
    reset() {
      hits.length = 0;
      for (const rule of activeRules) rule.matches = 0;
    },
  };
}

export function isInjectedFsFaultError(error: unknown): error is InjectedFsFaultError {
  return (
    error !== null &&
    typeof error === "object" &&
    "knorviaFsFaultId" in error &&
    typeof (error as { knorviaFsFaultId?: unknown }).knorviaFsFaultId === "string"
  );
}

export function parseFsFaultRulesFromEnvValue(rawValue: string): FsFaultRuleConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`Invalid ${KNORVIA_E2E_FS_FAULTS_ENV}: ${causeMessage(error)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid ${KNORVIA_E2E_FS_FAULTS_ENV}: expected a JSON array`);
  }
  for (let index = 0; index < parsed.length; index += 1) {
    const rule: unknown = parsed[index];
    if (rule === null || typeof rule !== "object" || Array.isArray(rule)) {
      throw invalidRule(index, "rule must be an object");
    }
  }
  return parsed as FsFaultRuleConfig[];
}

let processInjector: FsFaultInjector | null = null;
let testInjector: FsFaultInjector | null = null;

export function getProcessFsFaultInjector(): FsFaultInjector {
  if (testInjector) return testInjector;
  if (processInjector) return processInjector;
  const rawValue = process.env[KNORVIA_E2E_FS_FAULTS_ENV]?.trim();
  let rules: FsFaultRuleConfig[] = [];
  if (rawValue) {
    // 生产环境须显式放行，避免遗留的故障注入环境变量影响正常文件操作。
    const allowed =
      process.env.KNORVIA_ENV === "test" || process.env[KNORVIA_E2E_FS_FAULTS_ALLOW_ENV] === "1";
    if (allowed) rules = parseFsFaultRulesFromEnvValue(rawValue);
  }
  const injector = createFsFaultInjector(rules);
  processInjector = injector;
  return injector;
}

export function maybeThrowInjectedFsFault(input: FsFaultCheckInput): void {
  getProcessFsFaultInjector().maybeThrow(input);
}

export function setFsFaultInjectorForTests(injector: FsFaultInjector | null): void {
  testInjector = injector;
}

export function resetProcessFsFaultInjectorForTests(): void {
  processInjector = null;
  testInjector = null;
}
