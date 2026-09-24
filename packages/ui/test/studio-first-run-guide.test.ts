import assert from "node:assert/strict";
import { test } from "node:test";
import {
  onStudioFirstMessageAccepted,
  onStudioLocalKernelRequested,
  reportStudioFirstMessageAccepted,
  requestStudioLocalKernel,
} from "../src/onboarding/studioFirstRunGuideEvents.js";

test("accepted-message and local-CLI requests are isolated from invalid navigation", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  try {
    let accepted = 0;
    const kernels: string[] = [];
    const offAccepted = onStudioFirstMessageAccepted(() => accepted++);
    const offKernel = onStudioLocalKernelRequested((id) => kernels.push(id));
    reportStudioFirstMessageAccepted();
    requestStudioLocalKernel("qoder-cn");
    requestStudioLocalKernel("knorvia");
    requestStudioLocalKernel("ssh:abcdefabcdefabcdefabcdef:qoder-cn");
    assert.equal(accepted, 1);
    assert.deepEqual(kernels, ["qoder-cn"]);
    offAccepted();
    offKernel();
    reportStudioFirstMessageAccepted();
    requestStudioLocalKernel("codex");
    assert.equal(accepted, 1);
    assert.deepEqual(kernels, ["qoder-cn"]);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
