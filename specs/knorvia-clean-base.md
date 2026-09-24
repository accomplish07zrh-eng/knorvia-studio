# Knorvia Studio clean base

2026-09-22: the owner discarded the previous fork and all multi-engine collaboration changes. This checkout is freshly cloned from https://github.com/zai-org/ZCode at 872ad960de7ec172591f7e1952f7849229f94521. No discarded implementation is to be copied back.

## Scope

- Preserve upstream GUI layout, navigation, design tokens, composer, chat and native settings components. No replacement shell, collaboration dashboard, role management or workflow editor is introduced.
- A clean profile starts in the original light/white theme. Later explicit theme choices are preserved.
- Product name is Knorvia Studio. Use the owner's supplied K/robot image for application branding. Keep Apache-2.0, NOTICE and third-party attribution intact; internal package/protocol identifiers can remain compatible where they do not identify the product to users or share external state.
- Use a transparent cutout of the owner's supplied icon: preserve the K, robot, antenna and three light strokes; remove the dark photographic background. The owner's red outline is a selection guide and must not appear in the asset. Do not add a black tile, frame, border or decorative shadow. Native icon conversions must preserve alpha.
- Remove the upstream product account login implementation, callback registration, session restoration, credential exchange, payment/subscription surfaces and automatic account/model key provisioning. Never fake a logged-in user. Direct model/API-key configuration and third-party MCP authorization remain available.
- Remove connections to upstream product update, account, telemetry and remote configuration services. Do not rewrite those URLs to invented Knorvia servers.
- Isolate app identity, single-instance lock, protocol schemes, persistence, logs, browser profiles, temporary directories, credentials and runtime environment from ZCode. Do not import or change existing ZCode installations, credentials or data.
- Normal standalone app uses a Knorvia-owned profile; Windows portable uses a data directory beside the executable. The bundled agent uses that same selected data root. Never falls back to ~/.knorvia.
- Remote workspace attachment must not wait for removed product-account provisioning. Manual remote model configuration remains available.
- Windows portable packaging writes an explicit resources/knorvia-portable.json marker and ships as an unpacked folder with a directly runnable executable.
- Model-facing prompts use Knorvia identity while retaining tool instructions, permission boundaries and upstream license notices. Generic product-specific promotional instructions should be removed.

## Ownership and failure semantics

Main selects product identity and paths before session locks or child process startup. Host owns existing services and model settings. UI consumes existing hooks and services without inventing authentication state. CLI preserves upstream agent behavior and receives isolated runtime configuration. There is no new state owner or queue.

Launch -> Main chooses Knorvia profile -> Host opens Knorvia services -> original GUI opens workspace -> user configures a model -> existing agent runtime starts. Missing model configuration opens model settings or an actionable empty state, never product login. Invalid API keys remain honest provider errors.

## Acceptance

1. Fresh clone provenance recorded; discarded collaboration code absent.
2. Original GUI is intact, with Knorvia text/icon and no product sign-in/sign-out/account/pricing actions.
3. No product login service registered, callback routed, token restored, or upstream account/updater/telemetry request initiated. Generic external authorization is not confused with product login.
4. Model provider settings still accept user-supplied API credentials. No personal credentials are included in build artifacts or logs.
5. Separate app and portable profile; installed ZCode remains untouched.
6. Root typecheck, lint, architecture check, relevant removal/isolation tests, full desktop build and clean-profile launch. Report actual failures and unverified cases rather than claiming completion.
7. A desktop summary records the new source path and invalidates the old multi-engine plan. No new feature roadmap is implied.
