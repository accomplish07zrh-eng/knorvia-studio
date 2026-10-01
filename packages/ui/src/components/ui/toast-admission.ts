// SPDX-License-Identifier: Apache-2.0
// Source-exposed B5 replacement candidate; authorship/license review remains pending.
import type { ToastItem, ToastOptions, ToastUpdate } from "./toast.js";

export type ToastCommand =
  | { kind: "insert"; item: ToastItem }
  | { kind: "patch"; id: number; patch: ToastUpdate }
  | { kind: "remove"; id: number };

export function upsertToastItem(items: readonly ToastItem[], item: ToastItem): ToastItem[] {
  const next: ToastItem[] = [];
  for (let index = 0; index < items.length; index++) {
    if (item.dedupeKey && !(index in items)) continue;
    const current = items[index]!;
    if (!item.dedupeKey || current.dedupeKey !== item.dedupeKey) next.push(current);
  }
  next.push(item);
  return next;
}

export function reduceToastCommand(items: ToastItem[], command: ToastCommand): ToastItem[] {
  if (command.kind === "insert") return upsertToastItem(items, command.item);
  const next: ToastItem[] = [];
  for (const item of items) {
    if (item.id !== command.id) next.push(item);
    else if (command.kind === "patch") next.push({ ...item, ...command.patch });
  }
  return next;
}

type Admission = { patch: ToastUpdate; suppressed: boolean };

/** Pre-mount commands have one mailbox; mounted React projections own their item list. */
export class ToastAdmission {
  private sequence = 0;
  private sink: ((command: ToastCommand) => void) | null = null;
  private waiting = new Map<number, Admission>();

  get ready() {
    return this.sink !== null;
  }

  attach(sink: (command: ToastCommand) => void) {
    this.sink = sink;
    return () => {
      this.sink = null;
    };
  }

  issue(message: string, options?: ToastOptions) {
    const id = this.sequence++;
    const item: ToastItem = {
      id,
      message,
      durationMs: options?.durationMs ?? 3000,
      position: options?.position ?? "top-center",
      variant: options?.variant ?? "default",
      actionLabel: options?.actionLabel,
      onAction: options?.onAction,
      dismissible: options?.dismissible,
      dismissLabel: options?.dismissLabel,
      anchorId: options?.anchorId,
      dedupeKey: options?.dedupeKey,
    };
    this.waiting.set(id, { patch: {}, suppressed: false });
    const admit = () => {
      if (!this.sink) {
        requestAnimationFrame(admit);
        return;
      }
      const pending = this.waiting.get(id)!;
      this.waiting.delete(id);
      if (!pending.suppressed) this.sink({ kind: "insert", item: { ...item, ...pending.patch } });
    };
    admit();
    return id;
  }

  patch(id: number, patch: ToastUpdate) {
    const pending = this.waiting.get(id);
    if (pending) pending.patch = { ...pending.patch, ...patch };
    else this.sink?.({ kind: "patch", id, patch });
  }

  dismiss(id: number) {
    const pending = this.waiting.get(id);
    if (pending) {
      pending.patch = {};
      pending.suppressed = true;
    } else this.sink?.({ kind: "remove", id });
  }
}
