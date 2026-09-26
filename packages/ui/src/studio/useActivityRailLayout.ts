import { useSyncExternalStore } from "react";

const query = "(min-width: 768px)";
function subscribe(listener: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const getSnapshot = () => window.matchMedia(query).matches;
const getServerSnapshot = () => false;

/** 窄 Web 保留原导航；桌面收起内容侧栏时，全局工具仍须可达。 */
export function useActivityRailLayout(isDesktop = false) {
  const wide = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isDesktop || wide;
}
