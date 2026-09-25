import { studioProjectKey } from "../domain/projectIdentity.js";
import { decodeStepOutputs } from "../domain/outputRef.js";
import type { StudioOutputRef } from "../domain/outputRef.js";
import type { StudioStepResult } from "../workflowTypes.js";
import type {
  StudioApplyAcceptance,
  StudioApplyJournalState,
  StudioApplyLockState,
  StudioDeliveryEvidence,
  StudioDeliveryOutcome,
  StudioMessage,
  StudioRestartDisplayState,
  StudioRunOutcome,
  StudioRunStepOutcome,
  StudioWorkspaceChange,
} from "../types.js";
import type { StoredRun, StoredWorkspace, StudioRepository } from "./storePort.js";

/**
 * 交付结论与验收取证的只读投影（T05）。
 *
 * 纯函数、无 IO、不写任何记录：结论永远由既有 Host 证据推导，绝不落库成第二份状态。
 * 证据优先级 host-hash/apply-journal > creation-record > kernel-tool-state > model-claim；
 * 模型文字只是声明，永远不能把结论提升到 `produced` 以上。
 * 详见 `specs/knorvia-delivery-summary.md`。
 */

/** 验收记录 kind；辅助证据，永不作为任务终态被读回。 */
export const STUDIO_ACCEPTANCE_KIND = "apply-acceptance";
const TERMINAL_JOURNALS: readonly StudioApplyJournalState[] = [
  "complete",
  "rolled-back",
  "rollback-incomplete",
];
const CLAIM_SUMMARY = /无法核实/u;

/** 按写入顺序（新→旧）读取一次运行的全部验收记录。 */
export function readStudioAcceptances(
  db: StudioRepository,
  runId: string,
): StudioApplyAcceptance[] {
  return db
    .list<StudioApplyAcceptance>(STUDIO_ACCEPTANCE_KIND, { scope: runId, limit: 1000 })
    .filter(
      (item) => item?.version === 1 && item.runId === runId && typeof item.stepId === "string",
    );
}

/** 读完即忘：apply-lock 只在应用进行中或恢复待核验时存在。 */
export function readStudioApplyLock(
  db: StudioRepository,
  projectKey: string | undefined,
): StudioApplyLockState | undefined {
  if (!projectKey) return undefined;
  return db.read<StudioApplyLockState>("apply-lock", projectKey);
}

export interface StudioRestartInput {
  acceptances: readonly StudioApplyAcceptance[];
  /** Host 重读被接受路径得到的当前哈希；缺省表示本 Host 无法重读（远端或读取失败）。 */
  currentFileHashes?: Readonly<Record<string, string | null>>;
  /** Host 复核读取到的变更；`conflict === true` 等价于"当前文件已不同于隔离版本"。 */
  observedChanges?: readonly StudioWorkspaceChange[];
  /** apply journal 状态；非终态即为"部分/未知"。 */
  journals?: readonly { stepId?: string; operationId?: string; state: StudioApplyJournalState }[];
  applyLock?: StudioApplyLockState;
  /** 步骤/任务结果是否已知；`false` 时不得显示为已接受。 */
  resultKnown?: boolean;
}

/**
 * 重启后可显示的唯一判定入口：只接收数据、不读 IO、不写状态。
 * 返回 `null` 表示"已接受且与被接受版本一致"，无需提示。
 */
export function studioRestartDisplay(input: StudioRestartInput): StudioRestartDisplayState | null {
  const accepted = input.acceptances.filter((item) => item.result === "accepted");
  const unverified = input.acceptances.filter(
    (item) => item.result === "applied-unverified" || item.result === "remote-unverified",
  );
  const nonTerminalJournal = (input.journals ?? []).some(
    (item) => !TERMINAL_JOURNALS.includes(item.state),
  );
  if (input.resultKnown === false || nonTerminalJournal) return "partial-unknown";
  // 带 recoveryRequired 的锁是"应用成功但核验没走完"的持久标记；普通锁才是进行中的未知。
  if (input.applyLock?.recoveryRequired || unverified.length > 0) return "applied-refresh-failed";
  if (input.applyLock && accepted.length === 0) return "partial-unknown";
  if (accepted.some((item) => acceptedLaterModified(item, input))) return "accepted-later-modified";
  return null;
}

