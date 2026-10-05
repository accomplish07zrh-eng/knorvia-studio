import type { ReactNode } from "react";
import { TID_MODEL_PROVIDER_ADD_PROVIDER_BUTTON } from "@knorvia/shared";
import type { ModelProviderNavGroup } from "@/settings/model-provider-section/constants.js";
import { ModelProviderSectionNavigation } from "@/settings/model-provider-section/Navigation.js";
import { ProviderDetailFeedbackBoundary } from "@/settings/model-provider-section/ProviderDetailFeedback.js";
import { SettingsResourceHeaderActions } from "@/settings/SettingsResourceHeaderActions.js";
import { SettingsGroupHeading } from "@/settings/SettingsPageParts.js";

interface ModelProviderSectionLayoutProps {
  /** 分组标题（「供应商」），与其他资源页的分组标题同一层级。 */
  heading: string;
  description: string;
  refreshLabel: string;
  loadingLabel: string;
  presetLoading: boolean;
  customLoading: boolean;
  onRefresh: () => void;
  addProviderLabel: string;
  onAddProvider: () => void;
  navigationGroups: ModelProviderNavGroup[];
  selectedNodeKey: string | null;
  onSelectNavItem: (item: ModelProviderNavGroup["items"][number]) => void;
  onReorderProviderIds?: (providerIds: string[]) => Promise<void>;
  reorderableProviderIds?: ReadonlySet<string>;
  children: ReactNode;
}

function shouldShowModelProviderRefreshLoading(params: {
  presetLoading: boolean;
  customLoading: boolean;
}): boolean {
  return params.presetLoading || params.customLoading;
}

export function ModelProviderSectionLayout({
  heading,
  description,
  refreshLabel,
  loadingLabel,
  presetLoading,
  customLoading,
  onRefresh,
  addProviderLabel,
  onAddProvider,
  navigationGroups,
  selectedNodeKey,
  onSelectNavItem,
  onReorderProviderIds,
  reorderableProviderIds,
  children,
}: ModelProviderSectionLayoutProps) {
  const refreshButtonLoading = shouldShowModelProviderRefreshLoading({
    presetLoading,
    customLoading,
  });
  const showNavigation =
    refreshButtonLoading || navigationGroups.some((group) => group.items.length > 0);

  return (
    <div className="space-y-3">
      <SettingsGroupHeading
        title={heading}
        description={description}
        actions={
          <SettingsResourceHeaderActions
            onRefresh={onRefresh}
            onNew={onAddProvider}
            refreshing={refreshButtonLoading}
            refreshLabel={refreshButtonLoading ? loadingLabel : refreshLabel}
            newLabel={addProviderLabel}
            newTestId={TID_MODEL_PROVIDER_ADD_PROVIDER_BUTTON}
          />
        }
      />

      <div className="overflow-clip rounded-xl border border-border bg-card">
        <div
          className={`grid min-h-[36rem] gap-0 ${showNavigation ? "grid-cols-[56px_minmax(0,1fr)] md:grid-cols-[224px_minmax(0,1fr)]" : "grid-cols-1"}`}
          data-model-provider-split-panel="true"
        >
          {showNavigation && (
            <div
              className="min-w-0 border-r border-border"
              data-model-provider-navigation-scroll="true"
            >
              <ModelProviderSectionNavigation
                navigationGroups={navigationGroups}
                selectedNodeKey={selectedNodeKey}
                presetLoading={presetLoading}
                customLoading={customLoading}
                onSelectNavItem={onSelectNavItem}
                onReorderProviderIds={onReorderProviderIds}
                reorderableProviderIds={reorderableProviderIds}
              />
            </div>
          )}
          <div
            className="relative min-w-0 p-4 pb-20 sm:p-6 sm:pb-24"
            data-model-provider-detail-scroll="true"
          >
            <ProviderDetailFeedbackBoundary key={selectedNodeKey ?? "unselected-provider"}>
              {children}
            </ProviderDetailFeedbackBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
