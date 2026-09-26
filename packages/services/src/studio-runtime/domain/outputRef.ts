/**
 * 增量输出引用契约（T06）。
 *
 * 本模块是纯函数、浏览器安全：不导入 Node 内置模块，也不导入服务实现。
 * 检查点只保存有界引用；大文本、大 JSON 与媒体字节留在原有记录或文件中，
 * 引用一律按 id + 相对路径 / 作业 id + 输出 id 定位，绝不内联字节。
 *
 * 详见 `specs/knorvia-output-contract.md`。
 */

/** 契约当前版本。新增结构必须先升版本，不能原地改变已有字段含义。 */
export const STUDIO_OUTPUT_REF_VERSION = 1;
/** 没有版本字段的历史记录按此版本解读。 */
export const STUDIO_OUTPUT_REF_LEGACY_VERSION = 0;

const INLINE_LIMIT = 16 * 1024;
const INLINE_TOTAL_LIMIT = 64 * 1024;
const REFS_LIMIT = 32;
const NAME_PATTERN = /^.{1,64}$/u;
const NAME_LIMIT = 64;
const PATH_LIMIT = 1024;
const ID_LIMIT = 200;
const SCHEMA_ID_PATTERN = /^[\w.:-]{1,100}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
/** Windows 保留设备名不能作为路径段；命中时该引用在 Windows 上无法安全定位。 */
const RESERVED_SEGMENT = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type StudioOutputRef =
  | { kind: "text"; name: string; text: string }
  | { kind: "json"; name: string; schemaId?: string; value: JsonValue }
  | {
      kind: "workspace-file";
      name: string;
      runId: string;
      stepId: string;
      relativePath: string;
      sha256?: string;
    }
  | {
      kind: "creation-output";
      name: string;
      /** 产出该成果的运行 id：解析侧据此判定归属（创作任务记录本身不带运行来源）。 */
      runId: string;
      creationJobId: string;
      outputId: string;
      sha256?: string;
    };

export type StudioOutputRefStatus = "legacy" | "ok" | "unsupported";

export interface StudioOutputRefsDecodeResult {
  status: StudioOutputRefStatus;
  version: number;
  refs?: StudioOutputRef[];
  /** 版本高于 CURRENT 时按原始形状保留，供原样回写；绝不降级重写。 */
  raw?: unknown;
}

export type StudioOutputRefErrorCode = "malformed" | "tooLarge" | "unsupported";

/** 写入边界与解码失败统一用这个错误；调用方可按 code 区分。 */
export class StudioOutputRefError extends Error {
  constructor(
    readonly code: StudioOutputRefErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StudioOutputRefError";
  }
}

/**
 * 版本高于本进程可理解的契约版本。
 * 读数方必须保留原始记录并拒绝按旧语义使用它，绝不能静默丢弃或降级重写。
 */
export class StudioUnsupportedCheckpointVersionError extends StudioOutputRefError {
  constructor(
    readonly version: number,
    message: string,
  ) {
    super("unsupported", message);
    this.name = "StudioUnsupportedCheckpointVersionError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bounded(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit;
}

function inlineBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function malformed(detail: string): StudioOutputRefError {
  return new StudioOutputRefError("malformed", `Invalid studio output reference: ${detail}.`);
}

/** 只有真正可序列化的 JSON 值才能进入检查点；undefined／函数／NaN／循环引用一律拒绝。 */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (record(value))
    return Object.values(value).every((item) => item !== undefined && isJsonValue(item));
  return false;
}

export function studioJsonBytes(value: JsonValue): number {
  return inlineBytes(JSON.stringify(value));
}

/**
 * 工作区文件引用必须能映射到运行内相对路径。
 * 绝对路径、盘符、`..` 与 Windows 保留设备名都会被拒绝：它们无法安全地限定在本次运行的工作区里。
 */
export function isStudioOutputRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > PATH_LIMIT) return false;
  if (value.includes("\\") || value.includes("\0")) return false;
  if (value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return false;
  return value
    .split("/")
    .every(
      (segment) =>
        segment !== "" && segment !== "." && segment !== ".." && !RESERVED_SEGMENT.test(segment),
    );
}

function checkSha256(value: unknown, detail: string): void {
  if (value !== undefined && (typeof value !== "string" || !SHA256_PATTERN.test(value)))
    throw malformed(detail);
}

