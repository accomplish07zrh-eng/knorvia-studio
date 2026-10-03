// Existing ./protocol-v4/rows.js has conversationArtifactTypeSchema:
// z.enum(["pdf","pptx","docx","xlsx","image","html","md","text"]).
// Its exact object identity is re-exported. Import it, do not reconstruct/parse.
export type ConversationArtifactType = "pdf"|"pptx"|"docx"|"xlsx"|"image"|"html"|"md"|"text";
// Standard URL constructor/pathname/hostname/protocol, decodeURI, Array/Set/string/regex
// behavior are native JavaScript dependencies, with catches only specified in contract.
// Persisted message nested types referenced by persisted-message-api.d.ts remain
// existing opaque public attachment/tool/body-ref/slice/timeline data; pair merger
// retains them by identity rather than reconstructing their implementations.
