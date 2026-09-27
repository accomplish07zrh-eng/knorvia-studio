# Computer Use third-party notices

The Windows plugin bundles Cua Driver 0.30.1, copyright (c) 2025 Cua AI, Inc.,
under the MIT license reproduced in `CUA-LICENSE.txt`. These executables are
third-party software, not authored by Knorvia.

- Source: https://github.com/trycua/cua/tree/039783f9221a08c0daf9cda65a460fc4f346fa6e
- Release: https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.30.1
- Official Windows x64 binary ZIP SHA-256:
  `96ebb5996c0e25adf40ed648a46959723d31df5d90f24ffe2fb2d3cc2ee780be`
- Runtime files: `cua-driver.exe`, `cua-driver-uia.exe`, `cua-cursor-theme.exe`.
- Optional perception extensions and their models are not included.

The upstream Windows implementation acknowledges Interface-Agent and Trope Cua.
Their MIT texts and upstream notice are reproduced alongside this file in
`LICENSE-Interface-Agent-MIT.txt`, `LICENSE-trope-cua-MIT.txt`, and
`UPSTREAM-trope-cua-NOTICE.txt`.

`THIRD-PARTY-NOTICES-CUA-DRIVER.md` contains original notices for the conservative
Windows normal/build dependency closure; `cua-license-inventory.json` records
exact versions, source checksums and collection evidence. These dependencies have
their own licenses, including MPL-2.0 for UniFFI. The notice explains how to
obtain corresponding unmodified component sources. This collection is not a
linker-generated SBOM; build-time dependencies are conservatively retained.

The integration architecture was informed by the MIT-licensed Hermes Agent
Computer Use backend at commit `b4410b4baddbc83732241c655ff39ac72ffba865`:
https://github.com/NousResearch/hermes-agent/tree/b4410b4baddbc83732241c655ff39ac72ffba865/tools/computer_use
Hermes at that commit pins Cua 0.21.0. Knorvia uses its own adapter for 0.30.1,
not the Hermes Python agent, model loop, optional vision service or daemon.
