/**
 * 宿主引用解析契约（T07）。
 *
 * 本模块是纯函数、浏览器安全：不导入 Node 内置模块，也不导入服务实现。
 *
 * 客户端提供的绝对路径从来不是授权。引用必须先通过来源与归属校验（本模块），
 * 再由 Host 侧证据（存在性、真实哈希、契约版本）确认，最后才允许进入执行。
 * 任一环节失败都必须给出**可区分的理由**，因为"路径穿越""不属于本次运行""文件已变化"
 * 对用户意味着完全不同的处理动作。
 *
 * 引用格式沿用 T06 的 `StudioOutputRef`，不新增第二种格式。
 * 详见 `specs/knorvia-host-references.md`。
 */
import {
  decodeStepOutputs,
  isStudioOutputRelativePath,
  StudioUnsupportedCheckpointVersionError,
  type StudioOutputRef,
} from "./outputRef.js";
import {
  studioReferenceIdentity,
  studioReferencePathDetail,
  studioReferencePathReason,
  type StudioReferenceReason,
} from "./referencePath.js";

// 路径与身份规则住在 `referencePath.ts`；这里继续对外暴露同一组符号，调用方无需改动。
export {
  studioReferenceIdentity,
  studioReferencePathReason,
  type StudioReferenceReason,
} from "./referencePath.js";

/** 引用解析契约版本。新增判定类别必须先升版本，不能原地改变已有理由的含义。 */
export const STUDIO_REFERENCE_VERSION = 1;

export interface StudioReferenceContext {
  /** 当前运行的运行 id；`workspace-file` 引用必须属于它。 */
  runId: string;
  /**
   * 允许产出该引用的步骤 id 前缀集合（例如 `workflow:n1:`）。
   * 给出时，`stepId` 必须命中其中之一，否则按 `foreign-step` 拒绝。
   */
  stepOwners?: readonly string[];
  /** 当前运行的身份 key：`workspaceIdentity?.trim() || workspacePath`。 */
  workspaceIdentity?: string;
  /** 引用一侧记录的身份 key；两侧都非空且不同时拒绝。 */
  referenceWorkspaceIdentity?: string;
}

export interface StudioReferenceFileEvidence {
  exists: boolean;
  /** Host 重新读取得到的真实哈希；读不到时为 `null`。 */
  sha256: string | null;
}

export type StudioReferenceVerdict =
  | { ok: true; kind: StudioOutputRef["kind"]; relativePath?: string }
  | { ok: false; reason: StudioReferenceReason; detail: string };

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function reject(reason: StudioReferenceReason, detail: string): StudioReferenceVerdict {
  return { ok: false, reason, detail };
}

function detailFor(reason: StudioReferenceReason, value: string): string {
  return studioReferencePathDetail(reason, value);
}

/**
 * 校验引用的来源、归属与路径范围（纯函数，不读文件）。
 *
 * `text` / `json` 只做结构兜底：它们的内联边界由 `outputRef.ts` 负责。
 */
