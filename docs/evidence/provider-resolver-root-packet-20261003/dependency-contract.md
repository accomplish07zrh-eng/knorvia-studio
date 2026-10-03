# Retained dependency types and ports

The six dependency declaration files describe public types plus only the method surface needed by the resolver. They contain no method/function implementation, private fields or initializer/default expression. Field/type aliases are mechanically grounded in current declarations; readonly account access discriminator is inferred from its original string-as-const initializer and is explicitly qualified in extraction metadata. Constructors with defaults are marked optional; actual defaults are collaborator behavior, not rewritten here. Uncalled facade methods are omitted, so this is a resolver-specific dependency view, not a replacement package.

| Original import route | Declaration input / retained boundary |
| --- | --- |
| ./config/index.js | provider-config.d.ts, model-config.d.ts, ids.d.ts; original barrel stays unchanged |
| ./config-overlay.js | config-overlay.d.ts, including complete ConfigValidationIssue union |
| ./account-provider-state.js | account-provider-state.d.ts, supplied snapshot only |
| ./owned-order.js | owned-order.d.ts, original generic signature; implementation retained opaque |
| ./config/provider-data-schema.js | canonical sparse/complete provider schema; static schema contract below and source binding in curator manifest |
| @knorvia/shared/model-config | canonical sparse/complete model schema and option-map validator; source binding and static schema contract, not copied runtime validators |
| zod | z.infer type relationship from canonical schemas; pinned package metadata retained, no new dependency |

Relative imports inside declaration views retain original source module spelling. These files are reading inputs, not a relocated executable/typechecked package; source-route mapping is the table above. Some config declaration aliases reference retained rule-data-schema and canonical schema symbols. Those original public type relationships remain unchanged; the packet does not pretend to prove their entire semantic TypeScript/Zod closure. Do not follow the import paths to source bodies during independent author work. Root can supply the original package's canonical public type surfaces for later checking.

Resolver consumes map construction from filtered account entries, entries/keys/has/get/getRule, overlays and mapConfigs callbacks; template get; config withoutGroup/overlay/validateComplete; static model composeEffective and model resolve; generic owned ordering. Model-config nested property/option objects are supplied records/facades. Public methods can be faked for future bounded tests; no IO port is requested by this module. Account states provide availability/entitlement/reason/current/connection identity/time types but resolver reads only current for each ID. No credentials are present in the state contract.

Retained schema rules: provider/API/group/access/mode/visibility enums and complete provider fields are fixed by canonical provider-data-schema. Complete API keys and base URL require nonblank strings; URL validity and strict object shapes remain canonical. Personal sparse API data may retain an in-progress endpoint, but complete validation can reject it; resolver collects such issues, does not repair it. Model complete schemas require all capability booleans, positive integer context window/output-token limit, nonempty unique nonblank reasoning levels and validated mapping programs. Canonical option-map compiler/validator owns parsing, not resolver. No new safety rule or retroactive MIT claim is inferred from describing those schema contracts.

D-owned config-service/registry-service and all dependency implementations, facade/schema/type/static files remain untouched. Only current repository code and fixed public configuration types were read; no live account data/provider request/network/process/native execution.