/** 逐条校验并计算内联额度；返回内联字节合计。 */
function assertStudioOutputRef(ref: unknown, index: number): number {
  const detail = `entry ${index}`;
  if (!record(ref)) throw malformed(detail);
  if (!bounded(ref.name, NAME_LIMIT) || !NAME_PATTERN.test(ref.name)) throw malformed(detail);
  switch (ref.kind) {
    case "text": {
      if (typeof ref.text !== "string") throw malformed(detail);
      const size = inlineBytes(ref.text);
      if (size > INLINE_LIMIT)
        throw new StudioOutputRefError(
          "tooLarge",
          `Studio output ${ref.name} exceeds the ${INLINE_LIMIT}-byte inline text limit.`,
        );
      return size;
    }
    case "json": {
      if (
        ref.schemaId !== undefined &&
        (typeof ref.schemaId !== "string" || !SCHEMA_ID_PATTERN.test(ref.schemaId))
      )
        throw malformed(detail);
      if (!isJsonValue(ref.value)) throw malformed(detail);
      const size = studioJsonBytes(ref.value);
      if (size > INLINE_LIMIT)
        throw new StudioOutputRefError(
          "tooLarge",
          `Studio output ${ref.name} exceeds the ${INLINE_LIMIT}-byte inline JSON limit.`,
        );
      return size;
    }
    case "workspace-file": {
      if (
        !bounded(ref.runId, ID_LIMIT) ||
        typeof ref.stepId !== "string" ||
        ref.stepId.length > ID_LIMIT ||
        !isStudioOutputRelativePath(ref.relativePath)
      )
        throw malformed(detail);
      checkSha256(ref.sha256, detail);
      return 0;
    }
    case "creation-output": {
      if (
        !bounded(ref.runId, ID_LIMIT) ||
        !bounded(ref.creationJobId, ID_LIMIT) ||
        !bounded(ref.outputId, ID_LIMIT)
      )
        throw malformed(detail);
      checkSha256(ref.sha256, detail);
      return 0;
    }
    default:
      throw malformed(detail);
  }
}

/**
 * 写入边界校验：非法与超限一律抛错，不截断、不静默丢弃。
 * 截断会让"已保存的引用"与"实际产物"不一致，下游无法区分"输出本来就短"和"输出被截断"。
 */
export function assertStudioOutputRefs(refs: unknown): StudioOutputRef[] {
  if (!Array.isArray(refs)) throw malformed("not an array");
  if (refs.length > REFS_LIMIT)
    throw new StudioOutputRefError(
      "tooLarge",
      `A workflow step stores at most ${REFS_LIMIT} output references.`,
    );
  let inline = 0;
  const names = new Set<string>();
  refs.forEach((ref, index) => {
    inline += assertStudioOutputRef(ref, index);
    if (!record(ref)) return;
    const name = ref.name as string;
    if (names.has(name))
      throw new StudioOutputRefError("malformed", `Duplicate studio output name: ${name}.`);
    names.add(name);
  });
  if (inline > INLINE_TOTAL_LIMIT)
    throw new StudioOutputRefError(
      "tooLarge",
      `A workflow step inlines at most ${INLINE_TOTAL_LIMIT} bytes of output.`,
    );
  return refs as StudioOutputRef[];
}

/**
 * 引用只允许挂在结果已知的终态上：结果未知时不能把推测的结构化输出当成事实保存。
 * 已知失败的 step 仍可保留诊断引用（例如失败前已落盘的文件引用）。
 */
export function assertStudioOutputsForResult(result: {
  outputs?: unknown;
  resultKnown?: unknown;
}): StudioOutputRef[] | undefined {
  if (result.outputs === undefined) return undefined;
  if (result.resultKnown !== true) throw malformed("outputs require a known result");
  return assertStudioOutputRefs(result.outputs);
}

/**
 * 由节点声明的输出名与 Agent 的最终文本构造输出引用
 * （见 specs/knorvia-output-contract.md「命名输出的生产规则」）。
 *
 * 刻意不做猜测，也不把同一段全文复制成多个不同输出：
 * - 未声明输出名 → 不产出任何引用；
 * - 只声明一个名字 → 该名字接收节点文本（`text`）；
 * - 声明多个名字 → 文本必须是 JSON 对象且以这些名字为键；解析失败或缺键都算失败，
 *   由调用方把步骤判为失败，而不是让下游拿到一个空的或重复的引用。
 */
