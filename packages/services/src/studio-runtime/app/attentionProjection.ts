import { redactDiagnosticText } from "@knorvia/shared";
import type { StudioAttentionItem, StudioAttentionProjection } from "../attentionTypes.js";
import type { StudioConversation, StudioInteraction, StudioTurnSnapshot } from "../types.js";
import type { StudioKernelId } from "../kernelTypes.js";
import type { StudioGroupDefinition, StudioWorkflowDefinition } from "../workflowTypes.js";
import { studioAttentionVersion } from "../domain/attentionVersion.js";
import { isRetiredKernel } from "../domain/kernelPolicy.js";
import type { StoredRun, StoredWorkspace, StudioRepository } from "./storePort.js";

type AttentionTurn = StudioTurnSnapshot & { kernel?: StudioKernelId; workspacePath?: string };
interface ReadReceipt {
  version: 1;
  eventVersion: string;
}
const terminal = new Set(["succeeded", "failed", "interrupted", "cancelled"]);

export function studioAttentionItem(
  db: StudioRepository,
  object: StudioAttentionItem["object"],
  id: string,
): StudioAttentionItem | undefined {
  const interaction =
    object === "interaction" ? db.read<StudioInteraction>("interaction", id) : undefined;
  if (object === "interaction" && interaction?.status !== "pending") return;
  const run = db.read<StoredRun>("run", interaction?.runId ?? id);
  if (!run || (!interaction && !terminal.has(run.state))) return;
  if (interaction) {
    const turn = db.read<AttentionTurn>("turn", interaction.turnId);
    // 旧 attempt 的迟到审批不是当前待办；投影不能将其变成一次新的批准机会。
    if (
      !turn ||
      turn.runId !== run.id ||
      turn.attempt !== run.attempt ||
      run.cancelRequested ||
      !["running", "waiting"].includes(run.state)
    )
      return;
  }
  const conversation =
    run.kind === "chat" ? db.read<StudioConversation>("conversation", run.targetId) : undefined;
  const current =
    run.kind === "chat"
      ? conversation
      : db.read<StudioGroupDefinition | StudioWorkflowDefinition>(run.kind, run.targetId);
  const definition = run.definition;
  const turns = db.list<AttentionTurn>("turn", { scope: run.id, all: true });
  const declared =
    run.kind === "group"
      ? ((definition as StudioGroupDefinition | undefined)?.members ?? [])
      : run.kind === "workflow"
        ? ((definition as StudioWorkflowDefinition | undefined)?.nodes
            .filter((node) => node.data.kind === "agent")
            .map((node) => node.data.kernel) ?? [])
        : conversation
          ? [conversation.kernel]
          : [];
  const kernels = [
    ...new Set(
      interaction?.kernel
        ? [interaction.kernel]
        : [
            ...turns
              .filter((turn) => turn.attempt === run.attempt)
              .flatMap((turn) => (turn.kernel ? [turn.kernel] : [])),
            ...declared,
          ],
    ),
  ];
  const workspace = db.list<StoredWorkspace>("workspace", { scope: run.id, limit: 1 })[0];
  const eventVersion = studioAttentionVersion(run, interaction);
  const receipt = db.read<ReadReceipt>("attention-read", `${object}:${id}`);
  return {
    id,
    object,
    version: eventVersion,
    category: interaction
      ? "pending"
      : ["failed", "interrupted"].includes(run.state)
        ? "failed"
        : "completed",
    unread: receipt?.version !== 1 || receipt.eventVersion !== eventVersion,
    runId: run.id,
    attempt: run.attempt,
    targetId: run.targetId,
    targetKind: run.kind,
    title: redactDiagnosticText(
      interaction?.title ??
        (run.kind === "chat"
          ? conversation?.title
          : (current as StudioGroupDefinition | StudioWorkflowDefinition | undefined)?.name) ??
        definition?.name ??
        run.targetId,
    ).slice(0, 200),
    workspacePath:
      definition?.workspacePath ?? conversation?.workspacePath ?? workspace?.sourcePath ?? "",
    kernels,
    state: run.state,
    updatedAt: run.updatedAt,
    ...(interaction ? { interactionId: interaction.id, interactionKind: interaction.kind } : {}),
    ...(conversation?.nativeSessionId ? { nativeSessionId: conversation.nativeSessionId } : {}),
    targetDeleted: !current,
    kernelUnavailable: kernels.some(
      (kernel) =>
        isRetiredKernel(kernel) || (kernel.startsWith("acp:") && !db.read("config", kernel)),
    ),
    resultUnknown: run.state === "interrupted" && run.resultKnown !== true,
  };
}

export function readStudioAttention(db: StudioRepository): StudioAttentionProjection {
  const items = [
    ...db
      .list<StoredRun>("run", { all: true })
      .filter((run) => terminal.has(run.state))
      .flatMap((run) => studioAttentionItem(db, "run", run.id) ?? []),
    ...db
      .list<StudioInteraction>("interaction", { pendingInteractionsOnly: true, all: true })
      .flatMap((item) => studioAttentionItem(db, "interaction", item.id) ?? []),
  ].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt ||
      left.object.localeCompare(right.object) ||
      left.id.localeCompare(right.id),
  );
  const counts = { pending: 0, failed: 0, completed: 0 };
  for (const item of items) if (item.category === "pending" || item.unread) counts[item.category]++;
  return { items, counts };
}

export function readStudioAttentionItem(
  db: StudioRepository,
  object: StudioAttentionItem["object"],
  id: string,
  version: string,
): string {
  const current = studioAttentionItem(db, object, id);
  if (!current) throw new Error("此待办已结束或不存在，请刷新列表");
  // 只确认用户所见事件；迟到请求可取得回执，但绝不能标记更新后的事件。
  if (current.version !== version) return id;
  const key = `${object}:${id}`;
  const previous = db.read<ReadReceipt>("attention-read", key);
  if (previous && previous.version !== 1) throw new Error("阅读记录来自较新版本，请升级后处理");
  if (previous?.eventVersion !== version)
    db.write<ReadReceipt>(
      "attention-read",
      key,
      { version: 1, eventVersion: version },
      current.targetId,
    );
  return id;
}
