# Knorvia Studio

Knorvia Studio is an independent desktop agent studio, freshly cloned on 2026-09-22 from [ZCode](https://github.com/zai-org/ZCode). Current version: `0.8.0-preview.1` (preview). It keeps the original chat, project, settings and agent GUI, and adds multi-kernel chats, group chats and workflows inside that same GUI. The pre-2026-09-22 repository implementation was discarded; current features are reimplemented from the specs in `specs/`.

## Features

- **Identity and isolation**: Knorvia Studio name, transparent icon and black-and-white visual language. Upstream product sign-in, accounts, subscriptions, updates and telemetry are removed. Environment variables, configuration, credentials and data directories are separate (`KNORVIA_`, `.knorvia-studio`); ZCode configuration and sign-ins are never read.
- **Models**: configure your own endpoint, model and API key in the existing model settings.
- **Kernels**: Knorvia is the default kernel. Locally installed Codex, Claude Code and Grok Build, plus other CLI agents that pass ACP probing, share the same chat UI. Switching kernels starts a separate session. See the [backend spec](specs/knorvia-backend.md) and [CLI expansion spec](specs/knorvia-cli-expansion.md).
- **Group chats**: @-mention members or let the host decide. In task mode the host plans, dispatches and reviews until the task completes, is genuinely blocked or is stopped by the user. Each member has its own session and edits an isolated directory by default; diffs are reviewed and applied explicitly.
- **Workflows**: a node canvas with serial, parallel, conditional, join, manual approval, bounded retry, stop, history and resume; templates, run comparison, and scheduling through Automations.
- **Creation**: image and video generation (OpenAI Images compatible, configurable JSON API or ComfyUI), also available as a workflow node.
- **Also**: SSH remote workspace agents, session handoff and Markdown export, eight built-in plugins (documents, PDF, presentations, spreadsheets, browser and more), English and Chinese UI.

Not yet done in this preview: Computer Use is evaluation only (`@knorvia/cua` is a placeholder); the mobile remote Host is validated only against local protocol fixtures; first launch takes about 6 seconds against a 3 second target. See the [final delivery summary](docs/knorvia-final-local-delivery-20260925.md) (Chinese).

## Development

Requires Node.js 24.14.0 and pnpm 10.33.2 (see `mise.toml`). From the repository root:

| Purpose                              | Command                                            |
| ------------------------------------ | -------------------------------------------------- |
| Install                              | `pnpm install --frozen-lockfile`                   |
| Desktop dev                          | `pnpm dev:desktop`                                 |
| Web dev                              | `pnpm dev:web`                                     |
| Typecheck (includes i18n key parity) | `pnpm typecheck`                                   |
| Lint                                 | `pnpm lint`                                        |
| Architecture check                   | `pnpm architecture:check --changed`                |
| Offline regression tests             | `pnpm build:cli-packages`, then `pnpm test:studio` |

The `Studio offline checks` GitHub Actions workflow runs these checks on Linux for every pull request, and additionally on Windows for pushes to `main` and manual runs.

Windows portable data lives in the `data` directory beside the executable. After a full exit the portable folder can be copied as a whole.

## Docs and license

Read [AGENTS.md](AGENTS.md) and [DESIGN.md](DESIGN.md) before changing behavior. Product specs live in [specs/](specs/), acceptance and audit reports in [docs/](docs/). See [FORK-NOTES.md](FORK-NOTES.md) for provenance and modifications.

This is an independent modification, not an official upstream release. [LICENSE](LICENSE) (Apache-2.0), [NOTICE](NOTICE.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) preserve applicable upstream attribution.
