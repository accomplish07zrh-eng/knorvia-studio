import { useEffect, useRef } from "react";
import { PanelLeft } from "lucide-react";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";

/**
 * 窄屏 Web 的内容侧栏抽屉（specs/knorvia-layout-polish-20261009.md）。
 * 无活动栏（< 768px）时侧栏覆盖在内容上方：收起时左下角显示圆形开关，展开时显示遮罩，
 * 点遮罩或切换页面/会话即收起。桌面与宽屏不渲染任何内容。
 */
export const NARROW_SIDEBAR_DRAWER_CLASSNAME =
  "max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:!w-[min(86vw,20rem)] max-md:!max-w-none max-md:bg-sidebar max-md:shadow-2xl max-md:transition-[transform,opacity] max-md:duration-200";

export function narrowSidebarDrawerStateClassName(visible: boolean): string {
  return visible ? "max-md:translate-x-0" : "max-md:-translate-x-full";
}

export function NarrowSidebarDrawerControls({
  enabled,
  open,
  closeKey,
  onToggle,
}: {
  /** 仅窄屏 Web（无活动栏）启用。 */
  enabled: boolean;
  open: boolean;
  /** 页面或会话变化时的标识；变化即收起抽屉。 */
  closeKey: string;
  onToggle(): void;
}) {
  const { locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  const previousKey = useRef(closeKey);
  const latest = useRef({ open, onToggle });
  latest.current = { open, onToggle };
  useEffect(() => {
    if (previousKey.current === closeKey) return;
    previousKey.current = closeKey;
    if (enabled && latest.current.open) latest.current.onToggle();
  }, [closeKey, enabled]);
  if (!enabled) return null;
  if (open)
    return (
      <div
        aria-hidden="true"
        data-testid="narrow-sidebar-backdrop"
        className="absolute inset-0 z-30 bg-black/25 backdrop-blur-[1px] md:hidden"
        onClick={onToggle}
      />
    );
  const label = zh ? "打开侧栏" : "Open sidebar";
  return (
    <button
      type="button"
      data-testid="narrow-sidebar-toggle"
      aria-label={label}
      title={label}
      onClick={onToggle}
      className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-30 flex size-10 items-center justify-center rounded-full bg-background text-foreground shadow-lg ring-1 ring-border md:hidden"
    >
      <PanelLeft className="size-4" aria-hidden="true" />
    </button>
  );
}
