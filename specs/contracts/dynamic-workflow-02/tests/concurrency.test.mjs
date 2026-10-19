// SPDX-License-Identifier: Apache-2.0
// B24 自适应并发控制器（AIMD 状态机 · epoch 批次阻尼 · lastGood 探测退回 · 空闲重置）。
//
// 这一族的纪律是「纯」：控制器不读时钟、不做 I/O，`now` 由调用方喂。所以每个测试都自己
// 拿一个整数当时间，并且顺手钉一条「同样的信号序列得到同样的 cap/epoch/事件」——这是
// 纯状态的等价判据，也是新实现能被这套测试验收的前提。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dw } from "./entry.mjs";

const { ConcurrencyController } = dw;

const KEY = "deepseek/deepseek-chat";
/** 起步天花板：够大到能连砍几刀才见地板。 */
const CEILING = 8;
/** 时间轴起点离「空闲」足够远，正常信号不会误触发重置。 */
const T0 = 1_000;
/** 空闲门槛：见 CONCURRENCY_IDLE_RESET_MS（值本身由 pure.test.mjs 钉住）。 */
const IDLE = 300_000;

function make(ceiling = CEILING) {
  return new ConcurrencyController(KEY, ceiling);
}

/** 一次完整的「准入 → 成功」往返，返回控制器给出的变化列表。 */
function ok(c, now = T0) {
  const epoch = c.admitted(now);
  return c.succeeded(now, epoch);
}

/** 一次完整的「准入 → 被限流」往返。 */
function throttle(c, reason = "rate_limited", retryAfterMs, now = T0) {
  const epoch = c.admitted(now);
  return c.throttled(now, epoch, reason, retryAfterMs);
}

/** 取快照的几个字段（可选键缺席即 undefined，键仍然在场，断言才写得动）。 */
function pick(c, fields) {
  const snap = c.snapshot();
  const out = {};
  for (const field of fields) out[field] = snap[field];
  return out;
}

function cap(c) {
  return c.snapshot().cap;
}

describe("B24 初始状态与闸门", () => {
  it("构造即天花板起步，可选键缺席", () => {
    const c = make();
    assert.deepEqual(c.snapshot(), {
      cap: CEILING,
      ceiling: CEILING,
      epoch: 0,
      inFlight: 0,
      key: KEY,
      successStreak: 0,
      waiters: 0,
    });
    assert.equal(c.key, KEY);
    assert.equal(c.ceiling, CEILING);
  });

  it("闸门只看 inFlight 与 cooldown，不做空闲重置", () => {
    const c = make();
    assert.equal(c.canAdmit(T0), true);
    c.admitted(T0);
    assert.equal(c.canAdmit(T0), true);
    for (let i = 0; i < CEILING - 1; i += 1) c.admitted(T0);
    assert.equal(c.snapshot().inFlight, CEILING);
    assert.equal(c.canAdmit(T0), false);
    // 一小时后仍满员：canAdmit 不碰状态，cap 也不回天花板（重置是 observe/信号入口的事）。
    const before = c.snapshot();
    assert.equal(c.canAdmit(T0 + 10 * 60 * 60 * 1000), false);
    assert.deepEqual(c.snapshot(), before);
  });

  it("Retry-After 期间闸门关闭，到点即放行", () => {
    const c = make();
    const changes = throttle(c, "rate_limited", 5_000);
    assert.equal(c.snapshot().cooldownUntil, T0 + 5_000);
    assert.equal(changes[0].cooldownMs, 5_000);
    assert.equal(c.canAdmit(T0), false);
    assert.equal(c.canAdmit(T0 + 4_999), false);
    assert.equal(c.canAdmit(T0 + 5_000), true);
  });

  it("admitted 返回它所属的 epoch，并记下请求时刻", () => {
    const c = make();
    assert.equal(c.admitted(T0), 0);
    assert.equal(c.admitted(T0 + 1), 0);
    throttle(c, "rate_limited");
    assert.equal(c.snapshot().epoch, 1);
    assert.equal(c.admitted(T0 + 2), 1);
    assert.deepEqual(pick(c, ["lastRequestAt"]), { lastRequestAt: T0 + 2 });
  });

  it("admitted 自己不做空闲检查：陈旧的一档要由 observe/waiters 抬回天花板", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    assert.equal(c.admitted(T0 + IDLE), 1);
    assert.deepEqual(pick(c, ["cap", "epoch", "inFlight", "lastRequestAt"]), {
      cap: 6,
      epoch: 1,
      inFlight: 1,
      lastRequestAt: T0 + IDLE,
    });
    assert.deepEqual(c.observe(T0 + IDLE), []);
  });
});

