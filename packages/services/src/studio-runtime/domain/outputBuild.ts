/**
 * 命名输出的**生产者**：把节点声明 + 真实执行结果变成可引用的输出。
 *
 * 从 `outputRef.ts` 拆出来：那里只保留引用的类型与校验（读写边界），这里只保留生产规则。
 * 规则见 `specs/knorvia-output-contract.md`「命名输出的生产规则」：
 * **不做猜测，也不把同一段全文复制成多个不同输出**；构造失败一律返回错误，
 * 由调用方把步骤判为失败，不写半成品引用。
 */
import {
  assertStudioOutputRefs,
  isJsonValue,
  isStudioOutputId,
  isStudioOutputName,
  isStudioOutputRelativePath,
  type StudioOutputRef,
} from "./outputRef.js";

/**
 * 生产者的中间结果：要么已经是完整引用，要么是一个**待 Host 核验的工作区文件**。
 * 文件候选必须由调用方核对存在性与哈希后才能变成 `workspace-file` 引用，缺文件即失败。
 */
export type StudioBuiltOutput =
  | { kind: "ref"; ref: StudioOutputRef }
  | { kind: "file"; name: string; relativePath: string };

/**
 * 由节点声明的输出与 Agent 的最终文本构造输出。
 *
 * - 未声明输出 → 不产出任何引用；
 * - 来源 `text`：节点文本本身就是该输出，只允许单名节点；
 * - 来源 `json`：文本必须是按名建键的 JSON 对象，该名字取对应字段；
 * - 来源 `file`：该字段必须是一个可移植相对路径，交给 Host 核对后产出 `workspace-file` 引用。
 */
export function buildStudioStepOutputs(input: {
  names: readonly string[];
  sources?: ReadonlyMap<string, string>;
  text: string;
}): { ok: true; outputs: StudioBuiltOutput[] } | { ok: false; error: string } {
  const names = [...new Set(input.names)];
  if (!names.length) return { ok: true, outputs: [] };
  for (const name of names)
    if (!isStudioOutputName(name))
      return { ok: false, error: `Invalid workflow output name: ${name}` };

  const fallback = names.length === 1 ? "text" : "json";
  const sourceOf = (name: string) => input.sources?.get(name) ?? fallback;
  const keyed = `Node declares ${names.length} outputs (${names.join(", ")}), so its result must be a JSON object keyed by those names.`;

  if (names.every((name) => sourceOf(name) === "text")) {
    if (names.length !== 1)
      return { ok: false, error: "A text output requires the node to declare exactly one output." };
    const name = names[0]!;
    const guarded = guardRefs([{ kind: "text", name, text: input.text }]);
    return guarded.ok ? { ok: true, outputs: [{ kind: "ref", ref: guarded.refs[0]! }] } : guarded;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.text);
  } catch {
    return { ok: false, error: keyed };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return { ok: false, error: keyed };
  const record = parsed as Record<string, unknown>;
  const missing = names.filter((name) => !Object.hasOwn(record, name));
  if (missing.length)
    return {
      ok: false,
      error: `Workflow outputs missing from the node result: ${missing.join(", ")}.`,
    };

  const files: StudioBuiltOutput[] = [];
  const refs: StudioOutputRef[] = [];
  for (const name of names) {
    const value = record[name];
    const from = sourceOf(name);
    if (from === "text")
      return { ok: false, error: "A text output requires the node to declare exactly one output." };
    if (from === "file") {
      if (typeof value !== "string" || !isStudioOutputRelativePath(value))
        return {
          ok: false,
          error: `Workflow output ${name} must be a portable workspace relative path.`,
        };
      files.push({ kind: "file", name, relativePath: value });
      continue;
    }
    if (from !== "json") return { ok: false, error: `Unknown output source for ${name}.` };
    if (!isJsonValue(value))
      return { ok: false, error: `Workflow output ${name} must be a JSON value.` };
    refs.push({ kind: "json", name, value });
  }
  const guarded = guardRefs(refs);
  if (!guarded.ok) return guarded;
  const byName = new Map(guarded.refs.map((ref) => [ref.name, ref]));
  return {
    ok: true,
    outputs: [
      ...files,
      ...names
        .filter((name) => byName.has(name))
        .map((name): StudioBuiltOutput => ({ kind: "ref", ref: byName.get(name)! })),
    ],
  };
}

/**
 * 由节点声明的输出名与**真实创作成果**构造 `creation-output` 引用。
 *
 * 名字数与成果数必须相等，按顺序一一对应；数量不符时返回错误，由调用方把该步骤判为失败。
 * `sha256` 只在成果记录带哈希时写入，旧记录没有哈希时留空（消费侧要求宿主证据，
 * 不会把"没有哈希"当成"未变化"）。
 */
export function buildStudioCreationOutputs(input: {
  names: readonly string[];
  runId: string;
  jobId: string;
  outputs: ReadonlyArray<{ id: string; hash?: string }>;
}): { ok: true; refs: StudioOutputRef[] } | { ok: false; error: string } {
  const names = [...new Set(input.names)];
  if (!names.length) return { ok: true, refs: [] };
  if (!isStudioOutputId(input.runId)) return { ok: false, error: "Creation run id is missing." };
  if (!isStudioOutputId(input.jobId)) return { ok: false, error: "Creation job id is missing." };
  if (names.length !== input.outputs.length)
    return {
      ok: false,
      error: `Node declares ${names.length} outputs (${names.join(", ")}) but the creation job produced ${input.outputs.length}.`,
    };
  const refs: StudioOutputRef[] = [];
  for (const [index, name] of names.entries()) {
    if (!isStudioOutputName(name))
      return { ok: false, error: `Invalid workflow output name: ${name}` };
    const output = input.outputs[index]!;
    if (!isStudioOutputId(output.id))
      return { ok: false, error: `Creation output ${index} has no id.` };
    refs.push({
      kind: "creation-output",
      name,
      runId: input.runId,
      creationJobId: input.jobId,
      outputId: output.id,
      ...(output.hash ? { sha256: output.hash } : {}),
    });
  }
  return guardRefs(refs);
}

function guardRefs(
  refs: StudioOutputRef[],
): { ok: true; refs: StudioOutputRef[] } | { ok: false; error: string } {
  try {
    return { ok: true, refs: assertStudioOutputRefs(refs) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
