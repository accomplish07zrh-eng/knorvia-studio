# Personal provider configuration repository owner

The repository is the single instance owner of observed revision, write-completion generation, pending/in-flight poll state, error episode, subscriptions and disposal. Existing supplied path, codec, atomic private writer and shared file lock remain authoritative. No new filesystem watch, lock implementation, schema, credential lookup or persistence destination.

Read: unlocked canonical read -> when necessary lock/re-read/import/normalization -> snapshot; invalid material is preserved and only an empty in-memory layer is returned. Update: lock/re-read -> synchronous transform -> select four fields -> decode/encode before atomic write -> generation increment -> revision publication within lock -> updated after lock release. Already accepted IO continues after disposal; notification and rearming stop.

Polling stays lazy, single-flight and non-importing/non-writing. Generation fences stale reads and errors. Error episodes are cleared only by current successful polls. Callbacks preserve their receiver/throw behavior, listeners iterate the live Set, and full invalid-file recovery never silently overwrites real data. The inherited private writer requests mode0600; platform ACL/native lock proof remains deferred.

A full body-free contract-authored candidate is frozen before target source comparison. Source-exposed corrections preserve frozen empty updates, encoding-before-hash observation, locked canonical comparison order and the separate asynchronous poll-snapshot settlement boundary. These are qualified implementation evidence, not independent-expression/MIT or clean-room acceptance.

Checks use only fictional path/data and fake file, lock, codec, hashing and timer ports. No real user config, credentials, files, permissions, locks or provider operations. Minimal data protection/lifecycle checks and target static validation only; full integration/build/native acceptance remains after all lanes finish.
