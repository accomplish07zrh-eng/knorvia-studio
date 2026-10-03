# Personal provider configuration repository candidate

Complete candidate preserves lock-scoped re-read/import/normalization/write, strict pre-write codec round-trip, snapshot revision, generation-fenced lazy polling, callback and listener lifecycle, and disposal. Invalid material is preserved; a corrupt update cannot replace it with an empty configuration. Existing codec, atomic writer and lock implementations stay unchanged.

Three bounded fake-port groups pass, including locked external replacement, committed-listener failure, stale poll success after write, error-episode reset and disposal during polling. Frozen empty-update/hash-order mismatch is retained and corrected. Actual target-rooted compilation reports zero diagnostics for baseline and final (414 source files including libraries); four public export/class shapes match. Target lint has no warnings/errors; formatting and changed architecture pass.

Evidence: `evidence/root-personal-provider-repository-20261003/`. The original draft, freeze, six input files and standalone `.cjs.txt` checkers are preserved. Native filesystem/ACL/lock behavior, full callback/timer matrices, full project tests/build and final combined acceptance remain unrun. No actual user configuration, credentials, permissions, provider/network or native file operation was performed.

Source-exposed post-freeze corrections and retained expression are explicit. No whole-file MIT or clean-room claim. Keep this root draft separate until all lanes are collected for final integration.