export function studioReferenceOrigin(
  ref: unknown,
  context: StudioReferenceContext,
): StudioReferenceVerdict {
  if (!ref || typeof ref !== "object" || Array.isArray(ref))
    return reject("malformed", "Invalid studio reference: not an object");
  const record = ref as Record<string, unknown>;
  switch (record.kind) {
    case "text":
      return typeof record.text === "string"
        ? { ok: true, kind: "text" }
        : reject("malformed", "Invalid studio reference: text is not a string");
    case "json":
      return record.value !== undefined
        ? { ok: true, kind: "json" }
        : reject("malformed", "Invalid studio reference: json value is missing");
    case "workspace-file": {
      const pathReason = studioReferencePathReason(record.relativePath);
      if (pathReason) return reject(pathReason, detailFor(pathReason, String(record.relativePath)));
      if (!isStudioOutputRelativePath(record.relativePath))
        return reject("dangerous-name", "Reference path is not a portable relative path");
      if (typeof record.runId !== "string" || !record.runId)
        return reject("malformed", "Invalid studio reference: run id is missing");
      if (typeof record.stepId !== "string" || !record.stepId)
        return reject("malformed", "Invalid studio reference: step id is missing");
      if (record.runId !== context.runId)
        return reject("foreign-task", `Reference belongs to another run: ${record.runId}`);
      if (
        record.sha256 !== undefined &&
        (typeof record.sha256 !== "string" || !SHA256_PATTERN.test(record.sha256))
      )
        return reject("malformed", "Invalid studio reference: malformed sha256");
      return { ok: true, kind: "workspace-file", relativePath: record.relativePath };
    }
    case "creation-output": {
      if (typeof record.creationJobId !== "string" || !record.creationJobId)
        return reject("malformed", "Invalid studio reference: creation job id is missing");
      if (typeof record.outputId !== "string" || !record.outputId)
        return reject("malformed", "Invalid studio reference: creation output id is missing");
      // 创作任务记录本身不带运行来源，归属只能在引用上声明并在这里核对。
      if (typeof record.runId !== "string" || !record.runId)
        return reject("malformed", "Invalid studio reference: run id is missing");
      if (record.runId !== context.runId)
        return reject("foreign-task", `Reference belongs to another run: ${record.runId}`);
      if (
        record.sha256 !== undefined &&
        (typeof record.sha256 !== "string" || !SHA256_PATTERN.test(record.sha256))
      )
        return reject("malformed", "Invalid studio reference: malformed sha256");
      return { ok: true, kind: "creation-output" };
    }
    default:
      return reject("malformed", `Invalid studio reference kind: ${String(record.kind)}`);
  }
}

/**
 * 校验引用是否由当前节点可见的前置步骤产出。
 *
 * 单独于来源校验，因为"属于本次运行但在旁支"和"属于另一个运行"是两种不同的失败。
 */
export function studioReferenceOwnership(
  ref: StudioOutputRef,
  context: StudioReferenceContext,
): StudioReferenceVerdict {
  if (ref.kind !== "workspace-file") return { ok: true, kind: ref.kind };
  if (ref.runId !== context.runId)
    return reject("foreign-task", `Reference belongs to another run: ${ref.runId}`);
  const owners = context.stepOwners;
  if (owners && !owners.some((owner) => owner && ref.stepId.startsWith(owner)))
    return reject("foreign-step", `Reference was produced by an invisible step: ${ref.stepId}`);
  return { ok: true, kind: "workspace-file", relativePath: ref.relativePath };
}

/**
 * 校验工作区身份。
 *
 * 身份缺失时不判定（旧记录没有身份字段）；两侧都非空且不同才拒绝。
 */
export function studioReferenceWorkspace(context: StudioReferenceContext): StudioReferenceVerdict {
  const current = studioReferenceIdentity(context.workspaceIdentity);
  const referenced = studioReferenceIdentity(context.referenceWorkspaceIdentity);
  if (current && referenced && current !== referenced)
    return reject("workspace-mismatch", "Reference belongs to another workspace identity");
  return { ok: true, kind: "text" };
}

/** 引用契约版本；高于本进程必须拒绝，绝不按旧语义使用。 */
export function studioReferenceVersionVerdict(
  version: unknown,
  current: number,
): StudioReferenceVerdict {
  if (version === undefined) return { ok: true, kind: "text" };
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0)
    return reject("malformed", "Invalid studio reference contract version");
  if (version > current)
    return reject("unsupported-version", `Unsupported studio reference version: ${version}`);
  return { ok: true, kind: "text" };
}

/**
 * 版本证据判定。
 *
 * 引用带 `sha256` 时必须比对真实哈希；没有证据（Host 读不到）时调用方必须失败关闭，
 * 不能把"读不到"当成"未变化"，因此这里用 `missing` 明确表达"目标不可用"。
 */
