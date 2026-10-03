export type BrowserTabResidency =
  | "live-visible"
  | "live-background"
  | "suspend-pending"
  | "suspended"
  | "restoring";

export interface BrowserTabResidencyCandidate {
  tabId: string;
  windowId: number;
  sessionId: string;
  residency: BrowserTabResidency;
  /** 物理 guest 已 attach 且未 destroyed；logical residency 不能替代此事实。 */
  guestAttached: boolean;
  openedAt: number;
  lastActivityAt: number;
  lastSelectedAt: number | null;
  /** 当前任务最近一次被选择的主 tab；同一 window/session 至多一个。 */
  preferred: boolean;
  currentTask: boolean;
  selected: boolean;
  visible: boolean;
  operationActive: boolean;
  captureActive: boolean;
  audible: boolean;
  mediaActive: boolean;
  loading: boolean;
  downloadActive: boolean;
}


export declare const BROWSER_TAB_LIMIT:number;
export declare function selectBrowserTabLimitVictim(candidates:readonly BrowserTabResidencyCandidate[],options:{windowId:number;tabLimit?:number}):BrowserTabResidencyCandidate|null;