describe("B24 乘性减少", () => {
  it("0.75 系数逐档下取整，直到地板 1", () => {
    const c = make();
    const seen = [];
    for (let i = 0; i < 6; i += 1) {
      throttle(c, "rate_limited", undefined, T0 + i);
      seen.push(cap(c));
    }
    assert.deepEqual(seen, [6, 4, 3, 2, 1, 1]);
  });

  it("减档事件带 lastBad（旧 cap 被记为坏水位）", () => {
    const c = make();
    assert.deepEqual(throttle(c, "provider_overloaded", undefined, T0), [
      { key: KEY, lastBad: 8, next: 6, previous: 8, reason: "provider_overloaded" },
    ]);
    assert.deepEqual(throttle(c, "offpeak_queued", undefined, T0 + 1), [
      { key: KEY, lastBad: 6, next: 4, previous: 6, reason: "offpeak_queued" },
    ]);
  });

  it("已在地板且无 Retry-After：cap 不动也不发事件，但仍然翻页 epoch", () => {
    const c = make(1);
    assert.equal(c.snapshot().epoch, 0);
    assert.deepEqual(throttle(c, "rate_limited", undefined, T0), []);
    assert.deepEqual(pick(c, ["cap", "epoch", "lastBad", "lastGood"]), {
      cap: 1,
      epoch: 1,
      lastBad: 1,
      lastGood: undefined,
    });
  });

  it("同一档限流带上 Retry-After 就必须让 run 头知道冷却", () => {
    const c = make(1);
    assert.deepEqual(throttle(c, "rate_limited", 2_000, T0), [
      { cooldownMs: 2_000, key: KEY, lastBad: 1, next: 1, previous: 1, reason: "rate_limited" },
    ]);
  });

  it("旧 epoch 的 429 评价的是已被砍掉的 cap：不动 cap、不发事件", () => {
    const c = make();
    const staleEpoch = c.admitted(T0);
    throttle(c, "rate_limited", undefined, T0 + 1);
    const afterFirst = c.snapshot();
    const changes = c.throttled(T0 + 2, staleEpoch, "rate_limited", undefined);
    assert.deepEqual(changes, []);
    assert.deepEqual(pick(c, ["cap", "epoch", "successStreak", "inFlight"]), {
      cap: afterFirst.cap,
      epoch: afterFirst.epoch,
      inFlight: 0,
      successStreak: 0,
    });
  });

  it("旧 epoch 的 429 仍然清 streak 并吃下 Retry-After", () => {
    const c = make();
    const stale = c.admitted(T0);
    throttle(c, "rate_limited", undefined, T0 + 1);
    for (let i = 0; i < 3; i += 1) ok(c, T0 + 2 + i);
    assert.equal(c.snapshot().successStreak, 3);
    c.waiters(T0 + 5, 2);
    assert.deepEqual(c.throttled(T0 + 6, stale, "rate_limited", 1_000), []);
    assert.deepEqual(pick(c, ["successStreak", "cooldownUntil", "cap"]), {
      cap: 6,
      cooldownUntil: T0 + 6 + 1_000,
      successStreak: 0,
    });
  });

  it("旧 epoch 的成功不进 streak、不兑现 +1（批次阻尼的另一半）", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    c.waiters(T0 + 1, 5);
    for (let i = 0; i < 8; i += 1) {
      // 翻页前的 epoch 是 0；用它交回来的成功属于已被裁决掉的那一批。
      assert.deepEqual(c.succeeded(T0 + 2 + i, 0), []);
    }
    assert.deepEqual(pick(c, ["cap", "successStreak", "lastGood"]), {
      cap: 6,
      lastGood: undefined,
      successStreak: 0,
    });
  });
});

