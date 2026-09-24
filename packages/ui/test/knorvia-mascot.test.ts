import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceSpring,
  canAnimateMascot,
  mascotTarget,
  type MascotInput,
} from "../src/components/knorvia/mascotMotion.js";
import {
  createMascotPreferenceStore,
  MASCOT_PREFERENCE_KEY,
} from "../src/store/mascotPreferenceStore.js";

const input: MascotInput = {
  time: 1,
  gazeX: 0,
  gazeY: 0,
  focused: false,
  typing: false,
  hovered: false,
  resting: false,
  blink: 0,
  reactionAge: -1,
  reaction: 0,
};

test("spring motion has the same position and velocity at 30, 60 and 120 Hz", () => {
  const samples = [30, 60, 120].map((fps) => {
    const axis = { value: -5, velocity: 12 };
    for (let n = 0; n < fps; n++) advanceSpring(axis, 7, 1 / fps);
    return axis;
  });
  for (const axis of samples) {
    assert.ok(Math.abs(axis.value - samples[0]!.value) < 1e-8);
    assert.ok(Math.abs(axis.velocity - samples[0]!.velocity) < 1e-8);
    assert.ok(Math.abs(axis.value - 7) < 0.001);
  }
});

test("interrupting a gesture preserves its current position and does not overshoot unboundedly", () => {
  const axis = { value: 0, velocity: 0 };
  for (let n = 0; n < 8; n++) advanceSpring(axis, -8, 1 / 60);
  const before = axis.value;
  advanceSpring(axis, 0, 1 / 60);
  assert.ok(Math.abs(axis.value - before) < 1);
  for (let n = 0; n < 120; n++) advanceSpring(axis, 0, 1 / 60);
  assert.ok(Math.abs(axis.value) < 0.0001);
});

test("a delayed frame is bounded and cannot launch the head off the card", () => {
  const long = { value: 0, velocity: 0 };
  const bounded = { value: 0, velocity: 0 };
  advanceSpring(long, 9, 300);
  advanceSpring(bounded, 9, 0.05);
  assert.deepEqual(long, bounded);
  advanceSpring(long, 9, -1);
  assert.deepEqual(long, bounded);
});

test("pointer excursion is clamped and typing directs eyes toward the composer", () => {
  assert.deepEqual(
    mascotTarget({ ...input, gazeX: 900, gazeY: -400 }),
    mascotTarget({ ...input, gazeX: 1, gazeY: -1 }),
  );
  const focused = mascotTarget({ ...input, gazeX: -1, gazeY: -1, focused: true, typing: true });
  assert.ok(focused.eyeX < 0 && focused.eyeY < 0);
  assert.ok(focused.leftEye > 0 && focused.leftEye < 1);
});

test("reaction ends cleanly and all eyelids remain valid throughout its duration", () => {
  assert.deepEqual(mascotTarget({ ...input, reactionAge: 2 }), mascotTarget(input));
  for (let reaction = 0; reaction < 3; reaction++)
    for (let age = 0; age < 2; age += 0.01) {
      const pose = mascotTarget({ ...input, reactionAge: age, reaction, blink: 1 });
      assert.ok(Object.values(pose).every(Number.isFinite));
      assert.ok(pose.leftEye > 0 && pose.rightEye > 0);
    }
});

test("wink and smile shapes stay continuous when a reaction crosses a phase boundary", () => {
  for (let age = 0.01; age < 2; age += 0.005) {
    const previous = mascotTarget({ ...input, reaction: 1, reactionAge: age - 0.0001 });
    const next = mascotTarget({ ...input, reaction: 1, reactionAge: age });
    assert.ok(Math.abs(next.leftEye - previous.leftEye) < 0.005);
    assert.ok(Math.abs(next.smile - previous.smile) < 0.005);
  }
});

test("only visible, in-view, animated companions may schedule frames", () => {
  for (const mode of ["animated", "still", "hidden"]) {
    for (const reduced of [true, false])
      for (const visible of [true, false])
        for (const inView of [true, false]) {
          assert.equal(
            canAnimateMascot(mode, reduced, visible, inView),
            mode === "animated" && !reduced && visible && inView,
          );
        }
  }
});

test("appearance preference persists independently from chat drafts and restores", () => {
  const values = new Map<string, string>([["user-draft", "preserve"]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const store = createMascotPreferenceStore(storage);
  assert.equal(store.getState().mode, "animated");
  store.getState().setMode("hidden");
  assert.equal(values.get(MASCOT_PREFERENCE_KEY), "hidden");
  assert.equal(createMascotPreferenceStore(storage).getState().mode, "hidden");
  assert.equal(values.get("user-draft"), "preserve");
});

test("unavailable storage applies the choice without pretending it was saved", () => {
  const store = createMascotPreferenceStore({
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("quota");
    },
  });
  store.getState().setMode("still");
  assert.equal(store.getState().mode, "still");
  assert.equal(store.getState().saveFailed, true);
});
