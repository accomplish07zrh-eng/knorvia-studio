// SPDX-License-Identifier: Apache-2.0
// Source-exposed B5 replacement candidate; authorship/license review remains pending.

export type ScrollFadeEdges = "none" | "top" | "bottom" | "both";

/** Geometry is a projection; this owner never changes the consumer's scroll position. */
export class ScrollFadeController {
  private frame: number | null = null;
  private observer: ResizeObserver | null = null;

  constructor(
    private readonly viewport: HTMLDivElement,
    private readonly content: HTMLDivElement,
    private readonly publish: (edges: ScrollFadeEdges) => void,
  ) {}

  private measure = () => {
    const range = this.viewport.scrollHeight - this.viewport.clientHeight;
    const hidden = [
      !(range <= 1) && this.viewport.scrollTop > 1,
      !(range <= 1) && this.viewport.scrollTop < range - 1,
    ];
    const states: ScrollFadeEdges[] = ["none", "top", "bottom", "both"];
    this.publish(states[Number(hidden[0]) + 2 * Number(hidden[1])]!);
  };

  private requestMeasure = () => {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.measure();
    });
  };

  start() {
    this.measure();
    this.viewport.addEventListener("scroll", this.measure, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(this.requestMeasure);
      for (const node of [this.viewport, this.content]) this.observer.observe(node);
    }
    window.addEventListener("resize", this.requestMeasure);
  }

  stop() {
    this.viewport.removeEventListener("scroll", this.measure);
    window.removeEventListener("resize", this.requestMeasure);
    this.observer?.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.observer = null;
  }
}