describe("B24 加性递增与 lastGood", () => {
  it("满 K 段成功 + 有等待者 + 未及天花板 → +1，并清零 streak", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    assert.equal(cap(c), 6);
    c.waiters(T0 + 1, 1);
    const changes = [];
    for (let i = 0; i < 4; i += 1) changes.push(...ok(c, T0 + 2 + i));
    assert.deepEqual(changes, [
      { key: KEY, lastBad: 8, lastGood: 6, next: 7, previous: 6, reason: "recovered" },
    ]);
    assert.equal(cap(c), 7);
    assert.equal(c.snapshot().successStreak, 0);
  });

  it("没有等待者时 streak 照涨但不兑现；等待者一到位下一次成功即升一档", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    for (let i = 0; i < 4; i += 1) assert.deepEqual(ok(c, T0 + 1 + i), []);
    assert.deepEqual(pick(c, ["cap", "successStreak", "lastGood"]), {
      cap: 6,
      lastGood: 6,
      successStreak: 4,
    });
    c.waiters(T0 + 5, 1);
    assert.deepEqual(ok(c, T0 + 6), [
      { key: KEY, lastBad: 8, lastGood: 6, next: 7, previous: 6, reason: "recovered" },
    ]);
    assert.equal(c.snapshot().successStreak, 0);
  });

  it("streak 差一个不兑现，够数那一次才兑现", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    c.waiters(T0 + 1, 3);
    for (let i = 0; i < 3; i += 1) assert.deepEqual(ok(c, T0 + 2 + i), []);
    assert.equal(c.snapshot().successStreak, 3);
    assert.deepEqual(ok(c, T0 + 5), [
      { key: KEY, lastBad: 8, lastGood: 6, next: 7, previous: 6, reason: "recovered" },
    ]);
  });

  it("到天花板就停：streak 继续累积但不再 +1", () => {
    const c = make(2);
    throttle(c, "rate_limited", undefined, T0);
    assert.equal(cap(c), 1);
    c.waiters(T0 + 1, 5);
    const ups = [];
    for (let i = 0; i < 12; i += 1) ups.push(...ok(c, T0 + 2 + i));
    assert.equal(cap(c), 2);
    assert.deepEqual(ups, [
      { key: KEY, lastBad: 2, lastGood: 1, next: 2, previous: 1, reason: "recovered" },
    ]);
    assert.ok(c.snapshot().successStreak >= 4);
  });

  it("lastGood 只由完成的 streak 设立：减 cap 不给自己发证书", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    assert.deepEqual(pick(c, ["lastGood", "lastBad"]), { lastBad: 8, lastGood: undefined });
  });

  it("在 lastGood 之上探测被限流 → 退回 lastGood，两值都写进事件", () => {
    const c = make();
    // 先把 cap 砍到 6 并证明它（4 次成功 + 等待者），随后一次成功的 +1 探测到 7。
    throttle(c, "rate_limited", undefined, T0);
    c.waiters(T0 + 1, 1);
    for (let i = 0; i < 4; i += 1) ok(c, T0 + 2 + i);
    assert.equal(cap(c), 7);
    assert.equal(c.snapshot().lastGood, 6);
    const probe = c.admitted(T0 + 6);
    const changes = c.throttled(T0 + 7, probe, "rate_limited");
    assert.deepEqual(changes, [
      { key: KEY, lastBad: 7, lastGood: 6, next: 6, previous: 7, reason: "rate_limited" },
    ]);
    assert.equal(cap(c), 6);
    // 退回档不证伪 lastGood：它还在场，下一刀仍然按「回已知水位」处理。
    assert.equal(c.snapshot().lastGood, 6);
  });

  it("cap 恰好在 lastGood 上（墙没下移也不算探测）：按系数减并清掉被证伪的 lastGood", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    // 没有等待者：streak 走满把 6 证明为 lastGood，但 cap 停在 6。
    for (let i = 0; i < 4; i += 1) assert.deepEqual(ok(c, T0 + 1 + i), []);
    assert.deepEqual(pick(c, ["cap", "lastGood"]), { cap: 6, lastGood: 6 });
    assert.deepEqual(throttle(c, "rate_limited", undefined, T0 + 6), [
      { key: KEY, lastBad: 6, next: 4, previous: 6, reason: "rate_limited" },
    ]);
    assert.equal(c.snapshot().lastGood, undefined);
  });

  it("退回 lastGood 那一档之外的副作用照旧：翻 epoch、吃 cooldown、留下 lastRequestAt", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    c.waiters(T0 + 1, 1);
    for (let i = 0; i < 4; i += 1) ok(c, T0 + 2 + i);
    const epochBefore = c.snapshot().epoch;
    const probe = c.admitted(T0 + 6);
    c.throttled(T0 + 7, probe, "rate_limited", 1_500);
    assert.deepEqual(pick(c, ["epoch", "cooldownUntil", "lastRequestAt"]), {
      cooldownUntil: T0 + 7 + 1_500,
      epoch: epochBefore + 1,
      lastRequestAt: T0 + 6,
    });
  });

  it("升档不翻页 epoch：只有 429 与重置才翻", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    const epoch = c.snapshot().epoch;
    c.waiters(T0 + 1, 2);
    for (let i = 0; i < 4; i += 1) ok(c, T0 + 2 + i);
    assert.equal(c.snapshot().epoch, epoch);
  });
});

