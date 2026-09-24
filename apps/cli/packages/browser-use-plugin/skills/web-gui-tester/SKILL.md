---
name: web-gui-tester
description: Verify a website or local web application through observed browser interactions and visual evidence.
---

# Web interface verification

Every execution cell starts fresh. Import the absolute `scripts/browser-client.mjs` file from this plugin root with `await import(...)`, then call `await setupBrowserRuntime({globals:globalThis})`. Use the returned module export for setup; never assume an earlier cell left bindings behind. Select a browser from the actual host registry and read `await browser.documentation()` before interaction.

Start from the requested behaviors and acceptance criteria. Confirm the intended URL and test data. Use existing development commands only when authorized and preserve any already-running service.

Follow docs/workflow.md to inspect and target controls. Verify the happy path, an invalid input, an empty state and recovery from a failed action where relevant. Check keyboard focus and narrow layouts when requested. Use screenshots for visual assertions and DOM observations for semantic assertions.

Record expected versus observed results, the exact failing action, and supporting evidence. A source-code review or successful build is not a browser test. Do not execute paid inference, log into accounts, submit messages or change production data merely to complete a test; use the authorized local fixture. State skipped scenarios and missing dependencies explicitly.