export function studioReferenceEvidence(
  ref: StudioOutputRef,
  evidence: StudioReferenceFileEvidence | undefined,
): StudioReferenceVerdict {
  if (ref.kind === "text") return { ok: true, kind: "text" };
  if (ref.kind === "json") return { ok: true, kind: "json" };
  if (!evidence || !evidence.exists)
    return reject("missing", `Referenced ${ref.kind} is not available`);
  const expected = ref.sha256;
  if (!expected) return { ok: true, kind: ref.kind };
  if (evidence.sha256 === null)
    return reject("missing", `Referenced ${ref.kind} could not be re-read`);
  if (evidence.sha256 !== expected)
    return reject("changed", `Referenced ${ref.kind} changed since it was recorded`);
  return { ok: true, kind: ref.kind };
}

/**
 * 组合校验：结构 → 身份 → 归属 → 版本证据。
 * 返回第一个失败的理由，调用方据此报错。
 */
export function studioReferenceResolve(params: {
  ref: unknown;
  context: StudioReferenceContext;
  evidence?: StudioReferenceFileEvidence;
}): StudioReferenceVerdict {
  const identity = studioReferenceWorkspace(params.context);
  if (!identity.ok) return identity;
  const origin = studioReferenceOrigin(params.ref, params.context);
  if (!origin.ok) return origin;
  const ref = params.ref as StudioOutputRef;
  const ownership = studioReferenceOwnership(ref, params.context);
  if (!ownership.ok) return ownership;
  return studioReferenceEvidence(ref, params.evidence);
}

/** 执行期解析所需的最小结果视图；刻意不导入 app 层类型，保持 domain 无上层依赖。 */
export interface StudioWorkflowOutcomeView {
  status: string;
  text?: string;
  outputs?: StudioOutputRef[];
  version?: number;
}
/**
 * 执行期引用解析的宿主上下文（与 `app/ports.ts` 的 `StudioReferencePort` 结构一致）。
 * 宿主没有读取能力时，工作区文件引用失败关闭，绝不退化为"当作没变化"。
 */
export interface StudioWorkflowReferenceHost {
  runId: string;
  stepOwners?: readonly string[];
  workspaceIdentity?: string;
  fileVersion?(runId: string, stepId: string, relativePath: string): Promise<string | null>;
  /**
   * 经 CreationService 核对创作引用的归属、存在性与版本/哈希。
   * 返回 `null` 表示宿主无法核对（视同不可用）；不实现时创作引用失败关闭。
   */
  creationOutputVersion?(
    jobId: string,
    outputId: string,
  ): Promise<{ exists: boolean; sha256: string | null } | null>;
}

export const STUDIO_REFERENCE_PLACEHOLDER = /\{\{ref\.([^{}]+)\}\}/g;

/**
 * 已核验的 `workspace-file` 引用。下游隔离工作区里并没有这个文件，因此需要 Host 按这份身份
 * 把副本导入目标工作区（见 `specs/knorvia-host-references.md`「跨隔离输入」）。
 */
export interface StudioResolvedReferenceInput {
  name: string;
  sourceRunId: string;
  sourceStepId: string;
  relativePath: string;
  sha256?: string;
}

/** 解析结果：供提示词代入的文本值，以及需要由 Host 导入的文件输入。 */
export interface StudioWorkflowBindings {
  values: Map<string, string>;
  files: StudioResolvedReferenceInput[];
}

/** 提示词与创作参考路径里要求解析的上游输出名（去重）。 */
export function studioRequestedOutputs(sources: Array<string | undefined>): string[] {
  const requested = new Set<string>();
  for (const source of sources)
    for (const match of (source ?? "").matchAll(STUDIO_REFERENCE_PLACEHOLDER))
      requested.add(match[1]!.trim());
  return [...requested];
}

/**
 * 解析 `{{ref.<name>}}`：结构、来源与归属由本模块判定，存在性与真实哈希必须由宿主证据确认。
 * 任一步失败都在**调用内核之前**抛错，错误信息指出引用名与具体原因。
 */