describe("B24 其它信号", () => {
  it("瞬态失败：inFlight-- 与清 streak，cap 一律不动", () => {
    const c = make();
    c.admitted(T0);
    ok(c, T0 + 1);
    assert.equal(c.snapshot().successStreak, 1);
    assert.deepEqual(c.failedTransient(T0 + 2), []);
    assert.deepEqual(pick(c, ["cap", "inFlight", "successStreak"]), {
      cap: CEILING,
      inFlight: 0,
      successStreak: 0,
    });
  });

  it("永久失败/取消（ended）只做 inFlight--，不清 streak", () => {
    const c = make();
    c.admitted(T0);
    ok(c, T0 + 1);
    c.admitted(T0 + 2);
    assert.deepEqual(c.ended(T0 + 3), []);
    assert.deepEqual(pick(c, ["inFlight", "successStreak", "cap"]), {
      cap: CEILING,
      inFlight: 1,
      successStreak: 1,
    });
    assert.deepEqual(c.ended(T0 + 4), []);
    assert.equal(c.snapshot().inFlight, 0);
  });

  it("inFlight 有下限 0：多余的终结信号不把它写成负数", () => {
    const c = make();
    for (let i = 0; i < 5; i += 1) assert.deepEqual(c.ended(T0 + i), []);
    assert.equal(c.snapshot().inFlight, 0);
    assert.deepEqual(c.succeeded(T0 + 6, 0), []);
    assert.equal(c.snapshot().inFlight, 0);
  });

  it("Retry-After 不合法（0 / 负数 / 缺席）即没有 cooldown", () => {
    for (const retryAfterMs of [undefined, 0, -1]) {
      const c = make();
      throttle(c, "rate_limited", retryAfterMs, T0);
      assert.equal("cooldownUntil" in c.snapshot(), false, String(retryAfterMs));
      assert.equal(c.canAdmit(T0), true);
    }
  });

  it("cooldown 取更晚者，不被更早的 Retry-After 往回拉", () => {
    const c = make();
    throttle(c, "rate_limited", 10_000, T0);
    throttle(c, "rate_limited", 1_000, T0 + 2);
    assert.equal(c.snapshot().cooldownUntil, T0 + 10_000);
    const changes = throttle(c, "rate_limited", 40_000, T0 + 3);
    assert.equal(c.snapshot().cooldownUntil, T0 + 40_003);
    assert.ok(changes.some((change) => change.cooldownMs === 40_000));
  });

  it("等待者数非负，负数按 0 记", () => {
    const c = make();
    c.waiters(T0, -5);
    assert.equal(c.snapshot().waiters, 0);
    c.waiters(T0 + 1, 3);
    assert.equal(c.snapshot().waiters, 3);
  });

  it("observe 只做空闲检查：不碰计数，到点才带回一条 idle_reset", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    assert.deepEqual(c.observe(T0 + 1), []);
    assert.deepEqual(pick(c, ["inFlight", "successStreak", "waiters"]), {
      inFlight: 0,
      successStreak: 0,
      waiters: 0,
    });
    assert.deepEqual(c.observe(T0 + IDLE), [
      { key: KEY, next: CEILING, previous: 6, reason: "idle_reset" },
    ]);
  });

  it("信号只经 now 参数读时间：同一串信号重放得到同一份状态", () => {
    const script = (c) => {
      const out = [];
      out.push(...throttle(c, "rate_limited", 2_000, 1_000));
      out.push(...ok(c, 1_001));
      c.waiters(1_002, 4);
      for (let i = 0; i < 4; i += 1) out.push(...ok(c, 1_003 + i));
      out.push(...c.failedTransient(1_010));
      out.push(...throttle(c, "provider_overloaded", undefined, 1_011));
      return out;
    };
    const a = make();
    const b = make();
    const eventsA = script(a);
    const eventsB = script(b);
    assert.deepEqual(eventsB, eventsA);
    assert.deepEqual(b.snapshot(), a.snapshot());
    // 重放里确实有事件与一个非天花板的 cap（探测到 7 后被第二刀退回已知水位 6），不是空断言。
    assert.ok(eventsA.length > 0);
    assert.equal(a.snapshot().cap, 6);
  });
});

