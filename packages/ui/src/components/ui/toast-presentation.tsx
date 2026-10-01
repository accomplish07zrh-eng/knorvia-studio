// SPDX-License-Identifier: Apache-2.0
// Source-exposed B5 replacement candidate; inherited DOM/style contract retained.
import { Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import type { ToastItem, ToastPosition } from "./toast.js";

const stacks: Record<ToastPosition, string> = {
  "top-center": "fixed top-16 left-1/2 z-[9999] flex -translate-x-1/2 flex-col items-center gap-2",
  "top-right":
    "fixed right-4 top-16 z-[9999] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2",
  "bottom-left":
    "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-[9999] flex flex-col items-start gap-2",
  "bottom-center":
    "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[9999] flex -translate-x-1/2 flex-col items-center gap-2",
};
export function resolveToastStackClassName(position: ToastPosition): string {
  return stacks[position];
}
export function resolveToastAnchorLeft(rect: Pick<DOMRect, "left" | "width">): number {
  return rect.left + rect.width / 2;
}

const surfaces = {
  update:
    "origin-bottom-left w-[min(300px,calc(100vw-1rem))] max-w-[min(300px,calc(100vw-1rem))] border-popover-border text-foreground shadow-lg",
  notice: "w-[min(536px,calc(100vw-2rem))] border-border text-foreground",
  plain: "border-border px-4 py-3 text-foreground whitespace-pre-line",
};
const motion = {
  right: ["translate-x-[calc(100%+1rem)] opacity-0", "translate-x-0 opacity-100"],
  bottom: ["translate-y-1 scale-[0.98] opacity-0", "translate-y-0 scale-100 opacity-100"],
  top: ["-translate-y-1 scale-[0.98] opacity-0", "translate-y-0 scale-100 opacity-100"],
};

function ToastAction({
  item,
  onAction,
  compact,
}: {
  item: ToastItem;
  onAction?: () => void;
  compact?: boolean;
}) {
  if (!item.actionLabel) return null;
  return (
    <button
      type="button"
      onClick={onAction ?? item.onAction}
      className={
        compact
          ? "h-7 max-w-14 shrink-0 truncate rounded-md bg-secondary px-2 text-ui-base font-medium text-foreground transition-colors hover:bg-hover"
          : "max-w-1/2 self-center shrink-0 whitespace-normal break-words text-left font-medium leading-snug text-foreground underline underline-offset-2 hover:text-foreground-subtle"
      }
    >
      {item.actionLabel}
    </button>
  );
}

function UpdateContent({
  item,
  title,
  body,
  onAction,
}: {
  item: ToastItem;
  title: string;
  body: string;
  onAction?: () => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2">
      <span
        className="size-2 shrink-0 rounded-full bg-primary/80 ring-4 ring-accent"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-ui-base font-medium text-foreground">{title}</div>
        {body ? (
          <div className="mt-0.5 truncate text-ui-base leading-4 text-foreground-subtle">
            {body}
          </div>
        ) : null}
      </div>
      <ToastAction item={item} onAction={onAction} compact />
    </div>
  );
}

function NoticeContent({
  item,
  title,
  body,
  onAction,
  onDismiss,
}: {
  item: ToastItem;
  title: string;
  body: string;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  const Icon = item.variant === "warning" ? TriangleAlert : Info;
  return (
    <div className="flex min-w-0 items-center gap-4 px-4">
      <Icon
        className={
          item.variant === "warning"
            ? "size-4 shrink-0 text-warning"
            : "size-4 shrink-0 text-foreground-subtle"
        }
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-[1_0_0] items-start gap-4 py-3 text-sm">
        <div className="min-w-0 flex-1 leading-5">
          <div className="text-foreground">{title}</div>
          {body ? (
            <div className="mt-0.5 whitespace-pre-line text-foreground-subtle">{body}</div>
          ) : null}
        </div>
        <ToastAction item={item} onAction={onAction} />
      </div>
      {item.dismissible ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={item.dismissLabel ?? "Close"}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-foreground-subtle hover:bg-hover hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function ToastMessageView({
  item,
  visible,
  isBottom,
  title,
  body,
  onAction,
  onDismiss,
}: {
  item: ToastItem;
  visible: boolean;
  isBottom?: boolean;
  title?: string;
  body?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  const lines = item.message.split("\n");
  const text = { title: title ?? lines[0]!, body: body ?? lines.slice(1).join("\n").trim() };
  const kind =
    item.variant === "update"
      ? "update"
      : item.variant === "info" || item.variant === "warning"
        ? "notice"
        : "plain";
  const direction = item.position === "top-right" ? "right" : isBottom ? "bottom" : "top";
  return (
    <div
      className={cn(
        "rounded-2xl border bg-toast/60 text-ui-base shadow-lg backdrop-blur-xl transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transform-none motion-reduce:transition-opacity",
        surfaces[kind],
        motion[direction][visible ? 1 : 0],
      )}
    >
      {kind === "plain" ? (
        item.message
      ) : kind === "update" ? (
        <UpdateContent item={item} {...text} onAction={onAction} />
      ) : (
        <NoticeContent item={item} {...text} onAction={onAction} onDismiss={onDismiss} />
      )}
    </div>
  );
}
