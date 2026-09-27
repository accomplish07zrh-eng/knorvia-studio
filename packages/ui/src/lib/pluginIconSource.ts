import browserUseIconUrl from "@/assets/plugin-icons/browser-use.svg";
import documentsIconUrl from "@/assets/plugin-icons/documents.svg";
import imageSearchIconUrl from "@/assets/plugin-icons/image-search.svg";
import pdfIconUrl from "@/assets/plugin-icons/pdf.svg";
import pluginCreatorIconUrl from "@/assets/plugin-icons/plugin-creator.svg";
import presentationsIconUrl from "@/assets/plugin-icons/presentations.svg";
import skillCreatorIconUrl from "@/assets/plugin-icons/skill-creator.svg";
import spreadsheetsIconUrl from "@/assets/plugin-icons/spreadsheets.svg";
import { isTrustedImageUrl } from "@/lib/trustedImageUrl.js";

const OFFICIAL_PLUGIN_ICON_BY_ID: Readonly<Record<string, string>> = {
  "browser-use@knorvia-plugins-bundled": browserUseIconUrl,
  "documents@knorvia-plugins-bundled": documentsIconUrl,
  "image-search@knorvia-plugins-bundled": imageSearchIconUrl,
  "pdf@knorvia-plugins-bundled": pdfIconUrl,
  "plugin-creator@knorvia-plugins-bundled": pluginCreatorIconUrl,
  "presentations@knorvia-plugins-bundled": presentationsIconUrl,
  "skill-creator@knorvia-plugins-bundled": skillCreatorIconUrl,
  "spreadsheets@knorvia-plugins-bundled": spreadsheetsIconUrl,
};

const TRUSTED_BUNDLED_PLUGIN_ICONS = new Set(Object.values(OFFICIAL_PLUGIN_ICON_BY_ID));

/** 按完整身份解析客户端自有图标，避免商店、候选和消息各自维护不同例外。 */
export function resolvePluginIconSource(
  pluginId: string | undefined,
  icon?: string,
): string | undefined {
  if (pluginId) {
    const bundledIcon = OFFICIAL_PLUGIN_ICON_BY_ID[pluginId];
    if (bundledIcon) return bundledIcon;
  }
  return isTrustedImageUrl(icon) ? icon : undefined;
}

/** Session 投影已完成身份匹配；仅放行固定打包资源，不放宽任意本地 URL。 */
export function isTrustedPluginIconSource(icon: string | undefined): icon is string {
  return Boolean(icon && TRUSTED_BUNDLED_PLUGIN_ICONS.has(icon)) || isTrustedImageUrl(icon);
}
