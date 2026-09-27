# Knorvia Studio

Knorvia Studio brings multiple agent kernels into one desktop workspace. Individual chats, multi-agent collaboration, workflows, and image and video creation share a black-and-white interface that keeps projects, tools, tasks and their results together.

Current release: **0.8.0-preview.3**. Visit the [website](https://knorvia.xyz), or download the Windows x64 installer, portable package and SHA-256 checksums from [GitHub Releases](https://github.com/accomplish07zrh-eng/knorvia-studio/releases/tag/v0.8.0-preview.3). 中文：[README.md](README.md)。

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

The installer provides desktop and Start menu shortcuts and stores user data separately from the program. The portable package runs from `Knorvia Studio.exe` and keeps data in the adjacent `data` directory. Fully exit before copying the portable folder. Both downloads include checksums; current preview builds are unsigned.

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

The `Studio offline checks` GitHub Actions workflow runs checks on Linux for every pull request, and additionally on Windows for pushes to `main` and manual runs. `Release Windows installer and portable` validates a single commit before building and publishing both packages; published version assets are immutable. Set `KNORVIA_ENV=production` for production packaging and run `node packages/desktop/scripts/bundle.mjs --os win --arch x64`.

## Docs and license

Read [AGENTS.md](AGENTS.md) and [DESIGN.md](DESIGN.md) before changing behavior. Product specs live in [specs/](specs/), acceptance and audit reports in [docs/](docs/). See [FORK-NOTES.md](FORK-NOTES.md) for provenance and modifications.

The current source uses the root [Apache-2.0 license](LICENSE) and licenses explicitly declared in individual directories; see [NOTICE](NOTICE.md) and [third-party notices](THIRD-PARTY-NOTICES.md). Knorvia is replacing modules with independent implementations based on functional specifications and adopting MIT for files it can license independently. The whole application has **not** completed that migration. See [file provenance and licensing](licensing/README.md) and the [independent implementation spec](specs/knorvia-independent-implementation.md). Previous release artifacts and license records remain intact.
