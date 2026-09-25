import {
  creationReferenceSlots,
  type CreationJob,
  type CreationModel,
  type CreationOutput,
  type CreationVerification,
  type CreationVerificationOutcome,
} from "@knorvia/services";
import { CREATION_IMAGE_TYPES, CREATION_REFERENCE_MAX_BYTES } from "./creationInput.js";

/** 历史卡片上的四个入口；服务端没有额外接口，全部走既有的 reuseJob / createJob / verifyJob。 */
export type CreationEntryKey = "reuse" | "variant" | "reference" | "verify";

export interface CreationEntryState {
  /** 按钮文案的 i18n key（省略 studio.creation. 前缀）。 */
  label: string;
  enabled: boolean;
  /** 不可用原因；enabled 为 false 时给出可解释的理由。 */
  reason?: string;
  /** 可用时的诚实说明，例如结果未知时再次提交会产生第二次付费请求。 */
  note?: string;
  /** 触发后会产生新的供应商请求，可能再次计费。 */
  bills: boolean;
}

export type CreationEntryStates = Record<CreationEntryKey, CreationEntryState>;

const ENTRY_LABELS: Record<CreationEntryKey, string> = {
  reuse: "reuseParameters",
  variant: "variant",
  reference: "continueAsReference",
  verify: "verifyRemote",
};

function entry(
  key: CreationEntryKey,
  enabled: boolean,
  reason: string | undefined,
  note: string | undefined,
  bills: boolean,
): CreationEntryState {
  return {
    label: ENTRY_LABELS[key],
    enabled,
    bills,
    ...(reason ? { reason } : {}),
    ...(note ? { note } : {}),
  };
}

/** 只有已确认的成果才能作为参考输入，与工作流交接的哈希规则一致。 */
export function creationReferenceOutput(job: CreationJob): CreationOutput | undefined {
  return job.outputs.length > 0 ? job.outputs[0] : undefined;
}

/**
 * 复用与变体共用这一套门控，条件与 reuseStoredJob 的服务端校验逐项对应；
 * 槽位判断复用 creationReferenceSlots，界面不按协议字符串另写规则。
 */
function draftEntryBlock(job: CreationJob, model: CreationModel | undefined): string | undefined {
  if (job.status === "queued" || job.status === "running") return "entryReasonRunning";
  if (!model) return "entryReasonModelMissing";
  if (!model.enabled) return "entryReasonModelDisabled";
  if (model.kind !== job.kind) return "entryReasonModelKind";
  if (!model.configured) return "entryReasonModelUnconfigured";
  const slots = creationReferenceSlots(model);
  if (job.referenceName && !slots.image) return "entryReasonSlotReference";
  if (job.firstFrameName && !slots.firstFrame) return "entryReasonSlotFirstFrame";
  if (job.lastFrameName && !slots.lastFrame) return "entryReasonSlotLastFrame";
  return undefined;
}

function referenceEntryBlock(
  job: CreationJob,
  model: CreationModel | undefined,
): string | undefined {
  if (job.status !== "succeeded") return "referenceReasonStatus";
  const output = creationReferenceOutput(job);
  if (!output) return "referenceReasonOutput";
  if (!output.hash) return "referenceReasonHash";
  if (job.kind !== "image" || !CREATION_IMAGE_TYPES.includes(output.mimeType))
    return "referenceReasonKind";
  if (!output.size || output.size > CREATION_REFERENCE_MAX_BYTES) return "referenceReasonSize";
  if (!model) return "entryReasonModelMissing";
  if (!model.enabled) return "entryReasonModelDisabled";
  if (model.kind !== "image") return "entryReasonModelKind";
  if (!model.configured) return "entryReasonModelUnconfigured";
  if (!creationReferenceSlots(model).image) return "entryReasonSlotReference";
  return undefined;
}

/** 只有结果未知（interrupted／cancelled）的任务才允许核验，与 verifyJob 的服务端拒绝条件一致。 */
function verifyEntryBlock(job: CreationJob, model: CreationModel | undefined): string | undefined {
  if (job.status !== "interrupted" && job.status !== "cancelled") return "verifyReasonStatus";
  if (!model) return "verifyReasonModelMissing";
  return undefined;
}

export function creationEntryStates(
  job: CreationJob,
  model: CreationModel | undefined,
): CreationEntryStates {
  const draftReason = draftEntryBlock(job, model);
  const unknown = job.status === "interrupted" || job.status === "cancelled";
  const referenceReason = referenceEntryBlock(job, model);
  const verifyReason = verifyEntryBlock(job, model);
  const draftEnabled = draftReason === undefined;
  return {
    reuse: entry("reuse", draftEnabled, draftReason, undefined, false),
    variant: entry(
      "variant",
      draftEnabled,
      draftReason,
      draftEnabled && unknown ? "variantUnknownResult" : "variantNote",
      true,
    ),
    reference: entry(
      "reference",
      referenceReason === undefined,
      referenceReason,
      referenceReason === undefined ? "referenceNote" : undefined,
      true,
    ),
    verify: entry("verify", verifyReason === undefined, verifyReason, undefined, false),
  };
}

