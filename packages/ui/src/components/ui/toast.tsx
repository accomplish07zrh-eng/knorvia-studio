// SPDX-License-Identifier: Apache-2.0
// Source-exposed B5 replacement candidate; inherited presentation and pending review retained.
import { createRoot } from "react-dom/client";
import { useEffect, useReducer, useState } from "react";
import { ToastAdmission, reduceToastCommand } from "./toast-admission.js";
import { ToastAnchorPosition } from "./toast-anchor-position.js";
import { ToastMessageView, resolveToastStackClassName } from "./toast-presentation.js";

export { upsertToastItem } from "./toast-admission.js";
export {
  ToastMessageView,
  resolveToastStackClassName,
  resolveToastAnchorLeft,
} from "./toast-presentation.js";
export type ToastPosition = "top-center" | "top-right" | "bottom-left" | "bottom-center";
type ToastVariant = "default" | "update" | "info" | "warning";
export interface ToastOptions {
  durationMs?: number;
  position?: ToastPosition;
  variant?: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
  dismissLabel?: string;
  anchorId?: string;
  dedupeKey?: string;
}
export interface ToastItem {
  id: number;
  message: string;
  durationMs: number;
  position: ToastPosition;
  variant?: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
  dismissLabel?: string;
  anchorId?: string;
  dedupeKey?: string;
}
export type ToastUpdate = Partial<Omit<ToastItem, "id">>;

const admission = new ToastAdmission();
const positions: ToastPosition[] = ["top-center", "top-right", "bottom-left", "bottom-center"];
const exitDelay = 200;

function ToastLifetime({
  item,
  onDone,
  isBottom,
}: {
  item: ToastItem;
  onDone: (id: number) => void;
  isBottom?: boolean;
}) {
  const [phase, show] = useState<"entering" | "visible" | "leaving">("entering");
  useEffect(() => {
    requestAnimationFrame(() => show("visible"));
    const duration = item.durationMs;
    if (!(Number.isFinite(duration) && duration > 0)) return;
    const expiry = setTimeout(() => {
      show("leaving");
      setTimeout(() => onDone(item.id), exitDelay);
    }, duration);
    return () => clearTimeout(expiry);
  }, [item.durationMs]);
  const dismiss = () => {
    show("leaving");
    window.setTimeout(() => onDone(item.id), exitDelay);
  };
  const action = () => {
    item.onAction?.();
    dismiss();
  };
  return (
    <ToastMessageView
      item={item}
      visible={phase === "visible"}
      isBottom={isBottom}
      onAction={action}
      onDismiss={dismiss}
    />
  );
}

export function AnchoredToastStack({
  anchorId,
  items,
  onDone,
}: {
  anchorId: string;
  items: ToastItem[];
  onDone: (id: number) => void;
}) {
  const [left, moved] = useState<number | null>(null);
  useEffect(() => {
    const position = new ToastAnchorPosition(anchorId, moved);
    position.start();
    return () => position.stop();
  }, [anchorId]);
  return (
    <div
      className={resolveToastStackClassName("top-center")}
      style={left === null ? undefined : { left }}
    >
      {items.map((item) => (
        <ToastLifetime key={item.id} item={item} onDone={onDone} />
      ))}
    </div>
  );
}

function ToastProjection() {
  const [items, command] = useReducer(reduceToastCommand, []);
  useEffect(() => admission.attach(command), []);
  const removed = (id: number) => command({ kind: "remove", id });
  const anchors = new Map<string, ToastItem[]>();
  for (const item of items) {
    if (item.position !== "top-center" || !item.anchorId) continue;
    if (!anchors.has(item.anchorId)) anchors.set(item.anchorId, []);
    anchors.get(item.anchorId)!.push(item);
  }
  return (
    <>
      {positions.map((position) => (
        <div key={position} className={resolveToastStackClassName(position)}>
          {items
            .filter(
              (item) => item.position === position && (position !== "top-center" || !item.anchorId),
            )
            .map((item) => (
              <ToastLifetime
                key={item.id}
                item={item}
                onDone={removed}
                isBottom={position.startsWith("bottom")}
              />
            ))}
        </div>
      ))}
      {[...anchors].map(([anchorId, group]) => (
        <AnchoredToastStack key={anchorId} anchorId={anchorId} items={group} onDone={removed} />
      ))}
    </>
  );
}

export function toast(message: string, options?: ToastOptions): number {
  if (!admission.ready) {
    const host = document.createElement("div");
    host.id = "knorvia-toast-host";
    document.body.appendChild(host);
    createRoot(host).render(<ToastProjection />);
  }
  return admission.issue(message, options);
}
export function updateToast(id: number, patch: ToastUpdate): void {
  admission.patch(id, patch);
}
export function dismissToast(id: number): void {
  admission.dismiss(id);
}
