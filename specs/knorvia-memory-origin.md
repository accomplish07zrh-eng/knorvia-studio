# Memory origin metadata transformation

2026-09-30. Replace the inherited pure origin-session transformer while retaining its single public API and consumers (Write/Edit). No filesystem access or user data migration is introduced. This transformation only prepares content already being written through the existing conditional-write port.

## Boundary and compatibility

Only lowercase .md paths lexically contained under the provided memory root qualify. Keep the existing path helper; no symlink resolution or broader path permission is introduced. Recognize only the existing beginning-of-file YAML fence, with optional BOM and LF/CRLF. The closing delimiter must have no extra characters before line end or EOF. Preserve the exact prefix, closing delimiter and following body; serialized YAML uses the opening delimiter's newline style. Freeze the legacy immediate-empty-fence nonmatch as compatibility, rather than expanding the accepted grammar accidentally.

Parsed YAML errors, scalar/sequence root content and non-mapping metadata remain unchanged. Recognized blank/comment-only YAML documents retain their legacy origin creation behavior. A nonempty string originSessionId is authoritative, including whitespace-only strings; never overwrite it or refresh its node_type. For an eligible mapping without a valid existing origin, preserve unrelated metadata, place node_type: memory first, and set originSessionId to the supplied session string. Mutation failures retain the existing unchanged-content fallback; serialization exceptions still propagate as before. No logging of document contents or session identifiers is added.

## Confirmed absent-mapping bugfix

The existing helper sets missing metadata to a plain JavaScript object. The installed YAML Document API keeps that value as a plain object at this point, so isMap returns false and the helper silently returns the original content. A valid YAML root mapping without metadata therefore misses intended origin stamping. Deliberately create a YAML map node with the document's node factory before insertion. Newly created metadata uses block mapping layout; existing parsed metadata: {} already works and keeps its original flow layout. Scalar/sequence root documents, explicit null/scalar/list metadata and existing origins are not newly normalized or repaired. Update the Write regression that explicitly froze this old fallback to assert the intentional correction, keeping a record of the former result.

## Implementation and acceptance

Use a bounded delimiter scanner and one parsed-document mutation pass; retain the original single output string and no runtime legacy fallback. Before switching implementation, freeze a table of old outputs for scope, fences, newline/BOM, malformed YAML, mapping types, existing origins, metadata ordering and body preservation. Separate unchanged compatibility cases from the intentional missing-metadata differences. Verify source and actual emitted APIs and real Write/Edit consumers using synthetic filesystem ports. Run normal root/CLI types, lint, formatting, architecture, CLI build, full offline regression and exact-head native CI. Source exposure and transition licensing remain recorded; no clean-room, MIT, actual-user-file or installer claim follows from these tests.
