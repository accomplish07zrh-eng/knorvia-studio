import { useMemo, useRef } from "react";
import { Brain, RefreshCw } from "lucide-react";
import type { StudioChatSelection } from "@knorvia/services";
import type { KnorviaConfigOption } from "@knorvia/shared";
import { ModelConfigSelect } from "@/ModelConfigSelect.js";
import { ThoughtLevelCycleControl } from "@/chat-input-toolbar/ThoughtLevelCycleControl.js";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import {
  STUDIO_CLI_DEFAULT_VALUE,
  selectStudioChatModel,
  selectStudioChatReasoning,
  studioEffectiveModel,
  studioModelOptionValue,
  studioReportedDefaultReasoning,
} from "./chatSelections.js";
import type { StudioChatOptionsState } from "./useStudioChatOptions.js";

const neverLocked = () => false;
const composerSelector = '[data-testid="studio-external-composer-input"]';

export function StudioChatModelControls({
  selection,
  options,
  loading,
  disabled,
  onChange,
  onRetry,
}: StudioChatOptionsState & {
  selection: StudioChatSelection;
  disabled?: boolean;
  onChange: (selection: StudioChatSelection) => void;
  onRetry: () => void;
}) {
  const { intl, locale } = useKnorviaIntl();
  const zh = locale.startsWith("zh");
  const thoughtRef = useRef<HTMLSpanElement | null>(null);
  const model = studioEffectiveModel(selection, options);
  const defaultLabel = zh ? "CLI 默认" : "CLI default";
  const modelGroups = useMemo(() => {
    const items = [
      { key: STUDIO_CLI_DEFAULT_VALUE, value: STUDIO_CLI_DEFAULT_VALUE, name: defaultLabel },
      ...(options?.models ?? []).map((item) => ({
        key: studioModelOptionValue(item.id),
        value: studioModelOptionValue(item.id),
        name: item.label,
      })),
    ];
    if (
      selection.model !== undefined &&
      !options?.models.some((item) => item.id === selection.model)
    )
      items.push({
        key: studioModelOptionValue(selection.model),
        value: studioModelOptionValue(selection.model),
        name: selection.model,
      });
    return [{ key: "studio-models", label: zh ? "模型" : "Models", items }];
  }, [defaultLabel, options, selection.model, zh]);
  const thoughtOption: KnorviaConfigOption = {
    id: "studio-reasoning",
    name: zh ? "思考档位" : "Reasoning",
    category: "thought_level",
    type: "select",
    currentValue: selection.reasoningEffort ?? studioReportedDefaultReasoning(model) ?? "",
    options: model?.reasoning.map((item) => ({ value: item.id, name: item.label })),
  };
  const unknownThought = loading
    ? zh
      ? "读取思考档位"
      : "Loading reasoning"
    : model
      ? zh
        ? "不支持思考档位"
        : "No reasoning control"
      : zh
        ? "未提供思考档位"
        : "Reasoning unavailable";
  const triggerLabel =
    selection.model === undefined ? defaultLabel : (model?.label ?? selection.model);
  const commitReasoning = (value: string) =>
    onChange(selectStudioChatReasoning(selection, value, options));
  return (
    <>
      <ModelConfigSelect
        modelGroups={modelGroups}
        normalizedValue={
          selection.model === undefined
            ? STUDIO_CLI_DEFAULT_VALUE
            : studioModelOptionValue(selection.model)
        }
        triggerLabel={triggerLabel}
        tooltipTitle={
          selection.model === undefined && model ? `${defaultLabel}: ${model.label}` : triggerLabel
        }
        showManageModelsAction={false}
        showProviderLevel={false}
        lockReasonMessage=""
        isItemLocked={neverLocked}
        disabled={disabled}
        pending={loading}
        onValueChange={(value) => onChange(selectStudioChatModel(selection, value, options))}
        triggerTestId="studio-chat-model-select"
        focusSelectorOnClose={composerSelector}
        labelVisibilityClassName="hidden @sm/composer:inline-flex"
        indicatorClassName="hidden @sm/composer:block"
        triggerClassName="composer-model-trigger max-w-[var(--composer-model-max-width,16rem)] @max-sm/composer:size-7 @max-sm/composer:justify-center @max-sm/composer:p-0"
        triggerIconClassName="inline-flex @sm/composer:hidden"
        triggerLabelClassName="hidden min-w-0 text-left @sm/composer:block [&>span]:max-w-full [&>span>span]:block [&>span>span]:truncate"
        footerActions={[
          { key: "refresh", label: zh ? "刷新模型列表" : "Refresh models", onSelect: onRetry },
          ...(selection.reasoningEffort !== undefined
            ? [
                {
                  key: "default-reasoning",
                  label: zh ? "使用 CLI 默认思考设置" : "Use CLI default reasoning",
                  onSelect: () =>
                    onChange(selection.model === undefined ? {} : { model: selection.model }),
                },
              ]
            : []),
        ]}
      />
      {thoughtOption.options?.length ? (
        <ThoughtLevelCycleControl
          intl={intl}
          option={thoughtOption}
          triggerRef={thoughtRef}
          disabled={disabled}
          showInvalidCurrentValue
          indicatorClassName="hidden @xl/composer:block"
          restoreFocusSelector={composerSelector}
          triggerClassName="@max-sm/composer:size-7 @max-sm/composer:justify-center @max-sm/composer:p-0"
          onValueChange={commitReasoning}
          onCurrentValueCommit={commitReasoning}
        />
      ) : (
        <span
          className="inline-flex h-7 items-center gap-1 rounded-lg px-1.5 text-ui-base text-foreground-subtle"
          title={
            selection.reasoningEffort
              ? `${unknownThought} · ${zh ? "已保留" : "Retained"}: ${selection.reasoningEffort}`
              : unknownThought
          }
          aria-label={unknownThought}
          data-testid="studio-chat-reasoning-unavailable"
        >
          <Brain className="size-4" />
          <span className="hidden @xl/composer:inline-flex">{unknownThought}</span>
        </span>
      )}
    </>
  );
}

