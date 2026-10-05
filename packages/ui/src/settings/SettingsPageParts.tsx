import type { CSSProperties, ReactNode } from "react";
import type { BundledTheme } from "shiki";
import { CodeBlock } from "@/components/ai-elements/code-block.js";
import { Card, CardContent } from "@/components/ui/card.js";
import { CODE_PREVIEW_THEME_OPTIONS, SETTINGS_PREVIEW_CODE } from "@/lib/codePreviewPreferences.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { cn } from "@/components/lib/utils.js";

/**
 * Settings 与同级管理页在窗口框架内共享同一内容列。
 * Automations 曾在 shell 与页面内各自居中、加 padding，导致它与 Skills 等
 * Settings 功能的标题起点、顶部基线和内容宽度不一致。
 */
export const SETTINGS_FRAME_CONTENT_CLASSNAME =
  "mx-auto w-full max-w-4xl px-4 pb-8 pt-0 lg:px-8 lg:pb-10";

export function ThemeSelect({
  value,
  onValueChange,
}: {
  value: BundledTheme;
  onValueChange: (value: BundledTheme) => void;
}) {
  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as BundledTheme)}>
      <SelectTrigger size="lg" className="w-64 min-w-0 justify-between">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CODE_PREVIEW_THEME_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ThemePreviewCard({
  mode,
  title,
  themeName,
  theme,
  isActive,
  showLineNumbers,
  wrapLongLines,
  fontSizePx,
}: {
  mode: "light" | "dark";
  title: string;
  themeName: string;
  theme: BundledTheme;
  isActive: boolean;
  showLineNumbers: boolean;
  wrapLongLines: boolean;
  fontSizePx: number;
}) {
  const { intl } = useKnorviaIntl();
  const previewSurfaceClassName = mode === "light" ? "ring-1 ring-black/5" : "ring-1 ring-white/8";
  const previewThemeStyle = {
    "--color-background": mode === "light" ? "#f8f8f8" : "#161616",
    "--color-card": mode === "light" ? "#f8f8f8" : "#161616",
    "--color-foreground": mode === "light" ? "#0d0d0d" : "#ffffff",
  } as CSSProperties;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="text-ui-base font-semibold text-foreground">{title}</div>
          <div className="text-ui-base text-foreground-subtle">{themeName}</div>
        </div>
        <span
          className={`rounded-md px-2.5 py-1 text-ui-xs font-medium ${
            isActive ? "bg-selected text-foreground" : "bg-surface text-foreground-subtle"
          }`}
        >
          {intl.formatMessage({
            id: isActive ? "settings.previewBadge.active" : `settings.previewBadge.${mode}`,
          })}
        </span>
      </div>
      <div className="p-2">
        <CodeBlock
          code={SETTINGS_PREVIEW_CODE}
          language="typescript"
          theme={theme}
          showLineNumbers={showLineNumbers}
          wrapLongLines={wrapLongLines}
          fontSizePx={fontSizePx}
          // Light/Dark Preview 是预览目标主题，不应继承当前应用主题的 background token。
          // CodeBlock 内部会把 @pierre/diffs 背景映射到 card，这里同时固定 background/card。
          className={`overflow-hidden border-0 bg-background ${previewSurfaceClassName}`}
          style={previewThemeStyle}
        />
      </div>
    </div>
  );
}

/**
 * 设置行（2026-10-05 设置布局重做）：左侧标题与说明，右侧控件；窄宽度下控件换到说明下方。
 * 所有分区共用这一行样式，统一行高、内边距与分隔线。
 */
export function SettingsRow({
  label,
  description,
  control,
  detail,
  controlLayout = "default",
}: {
  label: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  detail?: ReactNode;
  controlLayout?: "default" | "wide";
}) {
  return (
    <div
      data-settings-row="true"
      className="border-t border-border/60 px-5 py-4 first:border-t-0 max-sm:px-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0 flex-1">
          <div className="text-ui-base font-medium text-foreground">{label}</div>
          {description ? (
            <div className="mt-1 text-ui-sm leading-5 text-foreground-subtle">{description}</div>
          ) : null}
        </div>
        <div
          className={cn(
            "flex min-w-0 shrink-0 flex-nowrap items-center gap-2 sm:justify-end",
            controlLayout === "wide" ? "w-full sm:w-[280px]" : "max-w-full",
          )}
        >
          {controlLayout === "wide" ? detail : null}
          {control}
        </div>
      </div>
      {detail && controlLayout !== "wide" ? <div className="mt-3">{detail}</div> : null}
    </div>
  );
}

/**
 * 设置分组：可选的分组标题与说明位于卡片外上方，卡片内是若干 SettingsRow。
 * 不传 title 时仅渲染卡片，兼容既有调用。
 */
export function SettingsGroupCard({
  children,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const card = (
    <Card
      data-settings-card="true"
      className="gap-0 overflow-hidden rounded-xl border border-border bg-card py-0 shadow-none"
    >
      <CardContent className="space-y-0 px-0">{children}</CardContent>
    </Card>
  );
  if (!title) return card;
  return (
    <section data-settings-group="true" className="flex flex-col gap-2.5">
      <SettingsGroupHeading title={title} description={description} actions={actions} />
      {card}
    </section>
  );
}

/** 分组标题：卡片外的小标题，也供自绘列表（如快捷键）复用，保持各分区分组层级一致。 */
export function SettingsGroupHeading({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 items-end justify-between gap-3 px-1">
      <div className="min-w-0">
        <h3 className="text-ui-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-ui-sm text-foreground-subtle">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SettingsBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-ui-xs font-medium text-foreground-subtle">
      {children}
    </span>
  );
}

export function getThemeOptionLabel(value: BundledTheme): string {
  return CODE_PREVIEW_THEME_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
