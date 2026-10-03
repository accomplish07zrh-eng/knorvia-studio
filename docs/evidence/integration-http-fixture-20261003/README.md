# Unified HTTP retained-fixture repair

Production HTTP assembly was already present at unified source
`902e35c6dbcfa4b829270352fecf03ebc07b219f`. The retained VM lifecycle fixture
failed before its transport assertions because it had no explicit
`./httpWindowController.js` port. After adding that port, the production
`server.once("close")` also requires an event-capable synthetic server.

Checked fixture/spec commit: `bf86b79ac819ac7f53e0afa36ec18cf9e7c1c9ac`. The repair only supplies an
explicit no-controller assembly for the agent-only transport collection and a
Node EventEmitter server. All 46 previous assert calls, six test names and the
loader's rejection of unknown dependencies are unchanged. Two assembly argument
assertions are added. There is no production, protocol, UI or data change.

[The actual scoped run](http-fixture-and-controller.tap) uses the six retained
lifecycle cases and the three unchanged production HTTP/WebSocket/RPC controller
contracts: **9 tests / 9 pass / 0 fail / 0 skip**, actual exit0. The latter uses
real loopback sockets, production assembly and controller, shared projections,
isolated attachments, source writes/rejections and existing/file-only service
boundaries with a synthetic task source. It is not a stub-only controller test.
The denied remote task address deliberately logs an RPC FAIL and rejects; this is
asserted behavior, not a promise of an error-free console.

[Validation](validation.json) records exact commands, bytes, source blobs and the
assertion-preservation comparison. The prior local reproduction actually exited1
with 5 pass/1 fail; its terminal output was observed but not saved as a raw file.
Raw older CI failures remain in run37123232166 and the recorded two job IDs.
Scoped lint/format and changed-file architecture checks actually passed. Root
checks and native Windows are left to the latest unified two-platform CI;
previous full-suite failures are not relabelled passed. GUI, actual Agent Host
exit and final distribution artifacts require their separate acceptance.
Apache, third-party obligations and historical evidence remain unchanged.
