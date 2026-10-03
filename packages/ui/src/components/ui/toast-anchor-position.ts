// SPDX-License-Identifier: Apache-2.0
// Source-exposed B5 replacement candidate; authorship/license review remains pending.
import { resolveToastAnchorLeft } from "./toast-presentation.js";

/** Tracks only screen position; anchor and toast lifecycle remain with their owners. */
export class ToastAnchorPosition {
  private anchor: HTMLElement | null = null;
  private resize: ResizeObserver | null = null;
  private mutation: MutationObserver | null = null;
  constructor(
    private readonly id: string,
    private readonly publish: (left: number | null) => void,
  ) {}

  private refresh = () => {
    const next = document.getElementById(this.id);
    if (next !== this.anchor) {
      if (this.anchor) this.resize?.unobserve(this.anchor);
      this.anchor = next;
      if (next) this.resize?.observe(next);
    }
    this.publish(next ? resolveToastAnchorLeft(next.getBoundingClientRect()) : null);
  };

  start() {
    if (typeof ResizeObserver !== "undefined") this.resize = new ResizeObserver(this.refresh);
    this.refresh();
    if (typeof MutationObserver !== "undefined") {
      this.mutation = new MutationObserver(this.refresh);
      this.mutation.observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener("resize", this.refresh);
    document.addEventListener("scroll", this.refresh, { capture: true, passive: true });
  }

  stop() {
    this.resize?.disconnect();
    this.mutation?.disconnect();
    window.removeEventListener("resize", this.refresh);
    document.removeEventListener("scroll", this.refresh, true);
  }
}
