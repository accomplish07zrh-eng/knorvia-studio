import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";

/**
 * 资源型设置页（MCP、技能、命令、钩子、子智能体）的统一布局原语。
 * 2026-10-05 设置布局重做第二轮：控制条 + 分组标题 + 纸面列表卡 + 空状态，
 * 见 specs/knorvia-unified-mode-onboarding-settings.md §6。
 */

/** 纸面列表卡：细线描边的卡片，行之间用极淡分隔线，取代旧的灰色底板。 */
export const SETTINGS_RESOURCE_LIST_CLASSNAME =
  "overflow-hidden rounded-xl border border-border bg-card";

/** 列表行之间的分隔线；行本身保持原有内容与交互。 */
export function SettingsResourceDivider() {
  return <div className="mx-4 h-px bg-border/60" aria-hidden="true" />;
}

/** 数量胶囊：分组标题、控制条共用。 */
export function SettingsResourceCount({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface px-1.5 text-ui-xs font-medium tabular-nums text-foreground-subtle">
      {children}
    </span>
  );
}

export function SettingsResourceGroupHeader({
  actions,
  count,
  title,
  hint,
}: {
  actions?: ReactNode;
  count: number;
  title: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="truncate text-ui-sm font-semibold text-foreground">{title}</h3>
        <SettingsResourceCount>{count}</SettingsResourceCount>
        {hint ? (
          <span className="min-w-0 truncate text-ui-sm text-foreground-subtle">{hint}</span>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SettingsResourceList<T>({
  getKey,
  items,
  renderItem,
}: {
  getKey: (item: T) => string;
  items: readonly T[];
  renderItem: (item: T) => ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div className={SETTINGS_RESOURCE_LIST_CLASSNAME}>
      {items.map((item, index) => (
        <div key={getKey(item)}>
          {index > 0 ? <SettingsResourceDivider /> : null}
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}

/**
 * 顶部控制条：左侧放范围选择与当前资源计数，右侧放搜索。整条是一张细线卡片，
 * 让「我在看哪个范围的什么」与「如何筛选」落在同一视线上。
 */
export function SettingsResourceToolbar({
  leading,
  trailing,
  className,
}: {
  leading: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-settings-resource-toolbar="true"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-1.5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">{leading}</div>
      {trailing ? <div className="w-full sm:ml-auto sm:w-64">{trailing}</div> : null}
    </div>
  );
}

/** 控制条里的资源名 + 数量。 */
export function SettingsResourceToolbarLabel({
  label,
  count,
}: {
  label: ReactNode;
  count: ReactNode;
}) {
  return (
    <div
      data-independent-capability-count="true"
      className="flex h-8 items-center gap-2 px-2 text-ui-base font-medium text-foreground"
    >
      <span>{label}</span>
      <SettingsResourceCount>{count}</SettingsResourceCount>
    </div>
  );
}

export function SettingsResourceToolbarDivider() {
  return <div className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />;
}
