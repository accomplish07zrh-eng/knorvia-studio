import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { MessageSquare, Users } from "lucide-react";

export function StudioConversationSwitch({
  value,
  onValueChange,
}: {
  value: "single" | "groups";
  onValueChange: (value: "single" | "groups") => void;
}) {
  const { intl } = useKnorviaIntl();
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (next === "single" || next === "groups") onValueChange(next);
      }}
    >
      <TabsList
        aria-label={intl.formatMessage({ id: "studio.chatMode" })}
        className="h-8 w-full gap-1 bg-transparent p-0"
      >
        <TabsTrigger
          value="single"
          className="h-8 flex-1 gap-1.5 text-ui-sm hover:bg-surface-hover"
        >
          <MessageSquare className="size-3.5" />
          {intl.formatMessage({ id: "studio.single" })}
        </TabsTrigger>
        <TabsTrigger
          value="groups"
          className="h-8 flex-1 gap-1.5 text-ui-sm hover:bg-surface-hover"
        >
          <Users className="size-3.5" />
          {intl.formatMessage({ id: "studio.groups" })}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
