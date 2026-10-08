import { ChevronDown, Hand } from "lucide-react";
import type { StudioPermission } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
export function StudioChatPermissionControl({
  permission,
  onClick,
}: {
  permission: StudioPermission;
  onClick: () => void;
}) {
  const { intl } = useKnorviaIntl();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      aria-label={intl.formatMessage({ id: `studio.agents.permission.${permission}` })}
      title={intl.formatMessage({ id: `studio.agents.permission.${permission}` })}
      className="size-7 gap-1 rounded-lg p-0 text-ui-base @xl/composer:w-auto @xl/composer:px-2"
    >
      <Hand className="size-4" />
      <span className="hidden @xl/composer:inline">
        {intl.formatMessage({ id: `studio.agents.permission.${permission}` })}
      </span>
      <ChevronDown className="hidden size-3.5 @xl/composer:block" />
    </Button>
  );
}
