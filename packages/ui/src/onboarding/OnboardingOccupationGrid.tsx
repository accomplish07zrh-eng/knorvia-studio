import { Check } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  occupations,
  getOccupationIcon,
  type OccupationValue,
} from "@/onboarding/occupationOptions.js";

interface OccupationGridProps {
  occupation: string | null;
  saving: boolean;
  onSelect: (value: OccupationValue) => void;
  label: string;
  /** 职业显示文案（i18n 已格式化）。 */
  formatLabel: (value: OccupationValue) => string;
}

/** 引导第一步的职业选择网格；从 OccupationOnboarding 抽出以控制文件行数。 */
export function OnboardingOccupationGrid({
  occupation,
  saving,
  onSelect,
  label,
  formatLabel,
}: OccupationGridProps) {
  return (
    <div
      className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2 [@media(max-height:740px)]:mt-5"
      role="group"
      aria-label={label}
    >
      {occupations.map((value, index) => {
        const Icon = getOccupationIcon(index);
        const selected = occupation === value;
        return (
          <button
            type="button"
            key={value}
            aria-pressed={selected}
            disabled={saving}
            onClick={() => onSelect(value)}
            className={cn(
              "group flex min-h-11 items-center gap-3 rounded-full border px-3.5 py-2 text-left text-ui-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused disabled:opacity-60",
              // 选中项用前景色描边：白底上纸片式选中不可辨，未选中保持细线描边。
              selected
                ? "border-foreground bg-card font-medium text-foreground"
                : "border-border text-foreground-subtle hover:bg-surface-hover hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{formatLabel(value)}</span>
            <span
              aria-hidden="true"
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border",
                selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-transparent",
              )}
            >
              {selected ? <Check className="size-3" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