describe("B24 空闲重置", () => {
  it("空闲恰好到点才重置，差 1ms 不算", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    assert.deepEqual(c.observe(T0 + IDLE - 1), []);
    assert.equal(cap(c), 6);
    assert.deepEqual(c.observe(T0 + IDLE), [
      { key: KEY, next: CEILING, previous: 6, reason: "idle_reset" },
    ]);
    assert.equal(cap(c), CEILING);
  });

  it("还有请求在飞就不算空闲", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    c.admitted(T0 + 1);
    assert.deepEqual(c.observe(T0 + 1 + IDLE), []);
    assert.equal(cap(c), 6);
  });

  it("没有请求过的控制器不会被重置（lastRequestAt 缺席）", () => {
    const c = make();
    assert.deepEqual(c.observe(T0 + 10 * IDLE), []);
    assert.deepEqual(c.ended(T0 + 10 * IDLE), []);
    assert.deepEqual(c.snapshot(), {
      cap: CEILING,
      ceiling: CEILING,
      epoch: 0,
      inFlight: 0,
      key: KEY,
      successStreak: 0,
      waiters: 0,
    });
  });

  it("重置清掉 streak / cooldown / lastGood / lastBad 并翻页 epoch，但保留 lastRequestAt", () => {
    const c = make();
    throttle(c, "rate_limited", 5_000, T0);
    c.waiters(T0 + 1, 2);
    for (let i = 0; i < 4; i += 1) ok(c, T0 + 2 + i);
    assert.deepEqual(pick(c, ["cooldownUntil", "lastGood", "lastBad"]), {
      cooldownUntil: T0 + 5_000,
      lastBad: 8,
      lastGood: 6,
    });
    const epochBefore = c.snapshot().epoch;
    c.observe(T0 + IDLE + 10);
    assert.deepEqual(c.snapshot(), {
      cap: CEILING,
      ceiling: CEILING,
      epoch: epochBefore + 1,
      inFlight: 0,
      key: KEY,
      lastRequestAt: T0 + 5,
      successStreak: 0,
      waiters: 2,
    });
  });

  it("幂等：已经回到天花板且状态干净时，后续空闲信号不再翻页也不发事件", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    assert.equal(c.observe(T0 + IDLE).length, 1);
    const after = c.snapshot();
    assert.deepEqual(c.observe(T0 + 2 * IDLE), []);
    assert.deepEqual(c.ended(T0 + 3 * IDLE), []);
    assert.deepEqual(c.snapshot(), after);
  });

  it("cap 已在天花板但状态脏：清状态、翻页，但不发事件（数值没变）", () => {
    const c = make();
    c.waiters(T0, 1);
    for (let i = 0; i < 4; i += 1) ok(c, T0 + 1 + i);
    assert.equal(cap(c), CEILING);
    assert.equal(c.snapshot().lastGood, CEILING);
    const epochBefore = c.snapshot().epoch;
    assert.deepEqual(c.observe(T0 + IDLE + 10), []);
    assert.deepEqual(pick(c, ["epoch", "lastGood", "successStreak"]), {
      epoch: epochBefore + 1,
      lastGood: undefined,
      successStreak: 0,
    });
  });

  it("一次信号里空闲重置与 cap 裁决互斥：重置翻走的 epoch 把这批 429 挡成陈旧", () => {
    const c = make();
    throttle(c, "rate_limited", undefined, T0);
    assert.equal(cap(c), 6);
    const epoch = c.snapshot().epoch;
    // 在飞已归零、lastRequestAt 仍是 T0：信号入口先做空闲检查。
    assert.deepEqual(c.throttled(T0 + IDLE, epoch, "rate_limited"), [
      { key: KEY, next: CEILING, previous: 6, reason: "idle_reset" },
    ]);
    assert.equal(cap(c), CEILING);
    assert.equal(c.snapshot().lastBad, undefined);
  });

  it("任一信号都会顺带做空闲检查，不只是 observe", () => {
    const withWaiters = make();
    throttle(withWaiters, "rate_limited", undefined, T0);
    assert.deepEqual(withWaiters.waiters(T0 + IDLE, 1), [
      { key: KEY, next: CEILING, previous: 6, reason: "idle_reset" },
    ]);
    assert.equal(cap(withWaiters), CEILING);

    const withTransient = make();
    throttle(withTransient, "rate_limited", undefined, T0);
    assert.equal(withTransient.failedTransient(T0 + IDLE).length, 1);
    assert.equal(cap(withTransient), CEILING);

    const withEnded = make();
    throttle(withEnded, "rate_limited", undefined, T0);
    assert.equal(withEnded.ended(T0 + IDLE).length, 1);
    assert.equal(cap(withEnded), CEILING);
  });

  it("重置后的第一次限流按天花板重算，而不是从地板继续砍", () => {
    const c = make();
    for (let i = 0; i < 6; i += 1) throttle(c, "rate_limited", undefined, T0 + i);
    assert.equal(cap(c), 1);
    assert.equal(c.ended(T0 + IDLE + 10).length, 1);
    assert.equal(cap(c), CEILING);
    throttle(c, "rate_limited", undefined, T0 + IDLE + 20);
    assert.equal(cap(c), 6);
  });
});