/** 两个等价证据源：Host 重读哈希，或 Host 复核读取到的 `conflict` 变更。 */
function acceptedLaterModified(
  acceptance: StudioApplyAcceptance,
  input: StudioRestartInput,
): boolean {
  const conflicted = new Set(
    (input.observedChanges ?? []).filter((change) => change.conflict).map((change) => change.path),
  );
  return acceptance.fileVersions.some((file) => {
    if (conflicted.has(file.path)) return true;
    const current = input.currentFileHashes?.[file.path];
    return current !== undefined && current !== file.afterHash;
  });
}

/** 交付投影只读既有记录；工具状态证据需要读取方提供该目标的 message 记录（时间线路径会提供）。 */
export interface StudioOutcomeReadOptions {
  toolMessages?: readonly StudioMessage[];
  turnSteps?: ReadonlyMap<string, string>;
}

export function readStudioRunOutcome(
  db: StudioRepository,
  run: StoredRun,
  options: StudioOutcomeReadOptions = {},
): StudioRunOutcome {
  const acceptances = readStudioAcceptances(db, run.id);
  const heads = db
    .list<{ stepId: string }>("workspace-head", { scope: run.id, limit: 10000 })
    .map((head) => head.stepId);
  const headSteps = new Set(heads);
  const toolSteps = new Set<string>();
  for (const message of options.toolMessages ?? []) {
    if (message.runId !== run.id || message.kind !== "tool" || message.state !== "succeeded")
      continue;
    const stepId = options.turnSteps?.get(message.turnId ?? "");
    if (stepId) toolSteps.add(stepId);
  }
  const runUnknown = run.state === "interrupted" && run.resultKnown !== true;
  const steps = [...new Set([...Object.keys(run.checkpoint?.steps ?? {}), ...heads])].map((stepId) =>
    readStudioStepOutcome({
      db,
      run,
      stepId,
      head: headSteps.has(stepId),
      acceptances: acceptances.filter((item) => item.stepId === stepId),
      toolState: toolSteps.has(stepId),
      runUnknown,
    }),
  );
  const outcome = runOutcomeOf(steps.map((step) => step.outcome));
  const restart = steps.map((step) => step.restart).find((state) => state !== undefined);
  return {
    outcome,
    evidence: [...new Set(steps.flatMap((step) => step.evidence))].sort(
      (left, right) => EVIDENCE_ORDER.indexOf(left) - EVIDENCE_ORDER.indexOf(right),
    ),
    steps,
    ...(restart ? { restart } : {}),
  };
}

const EVIDENCE_ORDER: readonly StudioDeliveryEvidence[] = [
  "host-hash",
  "apply-journal",
  "creation-record",
  "kernel-tool-state",
  "model-claim",
  "none",
];
const OUTCOME_ORDER: readonly StudioDeliveryOutcome[] = [
  "unknown",
  "produced",
  "checked",
  "unverified",
];

/** 汇总规则：任一未知步骤使整次运行未知；有产出未验收优先于全部已核验。 */
function runOutcomeOf(outcomes: readonly StudioDeliveryOutcome[]): StudioDeliveryOutcome {
  if (!outcomes.length) return "unverified";
  return OUTCOME_ORDER.find((candidate) => outcomes.includes(candidate)) ?? "unverified";
}

interface StepOutcomeInput {
  db: StudioRepository;
  run: StoredRun;
  stepId: string;
  head: boolean;
  acceptances: StudioApplyAcceptance[];
  toolState: boolean;
  runUnknown: boolean;
}

