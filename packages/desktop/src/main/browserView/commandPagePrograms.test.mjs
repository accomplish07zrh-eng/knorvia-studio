import test from "node:test";
import assert from "node:assert/strict";
import { owner, page, plain } from "./commandChainOwnerTestPorts.mjs";

function node(tag, attributes = {}, parent = null) {
  return {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    parentElement: parent,
    previousElementSibling: null,
    id: attributes.id || "",
    innerText: attributes.text || "",
    textContent: attributes.text || "",
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    getBoundingClientRect() {
      return {
        x: 1.4,
        y: 2.7,
        width: 10.8,
        height: 20.2,
        top: 2.7,
        bottom: 22.9,
        left: 1.4,
        right: 12.2,
      };
    },
  };
}

test("generated command programs preserve synthetic DOM refs, schemas, actions and errors", () => {
  const api = owner("scripts");
  const body = node("body");
  const button = node(
    "button",
    { id: "safe", text: "  A  B  ", "aria-label": "  Named  value  " },
    body,
  );
  const input = node("input", { type: "checkbox", name: "synthetic" }, button);
  Object.assign(input, { value: "x", type: "checkbox", checked: false, disabled: true });
  const hidden = node("button", {}, body);
  hidden.hidden = true;
  const document = {
    body,
    title: "synthetic title",
    documentElement: { clientWidth: 40, clientHeight: 50 },
    querySelectorAll(selector) {
      assert.equal(this, document);
      return selector.startsWith("a[href]")
        ? [button, hidden, input]
        : [body, button, input, hidden];
    },
    elementFromPoint(x, y) {
      assert.equal(this, document);
      assert.equal(x, null);
      assert.equal(y, null);
      return button;
    },
  };
  const window = {
    innerWidth: 100,
    innerHeight: 100,
    getComputedStyle(element) {
      assert.equal(this, window);
      return { display: element.hidden ? "none" : "block", visibility: "visible", opacity: "1" };
    },
  };
  const ports = {
    document,
    window,
    location: { href: "https://synthetic.invalid" },
    Event: class {
      constructor(type, options) {
        this.type = type;
        Object.assign(this, options);
      }
    },
  };
  const run = (source) => page(source, ports);
  const snapshot = plain(run(api.SNAPSHOT_SCRIPT(2, false)));
  assert.deepEqual(Object.keys(snapshot), [
    "url",
    "title",
    "dom",
    "domTruncated",
    "elements",
    "truncated",
  ]);
  assert.deepEqual(
    snapshot.elements.map((element) => element.ref),
    ["e1", "e2"],
  );
  assert.equal(snapshot.truncated, false);
  assert.deepEqual(snapshot.elements[0], {
    ref: "e1",
    tag: "button",
    selector: "#safe",
    xpath: "//*[@id='safe']",
    rect: { x: 1, y: 3, width: 11, height: 20 },
    inViewport: true,
    role: "button",
    name: "Named  value",
    text: "A  B",
    attributes: { id: "safe", "aria-label": "Named  value" },
  });
  assert.equal(snapshot.elements[1].parentRef, "e1");
  assert.equal(snapshot.elements[1].checked, false);
  assert.equal(snapshot.elements[1].disabled, true);
  assert.equal(snapshot.dom[1].name, "Named value");
  assert.equal(snapshot.dom[1].text, "A B");
  assert.equal(snapshot.dom[2].depth, 1);
  assert.equal(window.__knorviaRefs.get("e2"), input);
  const priorMap = window.__knorviaRefs;
  assert.equal(plain(run(api.SNAPSHOT_SCRIPT(1.9, true))).truncated, true);
  assert.notEqual(window.__knorviaRefs, priorMap);
  button.scrollIntoView = function (options) {
    assert.equal(this, button);
    assert.deepEqual(plain(options), { block: "center", inline: "center" });
    this.scrolled = true;
  };
  button.getBoundingClientRect = function () {
    assert.equal(this.scrolled, true);
    return { left: 3, top: 4, width: 10, height: 8 };
  };
  assert.deepEqual(plain(run(api.RESOLVE_SCRIPT("e1"))), { cx: 8, cy: 8 });
  assert.equal(run(api.RESOLVE_SCRIPT('missing"; throw 0;//')), null);
  const emitted = [];
  const select = {
    tagName: "SELECT",
    options: [
      { value: "a", text: "Alpha", selected: true },
      { value: "a", text: "other", selected: true },
      { value: "b", text: " Beta ", selected: true },
    ],
    dispatchEvent(event) {
      assert.equal(this, select);
      emitted.push([event.type, event.bubbles]);
    },
  };
  window.__knorviaRefs.set("select", select);
  assert.deepEqual(plain(run(api.SELECT_SCRIPT("select", ["a", "Beta"]))), { ok: true });
  assert.deepEqual(
    select.options.map((option) => option.selected),
    [true, false, true],
  );
  assert.deepEqual(emitted.splice(0), [
    ["input", true],
    ["change", true],
  ]);
  assert.deepEqual(plain(run(api.SELECT_SCRIPT("select", ["missing"]))), { error: "no_match" });
  assert.deepEqual(
    select.options.map((option) => option.selected),
    [false, false, false],
  );
  assert.deepEqual(emitted, []);
  let collection = [{ value: "switch", text: "switch", selected: true }];
  const oldOption = collection[0];
  Object.defineProperty(oldOption, "selected", {
    set(value) {
      if (!value) collection = [{ value: "switch", text: "switch", selected: false }];
    },
  });
  const live = {
    tagName: "SELECT",
    get options() {
      return collection;
    },
    dispatchEvent() {},
  };
  window.__knorviaRefs.set("live", live);
  run(api.SELECT_SCRIPT("live", ["switch"]));
  assert.equal(collection[0].selected, true);
  input.click = function () {
    assert.equal(this, input);
    this.checked = !this.checked;
    emitted.push("click");
  };
  assert.deepEqual(plain(run(api.CHECK_SCRIPT("e2", true))), { error: "ref_not_found" });
  window.__knorviaRefs.set("checkbox", input);
  assert.deepEqual(plain(run(api.CHECK_SCRIPT("checkbox", true))), { ok: true, checked: true });
  run(api.CHECK_SCRIPT("checkbox", true));
  assert.deepEqual(emitted.splice(0), ["click"]);
  button.getBoundingClientRect = () => ({
    x: 1,
    y: 2,
    width: 10,
    height: 8,
    top: 2,
    bottom: 10,
    left: 1,
    right: 11,
  });
  const point = plain(run(api.ELEMENT_AT_POINT_SCRIPT(NaN, Infinity)));
  assert.equal(point.ref, "p1");
  assert.equal("attributes" in point, false);
  assert.equal(window.__knorviaRefs.get("p1"), button);
  assert.equal(window.__knorviaRefs.get("checkbox"), input);
  assert.deepEqual(plain(run(api.EVALUATE_SCRIPT("({synthetic: 1})"))), {
    ok: true,
    kind: "json",
    data: '{"synthetic":1}',
  });
  assert.deepEqual(plain(run(api.EVALUATE_SCRIPT("undefined"))), {
    ok: true,
    kind: "str",
    data: "undefined",
  });
  assert.deepEqual(
    plain(run(api.EVALUATE_SCRIPT('(()=>{throw new Error("synthetic failure")})()'))),
    { ok: false, message: "synthetic failure" },
  );
  assert.throws(
    () => run(api.EVALUATE_SCRIPT(")")),
    (error) => error.name === "SyntaxError",
  );
  const reads = [];
  const measured = node("button");
  const measuredRect = {};
  for (const [key, value] of Object.entries({
    x: 1,
    y: 2,
    width: 10,
    height: 8,
    top: 2,
    bottom: 10,
    left: 1,
    right: 11,
  }))
    Object.defineProperty(measuredRect, key, {
      get() {
        reads.push(key);
        return value;
      },
    });
  measured.getBoundingClientRect = () => {
    reads.push("rect");
    return measuredRect;
  };
  Object.defineProperty(measured, "tagName", {
    get() {
      reads.push("tag");
      return "BUTTON";
    },
  });
  Object.defineProperty(measured, "previousElementSibling", {
    get() {
      reads.push("previous");
      return null;
    },
  });
  document.elementFromPoint = () => measured;
  run(api.ELEMENT_AT_POINT_SCRIPT(1, 2));
  assert.deepEqual(reads.slice(0, 12), [
    "rect",
    "x",
    "y",
    "width",
    "height",
    "top",
    "bottom",
    "left",
    "right",
    "tag",
    "tag",
    "previous",
  ]);
  reads.length = 0;
  Object.defineProperty(measured, "parentElement", {
    get() {
      reads.push("depth");
      return body;
    },
  });
  document.querySelectorAll = (selector) => (selector.startsWith("a[href]") ? [] : [measured]);
  run(api.SNAPSHOT_SCRIPT(1, true));
  assert.deepEqual(reads.slice(0, 7), ["rect", "tag", "depth", "top", "bottom", "left", "right"]);
  document.querySelectorAll = (selector) =>
    selector.startsWith("a[href]") ? [] : Array(301).fill(body);
  const capped = plain(run(api.SNAPSHOT_SCRIPT()));
  assert.equal(capped.dom.length, 300);
  assert.equal(capped.domTruncated, true);
  assert.equal(
    api.VIEWPORT_SCRIPT,
    "(function(){return {scrollX:Math.round(window.scrollX||window.pageXOffset||0),scrollY:Math.round(window.scrollY||window.pageYOffset||0),innerWidth:window.innerWidth||document.documentElement.clientWidth||0,innerHeight:window.innerHeight||document.documentElement.clientHeight||0};})()",
  );
});
