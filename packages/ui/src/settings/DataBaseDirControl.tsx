import { FolderOpen, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isDataBaseDirForbiddenWindowsInstallDirError,
  TID_SETTINGS_DATA_BASE_DIR_BROWSE,
  TID_SETTINGS_DATA_BASE_DIR_INPUT,
  TID_SETTINGS_DATA_BASE_DIR_SAVE,
  TID_SETTINGS_DATA_BASE_DIR_STATUS,
} from "@knorvia/shared";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";

export function DataBaseDirControl({
  dataBaseDir,
  defaultHomeDir,
  onDataBaseDirChange,
  onSelectDataBaseDir,
}: {
  dataBaseDir: string;
  defaultHomeDir: string;
  onDataBaseDirChange: (dir: string) => Promise<void>;
  onSelectDataBaseDir: () => Promise<string | null>;
}) {
  const { intl, locale } = useKnorviaIntl();
  const effectiveDir = dataBaseDir || defaultHomeDir;
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const localDataBaseDir = selectedDir ?? effectiveDir;
  const [isPickingDataBaseDir, setIsPickingDataBaseDir] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessageId, setErrorMessageId] = useState("settings.dataBaseDirCopyFailed");
  const [pickerError, setPickerError] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isDirty = localDataBaseDir.trim() !== effectiveDir;
  const isSaving = saveState === "saving";

  const handleBrowseDataBaseDir = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsPickingDataBaseDir(true);
    setPickerError(false);
    try {
      const selectedDir = await onSelectDataBaseDir();
      if (!selectedDir || !mounted.current) {
        return;
      }

      // 之前这里允许手输任意字符串，用户填错路径后仍会触发整份数据复制。
      // 这里改成只接受系统目录弹窗返回的真实文件夹路径，先更新草稿值，再由“保存”统一触发迁移，
      // 避免把“浏览目录”和“执行数据迁移”这两个风险不同的动作混在一起。
      setSelectedDir(selectedDir);
      setSaveState("idle");
    } catch {
      if (mounted.current) setPickerError(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setIsPickingDataBaseDir(false);
    }
  }, [onSelectDataBaseDir]);

  const handleSave = useCallback(async () => {
    if (inFlight.current || !isDirty) return;
    inFlight.current = true;
    const trimmed = localDataBaseDir.trim();
    const newValue = trimmed === defaultHomeDir ? "" : trimmed;
    setSaveState("saving");
    setPickerError(false);
    try {
      await onDataBaseDirChange(newValue);
      if (mounted.current) setSaveState("saved");
    } catch (error) {
      if (!mounted.current) return;
      setErrorMessageId(
        isDataBaseDirForbiddenWindowsInstallDirError(error)
          ? "settings.dataBaseDirForbiddenInstallDir"
          : "settings.dataBaseDirCopyFailed",
      );
      setSaveState("error");
    } finally {
      inFlight.current = false;
    }
  }, [defaultHomeDir, localDataBaseDir, onDataBaseDirChange, isDirty]);

  return (
    <div className="flex w-full min-w-0 max-w-80 flex-col gap-2">
      <div className="flex items-center gap-2">
        <FolderOpen className="size-4 shrink-0 text-foreground-subtle" />
        <Input
          size="lg"
          data-testid={TID_SETTINGS_DATA_BASE_DIR_INPUT}
          value={localDataBaseDir}
          title={localDataBaseDir}
          aria-label={intl.formatMessage({ id: "settings.dataBaseDir" })}
          readOnly
          disabled={isSaving || isPickingDataBaseDir}
          placeholder={intl.formatMessage({ id: "settings.dataBaseDirPlaceholder" })}
          className="min-w-0 flex-1 font-mono"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid={TID_SETTINGS_DATA_BASE_DIR_BROWSE}
          disabled={isSaving || isPickingDataBaseDir}
          onClick={() => void handleBrowseDataBaseDir()}
        >
          {intl.formatMessage({ id: "settings.dataBaseDirBrowse" })}
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid={TID_SETTINGS_DATA_BASE_DIR_SAVE}
          aria-label={intl.formatMessage({ id: "settings.dataBaseDirSave" })}
          disabled={!isDirty || isSaving || isPickingDataBaseDir}
          onClick={() => void handleSave()}
        >
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            intl.formatMessage({ id: "settings.dataBaseDirSave" })
          )}
        </Button>
      </div>
      {pickerError && (
        <p role="alert" className="text-ui-sm text-destructive">
          {locale.startsWith("zh")
            ? "无法打开文件夹选择器，请重试。已选路径会保留。"
            : "Could not open the folder picker. Try again; the selected path is retained."}
        </p>
      )}
      {saveState === "saving" ? (
        <p
          role="status"
          data-testid={TID_SETTINGS_DATA_BASE_DIR_STATUS}
          data-state="saving"
          className="text-ui-base text-foreground-subtle"
        >
          {intl.formatMessage({ id: "settings.dataBaseDirCopying" })}
        </p>
      ) : saveState === "saved" ? (
        <p
          role="status"
          data-testid={TID_SETTINGS_DATA_BASE_DIR_STATUS}
          data-state="saved"
          className="text-ui-base text-warning"
        >
          {intl.formatMessage({ id: "settings.dataBaseDirRestartRequired" })}
        </p>
      ) : saveState === "error" ? (
        <p
          role="alert"
          data-testid={TID_SETTINGS_DATA_BASE_DIR_STATUS}
          data-state="error"
          className="text-ui-base text-destructive"
        >
          {intl.formatMessage({ id: errorMessageId })}
        </p>
      ) : null}
    </div>
  );
}
