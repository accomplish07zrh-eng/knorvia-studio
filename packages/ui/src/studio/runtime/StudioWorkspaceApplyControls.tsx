// SPDX-License-Identifier: Apache-2.0
import type { IStudioRuntimeService } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { studioReviewApplicablePaths } from "./studioWorkspaceDiff.js";
import type { StudioHistoryReview, StudioRunHistoryActions } from "./studioRunHistoryActions.js";
export function StudioWorkspaceApplyControls({
  service,
  review,
  actions,
}: {
  service: IStudioRuntimeService;
  review: StudioHistoryReview;
  actions: StudioRunHistoryActions;
}) {
  const { intl } = useKnorviaIntl();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={review.loading || Boolean(review.applying)}
        onClick={() =>
          actions.setReviewSelection(studioReviewApplicablePaths(review.changes ?? []))
        }
      >
        {intl.formatMessage({ id: "studio.delivery.selectAll" })}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!review.selected.length || Boolean(review.applying)}
        onClick={() => actions.setReviewSelection([])}
      >
        {intl.formatMessage({ id: "studio.delivery.clearSelection" })}
      </Button>
      <span className="text-ui-sm text-foreground-subtle">
        {intl.formatMessage(
          { id: "studio.delivery.selectedCount" },
          { count: review.selected.length },
        )}
      </span>
      <Button
        size="sm"
        disabled={!review.selected.length || review.loading || Boolean(review.applying)}
        onClick={() =>
          void actions.applyReviewSelection(
            async (paths) => {
              await service.applyWorkspaceChanges({
                runId: review.run.id,
                stepId: review.stepId,
                paths,
              });
            },
            () =>
              service.workspaceChanges({
                runId: review.run.id,
                stepId: review.stepId,
              }),
          )
        }
      >
        {intl.formatMessage(
          { id: "studio.delivery.batchApply" },
          { count: review.selected.length },
        )}
      </Button>
    </div>
  );
}
