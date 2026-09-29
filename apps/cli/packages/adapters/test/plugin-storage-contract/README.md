# Plugin storage contract tests

This directory contains the permanent, offline 249-case plugin storage/source contract.

The immediate parent entry `plugin-storage-contract.test.ts` registers two top-level Node tests:

- source contract: 249 internal cases against `src/plugins/*.ts`;
- CLI dist contract: the same 249 internal cases against the exact built `dist/plugins/*.js` files.

The two groups run sequentially. They are two Node tests containing 249 contract cases each; they are not 498 newly registered Node tests.

The dist target never falls back to source and never builds during a test. Run `pnpm build:cli-packages` before `pnpm test:studio`; CI already uses this order.

For a targeted diagnostic run from the repository root:

```text
node apps/cli/packages/adapters/test/plugin-storage-contract/tools/run-target.mjs --target source
node apps/cli/packages/adapters/test/plugin-storage-contract/tools/run-target.mjs --target dist
```

Each target has a 30-minute outer bound. Existing per-case timeouts remain 15 seconds by default with the same explicit case overrides used by the accepted suite. All filesystem writes are confined to the test data root or an OS temporary directory. Network and real Git/process effects remain closed behind owned seams.
