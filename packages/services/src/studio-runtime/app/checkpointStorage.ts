import type { StudioCheckpoint, StudioStepResult } from "../workflowTypes.js";
import { assertStudioOutputsForResult } from "../domain/outputRef.js";
import type { StoredRun, StudioRepository } from "./storePort.js";

function projectText(text: string, size = 1024): string {
  return text.length <= size
    ? text
    : `${text.slice(0, size)}\n[Full result is retained in the execution record.]`;
}
export function projectStudioStep(result: StudioStepResult): StudioStepResult {
  // 写入边界：输出引用必须是有界的、且只挂在结果已知的终态上。
  // 超限在这里直接抛错，而不是截断后落盘——被截断的检查点无法与真实产物核对。
  const outputs = assertStudioOutputsForResult(result);
  return {
    ...result,
    ...(outputs === undefined ? {} : { outputs }),
    text: projectText(result.text),
    changesSummary: result.changesSummary ? projectText(result.changesSummary) : undefined,
  };
}
export function saveStudioStep(
  db: StudioRepository,
  run: StoredRun,
  id: string,
  result: StudioStepResult,
): void {
  db.write("step-result", `${run.id}:${id}`, result, run.id);
  run.checkpoint.steps[id] = projectStudioStep(result);
  // 历史结果分条持久化，不让持续群任务因单条运行记录越长越大而被迫中断。
  const maximum = run.kind === "group" ? 64 : 400;
  const keys = Object.keys(run.checkpoint.steps);
  for (const key of keys.slice(0, Math.max(0, keys.length - maximum)))
    delete run.checkpoint.steps[key];
}
export function readStudioStep(
  db: StudioRepository,
  run: StoredRun,
  id: string,
): StudioStepResult | undefined {
  const stored = db.read<StudioStepResult>("step-result", `${run.id}:${id}`);
  if (stored && (run.checkpoint.steps[id] || ["succeeded", "skipped"].includes(stored.status)))
    return stored;
  return run.checkpoint.steps[id];
}
export function saveStudioValues(
  db: StudioRepository,
  run: StoredRun,
  values: Record<string, string> | undefined,
): void {
  for (const [key, value] of Object.entries(values ?? {})) {
    db.write("checkpoint-value", `${run.id}:${key}`, { value }, run.id);
    try {
      const parsed = JSON.parse(value);
      run.checkpoint.values[key] =
        parsed && typeof parsed === "object" && typeof parsed.text === "string"
          ? JSON.stringify({
              ...parsed,
              text: projectText(parsed.text),
              changesSummary: parsed.changesSummary
                ? projectText(parsed.changesSummary)
                : undefined,
            })
          : value;
    } catch {
      run.checkpoint.values[key] = value;
    }
  }
}
export function executionCheckpoint(db: StudioRepository, run: StoredRun): StudioCheckpoint {
  return {
    ...run.checkpoint,
    steps: new Proxy(run.checkpoint.steps, {
      get: (target, key) =>
        typeof key === "string" ? readStudioStep(db, run, key) : Reflect.get(target, key),
    }),
    values: new Proxy(run.checkpoint.values, {
      get: (target, key) =>
        typeof key === "string"
          ? (db.read<{ value: string }>("checkpoint-value", `${run.id}:${key}`)?.value ??
            target[key])
          : Reflect.get(target, key),
    }),
  };
}
