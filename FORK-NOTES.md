# Knorvia Studio

Freshly cloned on 2026-09-22 from https://github.com/zai-org/ZCode.git, commit `872ad960de7ec172591f7e1952f7849229f94521`.

The owner discarded the previous customized repository and its multi-engine collaboration implementation; none of that code was copied back. This fork preserves the original GUI layout, components, interactions and agent loop.

## Clean base (2026-09-22, `specs/knorvia-clean-base.md`)

- Knorvia Studio application identity and the owner's supplied icon.
- Removal of upstream product sign-in, account recovery, subscription/payment, upstream cloud account services, product update and automatic product telemetry.
- Direct, user-configured model APIs and generic third-party MCP authorization remain available.
- Separate Knorvia environment/configuration/credentials/cache/storage namespaces. No automatic import of ZCode state.
- Knorvia identity in runtime prompts, while keeping permissions, tool contracts and safety instructions.

## Later owner-authorized additions

Each addition is specified in `specs/` and reimplemented inside the original GUI, not restored from the discarded repository:

- Knorvia black-and-white visual language (`specs/knorvia-visual-language.md`).
- Local CLI kernels, group chats and workflows backed by a Host-owned Studio runtime (`specs/knorvia-backend.md`, `specs/knorvia-cli-expansion.md`, `specs/knorvia-ssh-agents.md`).
- Image and video creation (`specs/knorvia-creation.md`), workflow templates and scheduling, workspace diff review, session handoff and export.
- Rewritten built-in plugins (`specs/knorvia-builtin-plugins.md`).

Apache-2.0, upstream NOTICE and third-party attribution are retained. Workspace packages are named `@knorvia/*`; remaining internal ZCode identifiers in source (protocol and compatibility names) are implementation details, not the app's name or state location. This is an independent modification, not an official upstream release.

This file records intended scope; the acceptance reports in `docs/` record actual build/test results and remaining limitations.
