export interface StudioScrollAnchor {
  element: HTMLElement;
  offset: number;
}

/** Track a visible message, so growth below it is never mistaken for prepended history. */
export function captureStudioScrollAnchor(container: HTMLElement): StudioScrollAnchor | undefined {
  const top = container.getBoundingClientRect().top;
  for (const element of container.querySelectorAll<HTMLElement>("[data-studio-message-id]")) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom > top) return { element, offset: rect.top - top };
  }
  return undefined;
}

export function restoreStudioScrollAnchor(container: HTMLElement, anchor: StudioScrollAnchor) {
  if (!container.contains(anchor.element)) return;
  container.scrollTop +=
    anchor.element.getBoundingClientRect().top -
    container.getBoundingClientRect().top -
    anchor.offset;
}
