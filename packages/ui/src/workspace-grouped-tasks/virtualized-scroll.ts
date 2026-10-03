// SPDX-License-Identifier: Apache-2.0
// Source-exposed contract implementation; validation and authorship review deferred.
import type { Virtualizer } from "@tanstack/react-virtual";

type GroupedTaskVirtualizerScrollOptions = {
  adjustments?: number;
  behavior?: ScrollBehavior;
};

type ScrollObservation = {
  horizontal: boolean;
  scrollTop: number;
  scrollOffset: number | null;
};

export function planGroupedTaskScroll(
  offset: number,
  options: GroupedTaskVirtualizerScrollOptions,
  observed: ScrollObservation,
): ScrollToOptions | null {
  const adjustment = options.adjustments === undefined ? 0 : options.adjustments;
  if (!observed.horizontal && options.behavior === undefined && offset === 0 && adjustment === 0) {
    // 共享容器已有位置而 virtualizer 仍缓存初始 0 时，忽略这一次旧同步，避免重挂载回顶。
    if (observed.scrollTop > 0 && observed.scrollOffset === 0) return null;
  }
  const target = offset + adjustment;
  return observed.horizontal
    ? { left: target, behavior: options.behavior }
    : { top: target, behavior: options.behavior };
}

export function isPotentialVerticalScrollContainer(overflowY: string): boolean {
  return ["auto", "scroll", "overlay"].some((mode) => overflowY.includes(mode));
}

export function scrollGroupedTaskVirtualizerToOffset<TScrollElement extends Element>(
  offset: number,
  options: GroupedTaskVirtualizerScrollOptions,
  instance: Virtualizer<TScrollElement, Element>,
): void {
  const element = instance.scrollElement;
  if (!element) return;
  const command = planGroupedTaskScroll(offset, options, {
    horizontal: instance.options.horizontal,
    scrollTop: element.scrollTop,
    scrollOffset: instance.scrollOffset,
  });
  if (command) element.scrollTo(command);
}
