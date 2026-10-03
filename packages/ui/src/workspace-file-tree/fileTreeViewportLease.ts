// SPDX-License-Identifier: Apache-2.0
// Source-exposed native viewport/resource candidate; source/runtime review pending.
type Metrics = { overflow: boolean; bottomMask: boolean };
type Ports = {
  scroll: HTMLElement;
  content: HTMLElement | null;
  offset: (value: string) => void;
  publish: (metrics: Metrics) => void;
  resizeObserver: (callback: () => void) => ResizeObserver;
  frame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
  window: Window;
};

/** Native scroll paints immediately; resize sources share a revocable pending frame. */
export function observeFileTreeViewport(ports: Ports): () => void {
  let active = true, frame: number | null = null;
  const cleanup: Array<() => void> = [];
  const update = () => {
    if (!active) return;
    const node = ports.scroll;
    ports.offset(`${node.scrollTop}px`);
    const overflow = node.scrollHeight > node.clientHeight + 1;
    const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
    ports.publish({ overflow, bottomMask: overflow && !atBottom });
  };
  const schedule = () => {
    if (!active || frame !== null) return;
    frame = ports.frame(() => { frame = null; update(); });
  };
  const release = () => {
    if (!active) return;
    active = false;
    let failed = false, failure: unknown;
    const operations = [...cleanup, () => { if (frame !== null) ports.cancelFrame(frame); frame = null; }];
    for (const operation of operations) {
      try { operation(); } catch (error) { if (!failed) failure = error; failed = true; }
    }
    cleanup.length = 0;
    if (failed) throw failure;
  };
  try {
    update();
    const observer = ports.resizeObserver(schedule);
    cleanup.push(() => observer.disconnect());
    observer.observe(ports.scroll);
    if (ports.content) observer.observe(ports.content);
    cleanup.push(() => ports.scroll.removeEventListener("scroll", update));
    ports.scroll.addEventListener("scroll", update, { passive: true });
    cleanup.push(() => ports.window.removeEventListener("resize", schedule));
    ports.window.addEventListener("resize", schedule);
  } catch (error) {
    // setup 未交出 effect cleanup 时仍释放已获取 observer/listener/frame。
    try { release(); } catch { /* preserve the installation failure */ }
    throw error;
  }
  return release;
}
