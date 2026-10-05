import { useEffect, useState } from "react";

// 与 Tailwind `lg` 断点一致：小于 lg 时设置导航收成图标栏。
const SETTINGS_NAV_COMPACT_QUERY = "(max-width: 1023.98px)";

function readCompact(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(SETTINGS_NAV_COMPACT_QUERY).matches
  );
}

/**
 * 设置导航是否处于图标栏（收起）形态。展开态标签可见，不再弹出与标签重复的提示；
 * 收起态只剩图标，才需要提示名称。只读媒体查询，不写入任何持久状态。
 */
export function useSettingsNavCompact(): boolean {
  const [compact, setCompact] = useState(readCompact);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(SETTINGS_NAV_COMPACT_QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}
