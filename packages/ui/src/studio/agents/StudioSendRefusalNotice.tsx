import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import type { StudioAuthHint } from "./kernelProbeView.js";
import { studioSendRefusalValues, type StudioSendRefusal } from "./kernelSendGate.js";

/**
 * 发送前校验被拒时的可解释提示：给出拒绝原因、按需给出只读登录提示，
 * 以及唯一的出口——重新探测。这里不会改换模型或放宽权限。
 */
export function StudioSendRefusalNotice({
  refusal,
  authHint,
  cliName,
  canReprobe,
  onReprobe,
}: {
  refusal: StudioSendRefusal;
  authHint?: StudioAuthHint;
  cliName: string;
  canReprobe: boolean;
  onReprobe: () => void;
}) {
  const { intl } = useKnorviaIntl();
  return (
    <div className="mt-2 space-y-1 px-2" data-testid="studio-send-refusal">
      <p role="alert" className="break-words text-ui-sm text-destructive">
        {intl.formatMessage(
          { id: refusal.messageId },
          studioSendRefusalValues(refusal, (id) => intl.formatMessage({ id })),
        )}
      </p>
      {authHint ? (
        <div className="space-y-0.5 text-ui-xs leading-5 text-foreground-subtle">
          <p className="font-medium">{intl.formatMessage({ id: authHint.titleKey })}</p>
          <p>{intl.formatMessage({ id: authHint.bodyKey }, { name: cliName })}</p>
        </div>
      ) : null}
      {refusal.retryable ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canReprobe}
          onClick={onReprobe}
        >
          {intl.formatMessage({ id: "studio.agents.reprobe" })}
        </Button>
      ) : null}
    </div>
  );
}
