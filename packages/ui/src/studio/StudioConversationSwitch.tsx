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
        className="h-8 w-full rounded-lg bg-surface p-0.5"
      >
        <TabsTrigger value="single" className="h-7 flex-1 gap-1.5 rounded-md text-ui-sm">
          <MessageSquare className="size-3.5" />
          {intl.formatMessage({ id: "studio.single" })}
        </TabsTrigger>
        <TabsTrigger value="groups" className="h-7 flex-1 gap-1.5 rounded-md text-ui-sm">
          <Users className="size-3.5" />
          {intl.formatMessage({ id: "studio.groups" })}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
