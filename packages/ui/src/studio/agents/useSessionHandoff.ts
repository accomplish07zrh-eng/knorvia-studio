import { useEffect, useRef, useState } from "react";
import type {
  IStudioRuntimeService,
  StudioKernelId,
  StudioKernelStatus,
  StudioMessage,
} from "@knorvia/services";
import {
  HANDOFF_TEXT_LIMIT,
  emptyHandoffRecord,
  handoffScopeKey,
  sameHandoffScope,
  sanitizeHandoffText,
  type SessionHandoffRecord,
} from "@knorvia/shared";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { createAgentConversationTransport } from "@/v4/agentConversationTransport.js";
import { studioAgentStore, useStudioAgentStore } from "@/store/studioAgentStore.js";
import { studioKernelOption } from "../types.js";
import {
  buildStudioHandoffDraft,
  availableHandoffTargets,
  createNativeHandoffAttempt,
  performNativeHandoff,
  performStudioHandoff,
  type NativeHandoffAttempt,
  type StudioHandoffAttempt,
} from "./sessionHandoff.js";
import { UiAsyncActionGate } from "./uiAsyncActionGate.js";
import { captureHandoffGoal, verifyHandoffReferences } from "./taskHandoff.js";

export interface SessionHandoffInput {
  service: IStudioRuntimeService | undefined;
  messages: readonly StudioMessage[];
  sourceKernel: StudioKernelId;
  sourceSessionId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  historyStartKnown?: boolean;
  totalRecordCount?: number;
  excludedRecordCount?: number;
  statuses: readonly StudioKernelStatus[];
  handoffDisabled?: boolean;
  onHandoffComplete: (kernel: StudioKernelId, sessionId: string) => void;
  onNativeHandoffComplete?: (sessionId: string, workspacePath: string) => void;
}

