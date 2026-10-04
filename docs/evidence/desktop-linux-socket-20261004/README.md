# Linux owned temporary socket diagnosis, 2026-10-04

Actual package source36d944b4e6290175dafba9607c0031c8c2e39d3f reused unchanged by
probe3a6b7435a3cddd4dee148aabfe6e6f3db1af328c in37180851173. Raw artifact
11294133803 JSON/PNG/strace are copied byte-for-byte. Main3647 received native
SIGTRAP pre-window at05:48:36.354059UTC; login-shell child exited0. Xvfb PNG is
blank. This is not proof of a modal error, slow login shell, or early bootstrap.

Three raw synthetic fixture experiments used official Electron41.0.3 Linuxx64,
ZIP SHA256 ca1a4963ef855f67afd34033ccfe4ca4cc986e5b58a77c2d0cf88ff3fc9933ee,
verified against official release checksums; Node24.14.0 and private Xvfb,
using the exact source3a state expression frozen here. The fixture initializes
only its own synthetic userData/data-owner environment; no real Knorvia profile
is copied. Raw harnesses read worktree source at invocation, so reproduce with
the expression saved here, not an arbitrary later head.

- Initial singleinstance experiment:149-byte TMPDIR + actual
  app.requestSingleInstanceLock failed; two20-byte owned TMPDIR cases created
  real windows and normal exit[0,null]. It has3iterations (the inherited
  mode-dependent loop), not2; raw harness/report preserved unchanged.
- Confirm experiment: exactly95-byte TMPDIR matching the hosted trace path,
  actual single-instance API, observed natural exit[null,SIGTRAP].20-byte case
  changed only its exclusively owned TMPDIR, created ready window and exited0.
- Control:95-byte TMPDIR, same fixture without single-instance request,
  created ready window and normal exit0. This isolates the temporary-directory
  condition at the Linux single-instance socket API boundary.

The correction changes only probe temporary sockets/extraction to exclusively
owned short /tmp/knv-* directories, removes those after owned termination and
fails cleanup errors. Original portable launcher, spaced path and persistent
profile/data are unchanged. Application bytes, single-instance feature,
window/version/path/persistence/normal-exit assertions and deadlines remain.
Actual reused Knorvia package acceptance is still required; these synthetic
experiments are not complete package, human GUI or migration acceptance.
No source/rights or license conclusion is promoted by this packet.
