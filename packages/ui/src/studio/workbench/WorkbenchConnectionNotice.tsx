import { useKnorviaIntl } from "@/i18n/IntlProvider.js";

/** 窗口内 Host 换代后，旧格不自动重绑；会话仍在内核记录中，可从「添加对话」重新放入。 */
export function WorkbenchConnectionNotice() {
  const { locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  return (
    <p role="status" className="p-5 text-ui-sm text-foreground-subtle">
      {zh
        ? "连接已变化，此格未自动重绑。请移出后从「添加对话」重新放入。"
        : "The connection changed and this tile was not rebound. Remove it and add the conversation again."}
    </p>
  );
}
