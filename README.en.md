# Knorvia Studio

An independent clean base preserving the upstream GUI and agent runtime. Previous multi-engine collaboration changes have been discarded. This fork changes product identity and icons, removes product account login and account-backed cloud services, and isolates configuration, credentials, storage and runtime prompts.

Configure your own model endpoint and API key in the existing model settings. Windows portable data lives in the data directory beside the executable.

Use Node.js 24 and pnpm 10.33.2. Run pnpm install --frozen-lockfile, pnpm typecheck, pnpm lint, and pnpm dev:desktop from the repository root. See [AGENTS.md](AGENTS.md), [DESIGN.md](DESIGN.md), and [the clean-base specification](specs/knorvia-clean-base.md) before changing behavior.

Based on [ZCode](https://github.com/zai-org/ZCode). See [FORK-NOTES.md](FORK-NOTES.md) for provenance and modifications. [LICENSE](LICENSE), [NOTICE](NOTICE.md), and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) preserve applicable upstream attribution.
