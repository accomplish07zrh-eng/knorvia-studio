import { vm, assert, plain, check, dialogFixture } from "./owners.fixture.mjs";

check(
  "dialog",
  "serialized main-world frame lifetimes, native receivers and confirm identity guard",
  () => {
    const f = dialogFixture(),
      calls = [],
      observers = [],
      mainEvents = [],
      frameEvents = [];
    const makeWindow = (id) => {
      const w = { document: { documentElement: {}, querySelectorAll: () => [] } };
      w.alert = function (value) {
        assert.equal(this, w);
        calls.push(["native-alert", id, value]);
      };
      w.confirm = function (value) {
        assert.equal(this, w);
        calls.push(["native-confirm", id, value]);
        return true;
      };
      return w;
    };
    const child = makeWindow("child"),
      frame = { contentWindow: child, addEventListener: (...args) => frameEvents.push(args) },
      main = makeWindow("main");
    main.document.querySelectorAll = () => [frame];
    main.addEventListener = (...args) => mainEvents.push(args);
    main.MutationObserver = class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(...args) {
        this.args = args;
      }
    };
    let result = { handled: false };
    main.__knorviaEmbeddedBrowserJavaScriptDialog__ = {
      show: (type, value) => {
        calls.push(["bridge", type, value]);
        return result;
      },
    };
    const serialized = "(" + f.getExecute().func.toString() + ")(...args)";
    vm.runInNewContext(serialized, {
      window: main,
      args: f.getExecute().args,
      String,
      WeakMap,
      WeakSet,
    });
    assert.equal(frameEvents.length, 1);
    assert.equal(frameEvents[0][0], "load");
    assert.equal(frameEvents[0][2], true);
    assert.equal(observers.length, 1);
    assert.deepEqual(plain(observers[0].args[1]), { childList: true, subtree: true });
    main.alert();
    assert.deepEqual(calls.slice(-2), [
      ["bridge", "alert", ""],
      ["native-alert", "main", ""],
    ]);
    assert.equal(child.confirm(42), true);
    assert.equal(calls.at(-1)[2], "42");
    result = { handled: true, value: false };
    assert.equal(main.confirm("handled"), false);
    const firstConfirm = main.confirm,
      replacementAlert = () => calls.push(["replacement-alert"]);
    main.alert = replacementAlert;
    observers[0].callback();
    assert.equal(main.confirm, firstConfirm);
    assert.equal(main.alert, replacementAlert);
    assert.equal(frameEvents.length, 1);
    main.confirm = () => false;
    observers[0].callback();
    assert.notEqual(main.confirm, firstConfirm);
    frameEvents[0][1]();
    assert.equal(frameEvents.length, 1);
    assert.equal(mainEvents.length, 0);
  },
);
check("dialog", "reply observation fallback and frame-load raw error boundary", () => {
  const f = dialogFixture(),
    raw = new Error("reply getter failed");
  let reads = 0;
  f.respond({
    handled: true,
    get value() {
      if (++reads === 2) throw raw;
      return true;
    },
  });
  assert.deepEqual(
    plain(f.exposed.__knorviaEmbeddedBrowserJavaScriptDialog__.show("confirm", "x")),
    { handled: false },
  );
  assert.equal(reads, 2);
});
check("dialog", "frame-load raw error boundary and deferred document readiness", () => {
  const f = dialogFixture(),
    raw = new Error("frame getter failed");
  const frameEvents = [],
    events = [],
    observed = [];
  let throwFrame = false;
  const frame = {
    get contentWindow() {
      if (throwFrame) throw raw;
      return undefined;
    },
    addEventListener: (...args) => frameEvents.push(args),
  };
  const main = {
    alert() {},
    confirm() {
      return true;
    },
    document: { documentElement: undefined, querySelectorAll: () => [frame] },
    addEventListener: (...args) => events.push(args),
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
      }
      observe(...args) {
        observed.push(args);
      }
    },
    __knorviaEmbeddedBrowserJavaScriptDialog__: { show: () => ({ handled: true }) },
  };
  vm.runInNewContext("(" + f.getExecute().func.toString() + ")(...args)", {
    window: main,
    args: f.getExecute().args,
    String,
    WeakMap,
    WeakSet,
  });
  assert.equal(events[0][0], "DOMContentLoaded");
  assert.deepEqual(plain(events[0][2]), { once: true });
  assert.equal(observed.length, 0);
  main.document.documentElement = {};
  events[0][1]();
  assert.equal(observed.length, 1);
  throwFrame = true;
  assert.throws(
    () => frameEvents[0][1](),
    (error) => error === raw,
  );
});
