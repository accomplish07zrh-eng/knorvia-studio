# Code signing and download verification

**Knorvia Studio downloads are currently not code-signed.** The Windows setup installer, portable executable, portable ZIP and the installer fetched by in-app one-click updates do not carry an Authenticode signature. An application to the SignPath Foundation free open source signing program was not approved in October 2026 because of the project's current size, and no other signing certificate is in use.

当前安装包未签名，请通过 SHA-256 校验文件。

## What to expect on Windows

Because the files are unsigned, Windows may show **Unknown Publisher** or a Microsoft Defender SmartScreen prompt the first time you run them. Only continue (for SmartScreen: **More info > Run anyway**) after verifying the file as described below.

## Verify a download

Every release on [GitHub Releases](https://github.com/accomplish07zrh-eng/knorvia-studio/releases) includes a `.sha256` file for each package and a combined `SHA256SUMS` file. Download packages only from that page or from links on the official site.

Windows PowerShell:

```powershell
Get-FileHash .\Knorvia-Studio-<version>-win-x64-setup.exe -Algorithm SHA256
```

Linux:

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

The hash printed on Windows must match the value in the corresponding `.sha256` file exactly (case does not matter). If it does not match, delete the file and do not run it.

In-app one-click updates perform the same SHA-256 comparison automatically before launching the installer, and download only over HTTPS from `github.com`, `objects.githubusercontent.com` and `release-assets.githubusercontent.com`. Because the checksum is published in the same release as the installer, this check detects corrupted or swapped downloads but is not a publisher signature.

## Maintainer

[accomplish07zrh-eng](https://github.com/accomplish07zrh-eng) maintains this repository, reviews contributions and publishes releases. Release packages are built by this repository's GitHub Actions from public source. The project retains inherited ZCode implementation and its applicable licensing and attribution; see [FORK-NOTES.md](FORK-NOTES.md), [NOTICE.md](NOTICE.md) and the [source inventory](licensing/README.md).

If code signing is adopted in the future, this page will be updated before any signed release is published.

## Privacy policy

Knorvia Studio has no default project-operated telemetry collection endpoint. Local settings, conversations, files, credentials, logs, and diagnostics are not automatically uploaded to the project for telemetry. This does not mean the application is offline: updates and user-selected network services have the following behavior.

- **Update checks:** the desktop application checks project releases at `api.github.com` by default. The GET request omits credentials and sends no conversation, workspace, or file content. GitHub can receive ordinary connection metadata such as the source IP address and request time. Disable checks or configure a custom release source in **Settings > General > Updates**; leaving the source empty uses the official GitHub source. A custom source's operator can receive the same connection metadata and has its own privacy policy.
- **One-click update installation:** on supported Windows installations, download URLs and redirects are restricted to HTTPS on `github.com`, `objects.githubusercontent.com`, and `release-assets.githubusercontent.com`. The installer is checked against its release SHA-256 file before launch. These downloads also expose connection metadata to GitHub. SHA-256 checking is implemented; because packages are unsigned, no Authenticode signer verification is performed.
- **Models and connected services:** model requests use providers selected and configured by the user, including configured credentials or environment authentication and provider SDK defaults. Prompts, attachments, and relevant task content can be sent to those services. Creation services, external CLI agents, remote workspaces, MCP servers, plugins, and browser actions can also access the network according to the user's configuration and actions. Their operators' privacy policies apply.
- **Optional telemetry:** model/runtime telemetry is disabled unless the operator sets `KNORVIA_MODEL_TELEMETRY_ENABLED=1` and supplies a valid OTLP trace endpoint. When enabled, traces and metrics use the operator-configured endpoint(s); separate trace and metrics addresses are supported, and a common endpoint derives `/v1/traces` and `/v1/metrics`. Telemetry is not routed to a default project collector. The configured receiver's privacy policy applies.

GitHub's handling of update-service metadata is described in the [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). Review the privacy policies of the model providers, CLI services, remote hosts, MCP servers, plugins, websites, custom update source, and OTLP receiver you choose. This policy does not extend the project's privacy claims to those services.
