import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox.js";
import { cn } from "@/components/lib/utils.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import {
  studioKernelOption,
  studioSelectableKernelOptions,
  type StudioKernelId,
} from "../types.js";
import { useStudioKernelCatalog } from "../agents/useStudioKernelCatalog.js";
import { StudioKernelIcon } from "../agents/StudioKernelIcon.js";

export function GroupKernelAvatar({ kernelId }: { kernelId: StudioKernelId }) {
  const { statuses } = useStudioKernelCatalog();
  const name = studioKernelOption(kernelId, statuses).name;
  return (
    <span
      aria-hidden="true"
      title={name}
      className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-ui-xs font-medium text-foreground-subtle"
    >
      <StudioKernelIcon kernelId={kernelId} className="size-4" />
    </span>
  );
}

export function GroupMembersField({
  value,
  onChange,
}: {
  value: StudioKernelId[];
  onChange: (members: StudioKernelId[]) => void;
}) {
  const { intl } = useKnorviaIntl();
  const id = useId();
  const { statuses, inspected } = useStudioKernelCatalog();
  const kernels = studioSelectableKernelOptions(statuses, value);
  return (
    <fieldset className="space-y-2">
      <legend className="text-ui-base font-medium">
        {intl.formatMessage({ id: "studio.groups.members" })}
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {kernels.map((kernel) => {
          const checked = value.includes(kernel.id);
          const available =
            kernel.builtin || statuses.find((item) => item.id === kernel.id)?.installed;
          return (
            <label
              key={kernel.id}
              htmlFor={`${id}-${kernel.id}`}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-ui-base hover:bg-hover",
                checked && "bg-selected",
              )}
            >
              <Checkbox
                id={`${id}-${kernel.id}`}
                checked={checked}
                disabled={(checked && value.length === 1) || (!checked && !available)}
                onCheckedChange={(next) =>
                  onChange(
                    next === true
                      ? [...value, kernel.id]
                      : value.filter((member) => member !== kernel.id),
                  )
                }
              />
              <span className="min-w-0 flex-1 truncate">{kernel.name}</span>
              <span className="shrink-0 text-ui-xs text-foreground-subtle">
                {intl.formatMessage({
                  id:
                    inspected && !available
                      ? "studio.groups.unavailable"
                      : kernel.builtin
                        ? "studio.groups.builtin"
                        : "studio.groups.external",
                })}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-ui-sm text-foreground-subtle">
        {intl.formatMessage({ id: "studio.groups.memberHint" })}
      </p>
    </fieldset>
  );
}
