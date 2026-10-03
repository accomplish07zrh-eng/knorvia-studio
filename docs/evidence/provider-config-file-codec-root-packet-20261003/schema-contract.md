# Retained schemas, parser contracts and security data

The codec's existing schema definitions/data and these collaborators remain source-derived retained material. This packet documents them for correct independent wrapper behavior; no MIT/rights or schema replacement is implied. Canonical type/routes remain @knorvia/provider, @knorvia/shared/model-config, @knorvia/shared/model-selection and zod4.6.5. No implementations of those collaborators are author inputs.

ProviderConfigLayerUpdate has providers/models and optional providerTemplates/providerOrder/defaultModelSelection; this codec ignores providerTemplates. Public personal parser functions and extractManualModelConfig are synchronous with explicit input unknown and original facade/manual output types. Existing serializers retain their map/rule receivers and defined public output types. Imported shape/extend/parse/safeParse relationships are canonical; no partial hand-written validator replaces them.

The current manual model schema preserves only the product-opened leaves:

- enabled uses the original sparse model enabled field, allowing its canonical omitted/null behavior.
- properties require contextWindow, supportsJsonSchemaOutput, supportsNativeWebSearch and supportsMidConversationSystem; inputFormat contains supportsImage/supportsVideo/supportsPdf.
- optionSpecs include complete reasoningLevel (values/map) and maxOutputTokens with max only.

Current manual shape does not add requiresMfjsToolSchema, supportsText/supportsAudio/outputFormat/supportsToolCall, max-output map or any other system leaf. Its nested objects retain strictness. Canonical positive integers/booleans, nonempty unique nonblank reasoning levels and validated option mapping programs stay unchanged.

Legacy complete shape starts from the complete model schema and changes only enabled to its sparse counterpart; all other required complete properties, format capability booleans and option-map fields remain complete. Legacy editable shape starts from current manual schema and adds required boolean requiresMfjsToolSchema under properties. Ordered union recognition and subsequent current editable extraction are narrow compatibility, not a permission to remove arbitrary unknown fields. The retained extractor uses current schema-defined field ownership recursively and then canonical parse.

Personal model payload has strict providerModelRules and manualProviderModelRules arrays. Smart rules are exact provider/model IDs with sparse canonical model config; manual rules use current manual schema. The schema rejects declaring the same provider/model tuple in both modes, using tuple JSON identity and its existing diagnostic/path. It does not introduce builtin template/API/site/pattern rule groups into a personal file. Model parser produces smart rules then manual rules in existing order; codec does not change parser rule identity logic.

Personal provider payload is strict providerRules. IDs are nonempty strings without new trimming. Rule metadata stays providerId, optional/null templateId and providerName, optional enabled, config. Duplicate provider IDs retain canonical rejection. Personal config excludes builtinModelIds; group is only standard-personal or null/omitted; personal API base URL can retain an in-progress string/null/omitted value, without broadening complete execution validation. A provider ID beginning account: cannot supply config.access (including explicit null); original fixed Account access authority/diagnostic stay unchanged. No account token, API key, provider header or real user value is included in packet samples.

Canonical stored envelope is strict root/config. providerOrder is optional array of strings.min(1), with no codec trim/dedup/default. Rule slots are unknown at this outer schema and reach strict retained personal parsers in provider-first order. ModelSelection is strict, trims nonempty IDs and optional reasoning level, and permits only its declared options. Version checks and fixed class/messages remain owned by codec, while generated Zod issue/path/message details remain canonical dependency behavior.

Original source import routes are preserved in declaration views rather than relocated runtime modules. Full semantic facade/Zod type closure and OS/runtime acceptance are deferred, not PASS. Root may supply canonical public type surfaces later without exposing implementation bodies. D model-config/account/config/registry owners, G adapters, repository candidate and all schema/facade/static files are outside this preparation scope.
