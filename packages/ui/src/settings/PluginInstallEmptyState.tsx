import type { ReactNode } from "react";

/**
 * 资源页空状态（2026-10-05 设置布局重做第二轮）：实线细边卡片 + 三道笔画母题 + 标题/说明/操作，
 * 取代旧的虚线框，与纸面列表卡同一层级。
 */
const CONTAINER_CLASS_NAME = "rounded-xl border border-border bg-card px-6 py-10 text-center";

export function PluginLoadingState({ label }: { label: string }) {
  return (
    <div
      role="status"
      className={`${CONTAINER_CLASS_NAME} flex items-center justify-center gap-2 text-ui-sm text-foreground-subtle`}
    >
      <span
        aria-hidden="true"
        className="size-1.5 animate-pulse rounded-full bg-foreground-subtlest motion-reduce:animate-none"
      />
      {label}
    </div>
  );
}

export function PluginSearchEmptyState({ label }: { label: string }) {
  return <div className={`${CONTAINER_CLASS_NAME} text-ui-sm text-foreground-subtle`}>{label}</div>;
}

export function PluginInstallEmptyState({
  actions,
  description,
  title,
}: {
  actions: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div
      data-settings-empty-state="true"
      className={`flex flex-col items-center justify-center gap-4 ${CONTAINER_CLASS_NAME}`}
    >
      <span aria-hidden="true" data-knorvia-strokes="true" />
      <div className="max-w-sm space-y-1.5">
        <div className="text-ui-base font-semibold text-foreground">{title}</div>
        <div className="text-ui-sm leading-5 text-foreground-subtle">{description}</div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
