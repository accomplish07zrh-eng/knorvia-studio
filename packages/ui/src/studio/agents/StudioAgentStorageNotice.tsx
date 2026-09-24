import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useStudioAgentStore } from "@/store/studioAgentStore.js";
import { STUDIO_DRAFT_TEXT_LIMIT } from "./agentDrafts.js";

export function StudioAgentStorageNotice() {
  const { intl } = useKnorviaIntl();
  const confirm = useConfirmDialog();
  const issue = useStudioAgentStore((state) => state.storageIssue);
  const tooLong = useStudioAgentStore((state) =>
    Object.values(state.drafts).some((draft) => draft.text.length > STUDIO_DRAFT_TEXT_LIMIT),
  );
  const retry = useStudioAgentStore((state) => state.retrySave);
  const reset = useStudioAgentStore((state) => state.resetLocalData);
  if (!issue && !tooLong) return null;
  const handleReset = async () => {
    if (
      await confirm({
        title: intl.formatMessage({ id: "studio.agents.resetStorageTitle" }),
        description: intl.formatMessage({ id: "studio.agents.resetStorageDescription" }),
        confirmLabel: intl.formatMessage({ id: "studio.agents.resetStorage" }),
        cancelLabel: intl.formatMessage({ id: "studio.agents.cancel" }),
        confirmVariant: "destructive",
      })
    )
      reset();
  };
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-2 rounded-xl border border-border bg-surface p-3 text-ui-sm text-foreground-subtle"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 basis-48 leading-5">
        {tooLong
          ? intl.formatMessage({ id: "studio.agents.storage.too-long" })
          : intl.formatMessage({ id: `studio.agents.storage.${issue}` })}
      </p>
      {issue === "write-failed" ? (
        <Button type="button" size="sm" variant="outline" onClick={retry}>
          {intl.formatMessage({ id: "studio.agents.retry" })}
        </Button>
      ) : issue ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void handleReset();
          }}
        >
          {intl.formatMessage({ id: "studio.agents.resetStorage" })}
        </Button>
      ) : null}
    </div>
  );
}
