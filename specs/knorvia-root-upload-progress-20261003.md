# SSH upload progress compatibility owner

Root exclusively owns the read-only SSH upload progress helper. Preserve async file-size/null behavior, POSIX basename, exact SSH error/status rendering and per-reporter timing/deduplication state. Each closure owns its own prior logged timestamp, bytes and percent. Snapshot arithmetic precedes admission; successful console.log precedes state mutation. Injected runtime edge values and throwing getters retain existing semantics. No transport, credentials, upload or filesystem-write functionality is added.

Use G's frozen body-free packet at a27c9aaf, matching source hashes before authoring. Root retains broader context/prior generic tool exposure; no isolation or automatic licence claim. Official plugin assets remain configuration/tiny helper material, unchanged. Ordinary runtime tests/builds deferred; static types/API/lint/architecture and post-freeze compatibility review, final aggregate acceptance later.