describe("B24 reason 词汇表", () => {
  it("三种限流原因都动 cap，recovered 与 idle_reset 由控制器自己命名", () => {
    for (const reason of ["rate_limited", "provider_overloaded", "offpeak_queued"]) {
      const c = make();
      assert.deepEqual(throttle(c, reason, undefined, T0)[0].reason, reason);
      assert.equal(cap(c), 6);
    }
    const up = make();
    throttle(up, "rate_limited", undefined, T0);
    up.waiters(T0 + 1, 1);
    let recovered;
    for (let i = 0; i < 4; i += 1) {
      const changes = ok(up, T0 + 2 + i);
      if (changes.length > 0) recovered = changes[0];
    }
    assert.equal(recovered.reason, "recovered");
    const idle = make();
    throttle(idle, "rate_limited", undefined, T0);
    assert.equal(idle.observe(T0 + IDLE)[0].reason, "idle_reset");
  });

  it("change 固定带 {key, previous, next, reason}，lastGood/lastBad/cooldownMs 只在有值时在场", () => {
    const down = make();
    assert.deepEqual(Object.keys(throttle(down, "rate_limited", undefined, T0)[0]).sort(), [
      "key",
      "lastBad",
      "next",
      "previous",
      "reason",
    ]);

    const clean = make();
    throttle(clean, "rate_limited", 1_000, T0);
    // 重置把 cooldown / lastGood / lastBad 一起清掉，那条事件就只剩四个固定键。
    assert.deepEqual(Object.keys(clean.observe(T0 + IDLE)[0]).sort(), [
      "key",
      "next",
      "previous",
      "reason",
    ]);

    const both = make();
    throttle(both, "rate_limited", 1_000, T0);
    both.waiters(T0 + 1, 1);
    let raised;
    for (let i = 0; i < 4; i += 1) {
      const changes = ok(both, T0 + 2 + i);
      if (changes.length > 0) raised = changes[0];
    }
    // 升档由 succeeded 发出，它自己不产 cooldownMs：cooldown 已过期与否都不写进这条事件。
    assert.deepEqual(Object.keys(raised).sort(), [
      "key",
      "lastBad",
      "lastGood",
      "next",
      "previous",
      "reason",
    ]);
    assert.equal(raised.lastGood, 6);
    assert.equal(raised.next, 7);
  });

  it("冷却中的快照把四个可选键一次摆齐", () => {
    const c = make();
    throttle(c, "rate_limited", 2_000, T0);
    assert.deepEqual(c.snapshot(), {
      cap: 6,
      ceiling: CEILING,
      cooldownUntil: T0 + 2_000,
      epoch: 1,
      inFlight: 0,
      key: KEY,
      lastBad: 8,
      lastRequestAt: T0,
      successStreak: 0,
      waiters: 0,
    });
  });
});
