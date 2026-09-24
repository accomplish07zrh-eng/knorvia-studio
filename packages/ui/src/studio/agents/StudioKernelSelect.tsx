import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { studioSelectableKernelOptions, type StudioKernelId } from "../types.js";
import { StudioKernelIcon } from "./StudioKernelIcon.js";
import { useStudioKernelCatalog } from "./useStudioKernelCatalog.js";

export function StudioKernelSelect({
  value,
  onValueChange,
  onManage,
}: {
  value: StudioKernelId;
  onValueChange: (id: StudioKernelId) => void;
  onManage: () => void;
}) {
  const { intl } = useKnorviaIntl();
  const { statuses, inspected } = useStudioKernelCatalog();
  const kernels = studioSelectableKernelOptions(statuses, [value]);
  return (
    <div className="flex min-w-0 items-center gap-1.5" data-testid="studio-kernel-select">
      <Select value={value} onValueChange={(next) => onValueChange(next as StudioKernelId)}>
        <SelectTrigger
          size="lg"
          className="min-w-0 flex-1"
          aria-label={intl.formatMessage({ id: "studio.agents.chooseKernel" })}
          title={intl.formatMessage({ id: "studio.agents.switchHint" })}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {kernels.map((kernel) => (
            <SelectItem key={kernel.id} value={kernel.id} className="pr-8">
              <StudioKernelIcon kernelId={kernel.id} className="size-4" />
              <span className="min-w-0 flex-1 truncate">{kernel.name}</span>
              {inspected &&
              !kernel.builtin &&
              statuses.find((item) => item.id === kernel.id)?.installed !== true ? (
                <span className="text-ui-xs text-foreground-subtle">
                  {intl.formatMessage({ id: "studio.agents.notInstalled" })}
                </span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        onClick={onManage}
        aria-label={intl.formatMessage({ id: "studio.agents.manage" })}
        title={intl.formatMessage({ id: "studio.agents.manage" })}
      >
        <Settings2 />
      </Button>
    </div>
  );
}
