import { Button } from "@/components/ui/button.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useModelProviders } from "@/hooks/useModelProviders.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { sortModelProvidersForDisplay } from "@/lib/modelProviderOrdering.js";
import { getProviderFormLabel } from "@/lib/providerSettingsFormTypes.js";
import {
  addPendingSettingsSectionListener,
  consumePendingSettingsModelProviderTarget,
  type SettingsModelProviderTarget,
} from "@/lib/settingsNavigation.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ModelProviderNavGroup } from "./model-provider-section/constants.js";
import { InlineEditableProviderCard } from "./model-provider-section/InlineEditableProviderCard.js";
import { confirmAndDeleteModelProvider } from "./model-provider-section/modelProviderActions.js";
import { ProviderTemplatePicker } from "./model-provider-section/ProviderTemplatePicker.js";
import { ModelProviderSectionLayout } from "./model-provider-section/SectionLayout.js";

export {
  fuzzyMatch,
  handleEndpointSuggestionPopoverOpenAutoFocus,
  resolveEndpointSuggestionOpenRequest,
} from "./model-provider-section/utils.js";

/** 仅收拢账号业务；布局和 API Key / 模型编辑继续使用上游原组件。 */
export function ModelProviderSection({
  workspacePath = "",
  connectivityWorkspacePath,
  connectivityWorkspaceRequired,
  pendingModelProviderTarget,
  onConsumePendingModelProviderTarget,
}: {
  workspacePath?: string;
  connectivityWorkspacePath?: string;
  connectivityWorkspaceRequired?: boolean;
  pendingModelProviderTarget?: SettingsModelProviderTarget;
  onConsumePendingModelProviderTarget?: () => void;
} = {}) {
  const { intl, locale } = useKnorviaIntl();
  const confirmDialog = useConfirmDialog();
  const models = useModelProviders({
    workspacePath,
    connectivityWorkspacePath,
    connectivityWorkspaceRequired,
    connectivityUnavailableMessage: intl.formatMessage({
      id: "settings.modelProvider.testModel.localWorkspaceUnavailable",
    }),
  });
  const [selectedId, setSelectedId] = useState<string | null>(
    () => consumePendingSettingsModelProviderTarget()?.providerId ?? null,
  );
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [creatingProvider, setCreatingProvider] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providers = useMemo(
    () =>
      sortModelProvidersForDisplay(models.modelProviders, models.displayOrder).filter(
        (provider) => provider.config.access?.type !== "zhipu-account",
      ),
    [models.modelProviders, models.displayOrder],
  );
  const selected =
    providers.find((provider) => provider.providerId === selectedId) ?? providers[0] ?? null;
  const groups = useMemo<ModelProviderNavGroup[]>(
    () => [
      {
        id: "custom",
        title: intl.formatMessage({ id: "settings.modelProvider" }),
        items: providers.map((provider) => ({
          key: provider.providerId,
          type: "custom",
          provider,
          label: getProviderFormLabel(provider),
          statusActive: provider.executable,
        })),
      },
    ],
    [intl, providers],
  );
  const selectTarget = useCallback((target?: SettingsModelProviderTarget) => {
    if (!target) return;
    setSelectedId(target.providerId);
    setTemplatePickerOpen(false);
  }, []);
  useEffect(() => {
    if (pendingModelProviderTarget) {
      selectTarget(pendingModelProviderTarget);
      onConsumePendingModelProviderTarget?.();
    }
  }, [pendingModelProviderTarget, onConsumePendingModelProviderTarget, selectTarget]);
  useEffect(
    () =>
      addPendingSettingsSectionListener((section, detail) => {
        if (section === "modelProvider")
          selectTarget(
            detail?.modelProviderId ? { providerId: detail.modelProviderId } : undefined,
          );
      }),
    [selectTarget],
  );
  const create = async (input: { templateId?: string; providerName?: string }) => {
    setCreatingProvider(true);
    setError(null);
    try {
      const created = await models.createPersonalProvider({ ...input, locale });
      setSelectedId(created.providerId);
      setTemplatePickerOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setCreatingProvider(false);
    }
  };
  if (models.loadError)
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-ui-base">
        <p className="text-destructive">{models.loadError.message}</p>
        <Button type="button" variant="outline" onClick={models.reload}>
          {intl.formatMessage({ id: "common.retry" })}
        </Button>
      </div>
    );
  return (
    <ModelProviderSectionLayout
      description={intl.formatMessage({ id: "settings.modelProviderDescription" })}
      refreshLabel={intl.formatMessage({ id: "settings.modelProvider.refresh" })}
      loadingLabel={intl.formatMessage({ id: "common.loading" })}
      presetLoading={models.loading || models.refreshing}
      customLoading={models.loading || models.refreshing}
      onRefresh={() => {
        void models.refresh();
      }}
      addProviderLabel={intl.formatMessage({ id: "settings.modelProvider.addProviderAction" })}
      onAddProvider={() => setTemplatePickerOpen(true)}
      navigationGroups={groups}
      selectedNodeKey={selected?.providerId ?? null}
      onSelectNavItem={(item) => {
        setSelectedId(item.key);
        setTemplatePickerOpen(false);
      }}
      onReorderProviderIds={(providerIds) => models.saveDisplayOrder({ providerIds })}
      reorderableProviderIds={models.reorderableProviderIds}
    >
      {error ? (
        <p role="alert" className="mb-3 text-ui-base text-destructive">
          {error}
        </p>
      ) : null}
      {templatePickerOpen || (!selected && !models.loading) ? (
        <ProviderTemplatePicker
          templates={models.providerTemplates}
          creating={creatingProvider}
          onBack={selected ? () => setTemplatePickerOpen(false) : undefined}
          onCreateFromTemplate={(templateId) => create({ templateId })}
          onCreateCustom={(providerName) => create({ providerName })}
        />
      ) : selected ? (
        <InlineEditableProviderCard
          key={selected.providerId}
          provider={selected}
          onSave={async (provider) => {
            await models.saveProvider(provider);
          }}
          onAddPersonalModel={models.addPersonalModel}
          onSavePersonalModelDraft={models.savePersonalModelDraft}
          onSetPersonalModelEnabled={models.setPersonalModelEnabled}
          onDeletePersonalModel={models.deletePersonalModel}
          onDelete={() =>
            confirmAndDeleteModelProvider({
              provider: selected,
              confirmDialog,
              intl,
              deleteProvider: models.deleteProvider,
            })
          }
          onTestModel={models.testModelConnectivity}
          onReorderModelIds={(ids) => models.reorderProviderModels(selected.providerId, ids)}
          nameEditable={true}
          settingsRevision={models.providerSettingsView?.revision}
        />
      ) : null}
    </ModelProviderSectionLayout>
  );
}
