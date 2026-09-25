import { useState } from "react";
import { Clock3, Settings2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { studioKernelOption, type StudioKernelId } from "@/studio/types.js";
import { useStudioKernelCatalog } from "@/studio/agents/useStudioKernelCatalog.js";

export function StudioFirstRunGuide({
  onChooseProvider,
  onChooseKernel,
  onDefer,
  onDismiss,
}: {
  onChooseProvider: () => void;
  onChooseKernel: (id: StudioKernelId) => void;
  onDefer: () => Promise<void>;
  onDismiss: () => void;
}) {
  const { intl } = useKnorviaIntl();
  const t = (id: string) => intl.formatMessage({ id: `studio.firstRun.${id}` });
  const { statuses, inspected, checking, error: inspectionError } = useStudioKernelCatalog();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const localKernels = statuses.filter(
    (status) => status.installed && status.id !== "knorvia" && !status.id.startsWith("ssh:"),
  );

  const defer = async () => {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      await onDefer();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onDismiss();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[min(720px,calc(100dvh-2rem))] w-full max-w-xl overflow-y-auto p-6"
        data-testid="studio-first-run-guide"
      >
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-1 w-5 -skew-x-25 bg-foreground" />
            <span className="h-1 w-5 -skew-x-25 bg-foreground/60" />
            <span className="h-1 w-5 -skew-x-25 bg-foreground/30" />
          </div>
          <DialogTitle className="text-ui-lg font-semibold">{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full justify-start gap-3 rounded-2xl px-4 py-3 text-left"
            onClick={onChooseProvider}
            data-testid="studio-first-run-provider"
          >
            <Settings2 className="size-5 shrink-0" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{t("provider")}</span>
              <span className="text-ui-sm font-normal text-foreground-subtle">
                {t("providerHint")}
              </span>
            </span>
          </Button>

          <section className="rounded-2xl border border-border px-4 py-3" aria-label={t("cli")}>
            <div className="flex items-start gap-3">
              <Terminal className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t("cli")}</div>
                <p className="mt-0.5 text-ui-sm text-foreground-subtle">{t("cliHint")}</p>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {localKernels.map((status) => (
                <Button
                  key={status.id}
                  type="button"
                  variant="ghost"
                  className="h-9 w-full justify-start rounded-full px-3"
                  onClick={() => onChooseKernel(status.id)}
                  data-testid={`studio-first-run-cli-${status.id}`}
                >
                  {studioKernelOption(status.id, statuses).name}
                </Button>
              ))}
              {localKernels.length === 0 ? (
                <p className="px-1 py-1 text-ui-sm text-foreground-subtle" role="status">
                  {checking || !inspected
                    ? t("checking")
                    : inspectionError
                      ? t("checkFailed")
                      : t("noneFound")}
                </p>
              ) : null}
            </div>
            <p className="mt-2 text-ui-xs text-foreground-subtle">{t("cliCaveat")}</p>
          </section>

          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-start gap-3 rounded-2xl px-4 py-3 text-left"
            disabled={saving}
            onClick={() => void defer()}
            data-testid="studio-first-run-later"
          >
            <Clock3 className="size-5 shrink-0" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{t("later")}</span>
              <span className="text-ui-sm font-normal text-foreground-subtle">
                {t("laterHint")}
              </span>
            </span>
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-ui-sm text-destructive">
            {t("saveFailed")}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss} disabled={saving}>
            {t("close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