export async function resolveStudioWorkflowBindings(params: {
  sources: Array<string | undefined>;
  outcomes: ReadonlyMap<string, StudioWorkflowOutcomeView>;
  ancestors?: ReadonlySet<string>;
  host?: StudioWorkflowReferenceHost;
}): Promise<StudioWorkflowBindings> {
  const values = new Map<string, string>();
  const files: StudioResolvedReferenceInput[] = [];
  const requested = studioRequestedOutputs(params.sources);
  if (!requested.length) return { values, files };
  for (const name of requested) {
    const found = findWorkflowOutput(params.outcomes, name, params.ancestors);
    if (!found) throw new Error(`Workflow reference is unavailable before execution: ref.${name}.`);
    if (!params.host)
      throw new Error(`Workflow reference cannot be verified without a host context: ref.${name}.`);
    const context: StudioReferenceContext = {
      runId: params.host.runId,
      stepOwners: [`workflow:${found.producer}:`],
      workspaceIdentity: studioReferenceIdentity(params.host.workspaceIdentity),
      referenceWorkspaceIdentity: studioReferenceIdentity(params.host.workspaceIdentity),
    };
    let evidence: StudioReferenceFileEvidence | undefined;
    if (found.ref.kind === "workspace-file") {
      if (!params.host.fileVersion)
        throw new Error(
          `Workflow reference cannot be verified without host evidence: ref.${name}.`,
        );
      const hash = await params.host.fileVersion(
        found.ref.runId,
        found.ref.stepId,
        found.ref.relativePath,
      );
      evidence = { exists: hash !== null, sha256: hash };
    } else if (found.ref.kind === "creation-output") {
      // 创作引用必须经 CreationService 核对归属/存在性/版本，而不是只看字段形状。
      if (!params.host.creationOutputVersion)
        throw new Error(
          `Workflow reference cannot be verified without creation evidence: ref.${name}.`,
        );
      const version = await params.host.creationOutputVersion(
        found.ref.creationJobId,
        found.ref.outputId,
      );
      evidence = version ?? { exists: false, sha256: null };
    }
    const verdict = studioReferenceResolve({ ref: found.ref, context, evidence });
    if (!verdict.ok) throw new Error(`Workflow reference ${name} was rejected: ${verdict.detail}.`);
    values.set(name, studioReferenceText(found.ref));
    // 文件引用还要交给 Host 导入下游工作区：上游工作区里有这个相对路径，不代表下游也有。
    if (found.ref.kind === "workspace-file")
      files.push({
        name,
        sourceRunId: found.ref.runId,
        sourceStepId: found.ref.stepId,
        relativePath: found.ref.relativePath,
        ...(found.ref.sha256 ? { sha256: found.ref.sha256 } : {}),
      });
  }
  return { values, files };
}

/** 在可见范围内按名字查找输出引用；同时返回产出它的节点 id。 */
function findWorkflowOutput(
  outcomes: ReadonlyMap<string, StudioWorkflowOutcomeView>,
  name: string,
  ancestors?: ReadonlySet<string>,
): { ref: StudioOutputRef; producer: string } | undefined {
  for (const [producer, outcome] of outcomes) {
    if (ancestors && !ancestors.has(producer)) continue;
    if (outcome.status !== "succeeded" || !outcome.outputs) continue;
    // 契约版本高于本进程时不能被当作可用引用。
    const verdict = decodeStepOutputs(outcome);
    if (verdict.kind === "unsupported")
      throw new StudioUnsupportedCheckpointVersionError(
        verdict.version,
        `Unsupported workflow checkpoint version for ${producer}.`,
      );
    for (const ref of outcome.outputs) if (ref.name === name) return { ref, producer };
  }
  return undefined;
}

/** 引用的可执行文本：内联值原样使用，文件类引用只交出经过校验的引用位置。 */
function studioReferenceText(ref: StudioOutputRef): string {
  switch (ref.kind) {
    case "text":
      return ref.text;
    case "json":
      return JSON.stringify(ref.value);
    case "workspace-file":
      return ref.relativePath;
    default:
      return ref.outputId;
  }
}