function readStudioStepOutcome(input: StepOutcomeInput): StudioRunStepOutcome {
  const { db, run, stepId } = input;
  const step = run.checkpoint?.steps?.[stepId] as StudioStepResult | undefined;
  const workspace = db.read<StoredWorkspace>("workspace", `${run.id}:${stepId}`);
  const projectKey = workspace ? studioProjectKey(workspace.sourcePath) : undefined;
  const applyLock = readStudioApplyLock(db, projectKey);
  const latest = input.acceptances[0];
  const journals: { stepId?: string; operationId?: string; state: StudioApplyJournalState }[] =
    input.acceptances
      .filter((item) => item.journalState)
      .map((item) => ({ stepId, operationId: item.operationId, state: item.journalState! }));
  // 有锁又没有验收记录 = 一次未完成的应用；用非终态 journal 表达，交给同一判定函数。
  if (applyLock && !applyLock.recoveryRequired && !latest)
    journals.push({ stepId, state: "applying" });
  const restart = studioRestartDisplay({
    acceptances: input.acceptances,
    journals,
    applyLock,
    // 任务整体结果未知优先于步骤记录：未知结果不得显示为已接受。
    resultKnown: input.runUnknown ? false : step ? step.resultKnown === true : undefined,
  });
  const evidence = stepEvidence(step, latest, input.toolState);
  return {
    stepId,
    outcome: stepOutcome(input, step, latest, evidence, applyLock),
    evidence,
    ...(workspace ? { workspaceStepId: workspace.stepId, workspacePath: workspace.path } : {}),
    ...(latest ? { acceptance: latest } : {}),
    ...(restart ? { restart } : {}),
  };
}

function stepEvidence(
  step: StudioStepResult | undefined,
  latest: StudioApplyAcceptance | undefined,
  toolState: boolean,
): StudioDeliveryEvidence[] {
  const evidence: StudioDeliveryEvidence[] = [];
  if (latest?.result === "accepted" && latest.confirmation !== "remote-returned")
    evidence.push("host-hash");
  // 远端返回的摘要不是本地 journal；只有本地 Host 自己的应用事务才算 apply-journal。
  if (latest && latest.confirmation !== "remote-returned") evidence.push("apply-journal");
  if (creationRefs(step).length) evidence.push("creation-record");
  if (toolState) evidence.push("kernel-tool-state");
  if (step?.text) evidence.push("model-claim");
  return evidence.length ? evidence : ["none"];
}

function stepOutcome(
  input: StepOutcomeInput,
  step: StudioStepResult | undefined,
  latest: StudioApplyAcceptance | undefined,
  evidence: readonly StudioDeliveryEvidence[],
  applyLock: StudioApplyLockState | undefined,
): StudioDeliveryOutcome {
  if (input.runUnknown || (step && step.resultKnown !== true)) return "unknown";
  // 结果未知或恢复待核验的应用：交付是否发生无法证明，不许显示为已验收。
  if (!step && (input.head || evidence.includes("kernel-tool-state"))) return "unknown";
  if (input.acceptances.length === 0 && applyLock?.recoveryRequired) return "unknown";
  if (latest?.result === "accepted") return "checked";
  if (creationRefs(step).some((ref) => ref.sha256)) return "checked";
  if (input.head && !CLAIM_SUMMARY.test(step?.changesSummary ?? "")) return "produced";
  return "unverified";
}

/** 只认经 `decodeStepOutputs` 校验的引用；更高版本或非法载荷一律不当作证据。 */
function creationRefs(
  step: StudioStepResult | undefined,
): Extract<StudioOutputRef, { kind: "creation-output" }>[] {
  if (!step) return [];
  try {
    const decoded = decodeStepOutputs(step);
    if (decoded.kind !== "ok") return [];
    return (decoded.refs ?? []).filter(
      (ref): ref is Extract<StudioOutputRef, { kind: "creation-output" }> =>
        ref.kind === "creation-output",
    );
  } catch {
    return [];
  }
}
