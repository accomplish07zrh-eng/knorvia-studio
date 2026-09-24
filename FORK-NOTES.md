# Knorvia Studio

Freshly cloned on 2026-09-22 from https://github.com/zai-org/ZCode.git, commit `872ad960de7ec172591f7e1952f7849229f94521`.

The owner discarded the previous customized repository and multi-engine collaboration implementation. This fork preserves the original GUI, agent loop and design system, with these limited changes:

- Knorvia Studio application identity and the owner's supplied icon.
- Removal of upstream product sign-in, account recovery, subscription/payment, upstream cloud account services, product update and automatic product telemetry.
- Direct, user-configured model APIs and generic third-party MCP authorization remain available.
- Separate Knorvia environment/configuration/credentials/cache/storage namespaces. No automatic import of ZCode state.
- Knorvia identity in runtime prompts, while keeping permissions, tool contracts and safety instructions.

Apache-2.0, upstream NOTICE and third-party attribution are retained. Internal `@zcode/*` package imports and source directory names are compatibility implementation details, not the app's name or state location. This is an independent modification, not an official upstream release.

This file records intended scope; the desktop verification report records actual build/test results and remaining limitations.
