import { useState } from "react";
import { Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import type { IPluginManagementService } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Input } from "@/components/ui/input.js";
import { toast } from "@/components/ui/toast.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { usePluginManagementStore } from "@/store/pluginManagementStore.js";

/** Low-frequency source management stays inside Settings → Plugins, not a second marketplace page. */
export function PluginSourcesDialog({
  open,
  onOpenChange,
  pluginService,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pluginService: IPluginManagementService;
}) {
  const { intl, locale } = useKnorviaIntl();
  const [source, setSource] = useState("");
  const [confirmRemovalId, setConfirmRemovalId] = useState<string | null>(null);
  const marketplaces = usePluginManagementStore((state) => state.marketplaces);
  const availablePlugins = usePluginManagementStore((state) => state.availablePlugins);
  const operationId = usePluginManagementStore((state) => state.operationId);
  const error = usePluginManagementStore((state) => state.error);
  const addMarketplace = usePluginManagementStore((state) => state.addMarketplace);
  const updateMarketplace = usePluginManagementStore((state) => state.updateMarketplace);
  const removeMarketplace = usePluginManagementStore((state) => state.removeMarketplace);
  const installPlugin = usePluginManagementStore((state) => state.installPlugin);
  const personalSources = marketplaces.filter((marketplace) => !marketplace.isOfficial);
  const personalSourceIds = new Set(personalSources.map((marketplace) => marketplace.id));
  const installable = availablePlugins.filter(
    (plugin) => !plugin.installed && personalSourceIds.has(plugin.marketplace),
  );
  const busy = operationId !== null;

  const add = async () => {
    const value = source.trim();
    if (!value || busy) return;
    if (await addMarketplace(value, pluginService)) setSource("");
  };
  const refresh = async (id: string) => {
    if (!(await updateMarketplace(id, pluginService))) return;
    toast(intl.formatMessage({ id: "settings.plugins.sources.refreshed" }));
  };
  const remove = async (id: string) => {
    if (confirmRemovalId !== id) {
      setConfirmRemovalId(id);
      return;
    }
    await removeMarketplace(id, pluginService);
    if (!usePluginManagementStore.getState().error) setConfirmRemovalId(null);
  };
  const install = async (name: string, marketplace: string) => {
    await installPlugin(name, marketplace, pluginService, "user");
    if (!usePluginManagementStore.getState().error) {
      toast(intl.formatMessage({ id: "settings.plugins.sources.installed" }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[80vh] max-w-xl overflow-y-auto"
        data-testid="plugin-sources-dialog"
      >
        <DialogHeader>
          <DialogTitle>{intl.formatMessage({ id: "settings.plugins.sources.title" })}</DialogTitle>
          <DialogDescription>
            {intl.formatMessage({ id: "settings.plugins.sources.description" })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Input
            data-testid="plugin-source-input"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder={intl.formatMessage({ id: "settings.plugins.sources.placeholder" })}
            aria-label={intl.formatMessage({ id: "settings.plugins.sources.placeholder" })}
          />
          <Button type="submit" disabled={!source.trim() || busy}>
            {intl.formatMessage({ id: "settings.plugins.sources.add" })}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-ui-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="space-y-2" data-testid="plugin-source-list">
          {personalSources.length === 0 ? (
            <p className="text-ui-sm text-foreground-subtle">
              {intl.formatMessage({ id: "settings.plugins.sources.empty" })}
            </p>
          ) : (
            personalSources.map((marketplace) => (
              <div
                key={marketplace.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui-base font-medium">{marketplace.name}</p>
                  <p className="text-ui-xs text-foreground-subtle">
                    {intl.formatMessage(
                      { id: "settings.plugins.store.sources.pluginCount" },
                      { count: marketplace.pluginCount },
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={intl.formatMessage({ id: "settings.plugins.store.sources.update" })}
                  onClick={() => void refresh(marketplace.id)}
                >
                  <RefreshCw className="size-4" />
                </Button>
                <Button
                  type="button"
                  size={confirmRemovalId === marketplace.id ? "sm" : "icon-sm"}
                  variant={confirmRemovalId === marketplace.id ? "destructive" : "ghost"}
                  disabled={busy}
                  aria-label={intl.formatMessage({ id: "settings.plugins.store.sources.remove" })}
                  onClick={() => void remove(marketplace.id)}
                >
                  {confirmRemovalId === marketplace.id ? (
                    intl.formatMessage({ id: "settings.plugins.sources.confirmRemove" })
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
        {installable.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-ui-base font-medium">
              {intl.formatMessage({ id: "settings.plugins.sources.available" })}
            </p>
            {installable.map((plugin) => (
              <div key={plugin.id} className="flex items-center gap-2 px-1 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui-base">
                    {plugin.listing?.displayNameI18n?.[locale] ??
                      plugin.listing?.displayName ??
                      plugin.name}
                  </p>
                  <p className="truncate text-ui-xs text-foreground-subtle">
                    {plugin.marketplace} · {plugin.version ?? "—"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void install(plugin.name, plugin.marketplace)}
                >
                  {operationId === `plugin:install:${plugin.name}@${plugin.marketplace}` ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  {intl.formatMessage({ id: "settings.plugins.store.install" })}
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
