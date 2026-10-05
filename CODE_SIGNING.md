# Code signing policy

**Application pending; no SignPath signing is active.** Knorvia Studio is preparing an application to SignPath Foundation. This policy describes the intended process after approval; it does not claim that the application has been accepted or that current downloads are signed.

The planned attribution after approval is:

Free code signing provided by SignPath.io, certificate by SignPath Foundation.

See [SignPath.io](https://about.signpath.io/), [SignPath Foundation](https://signpath.org/), and the [Foundation conditions](https://signpath.org/terms). A valid, trusted Windows Authenticode signature is intended to identify the publisher instead of showing Unknown Publisher. Signing does not guarantee that all Microsoft Defender SmartScreen reputation warnings or other Windows security prompts disappear.

## Team roles

- Committers and reviewers: [accomplish07zrh-eng](https://github.com/accomplish07zrh-eng).
- Approvers: [accomplish07zrh-eng](https://github.com/accomplish07zrh-eng).

The maintainer reviews external contributions, including source and build changes, and will manually approve each stable release's signing request on the SignPath website. All signing team members must use MFA for GitHub and SignPath; GitHub MFA has been confirmed by the maintainer, while SignPath setup is pending.

## Intended signing scope

Only artifacts built by this repository's GitHub Actions from public source in [accomplish07zrh-eng/knorvia-studio](https://github.com/accomplish07zrh-eng/knorvia-studio) are eligible for the planned requests: Windows setup installers, portable executables, and project-built Knorvia application executables distributed in portable ZIPs. The update installer is the same Windows setup artifact. ZIPs are distribution containers, not Authenticode-signed files.

Local builds, binaries from other repositories, and prebuilt third-party executables will not be submitted for signing. Upstream executables and libraries inside a ZIP or installer retain their own publisher signatures and attribution; they will not be signed with this project's subscription.

The project retains inherited ZCode implementation and its applicable licensing and attribution; see [FORK-NOTES.md](FORK-NOTES.md), [NOTICE.md](NOTICE.md), and the [source inventory](licensing/README.md). The Foundation's conditions for modified upstream software and project reputation still require verification before signing can begin. No certificate, release integration, or update-installer Authenticode signer verification is enabled by this documentation change. The future work is described in the [signing specification](specs/knorvia-code-signing.md).

## Privacy policy

Knorvia Studio has no default project-operated telemetry collection endpoint. Local settings, conversations, files, credentials, logs, and diagnostics are not automatically uploaded to the project for telemetry. This does not mean the application is offline: updates and user-selected network services have the following behavior.

- **Update checks:** the desktop application checks project releases at `api.github.com` by default. The GET request omits credentials and sends no conversation, workspace, or file content. GitHub can receive ordinary connection metadata such as the source IP address and request time. Disable checks or configure a custom release source in **Settings > General > Updates**; leaving the source empty uses the official GitHub source. A custom source's operator can receive the same connection metadata and has its own privacy policy.
- **One-click update installation:** on supported Windows installations, download URLs and redirects are restricted to HTTPS on `github.com`, `objects.githubusercontent.com`, and `release-assets.githubusercontent.com`. The installer is checked against its release SHA-256 file before launch. These downloads also expose connection metadata to GitHub. SHA-256 checking is implemented; Authenticode signer verification is future work.
- **Models and connected services:** model requests use providers selected and configured by the user, including configured credentials or environment authentication and provider SDK defaults. Prompts, attachments, and relevant task content can be sent to those services. Creation services, external CLI agents, remote workspaces, MCP servers, plugins, and browser actions can also access the network according to the user's configuration and actions. Their operators' privacy policies apply.
- **Optional telemetry:** model/runtime telemetry is disabled unless the operator sets `KNORVIA_MODEL_TELEMETRY_ENABLED=1` and supplies a valid OTLP trace endpoint. When enabled, traces and metrics use the operator-configured endpoint(s); separate trace and metrics addresses are supported, and a common endpoint derives `/v1/traces` and `/v1/metrics`. Telemetry is not routed to a default project collector. The configured receiver's privacy policy applies.

GitHub's handling of update-service metadata is described in the [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). Review the privacy policies of the model providers, CLI services, remote hosts, MCP servers, plugins, websites, custom update source, and OTLP receiver you choose. This policy does not extend the project's privacy claims to those services.
