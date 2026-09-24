import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { SettingsRow } from "@/settings/SettingsPageParts.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import {
  MASCOT_MODES,
  type MascotMode,
  useMascotPreference,
} from "@/store/mascotPreferenceStore.js";
import { KnorviaMark } from "./KnorviaMark.js";

export function MascotAppearanceSetting() {
  const { intl } = useKnorviaIntl();
  const { mode, setMode, saveFailed } = useMascotPreference((state) => state);
  return (
    <>
      <SettingsRow
        label={intl.formatMessage({ id: "studio.mascot.label" })}
        description={intl.formatMessage({ id: "studio.mascot.description" })}
        control={
          <div className="flex items-center gap-3">
            <KnorviaMark className="size-8" />
            <Select value={mode} onValueChange={(value) => setMode(value as MascotMode)}>
              <SelectTrigger
                className="w-36"
                aria-label={intl.formatMessage({ id: "studio.mascot.label" })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MASCOT_MODES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {intl.formatMessage({ id: `studio.mascot.${value}` })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      {saveFailed ? (
        <p role="alert" className="px-4 pb-3 text-ui-sm text-destructive">
          {intl.formatMessage({ id: "studio.mascot.saveFailed" })}
        </p>
      ) : null}
    </>
  );
}
