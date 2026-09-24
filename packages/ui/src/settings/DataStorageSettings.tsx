import { useEffect, useState } from "react";
import type { ISettingService, SettingDataLocation } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { useServices } from "@/hooks/useServices.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { DataBaseDirControl } from "./DataBaseDirControl.js";
import { SettingsGroupCard } from "./SettingsPageParts.js";

export function DataStorageSettings({
  defaultHomeDir,
  onDataBaseDirChange,
  onSelectDataBaseDir,
}: {
  defaultHomeDir: string;
  onDataBaseDirChange: (dir: string) => Promise<void>;
  onSelectDataBaseDir: () => Promise<string | null>;
}) {
  const { settingService } = useServices();
  const { intl, locale } = useKnorviaIntl();
  const zh = locale.startsWith("zh");
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    service: ISettingService;
    location?: SettingDataLocation;
    error?: string;
  }>();
  useEffect(() => {
    let current = true;
    setState({ service: settingService });
    void Promise.resolve()
      .then(() => settingService.getDataLocation())
      .then(
        (location) => {
          if (current) setState({ service: settingService, location });
        },
        (cause: unknown) => {
          if (current)
            setState({
              service: settingService,
              error: cause instanceof Error ? cause.message : String(cause),
            });
        },
      );
    return () => {
      current = false;
    };
  }, [settingService, revision]);
  // 服务切换的首帧也不显示上一 Host 的目录；查询失败绝不伪装成用户主目录。
  const visible = state?.service === settingService ? state : undefined;
  const location = visible?.location;
  const fixedDescription =
    location?.readOnlyReason === "portable"
      ? zh
        ? "数据保存在便携版文件夹中。完全退出应用后，移动整个文件夹即可一并带走数据。"
        : "Data stays with this portable folder. Fully quit the app before moving the entire folder."
      : zh
        ? "当前运行配置已固定此数据目录，无法在这里迁移。"
        : "The current launch configuration fixes this data location. It cannot be moved here.";
  return (
    <SettingsGroupCard>
      <div className="min-w-0 space-y-2 px-4 py-3" data-testid="settings-actual-data-location">
        <h3 className="text-ui-base font-medium">
          {intl.formatMessage({ id: "settings.dataBaseDir" })}
        </h3>
        {location ? (
          <>
            <p
              className="break-all font-mono text-ui-sm text-foreground select-text"
              title={location.dataRootDir}
            >
              {location.dataRootDir}
            </p>
            {location.readOnlyReason ? (
              <p className="text-ui-sm leading-5 text-foreground-subtle">{fixedDescription}</p>
            ) : (
              <DataBaseDirControl
                dataBaseDir={location.baseDir}
                defaultHomeDir={defaultHomeDir}
                onDataBaseDirChange={onDataBaseDirChange}
                onSelectDataBaseDir={onSelectDataBaseDir}
              />
            )}
          </>
        ) : visible?.error ? (
          <div className="flex flex-wrap items-start gap-2">
            <p
              role="alert"
              className="min-w-0 flex-1 basis-48 break-words text-ui-sm text-destructive"
            >
              {zh ? "无法读取数据位置：" : "Could not read the data location: "}
              {visible.error}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRevision((value) => value + 1)}
            >
              {zh ? "重试" : "Retry"}
            </Button>
          </div>
        ) : (
          <p role="status" className="text-ui-sm text-foreground-subtle">
            {zh ? "正在读取实际数据位置…" : "Loading the actual data location…"}
          </p>
        )}
      </div>
    </SettingsGroupCard>
  );
}
