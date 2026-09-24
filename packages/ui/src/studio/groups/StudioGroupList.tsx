import { MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useStudioGroups } from "./useStudioGroups.js";

export function StudioGroupList({
  selectedGroupId,
  onSelectGroup,
  onCreateGroup,
}: {
  selectedGroupId: string | null;
  onSelectGroup: (id: string) => void;
  onCreateGroup: () => void;
}) {
  const { intl } = useKnorviaIntl();
  const { groups } = useStudioGroups();
  const t = (id: string) => intl.formatMessage({ id: `studio.groups.${id}` });
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 px-2 pb-3">
      <Button
        type="button"
        variant="ghost"
        className="h-8 justify-start gap-2 text-foreground-subtle"
        onClick={onCreateGroup}
      >
        <Plus className="size-4" />
        {t("create")}
      </Button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="px-2 py-4 text-ui-sm text-foreground-subtlest">{t("emptyList")}</p>
        ) : (
          <ul className="space-y-0.5" aria-label={t("title")}>
            {[...groups]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    aria-current={group.id === selectedGroupId ? "page" : undefined}
                    title={group.name}
                    onClick={() => onSelectGroup(group.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-ui-base text-foreground hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-input-border-focused",
                      group.id === selectedGroupId && "bg-selected",
                    )}
                  >
                    <MessageCircle className="size-4 shrink-0 text-foreground-subtle" />
                    <span className="min-w-0 flex-1 truncate">{group.name}</span>
                    <span
                      className="text-ui-xs text-foreground-subtlest"
                      aria-label={intl.formatMessage(
                        { id: "studio.groups.memberCount" },
                        { count: group.members.length },
                      )}
                    >
                      {group.members.length}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