/** UI owns one reviewed attempt; the existing transport owns admission and execution. */
export function useSessionHandoff({
  service,
  messages,
  sourceKernel,
  sourceSessionId,
  workspacePath,
  workspaceIdentity,
  historyStartKnown = false,
  totalRecordCount,
  excludedRecordCount,
  statuses,
  handoffDisabled = false,
  onHandoffComplete,
  onNativeHandoffComplete,
}: SessionHandoffInput) {
  const { locale } = useKnorviaIntl();
  const zh = locale.startsWith("zh");
  const { agentService: nativeAgentService, fileService } = useBaseWorkspaceServices();
  const scope = {
    sessionId: sourceSessionId,
    kernelId: sourceKernel,
    workspacePath,
    workspaceIdentity,
  };
  const scopeKey = handoffScopeKey(scope);
  const record = useStudioAgentStore((state) => {
    const candidate = state.handoffs[scopeKey];
    return candidate && sameHandoffScope(candidate.scope, scope) ? candidate : undefined;
  });
  const storageIssue = useStudioAgentStore((state) => state.storageIssue);
  const dirty = useStudioAgentStore((state) => state.dirty);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<StudioKernelId | "">("");
  const [draft, setDraft] = useState("");
  const [previewRecord, setPreviewRecord] = useState<SessionHandoffRecord | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [draftEdited, setDraftEdited] = useState(false);
  const [notesError, setNotesError] = useState("");
  const verifiedReferences = useRef<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<StudioHandoffAttempt | NativeHandoffAttempt | null>(null);
  const handoffGate = useRef(new UiAsyncActionGate());
  const previewGate = useRef(new UiAsyncActionGate());
  const generation = useRef(0);
  const sourceName = studioKernelOption(sourceKernel, statuses).name;
  useEffect(() => {
    generation.current++;
    handoffGate.current.activate();
    previewGate.current.activate();
    pending.current = null;
    setBusy(false);
    setPreviewing(false);
    setOpen(false);
    setPreviewRecord(null);
    setNotesError("");
    return () => {
      generation.current++;
      handoffGate.current.deactivate();
      previewGate.current.deactivate();
    };
  }, [
    service,
    nativeAgentService,
    fileService,
    sourceKernel,
    sourceSessionId,
    workspacePath,
    workspaceIdentity,
  ]);
  useEffect(() => {
    if (handoffDisabled || !workspacePath || sourceKernel.startsWith("ssh:")) return;
    const next = captureHandoffGoal({ scope, record, historyStartKnown }, messages);
    if (next !== record && next.fields.goal && !studioAgentStore.getState().saveHandoff(next))
      setNotesError(
        zh
          ? "目标尚未保存：存储不可用或记录已达上限。"
          : "Goal is not saved: storage unavailable or record limit reached.",
      );
  }, [scopeKey, workspacePath, record, messages, historyStartKnown, handoffDisabled]);
  const targets = availableHandoffTargets(
    statuses,
    sourceKernel,
    Boolean(nativeAgentService && onNativeHandoffComplete),
  );
  const canHandoff = Boolean(
    (service || (nativeAgentService && onNativeHandoffComplete)) &&
    messages.some(
      (message) =>
        message.targetId === sourceSessionId &&
        message.kind === "text" &&
        (message.sender === "user" || message.sender === sourceKernel),
    ) &&
    workspacePath &&
    !sourceKernel.startsWith("ssh:") &&
    !handoffDisabled &&
    targets.length,
  );

  const refreshPreview = (next: SessionHandoffRecord) => {
    previewGate.current.run(
      async () => {
        const references = await verifyHandoffReferences(fileService, next);
        return {
          text: buildStudioHandoffDraft(messages, sourceName, zh, {
            scope,
            record: next,
            historyStartKnown,
            totalRecordCount,
            excludedRecordCount,
            verifiedReferences: references,
          }).text,
          references,
        };
      },
      {
        onStart: () => {
          setPreviewing(true);
          setDraft("");
          setError("");
        },
        onSuccess: ({ text, references }) => {
          verifiedReferences.current = references;
          setPreviewRecord(next);
          setDraft(text);
          setDraftEdited(false);
        },
        onError: (cause) =>
          setError(sanitizeHandoffText(cause instanceof Error ? cause.message : String(cause))),
        onSettled: () => setPreviewing(false),
      },
    );
  };
  const start = () => {
    if (!canHandoff || open) return;
    previewGate.current.activate();
    if (pending.current) {
      setTarget(pending.current.targetKernel);
      setDraft(pending.current.text);
    } else {
      setTarget("");
      refreshPreview(record ?? captureHandoffGoal({ scope, historyStartKnown }, messages));
    }
    setError("");
    setOpen(true);
  };
  const confirm = () => {
    if (
      !open ||
      !canHandoff ||
      !targets.some((status) => status.id === target) ||
      !target ||
      !draft.trim() ||
      previewing ||
      draft.length > HANDOFF_TEXT_LIMIT
    )
      return;
    const confirmedGeneration = generation.current;
    handoffGate.current.run(
      async () => {
        if (!pending.current && previewRecord && verifiedReferences.current.length) {
          const current = await verifyHandoffReferences(fileService, previewRecord);
          if (verifiedReferences.current.some((ref) => !current.includes(ref)))
            throw new Error(
              zh
                ? "引用已变化或无法核验，请刷新预览后确认。"
                : "References changed or cannot be verified. Refresh the preview before confirming.",
            );
        }
        if (generation.current !== confirmedGeneration) throw new Error("接力来源已变化");
        const attempt =
          pending.current ??
          (target === "knorvia"
            ? createNativeHandoffAttempt({
                sourceKernel,
                workspacePath,
                text: sanitizeHandoffText(draft),
              })
            : {
                targetId: crypto.randomUUID(),
                sourceKernel,
                targetKernel: target,
                workspacePath,
                text: sanitizeHandoffText(draft),
              });
        pending.current = attempt;
        if ("envelope" in attempt) {
          if (!nativeAgentService || !onNativeHandoffComplete)
            throw new Error("原生会话服务暂不可用");
          const transport = createAgentConversationTransport(nativeAgentService, {
            workspacePath: attempt.workspacePath,
          });
          const sessionId = await performNativeHandoff(transport.sendCommand, attempt);
          return { kind: "native" as const, sessionId, workspacePath: attempt.workspacePath };
        } else {
          if (!service) throw new Error("Studio Runtime 暂不可用");
          await performStudioHandoff(service, attempt);
          return {
            kind: "external" as const,
            kernel: attempt.targetKernel,
            sessionId: attempt.targetId,
          };
        }
      },
      {
        onStart: () => {
          setBusy(true);
          setError("");
        },
        onSuccess: (result) => {
          if (result.kind === "native")
            onNativeHandoffComplete?.(result.sessionId, result.workspacePath);
          else onHandoffComplete(result.kernel, result.sessionId);
          setOpen(false);
          pending.current = null;
        },
        onError: (cause) =>
          setError(sanitizeHandoffText(cause instanceof Error ? cause.message : String(cause))),
        onSettled: () => setBusy(false),
      },
    );
  };
  const close = () => {
    if (handoffGate.current.isRunning) return;
    previewGate.current.deactivate();
    setPreviewing(false);
    setOpen(false);
  };
  const saveNotes = (next: SessionHandoffRecord) => {
    const owner = studioAgentStore.getState();
    const current = owner.handoffs[scopeKey];
    // 旧预览缺失目标时，不能抹掉同作用域刚从已加载历史捕获的目标；显式清空仍优先。
    const saved = owner.saveHandoff(
      current && sameHandoffScope(current.scope, scope) && !next.fields.goal
        ? {
            ...next,
            fields: {
              ...next.fields,
              ...(current.fields.goal ? { goal: current.fields.goal } : {}),
            },
          }
        : next,
    );
    if (studioAgentStore.getState().actionError) {
      setNotesError(
        zh
          ? "记录无效或已达 100 条记录上限，未保存本次修改。"
          : "Invalid notes or the 100-record limit was reached. These edits were not saved.",
      );
      return;
    }
    setNotesError(
      saved
        ? ""
        : zh
          ? "任务记录未保存。保留在内存；可重试保存。"
          : "Task notes were not saved. Kept in memory; retry saving.",
    );
    refreshPreview(studioAgentStore.getState().handoffs[scopeKey] ?? emptyHandoffRecord(scope));
  };
  return {
    open,
    target,
    setTarget,
    draft,
    busy,
    previewing,
    draftEdited,
    previewRecord,
    error,
    notesError,
    storageIssue,
    dirty,
    targets,
    canHandoff,
    start,
    close,
    confirm,
    saveNotes,
    refreshPreview,
    hasPending: Boolean(pending.current),
    editDraft: (text: string) => {
      setDraft(sanitizeHandoffText(text));
      setDraftEdited(true);
    },
    retrySave: () => {
      if (studioAgentStore.getState().retrySave()) setNotesError("");
    },
  };
}
