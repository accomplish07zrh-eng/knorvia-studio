import { Ellipsis, Settings2 } from "lucide-react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { studioSelectableKernelOptions, type StudioKernelId } from "../types.js";
import { StudioKernelIcon } from "./StudioKernelIcon.js";
import { kernelRailOptions } from "./kernelRailOptions.js";
import { studioProbeBadgeKey } from "./kernelProbeView.js";
import { useStudioKernelCatalog } from "./useStudioKernelCatalog.js";

export function StudioKernelRail({
  value,
  active,
  onSelect,
  onManage,
}: {
  value: StudioKernelId;
  active: boolean;
  onSelect: (id: StudioKernelId) => void;
  onManage: () => void;
}) {
  const { intl } = useKnorviaIntl();
  const { statuses, inspected } = useStudioKernelCatalog();
  const options = studioSelectableKernelOptions(statuses, [value]);
  const label = intl.formatMessage({ id: "studio.agents.chooseKernel" });
  const statusLabel = (id: StudioKernelId) => {
    const status = statuses.find((item) => item.id === id);
    return id !== "knorvia" && !status?.installed
      ? intl.formatMessage({ id: studioProbeBadgeKey({ status, inspected, builtin: false }) })
      : "";
  };

  return (
    <div
      role="group"
      aria-label={label}
      data-testid="studio-kernel-rail"
      className="flex flex-col items-center gap-1"
    >
      <span className="mb-1 text-ui-xs text-foreground-subtlest" aria-hidden="true">
        {intl.formatMessage({ id: "studio.rail.kernels" })}
      </span>
      {kernelRailOptions(options, value).map((kernel) => {
        const unavailable = statusLabel(kernel.id);
        return (
          <ControlHintTooltip
            key={kernel.id}
            title={[kernel.name, unavailable].filter(Boolean).join(" · ")}
            side="right"
          >
            <Button
              variant="ghost"
              size="icon-lg"
              className={cn("size-9", active && value === kernel.id && "bg-selected")}
              aria-label={kernel.name}
              aria-pressed={active && value === kernel.id}
              data-testid={`studio-rail-kernel-${kernel.id}`}
              onClick={() => onSelect(kernel.id)}
            >
              <StudioKernelIcon kernelId={kernel.id} className="size-5" />
            </Button>
          </ControlHintTooltip>
        );
      })}
      <DropdownMenu>
        <ControlHintTooltip title={label} side="right">
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-9 text-foreground-subtle"
              aria-label={label}
              data-testid="studio-rail-kernels-more"
            >
              <Ellipsis className="size-5" />
            </Button>
          </DropdownMenuTrigger>
        </ControlHintTooltip>
        <DropdownMenuContent side="right" align="start" className="w-64">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(id) => onSelect(id as StudioKernelId)}
            className="max-h-64 overflow-y-auto"
          >
            {options.map((kernel) => (
              <DropdownMenuRadioItem key={kernel.id} value={kernel.id}>
                <StudioKernelIcon kernelId={kernel.id} className="size-4" />
                <span className="min-w-0 flex-1 truncate">{kernel.name}</span>
                {statusLabel(kernel.id) ? (
                  <span className="text-ui-xs text-foreground-subtle">
                    {statusLabel(kernel.id)}
                  </span>
                ) : null}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onManage}>
            <Settings2 className="size-4" />
            {intl.formatMessage({ id: "studio.agents.manage" })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
