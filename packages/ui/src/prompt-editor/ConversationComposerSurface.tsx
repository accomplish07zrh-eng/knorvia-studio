import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";

/** 原聊天输入卡的单一呈现边界；内核适配只提供内容，不维护另一套尺寸和样式。 */
export function ConversationComposerSurface({
  contextHeader,
  children,
}: {
  contextHeader?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      data-composer-surface="true"
      className={cn(
        "chat-composer-input-surface relative w-full",
        contextHeader && "rounded-2xl bg-surface shadow-xl/5",
      )}
    >
      {contextHeader ? (
        <div className="p-1.5 flex min-w-0 flex-wrap items-center gap-0">{contextHeader}</div>
      ) : null}
      {children}
    </div>
  );
}