/** 操作行下方的一行说明：只列真正不可用的入口，同一原因合并成一组。 */
export function creationDisabledEntries(
  states: CreationEntryStates,
): Array<{ reason: string; labels: string[] }> {
  const groups: Array<{ reason: string; labels: string[] }> = [];
  for (const state of Object.values(states)) {
    if (state.enabled || !state.reason) continue;
    const existing = groups.find((group) => group.reason === state.reason);
    if (existing) existing.labels.push(state.label);
    else groups.push({ reason: state.reason, labels: [state.label] });
  }
  return groups;
}

export interface CreationDetailRow {
  /** 行标签的 i18n key（省略 studio.creation. 前缀）。 */
  label: string;
  /** 直接显示的文本。 */
  value?: string;
  /** 需要翻译的枚举值（任务类型、协议）。 */
  messageId?: string;
}

export interface CreationHistoryDetail {
  /** 直接取服务端 publicJob 的计算结果，界面不重新推断。 */
  reconstructible: boolean;
  /** 不可还原时服务端列出的缺失字段，原样显示。 */
  missing: string[];
  /** 快照里确实存在的白名单字段行；旧记录没有快照时为空。 */
  snapshot: CreationDetailRow[];
  provenance: CreationDetailRow[];
}

export function creationTimeText(value: string): string {
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? value : time.toLocaleString();
}

function nameRow(label: string, name?: string, hash?: string): CreationDetailRow[] {
  if (!name) return [];
  return [{ label, value: hash ? `${name} · ${hash.slice(0, 12)}` : name }];
}

/**
 * 快照与来源关系的展示模型。缺失快照时只给出“无法还原”和缺失项，
 * 绝不用当前模型配置或表单当前值顶替历史参数。
 */
export function creationHistoryDetail(job: CreationJob): CreationHistoryDetail {
  const snapshot = job.parameterSnapshot;
  const reconstructible = job.reconstructible === true;
  const missing =
    job.missing && job.missing.length > 0
      ? [...job.missing]
      : reconstructible
        ? []
        : ["parameterSnapshot"];
  const snapshotRows: CreationDetailRow[] = snapshot
    ? [
        { label: "snapshotKind", messageId: snapshot.kind },
        { label: "snapshotModel", value: snapshot.modelName },
        { label: "snapshotProtocol", messageId: `protocol.${snapshot.protocol}` },
        { label: "snapshotProviderModel", value: snapshot.params?.model ?? "" },
        { label: "snapshotPrompt", value: snapshot.prompt },
        { label: "snapshotCapturedAt", value: creationTimeText(snapshot.capturedAt) },
        ...nameRow("snapshotReference", snapshot.referenceName, snapshot.referenceHash),
        ...nameRow("snapshotFirstFrame", snapshot.firstFrameName, snapshot.firstFrameHash),
        ...nameRow("snapshotLastFrame", snapshot.lastFrameName, snapshot.lastFrameHash),
      ]
    : [];
  const provenance: CreationDetailRow[] = [];
  if (job.provenance?.parentJobId)
    provenance.push({ label: "provenanceParent", value: job.provenance.parentJobId });
  if (job.provenance?.referencedOutputId)
    provenance.push({ label: "provenanceOutput", value: job.provenance.referencedOutputId });
  if (job.provenance?.repeatOfRequestId)
    provenance.push({ label: "provenanceRepeat", value: job.provenance.repeatOfRequestId });
  return { reconstructible, missing, snapshot: snapshotRows, provenance };
}

export type CreationVerificationTone = "success" | "failure" | "unknown" | "unsupported";

export interface CreationVerificationView {
  outcome: CreationVerificationOutcome;
  tone: CreationVerificationTone;
  /** 结果标签的 i18n key（省略 studio.creation. 前缀）。 */
  label: string;
  /** 服务端返回的原文，原样显示，界面不改写。 */
  message: string;
  checkedAt: string;
}

const VERIFICATION_VIEWS: Record<
  CreationVerificationOutcome,
  { tone: CreationVerificationTone; label: string }
> = {
  succeeded: { tone: "success", label: "verifyOutcomeSucceeded" },
  failed: { tone: "failure", label: "verifyOutcomeFailed" },
  unknown: { tone: "unknown", label: "verifyOutcomeUnknown" },
  unsupported: { tone: "unsupported", label: "verifyOutcomeUnsupported" },
};

export function creationVerificationView(
  verification: CreationVerification,
): CreationVerificationView {
  const view = VERIFICATION_VIEWS[verification.outcome];
  return {
    outcome: verification.outcome,
    tone: view.tone,
    label: view.label,
    message: verification.message,
    checkedAt: verification.checkedAt,
  };
}