export function buildStudioStepOutputs(input: {
  names: readonly string[];
  text: string;
}): { ok: true; refs: StudioOutputRef[] } | { ok: false; error: string } {
  const names = [...new Set(input.names)];
  if (!names.length) return { ok: true, refs: [] };
  for (const name of names)
    if (!bounded(name, NAME_LIMIT) || !NAME_PATTERN.test(name))
      return { ok: false, error: `Invalid workflow output name: ${name}` };

  const keyed = `Node declares ${names.length} outputs (${names.join(", ")}), so its result must be a JSON object keyed by those names.`;
  if (names.length === 1) {
    const name = names[0]!;
    return guardRefs([{ kind: "text", name, text: input.text }]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.text);
  } catch {
    return { ok: false, error: keyed };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return { ok: false, error: keyed };
  const source = parsed as Record<string, unknown>;
  const missing = names.filter((name) => !Object.hasOwn(source, name));
  if (missing.length)
    return {
      ok: false,
      error: `Workflow outputs missing from the node result: ${missing.join(", ")}.`,
    };
  const refs: StudioOutputRef[] = [];
  for (const name of names) {
    const value = source[name];
    if (!isJsonValue(value))
      return { ok: false, error: `Workflow output ${name} must be a JSON value.` };
    refs.push({ kind: "json", name, value });
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

/**
 * 由节点声明的输出名与**真实创作成果**构造 `creation-output` 引用。
 *
 * 与文本生产者同样的原则：不做猜测、不复制。名字数与成果数必须相等，按顺序一一对应；
 * 数量不符时返回错误，由调用方把该步骤判为失败。`sha256` 只在成果记录带哈希时写入，
 * 旧记录没有哈希时留空（消费侧要求宿主证据，不会把"没有哈希"当成"未变化"）。
 */
export function buildStudioCreationOutputs(input: {
  names: readonly string[];
  runId: string;
  jobId: string;
  outputs: ReadonlyArray<{ id: string; hash?: string }>;
}): { ok: true; refs: StudioOutputRef[] } | { ok: false; error: string } {
  const names = [...new Set(input.names)];
  if (!names.length) return { ok: true, refs: [] };
  if (!bounded(input.runId, ID_LIMIT)) return { ok: false, error: "Creation run id is missing." };
  if (!bounded(input.jobId, ID_LIMIT)) return { ok: false, error: "Creation job id is missing." };
  if (names.length !== input.outputs.length)
    return {
      ok: false,
      error: `Node declares ${names.length} outputs (${names.join(", ")}) but the creation job produced ${input.outputs.length}.`,
    };
  const refs: StudioOutputRef[] = [];
  for (const [index, name] of names.entries()) {
    if (!bounded(name, NAME_LIMIT) || !NAME_PATTERN.test(name))
      return { ok: false, error: `Invalid workflow output name: ${name}` };
    const output = input.outputs[index]!;
    if (!bounded(output.id, ID_LIMIT))
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

/**
 * 解码 step 结果里的输出契约。
 *
 * - 没有 `version`：legacy，按旧语义继续，不解析引用；
 * - `version <= CURRENT`：ok，解析并校验引用；
 * - `version > CURRENT`：unsupported，拒绝使用但保留 `raw`。
 */
export function decodeStudioOutputRefs(value: unknown): StudioOutputRefsDecodeResult {
  if (!record(value)) throw malformed("not an object");
  const raw = value.version;
  if (raw === undefined)
    return { status: "legacy", version: STUDIO_OUTPUT_REF_LEGACY_VERSION, raw: value };
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0)
    throw malformed("invalid version");
  if (raw > STUDIO_OUTPUT_REF_VERSION) return { status: "unsupported", version: raw, raw: value };
  return {
    status: "ok",
    version: raw,
    refs: value.outputs === undefined ? undefined : assertStudioOutputRefs(value.outputs),
  };
}

/** 已通过 `assertStudioOutputRefs` 的引用可重复校验，用于读取侧往返一致性断言。 */
export function isStudioOutputRefs(value: unknown): value is StudioOutputRef[] {
  try {
    assertStudioOutputRefs(value);
    return true;
  } catch {
    return false;
  }
}

/** 供 `workflowCached` 判定的结果：`legacy` 表示载荷没有输出契约。 */
export type StudioStepOutputsVerdict =
  | { kind: "legacy" }
  | { kind: "ok"; refs: StudioOutputRef[] | undefined }
  | { kind: "unsupported"; version: number; raw: unknown };

/**
 * 校验一个已解析的 step 结果载荷携带的输出契约。
 *
 * 非法契约**直接抛错**（`StudioOutputRefError`），由调用方统一转成既有的
 * `Invalid workflow checkpoint` 报告；"版本高于本进程"单独用 unsupported 表达，
 * 因为它必须报不同的错并保留原始记录。
 */
export function decodeStepOutputs(value: unknown): StudioStepOutputsVerdict {
  if (!record(value) || (value.version === undefined && value.outputs === undefined))
    return { kind: "legacy" };
  const decoded = decodeStudioOutputRefs(value);
  if (decoded.status === "unsupported")
    return { kind: "unsupported", version: decoded.version, raw: decoded.raw };
  if (decoded.status === "legacy") return { kind: "legacy" };
  return { kind: "ok", refs: decoded.refs };
}