export function StudioChatOptionsNotice({
  options,
  error,
  loading,
  selection,
  onRetry,
}: StudioChatOptionsState & {
  selection: StudioChatSelection;
  onRetry: () => void;
}) {
  const { locale } = useKnorviaIntl();
  const zh = locale.startsWith("zh");
  const selected = studioEffectiveModel(selection, options);
  const missingModel = !loading && options && selection.model !== undefined && !selected;
  const missingReasoning =
    !loading &&
    options &&
    selection.reasoningEffort !== undefined &&
    !selected?.reasoning.some((item) => item.id === selection.reasoningEffort);
  const sharedWarnings = options?.sharedResourceWarnings ?? [];
  if (!error && !missingModel && !missingReasoning && !sharedWarnings.length) return null;
  const notice = error
    ? zh
      ? `无法读取模型列表：${error}`
      : `Could not load models: ${error}`
    : missingModel
      ? zh
        ? `当前模型 ${selection.model} 未在返回列表中，已保留选择。`
        : `The current model ${selection.model} was not listed; your selection is retained.`
      : zh
        ? `该模型未报告思考档位 ${selection.reasoningEffort}，已保留选择。可重新选择或使用 CLI 默认思考设置。`
        : `Reasoning level ${selection.reasoningEffort} was not reported for this model; your selection is retained. Choose a supported level or CLI default reasoning.`;
  return (
    <div role="status" className="mt-2 space-y-1 px-2 text-ui-sm text-foreground-subtle">
      {(error || missingModel || missingReasoning) && (
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 break-words">{notice}</p>
          {error && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={onRetry}
              className="h-auto shrink-0 gap-1 px-1 py-0 text-ui-sm"
            >
              <RefreshCw className="size-3" />
              {zh ? "重试" : "Retry"}
            </Button>
          )}
        </div>
      )}
      {sharedWarnings.length ? (
        <details className="min-w-0">
          <summary className="cursor-pointer text-foreground-subtle">
            {zh ? "共享资源兼容提示" : "Shared resource compatibility"}
            {` · ${sharedWarnings.length}`}
            <span className="ml-2 inline-block max-w-[min(28rem,60vw)] align-bottom truncate">
              {sharedWarnings[0]}
            </span>
          </summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {sharedWarnings.map((warning, index) => (
              <li key={`${index}:${warning.slice(0, 32)}`} className="break-words">
                {warning}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
