import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useOptionalServices } from "@/hooks/useServices.js";
import { SettingsRow } from "./SettingsPageParts.js";
import { asyncSettingFields } from "./asyncSettingField.js";

export function AsyncSettingTextRow({
  fieldId,
  label,
  description,
  placeholder,
  value,
  onSave,
  commaSeparated = false,
}: {
  fieldId: string;
  label: string;
  description: string;
  placeholder: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  commaSeparated?: boolean;
}) {
  const { intl, locale } = useKnorviaIntl();
  const zh = locale.startsWith("zh");
  const statusId = useId();
  const [localOwner] = useState(() => ({}));
  const owner = useOptionalServices()?.settingService ?? localOwner;
  const field = useMemo(
    () =>
      asyncSettingFields.get(owner, fieldId, value, (raw) =>
        commaSeparated
          ? raw
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean)
              .join(",")
          : raw.trim(),
      ),
    [owner, fieldId, value, commaSeparated],
  );
  const state = useSyncExternalStore(field.subscribe, field.getSnapshot, field.getSnapshot);
  useEffect(() => {
    field.sync(value);
  }, [field, value]);
  const save = () => {
    void field.save(onSave);
  };
  const status = state.error
    ? zh
      ? `保存失败：${state.error}`
      : `Could not save: ${state.error}`
    : state.pending
      ? zh
        ? "正在保存…"
        : "Saving…"
      : state.saved
        ? state.dirty
          ? zh
            ? "上次保存成功；当前改动尚未保存。"
            : "Saved the previous value. Your latest edits are unsaved."
          : zh
            ? "已保存"
            : "Saved"
        : "";
  return (
    <SettingsRow
      label={label}
      description={description}
      control={
        <Button
          type="button"
          size="lg"
          disabled={!state.dirty || state.pending}
          aria-label={`${intl.formatMessage({ id: "settings.dataBaseDirSave" })} ${label}`}
          onClick={save}
        >
          {state.pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {intl.formatMessage({ id: "settings.dataBaseDirSave" })}
        </Button>
      }
      detail={
        <div className="w-full max-w-[520px] space-y-2">
          <Input
            size="lg"
            value={state.value}
            placeholder={placeholder}
            aria-label={label}
            aria-describedby={status ? statusId : undefined}
            aria-invalid={Boolean(state.error)}
            onChange={(event) => field.edit(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                save();
              }
            }}
            className="min-w-0 font-mono"
          />
          {status ? (
            <p
              id={statusId}
              role={state.error ? "alert" : "status"}
              className={
                state.error
                  ? "break-words text-ui-sm text-destructive"
                  : "break-words text-ui-sm text-foreground-subtle"
              }
            >
              {status}
            </p>
          ) : null}
        </div>
      }
    />
  );
}
