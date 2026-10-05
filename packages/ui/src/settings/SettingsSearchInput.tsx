import { Search, X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";

export function SettingsSearchInput({
  className,
  clearLabel = "Clear search",
  clearTestId,
  containerClassName,
  onClear,
  ...props
}: ComponentProps<typeof Input> & {
  clearLabel?: string;
  clearTestId?: string;
  containerClassName?: string;
  onClear?: () => void;
}) {
  const canClear = Boolean(onClear && props.value && !props.disabled);

  return (
    <div className={cn("relative", containerClassName)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle"
        aria-hidden="true"
      />
      <Input
        {...props}
        type="search"
        size="lg"
        className={cn(
          // 主题对 [data-slot=input] 的 padding-inline 优先级高于普通 pl-9，图标会压住占位文字；
          // 这里用 important 内边距保证图标与文字分开（与设置导航搜索同一修复）。
          "h-9 rounded-full border-transparent bg-surface !pl-9 hover:border-input-border-hover focus-visible:bg-input-focused [&::-webkit-search-cancel-button]:appearance-none",
          canClear && "!pr-9",
          className,
        )}
      />
      {canClear ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full text-foreground-subtle"
          aria-label={clearLabel}
          data-testid={clearTestId}
          onClick={onClear}
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
