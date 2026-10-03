import { assert, test, json, load, harness } from "./commandOwners.fixture.mjs";

test("input: live coordinates, held-key ordering, arity and owned path release", async () => {
  const input = load("browserCommandInput");
  assert.equal(input.modifiersBitmask(["ControlOrMeta", "Alt", "Control"]), 3);
  const h = harness(),
    p = { cx: 1, cy: 2 };
  h.view.cdp.send = async (...args) => {
    h.calls.push(json(args));
    p.cx++;
  };
  await input.dispatchClickAt(h.view, p, "right", true, 8);
  assert.deepEqual(
    h.calls.map((c) => [c.length, c[1].type, c[1].x, c[1].modifiers, c[1].clickCount]),
    [
      [2, "mouseMoved", 1, 8, undefined],
      [2, "mousePressed", 2, 8, 2],
      [2, "mouseReleased", 3, 8, 2],
    ],
  );
  h.calls.length = 0;
  await input.dispatchKeyPress(h.view, ["ctrl+ctrl", "shift+a"]);
  assert.deepEqual(
    h.calls.map((c) => [c[1].type, c[1].key, c[1].modifiers]),
    [
      ["keyDown", "Control", 2],
      ["keyDown", "Control", 2],
      ["keyDown", "Shift", 10],
      ["keyDown", "a", 10],
      ["keyUp", "a", 10],
      ["keyUp", "Shift", 2],
      ["keyUp", "Control", undefined],
      ["keyUp", "Control", undefined],
    ],
  );
  h.calls.length = 0;
  await input.dispatchKey(h.view, "a", 0, "");
  assert.deepEqual(
    h.calls.map((c) => [c.length, c[2], c[1]]),
    [
      [3, "", { type: "keyDown", key: "a" }],
      [3, "", { type: "keyUp", key: "a" }],
    ],
  );
  const failure = new Error("synthetic move"),
    cleanup = new Error("synthetic release");
  let count = 0;
  h.view.cdp.send = async (...args) => {
    h.calls.push(json(args));
    if (++count === 3) throw failure;
  };
  h.calls.length = 0;
  const point = { x: 3, y: 4 };
  await assert.rejects(
    input.dispatchDragPath(h.view, [{ x: 1, y: 2 }, point]),
    (err) => err === failure,
  );
  assert.equal(h.calls.length, 4);
  assert.deepEqual(h.calls[3][1], {
    type: "mouseReleased",
    x: 3,
    y: 4,
    button: "left",
    clickCount: 1,
  });
  count = 0;
  h.view.cdp.send = async () => {
    if (++count === 3) throw failure;
    if (count === 4) throw cleanup;
  };
  await assert.rejects(
    input.dispatchDragPath(h.view, [{ x: 1, y: 2 }, point]),
    (err) => err === cleanup,
  );
  count = 0;
  h.view.cdp.send = async () => {
    if (++count === 2) throw failure;
  };
  await assert.rejects(input.dispatchDragPath(h.view, [point]), (err) => err === failure);
  assert.equal(count, 2);
  count = 0;
  await assert.rejects(
    input.dispatchDrag(h.view, { cx: 0, cy: 0 }, { cx: 10, cy: 20 }),
    (err) => err === failure,
  );
  assert.equal(count, 2);
  h.calls.length = 0;
  h.view.cdp.send = async (...args) => {
    h.calls.push(json(args));
  };
  await input.dispatchDrag(h.view, { cx: 0, cy: 0 }, { cx: 10, cy: 20 });
  assert.equal(h.calls.length, 13);
  assert.deepEqual(
    h.calls.slice(2, 12).map((c) => [c[1].x, c[1].y]),
    Array.from({ length: 10 }, (_, i) => [i + 1, (i + 1) * 2]),
  );
  h.view.webContents.executeJavaScript = async (script) => {
    assert.equal(script.name, "RESOLVE");
    return { cx: NaN, cy: Infinity };
  };
  const resolved = await input.resolveRefCenter(h.view, "ref");
  assert.ok(Number.isNaN(resolved.cx));
  assert.equal(resolved.cy, Infinity);
  h.calls.length = 0;
  await input.dispatchScrollGesture(h.view, p, 4, 5, -1);
  assert.equal(h.calls[1][1].type, "mouseWheel");
  assert.equal("modifiers" in h.calls[1][1], false);
  h.calls.length = 0;
  h.view.cdp.send = async (...args) => h.calls.push(args);
  await input.dispatchKey(h.view, "constructor");
  assert.equal("key" in h.calls[0][1], true);
  assert.equal(h.calls[0][1].key, undefined);
  assert.equal("code" in h.calls[0][1], true);
});
test("interaction: ref and clipboard authority, schema identity, short circuits and optional arity", async () => {
  const h = harness(),
    point = { cx: 5, cy: 7 },
    forward = [];
  let maskCalls = 0,
    schemaValue;
  const input = {
    resolveRefCenter: async (...args) => {
      forward.push(["resolve", ...args]);
      return args[1] === "missing" ? null : point;
    },
    modifiersBitmask: () => ++maskCalls,
    ...Object.fromEntries(
      [
        "dispatchClickAt",
        "dispatchKey",
        "dispatchKeyPress",
        "dispatchDrag",
        "dispatchDragPath",
        "dispatchScrollGesture",
      ].map((name) => [name, async (...args) => forward.push([name, ...args])]),
    ),
  };
  const parsed = { synthetic: "element" };
  const interaction = load("browserCommandInteractionHandlers", {
    ...h.ports,
    "./browserCommandInput.js": input,
    "./browserVirtualClipboard.js": {
      pasteTextIntoFocusedTarget: async (...args) => forward.push(["paste", ...args]),
    },
    "@knorvia/shared": {
      browserSnapshotElementSchema: {
        safeParse: (value) => {
          schemaValue = value;
          return { success: true, data: parsed };
        },
      },
    },
  });
  assert.equal(
    await interaction.handleType(h.view, { method: "type", ref: "r", text: "synthetic" }, h.done),
    h.sentinel,
  );
  assert.equal(forward[1].length, 5);
  assert.equal(forward[1][2], point);
  assert.equal(forward[2].length, 3);
  assert.equal(h.sentinel.state, h.state);
  forward.length = 0;
  await interaction.handleDrag(h.view, { method: "drag", fromRef: "missing", toRef: "r" }, h.done);
  assert.equal(forward.length, 1);
  assert.equal(h.sentinel.error.code, "ref_not_found");
  h.calls.length = 0;
  await interaction.handleScroll(h.view, { method: "scroll", ref: "r", x: 9 }, h.done);
  assert.equal(h.calls.filter((c) => c[0] === "Input.dispatchMouseEvent").length, 0);
  h.calls.length = 0;
  await interaction.handleHover(h.view, { method: "hover", x: NaN, y: Infinity }, h.done);
  assert.equal(maskCalls, 2);
  assert.equal(h.calls[0][1].modifiers, 2);
  h.view.cdp.send = async (...args) => {
    assert.equal(args.length, 1);
    return { cssVisualViewport: { clientWidth: 20, clientHeight: 10 } };
  };
  forward.length = 0;
  await interaction.handleDomCuaScroll(
    h.view,
    { method: "domCuaScroll", scrollX: 2, scrollY: 3 },
    h.done,
  );
  assert.equal(forward[0].length, 5);
  assert.deepEqual(json(forward[0][2]), { cx: 10, cy: 5 });
  const raw = { unparsed: true };
  h.view.webContents.executeJavaScript = async () => raw;
  await interaction.handleElementInfo(h.view, { method: "elementInfo", x: 0, y: 0 }, h.done);
  assert.equal(schemaValue, raw);
  assert.equal(h.sentinel.element, parsed);
  for (const [name, command] of [
    ["handleClick", { method: "click", x: 1, y: 2 }],
    ["handlePress", { method: "press", key: "Enter" }],
    ["handleCuaKeypress", { method: "cuaKeypress", keys: ["ctrl+a"] }],
    ["handleCuaScroll", { method: "cuaScroll", x: 1, y: 2, scrollX: 3, scrollY: 4 }],
    ["handleCuaDrag", { method: "cuaDrag", path: [{ x: 1, y: 2 }] }],
    ["handleSelect", { method: "select", ref: "r", values: ["v"] }],
    ["handleCheck", { method: "check", ref: "r", checked: false }],
  ])
    assert.equal(await interaction[name](h.view, command, h.done), h.sentinel);
  let errorReads = 0;
  h.view.webContents.executeJavaScript = async () => ({
    get error() {
      errorReads++;
      return errorReads === 5 ? "late message" : "synthetic";
    },
  });
  await interaction.handleSelect(h.view, { method: "select", ref: "r", values: [] }, h.done);
  assert.equal(errorReads, 5);
  assert.equal(h.sentinel.error.message, "select failed: late message");
  const noCoords = {
    method: "click",
    ref: "r",
    get x() {
      throw new Error("ref authority must not read coordinates");
    },
    get y() {
      throw new Error("ref authority must not read coordinates");
    },
  };
  await interaction.handleClick(h.view, noCoords, h.done);
  h.view.cdp.send = async () => null;
  await assert.rejects(
    interaction.handleDomCuaScroll(
      h.view,
      { method: "domCuaScroll", scrollX: 1, scrollY: 2 },
      h.done,
    ),
    (err) => err.name === "TypeError",
  );
  const failure = new Error("synthetic clipboard");
  input.resolveRefCenter = async () => {
    throw failure;
  };
  await assert.rejects(
    interaction.handleType(h.view, { method: "type", ref: "r", text: "x" }, h.done),
    (err) => err === failure,
  );
});
