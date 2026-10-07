// SPDX-License-Identifier: Apache-2.0
import { sanitizeHandoffText } from "@knorvia/shared";
import type {
  IStudioRuntimeService,
  StudioCommand,
  StudioReviewAnchor,
  StudioReviewDraft,
  StudioReviewCommand,
} from "@knorvia/services";
import { UiAsyncActionGate } from "../agents/uiAsyncActionGate.js";
import { readReviewEdits, writeReviewEdits, type ReviewEdit } from "./workspaceReviewEditCache.js";

const commentLimitError = "批注最多 1,000 字符 / Comments may contain at most 1,000 characters";

interface Snapshot {
  draft?: StudioReviewDraft;
  edits: Record<string, ReviewEdit>;
  busy: boolean;
  ready: boolean;
  error?: string;
  cacheError?: string;
  cacheBlocked?: boolean;
}
/** Renderer owns only unaccepted text; saved review and accepted runs come from the Host. */
export class WorkspaceReviewController {
  private gate = new UiAsyncActionGate();
  private listeners = new Set<() => void>();
  private value: Snapshot = { edits: {}, busy: false, ready: false };
  private pending?: StudioCommand;
  private cacheRevision = 0;
  private reloadRequired = false;
  constructor(
    private service: IStudioRuntimeService,
    private targetId: string,
    private runId: string,
    private stepId: string,
    private storage: Pick<Storage, "getItem" | "setItem">,
  ) {}
  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(patch: Partial<Snapshot>) {
    this.value = { ...this.value, ...patch };
    for (const listener of this.listeners) listener();
  }
  activate() {
    this.gate.activate();
    this.reload();
  }
  observe(draft: StudioReviewDraft | undefined) {
    const current = this.value.draft;
    if (
      draft &&
      current?.id === draft.id &&
      current.revision === draft.revision &&
      !this.value.busy
    )
      this.set({ draft: { ...current, lastDelivery: draft.lastDelivery } });
  }
  deactivate() {
    this.gate.deactivate();
  }
  private accept(draft: StudioReviewDraft) {
    if (
      draft.runId !== this.runId ||
      draft.stepId !== this.stepId ||
      draft.targetId !== this.targetId
    )
      throw new Error("评审返回了不同任务，已拒绝更新");
    if (this.value.draft?.id !== draft.id) {
      const cached = readReviewEdits(this.storage, draft);
      this.cacheRevision = cached.revision ?? 0;
      this.set({
        draft,
        edits: cached.edits,
        cacheError: cached.error,
        cacheBlocked: Boolean(cached.error),
      });
    } else this.set({ draft });
  }
  private persist(draft: StudioReviewDraft, edits: Record<string, ReviewEdit>) {
    const error = writeReviewEdits(this.storage, draft, edits, this.cacheRevision);
    if (!error) this.cacheRevision++;
    return error;
  }
  private perform(work: () => Promise<StudioReviewDraft | undefined>, accepted?: () => void) {
    return this.gate.run(work, {
      onStart: () => this.set({ busy: true, error: undefined }),
      onSuccess: (draft) => {
        if (draft) this.accept(draft);
        accepted?.();
        this.set({ ready: true });
      },
      onError: (error) =>
        this.set({ error: error instanceof Error ? error.message : String(error) }),
      onSettled: () => this.set({ busy: false }),
    });
  }
  reload = () =>
    this.perform(
      async () => {
        const timeline = await this.service.timeline(this.targetId);
        return timeline.reviewDrafts?.find(
          (draft) => draft.runId === this.runId && draft.stepId === this.stepId,
        );
      },
      () => {
        this.reloadRequired = false;
      },
    );
  private command(input: StudioReviewCommand & { commandId?: string }) {
    const command = {
      ...input,
      commandId: input.commandId ?? crypto.randomUUID(),
    } as StudioCommand;
    return command;
  }
  private base() {
    return {
      type: "workspace-review" as const,
      runId: this.runId,
      stepId: this.stepId,
      draftId: this.value.draft?.id,
      baseRevision: this.value.draft?.revision ?? 0,
    };
  }
  private async submit(command: StudioCommand) {
    const result = await this.service.command(command);
    if (!result.reviewDraft) throw new Error("Host 未返回已保存的评审，请重新读取");
    return result.reviewDraft;
  }
  select = (anchor: StudioReviewAnchor) => {
    if (!this.value.ready || this.value.cacheBlocked) return;
    this.perform(async () => {
      this.pending ??= this.command({
        ...this.base(),
        action: "save-comment",
        commentId: crypto.randomUUID(),
        body: "",
        anchor,
      });
      const draft = await this.submit(this.pending);
      this.pending = undefined;
      return draft;
    });
  };
  edit = (id: string, body: string) => {
    const draft = this.value.draft;
    if (!draft || this.value.busy || this.value.cacheBlocked) return;
    // 浏览器 maxlength 会静默截断长粘贴；由编辑 owner 明确拒绝并保留此前正文。
    if (body.length > 1000) {
      this.set({ error: commentLimitError });
      return;
    }
    const edits = {
      ...this.value.edits,
      [id]: { ...this.value.edits[id], body: sanitizeHandoffText(body) },
    };
    const cacheError = this.persist(draft, edits);
    this.set({
      edits,
      cacheError,
      error: this.value.error === commentLimitError ? undefined : this.value.error,
    });
  };
  private async flush(explicitSave = false) {
    if (this.reloadRequired)
      throw new Error("评审已在其他窗口修改，请先重新读取批注；本机文字仍保留");
    let draft = this.value.draft;
    if (!draft) throw new Error("请先选择差异行");
    if (this.value.cacheBlocked || (this.value.cacheError && !explicitSave))
      throw new Error(this.value.cacheError);
    for (const [id, edit] of Object.entries(this.value.edits)) {
      if (!draft.comments.some((comment) => comment.id === id))
        throw new Error("批注已在其他窗口删除，本机文本仍保留");
      const request =
        edit.request ??
        this.command({
          ...this.base(),
          baseRevision: draft.revision,
          action: "save-comment",
          commentId: id,
          body: edit.body,
        });
      let edits = { ...this.value.edits, [id]: { ...edit, request } };
      const error = this.persist(draft, edits);
      this.set({ edits });
      if (error && !explicitSave) throw new Error(error);
      try {
        draft = await this.submit(request);
      } catch (error) {
        // Host 明确拒绝版本冲突时该请求没有受理；未知传输失败仍保留原请求编号。
        if (error instanceof Error && error.message.includes("评审版本")) {
          this.reloadRequired = true;
          const edits = { ...this.value.edits, [id]: { body: edit.body } };
          this.set({ edits, cacheError: this.persist(draft, edits) });
        }
        throw error;
      }
      this.accept(draft);
      if (
        request.type === "workspace-review" &&
        request.action === "save-comment" &&
        draft.revision > request.baseRevision + 1
      ) {
        // 原请求已经受理，但最新投影还包含另一窗口的后续保存；不能把它当成本机编辑依据。
        this.reloadRequired = true;
        const edits = {
          ...this.value.edits,
          [id]: { body: this.value.edits[id]?.body ?? edit.body },
        };
        this.set({ edits, cacheError: this.persist(draft, edits) });
        throw new Error("评审已在其他窗口修改，请先重新读取批注；本机文字仍保留");
      }
      edits = { ...this.value.edits };
      // 丢 ACK 后用户可能继续改字；旧请求的回执不能清空后来输入的文字。
      if (
        edits[id]?.body ===
        (request.type === "workspace-review" && request.action === "save-comment"
          ? request.body
          : undefined)
      )
        delete edits[id];
      else if (edits[id]) edits[id] = { body: edits[id]!.body };
      this.set({ edits, cacheError: this.persist(draft, edits) });
    }
    if (Object.keys(this.value.edits).length)
      throw new Error("旧保存已确认；较新的编辑仍保留，请再保存一次");
    return draft;
  }
  discard = (id: string) =>
    this.perform(async () => {
      const draft = this.value.draft;
      if (!draft) throw new Error("请先读取评审");
      const edits = { ...this.value.edits };
      delete edits[id];
      const error = this.persist(draft, edits);
      if (error) throw new Error(error);
      this.set({ edits, cacheError: undefined });
      return draft;
    });
  save = () => this.perform(() => this.flush(true));
  prepare = () =>
    this.perform(async () => {
      await this.flush();
      return this.submit(this.command({ ...this.base(), action: "prepare" }));
    });
  remove = (id: string) =>
    this.perform(async () => {
      if (this.value.edits[id]) throw new Error("请先保存本机编辑，再删除批注");
      return this.submit(this.command({ ...this.base(), action: "delete-comment", commentId: id }));
    });
  send = () =>
    this.perform(async () => {
      const draft = this.value.draft;
      if (!draft?.preview || Object.keys(this.value.edits).length)
        throw new Error("请先保存并预览当前批注");
      const command = this.command({
        ...this.base(),
        action: "send",
        previewId: draft.preview.id,
        commandId: draft.preview.commandId,
      });
      return this.submit(command);
    });
}
