# Context usage contributor projections

Own only runtime/helpers/context-usage-breakdown.ts. Pure projections, no accepted state, reads/permissions or normalization. Preserve complete public declarations, unions/literals and dependency type imports. Keep existing projection vocabulary/metrics; no cosmetic novelty requirement, schema rewrite, validation, aggregation or extra fields. Complete source<400lines. Do not read existing source/dependency/test/history/review bodies. Public field order and own optional undefined fields are contract data, not novel expression.

buildCategoryBreakdown calls identical map.get(source) once with method receiver. Falsy/missing category=>undefined, no copy. Found category=>fresh shallow spread of all enumerable fields (including extension fields), then own contributors set to identical input array, overriding existing property. Category/map/contributors are unmodified and no nested clone.

Every contributor below is a fresh plain object with only named own keys in the specified order; optional-valued keys are present even undefined. No input spread, extras, numeric sanitation, confidence/token method recalculation or category lookup. All metric field values copy verbatim.

sectionContributor: kind context_section, categorySource argument, label=section.name, name=section.name, source=section.source, injectionTarget=section.injectionTarget, cacheHint=section.cacheHint, then chars,tokens,tokenMethod,confidence,tokenizer copied from section.

toolContributor: kind tool_schema, categorySource argument, label=tool.name, name=tool.name, source=tool.source, serverName=tool.serverName, readOnly=tool.readOnly, sideEffectScope=tool.sideEffectScope, then chars,tokens,tokenMethod,confidence,tokenizer copied from tool.

skillContributor: kind skill, categorySource argument, label=skill.name, name=skill.name, source=skill.source, scope=skill.scope, path=skill.path, then chars,tokens,tokenMethod,confidence,tokenizer copied from skill.

messageRoleContributor: kind message_role, categorySource literal messages, label=message.role, role=message.role, count=message.count, then chars,tokens,tokenMethod,confidence,tokenizer copied from message.

Dependency and public type surfaces are authoritative. The file's mappings are thin contract-bound data projections; retaining matching field expressions is allowed and must be candidly disclosed. Do not invent discretionary complexity to make trivial wrappers appear independent.
