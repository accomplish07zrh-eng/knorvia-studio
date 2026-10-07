# Knorvia Studio

Knorvia Studio brings multiple agent kernels into one desktop workspace. Individual chats, multi-agent collaboration, workflows, and image and video creation share a black-and-white interface that keeps projects, tools, tasks and their results together.

This source version is **0.9.0**; see [CHANGELOG.md](CHANGELOG.md). Published Windows x64 and Linux x64 installers, portable packages and SHA-256 checksums are available from [GitHub Releases](https://github.com/accomplish07zrh-eng/knorvia-studio/releases/latest). The project [website](https://knorvia.xyz) provides an introduction. 中文：[README.md](README.md)。

## Features

- **Workspace**: an activity rail, kernel switcher and shared rounded workspace, with light and dark themes, optional glass surfaces, fine-line icons and entrance motion. English and Chinese, keyboard access and separate drafts are supported.
- **Models and data**: configure your own endpoint, model and API key. No product account is required. Application configuration and data use the independent `KNORVIA_` and `.knorvia-studio` namespaces.
- **Kernels**: Knorvia is the default kernel. Locally installed Codex, Claude Code and Grok Build, plus other CLI agents that pass ACP probing, share the same chat UI. Switching kernels starts a separate session. See the [backend spec](specs/knorvia-backend.md) and [CLI expansion spec](specs/knorvia-cli-expansion.md).
- **Group chats**: @-mention members or let the host decide. In task mode the host plans, dispatches and reviews until the task completes, is genuinely blocked or is stopped by the user. Each member has its own session and edits an isolated directory by default; diffs are reviewed and applied explicitly.
- **Workflows**: a node canvas with serial, parallel, conditional, join, manual approval, bounded retry, stop, history and resume; templates, run comparison, and scheduling through Automations.
- **Creation**: image and video generation (OpenAI Images compatible, configurable JSON API or ComfyUI), also available as a workflow node.
- **Plugins and computer control**: built-in document, PDF, presentation, spreadsheet, browser, skill and plugin creation tools. The Windows Computer Use plugin is disabled by default. Once enabled, it requires target-window authorization for screenshots, mouse and keyboard actions, with a stop control. It currently requires the local Knorvia kernel and an image-capable model; remote workspaces and other operating systems are not supported.
- **Projects and handoff**: SSH remote workspace agents, file diff review, shared capabilities across kernels, session handoff and Markdown export.

Computer Use can move the foreground pointer or focus. UAC, secure desktops and unrestricted whole-desktop control are not supported. Mobile remote control has only been checked with local protocol fixtures; startup performance is still being improved. Actual model capabilities and charges depend on the configured service. Offline tests do not establish live compatibility with every external kernel or model. See the [release verification](docs/knorvia-release-preview3-20260927.md), [computer-control verification](docs/knorvia-windows-computer-use-20260927.md) and [startup measurements](docs/knorvia-startup-performance-20260927.md) (Chinese).

## Installation and data

The Windows installer provides desktop and Start menu shortcuts and stores user data separately from the program. The Windows portable ZIP runs from `Knorvia Studio.exe` and keeps data in the adjacent `data` directory. Fully exit before copying the portable folder. See [installation and data guidance](docs/desktop-release-installation.md) for Linux formats, portable programs and upgrade steps. All packages include checksums; current packages are unsigned.

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

The `Studio offline checks` GitHub Actions workflow checks Linux and Windows on pull requests, pushes to `main` and manual runs. `Release desktop installers and portable` checks one full source SHA, builds and accepts Windows/Linux installer and portable formats, then publishes after all gates pass; published version assets are immutable. Set `KNORVIA_ENV=production` for production packaging and run `node packages/desktop/scripts/bundle.mjs --os win --arch x64` for Windows, or use `--os linux` for Linux.

## Docs and license

Read [AGENTS.md](AGENTS.md) and [DESIGN.md](DESIGN.md) before changing behavior. Product specs live in [specs/](specs/), acceptance and audit reports in [docs/](docs/). See [FORK-NOTES.md](FORK-NOTES.md) for provenance and modifications.

Knorvia Studio continues under the root [Apache-2.0 license](LICENSE) and is maintained by this project. As of October 3, 2026, a project-wide MIT migration is no longer a goal. Work continues to replace inherited implementations from the original project while retaining ordinary third-party dependencies and their actual notices; full independent replacement is still incomplete. Existing file, directory and third-party licenses and attribution remain in place; see [NOTICE](NOTICE.md) and [third-party notices](THIRD-PARTY-NOTICES.md). Actual sources and the current license scope are recorded in [file provenance and licensing](licensing/README.md) and the [source maintenance spec](specs/knorvia-independent-implementation.md). Previous release artifacts and license records remain intact.
