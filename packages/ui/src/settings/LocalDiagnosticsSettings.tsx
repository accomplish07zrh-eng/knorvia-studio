import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";
import { useStudioKernelCatalog } from "@/studio/agents/useStudioKernelCatalog.js";
import { studioKernelOption } from "@/studio/types.js";
import type { LocalDiagnosticPreview, LocalDiagnosticRequest } from "@knorvia/shared";

export function LocalDiagnosticsSettings() {
  const platform = usePlatform();
  const { intl } = useKnorviaIntl();
  const t = (id: string) => intl.formatMessage({ id: `settings.localDiagnostics.${id}` });
  const { statuses, inspected, checking, error: inspectionError } = useStudioKernelCatalog();
  const [preview, setPreview] = useState<LocalDiagnosticPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [exportedPath, setExportedPath] = useState("");

  const prepare = async () => {
    if (!platform.previewLocalDiagnostics || busy) return;
    setBusy(true);
    setError(false);
    setExportedPath("");
    try {
      const request: LocalDiagnosticRequest = {
        inspection: checking || !inspected ? "checking" : inspectionError ? "failed" : "complete",
        kernels: statuses
          .filter((status) => !status.id.startsWith("ssh:"))
          .slice(0, 64)
          .map((status) => ({
            id: status.id,
            name: studioKernelOption(status.id, statuses).name.slice(0, 120),
            installed: status.installed,
            ...(status.version ? { version: status.version.slice(0, 80) } : {}),
            origin: status.origin,
          })),
      };
      setPreview(await platform.previewLocalDiagnostics(request));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const exportPreview = async () => {
    if (!preview || !platform.exportLocalDiagnostics || busy) return;
    setBusy(true);
    setError(false);
    try {
      const result = await platform.exportLocalDiagnostics(preview.id);
      if (!result.success || !result.path) throw new Error("diagnostic export failed");
      setExportedPath(result.path);
      setPreview(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsGroupCard>
      <SettingsRow
        label={t("title")}
        description={t("description")}
        control={
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={busy || !platform.previewLocalDiagnostics}
            onClick={() => void prepare()}
            data-testid="local-diagnostics-preview"
          >
            {busy && !preview ? t("preparing") : t("preview")}
          </Button>
        }
      />
      {error ? <p role="alert" className="px-4 pb-3 text-ui-sm text-destructive">{t("error")}</p> : null}
      {exportedPath ? (
        <p className="break-all px-4 pb-3 text-ui-sm text-foreground-subtle" role="status">
          {t("saved")}: {exportedPath}
        </p>
      ) : null}
      {preview ? (
        <div className="space-y-3 border-t border-border px-4 py-4" data-testid="local-diagnostics-files">
          <p className="text-ui-sm text-foreground-subtle">
            {t("frozenAt")}: {new Date(preview.createdAt).toLocaleString()} · {preview.files.length} {t("files")}
          </p>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {preview.files.map((file) => (
              <details key={file.path} className="rounded-xl border border-border px-3 py-2">
                <summary className="cursor-pointer text-ui-sm font-medium">
                  {file.path} · {file.bytes} B
                </summary>
                <p className="mt-2 break-all text-ui-xs text-foreground-subtle">SHA-256: {file.sha256}</p>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-ui-xs text-foreground-subtle">
                  {file.snippet}
                </pre>
                {file.snippetTruncated ? <p className="text-ui-xs text-foreground-subtle">{t("truncated")}</p> : null}
              </details>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="button" disabled={busy} onClick={() => void exportPreview()} data-testid="local-diagnostics-export">
              {t("export")}
            </Button>
          </div>
        </div>
      ) : null}
    </SettingsGroupCard>
  );
}
