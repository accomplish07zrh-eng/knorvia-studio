import type {
  CuaPermissionKind,
  Locale,
  PrepareCuaHelperPermissionDragResult,
} from "@knorvia/shared";
import { resolveCuaPermissionPanelMessages } from "./cuaPermissionPanelMessages.js";

interface CuaPermissionPanelState {
  permission: CuaPermissionKind;
  locale: Locale;
  iconDataUrl: string | null;
}

declare global {
  interface Window {
    cuaPermissionPanel?: {
      prepareDrag?(): Promise<PrepareCuaHelperPermissionDragResult>;
      startDrag?(): void;
      notifyDragEnded?(): void;
      onState?(callback: (state: CuaPermissionPanelState) => void): () => void;
    };
  }
}

class CuaPermissionPanel {
  private gesture: "idle" | "dragging" = "idle";
  private readonly nodes: Record<
    "tile" | "hintPrefix" | "permissionLabel" | "hintSuffix" | "completion" | "icon",
    HTMLElement | null
  >;

  constructor(private readonly bridge: Window["cuaPermissionPanel"]) {
    this.nodes = {
      tile: document.getElementById("tile"),
      hintPrefix: document.getElementById("hintPrefix"),
      permissionLabel: document.getElementById("permissionLabel"),
      hintSuffix: document.getElementById("hintSuffix"),
      completion: document.getElementById("completion"),
      icon: document.querySelector<HTMLElement>(".icon"),
    };
  }

  mount(): void {
    // Prewarm before the gesture; native startDrag cannot wait for async install.
    this.bridge?.prepareDrag?.()
      .then((result) => this.applyHelperDisplayName(result))
      .catch(() => {});
    this.bridge?.onState?.((state) => this.applyState(state));
    this.nodes.tile?.addEventListener("dragstart", this.beginDrag);
    this.nodes.tile?.addEventListener("dragend", this.endDrag);
    document.addEventListener("mouseup", this.endDrag);
  }

  private applyHelperDisplayName(result: PrepareCuaHelperPermissionDragResult): void {
    const appName = document.getElementById("appName");
    if (result?.helperDisplayName && appName) appName.textContent = result.helperDisplayName;
  }

  private applyState(state: CuaPermissionPanelState): void {
    const messages = resolveCuaPermissionPanelMessages(state.locale, state.permission);
    document.documentElement.lang = state.locale;
    document.title = messages.documentTitle;
    if (this.nodes.tile) this.nodes.tile.title = messages.dragTitle;
    for (const key of ["hintPrefix", "permissionLabel", "hintSuffix", "completion"] as const) {
      const node = this.nodes[key];
      if (node) node.textContent = messages[key];
    }
    if (state.iconDataUrl && this.nodes.icon) {
      this.nodes.icon.style.backgroundImage = 'url("' + state.iconDataUrl + '")';
    }
  }

  private readonly beginDrag = (event: DragEvent): void => {
    event.preventDefault();
    this.gesture = "dragging";
    this.bridge?.startDrag?.();
  };

  private readonly endDrag = (): void => {
    if (this.gesture === "idle") return;
    this.gesture = "idle";
    this.bridge?.notifyDragEnded?.();
  };
}

new CuaPermissionPanel(window.cuaPermissionPanel).mount();
