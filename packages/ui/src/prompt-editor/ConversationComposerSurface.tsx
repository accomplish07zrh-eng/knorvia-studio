import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";

/** 原聊天输入卡的单一呈现边界；内核适配只提供内容，不维护另一套尺寸和样式。上下文行位于输入框下方。 */
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
      {children}
      {/* 项目与插件等上下文放在输入框下方（specs/knorvia-composer-polish-20261008.md）；所有内核共用此边界。 */}
      {contextHeader ? (
        <div
          data-composer-context="true"
          className="p-1.5 flex min-w-0 flex-wrap items-center gap-0"
        >
          {contextHeader}
        </div>
      ) : null}
    </div>
  );
}
