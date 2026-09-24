import { Loader2, Sparkles } from "lucide-react";
import type { CreateTaskRequest } from "@/app-shell/types.js";
import { Button } from "@/components/ui/button.js";
import { usePluginCreator } from "@/hooks/usePluginCreator.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";

export function PluginAddMenu({
  onCreateTask,
  testId,
}: {
  onCreateTask?: (request?: CreateTaskRequest) => void;
  testId: string;
}) {
  const { intl } = useKnorviaIntl();
  const creator = usePluginCreator(onCreateTask);
  return (
    <Button
      type="button"
      variant="default"
      data-testid={testId}
      disabled={creator.busy || !creator.available}
      onClick={() => void creator.create()}
    >
      {creator.busy ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Sparkles className="size-3.5" aria-hidden="true" />
      )}
      {intl.formatMessage({ id: "pluginCreator.create" })}
    </Button>
  );
}
