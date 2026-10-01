# Bounded untracked line statistics

Baseline4959ec0ef6fd2d4b21b41b7728a1b48f8b6857ec. Own only
countUntrackedFileLines/buildUntrackedStats bodies in gitCliHelpers.ts. Freeze
the exact source-exposed declarations before implementation; protect every
accepted helper, declaration, read plan, status/cache owner and command policy.

- Await stat, reject nonfiles/size > 1048576 with zero, then open(path,"r").
  Stat/open errors propagate from the private counter; the builder maps them
  to {added:0,removed:0}. Read(buffer,0,length,null) reuses the supplied buffer.
  Length is min(buffer.length,remaining budget plus one probe byte). At the exact
  cap, one further read detects growth. An oversized read returns zero before
  byte inspection. Inspect only bytesRead bytes; stale tail bytes are irrelevant.
- NUL yields zero. Count LF bytes without decoding or CR normalization; nonempty
  text ending without LF adds one. Empty/EOF starts with no trailing-byte charge.
  Preserve short reads, binary across chunks, stat/read size disagreement and
  growth. Every acquired handle closes exactly once in finally, including read
  errors/binary/over-cap/EOF. A close error overrides the count/read error and
  produces zero in the builder. No close occurs when open fails or stat skips.
- Eagerly filter isUntracked in input order. At most four workers start in order;
  each owns one 65536-byte buffer for its entire sequential lifetime. One shared
  dispatch owner assigns each entry once; no second queue/cache/limiter. Resolve
  repoRoot plus path.split("/") as before. Preserve duplicates and literal/native
  path semantics. Successful keys are captured before the counter await; error
  fallback reads the entry key after failure. Record insertion follows completion,
  not input order; duplicate overwrites keep first insertion position. Input is
  not modified. Per-file failures do not abort remaining assignments.
- Preserve original await boundaries: counter stat/open/read/finally-close,
  worker count, builder Promise.all and unchanged getStatus await. Dispatch the
  next item only after the prior count and close settle. Keep queued/reentrant
  status reuse, invalidation and late completion through the actual owner. No
  cancellation, retry, threshold, permissions or command changes.

Use remaining-byte accounting and zero-copy chunk NUL/LF searches; workers share
one filtered-entry iterator and launch through an explicit bounded loop. Freeze
small fake stat/open/read/close contracts and real repo/service/RPC consumers.
All fixtures are owned synthetic data with reused small buffers, no user files
or actual processes. Focused source/actual-emitted and services-only type/owned
lint/format/architecture checks suffice. Root owns aggregate/native acceptance
and independent expression/licence review; no clean-room/MIT/publication grant.
