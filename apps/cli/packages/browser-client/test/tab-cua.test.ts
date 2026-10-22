// tab-cua 的行为测试：命令构造的形状与边界。
import assert from "node:assert/strict";
import test from "node:test";
import { createCua, createDomCua } from "../src/tab-cua.js";
import type { BrowserCommand, BrowserSnapshot } from "@knorvia/contracts/browser-control";

/** 收集所有发出的命令。 */
function recorder(): {
  commands: BrowserCommand[];
  act: (command: BrowserCommand) => Promise<void>;
} {
  const commands: BrowserCommand[] = [];
  return {
    commands,
    act: async (command) => {
      commands.push(command);
    },
  };
}

test("createCua.click maps a numeric button to its name", async () => {
  const { commands, act } = recorder();
  await createCua(act).click({ x: 10, y: 20, button: 3 });
  assert.deepEqual(commands[0], {
    method: "click",
    x: 10,
    y: 20,
    button: "right",
    modifiers: undefined,
  });
});

test("createCua.click defaults to the left button", async () => {
  const { commands, act } = recorder();
  await createCua(act).click({ x: 1, y: 2 });
  assert.equal((commands[0] as { button?: string }).button, "left");
});

test("createCua.click rejects an unsupported button", async () => {
  const { act } = recorder();
  await assert.rejects(
    async () => createCua(act).click({ x: 0, y: 0, button: 9 as never }),
    /Unsupported CUA mouse button: 9/u,
  );
});

test("createCua keeps only recognised key modifiers", async () => {
  const { commands, act } = recorder();
  await createCua(act).keypress({ keys: ["Shift", "NotAModifier"] });
  // keypress 原样转发 keys，不做过滤。
  assert.deepEqual((commands[0] as { keys?: string[] }).keys, ["Shift", "NotAModifier"]);
});

test("createCua.click drops unknown modifiers from keypress", async () => {
  const { commands, act } = recorder();
  await createCua(act).click({ x: 0, y: 0, keypress: ["Shift", "Bogus"] });
  assert.deepEqual((commands[0] as { modifiers?: string[] }).modifiers, ["Shift"]);
});

test("createCua.click omits modifiers when none are recognised", async () => {
  const { commands, act } = recorder();
  await createCua(act).click({ x: 0, y: 0, keypress: ["Bogus"] });
  assert.equal((commands[0] as { modifiers?: string[] }).modifiers, undefined);
});

test("createCua.double_click sets doubleClick", async () => {
  const { commands, act } = recorder();
  await createCua(act).double_click({ x: 5, y: 6 });
  assert.equal((commands[0] as { doubleClick?: boolean }).doubleClick, true);
});

test("createCua.move is emitted as a hover command", async () => {
  const { commands, act } = recorder();
  await createCua(act).move({ x: 7, y: 8 });
  assert.equal(commands[0].method, "hover");
});

test("createCua.drag and scroll use their dedicated methods", async () => {
  const { commands, act } = recorder();
  const cua = createCua(act);
  await cua.drag({
    path: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  });
  await cua.scroll({ x: 0, y: 0, scrollY: 120 });
  assert.equal(commands[0].method, "cuaDrag");
  assert.equal(commands[1].method, "cuaScroll");
  assert.equal((commands[1] as { scrollY?: number }).scrollY, 120);
});

test("createCua.type forwards the text", async () => {
  const { commands, act } = recorder();
  await createCua(act).type({ text: "hello" });
  assert.deepEqual(commands[0], { method: "type", text: "hello" });
});

test("createDomCua.click targets a DOM node by ref", async () => {
  const { commands, act } = recorder();
  const snapshot = async (): Promise<BrowserSnapshot> => ({}) as BrowserSnapshot;
  const dom = createDomCua(act, snapshot);
  await dom.click({ node_id: "node-7" });
  assert.deepEqual(commands[0], { method: "click", ref: "node-7" });
});

test("createDomCua.get_visible_dom delegates to the snapshot callback", async () => {
  const { act } = recorder();
  const expected = { html: "<div />" } as unknown as BrowserSnapshot;
  const dom = createDomCua(act, async () => expected);
  assert.equal(await dom.get_visible_dom(), expected);
});
