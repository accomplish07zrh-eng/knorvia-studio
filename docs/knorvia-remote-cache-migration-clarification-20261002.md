# Remote-cache sibling migration: readiness and stat gates

This is a behavioral clarification of the frozen remote-cache packet; it supplies no predecessor implementation body and does not change the frozen input bytes.

For old hash-version component-cache migration, directory enumeration first restricts candidates to directory entries with the normalized-version-plus prefix. Symbolic-link siblings are not directory candidates, including links pointing to directories. The resolved current target path is excluded.

Each remaining candidate must then pass component readiness: a stat must identify a directory, and an accessible `.ready` or `.remote-assets-ready` marker must exist. Errors from that readiness stat count as absence, so that sibling is skipped. Marker-access errors likewise do not establish readiness.

Only after readiness succeeds is the sibling statted again to obtain mtimeMs for ranking. Failure of this second stat propagates; it is not ignored. Thus the packet's statement that candidate stat failures propagate refers to the post-readiness ranking stat, not every stat of every prefixed sibling. A removal/permission race between readiness and that second stat can therefore reject migration. This distinction preserves existing observable gates without prescribing source structure.

Root remains responsible for its already-frozen separate cache implementation. This clarification does not imply fresh author context or OS isolation, and does not transmit target source or integrate that owner into E.
