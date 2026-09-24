import assert from "node:assert/strict";
import test from "node:test";
import {
  captureStudioScrollAnchor,
  restoreStudioScrollAnchor,
} from "../src/studio/runtime/studioScrollAnchor.js";

function viewport() {
  let prepended = 0;
  const container = {
    scrollTop: 120,
    scrollHeight: 900,
    getBoundingClientRect: () => ({ top: 50 }),
    querySelectorAll: () => messages,
    contains: (element: unknown) => messages.includes(element as HTMLElement),
  };
  const messages = [0, 100, 200, 300].map(
    (offset) =>
      ({
        getBoundingClientRect: () => ({
          top: 50 + offset + prepended - container.scrollTop,
          bottom: 150 + offset + prepended - container.scrollTop,
        }),
      }) as HTMLElement,
  );
  return {
    container: container as unknown as HTMLElement,
    messages,
    prepend: (height: number) => {
      prepended += height;
      container.scrollHeight += height;
    },
  };
}
test("streaming below the reading anchor never moves the user's current message", () => {
  const { container } = viewport();
  const anchor = captureStudioScrollAnchor(container)!;
  Object.assign(container, { scrollHeight: 1500 });
  restoreStudioScrollAnchor(container, anchor);
  assert.equal(container.scrollTop, 120);
  assert.equal(anchor.offset, -20);
});
test("prepending history preserves the existing visible message and its partial offset", () => {
  const { container, prepend } = viewport();
  const anchor = captureStudioScrollAnchor(container)!;
  prepend(600);
  restoreStudioScrollAnchor(container, anchor);
  assert.equal(container.scrollTop, 720);
  assert.equal(
    anchor.element.getBoundingClientRect().top - container.getBoundingClientRect().top,
    -20,
  );
});
test("manual scrolling while history is pending replaces the anchor, including after tail growth", () => {
  const { container, prepend, messages } = viewport();
  let anchor = captureStudioScrollAnchor(container)!;
  container.scrollTop = 250;
  anchor = captureStudioScrollAnchor(container)!;
  assert.equal(anchor.element, messages[2]);
  Object.assign(container, { scrollHeight: 1800 });
  prepend(600);
  restoreStudioScrollAnchor(container, anchor);
  assert.equal(container.scrollTop, 850);
  assert.equal(
    anchor.element.getBoundingClientRect().top - container.getBoundingClientRect().top,
    -50,
  );
});
