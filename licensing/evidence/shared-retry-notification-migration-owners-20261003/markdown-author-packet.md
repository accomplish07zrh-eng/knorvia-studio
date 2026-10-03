# Complete owner API and behavior packet

Exact target: packages/shared/src/subagent-markdown-selection.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-markdown-queue-authored/subagent-markdown-selection.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
import { decodeCustomModelValue, encodeCustomModelValue } from "./custom-model-value.js";

import { migrateLegacyModelProviderId, migrateLegacyOfficialGlmModelId, } from "./legacy-model-provider-identity.js";

import { parseModelPickerValue, type ModelSelection } from "./model-selection.js";

export function parseSubagentMarkdownSelection(frontmatter: Record<string, unknown>): ModelSelection | undefined;

export function formatSubagentMarkdownModel(selection: ModelSelection): string;

export function migrateSubagentMarkdownProvider(content: string): string;
```

Complete pure formal Markdown model parse/format and STORAGE-only provider migration; don't inline retained identity ports. Public ModelSelection has providerId:string,modelId:string,options?:{reasoningLevel?:string}; parseModelPickerValue(string)->selection maythrow. decodeCustomModelValue(string)->{providerId:string,modelName?:string}|null; encodeCustomModelValue(providerId,modelName?) returnscustomencoded string; migrationports `(providerId:string)->string|undefined` and `(oldProviderId:string,modelId:string)->string`. Port internals not provided/inlined; no IO/native reads.
Parse frontmatter.model MUST actualstring,trim; denyempty or exactcase inherit/main/sonnet/opus/haiku. Call customdecode FIRST; iftruthy require custom.providerId.trim nonempty and custom.modelName?.trim nonempty; selection onlytrimmedproviderId/modelId. If no custom, callpicker inside try/catch and only picker exceptions=>undefined. Do not catch decode or migrationport exceptions. thoughtLevel ifstringtrim else''; ifnonempty return{...selection,options:{reasoningLevel}} replacing previous options; else return exact selection object frompicker (customfresh). No interpretation of other interimfields/legacy IDs here.
Format ignoresoptions: encodecustom iffprovider.startsWith('custom:') ORproviderincludes('/') ORmodelIdincludes('$'); otherwiseliteral `${providerId}/${modelId}`, no trimming/migration. modelIdslashes alone allowedliteral.
Migration works on string without rebuilding YAML/body. Recognize frontmatter only atstart, optionalBOM, delimiter--- optionalspaces/tabs newline LF/CRLF; body non-greedy until newline closing--- optionalspaces/tabs followednewline/end. Compatibility regexboundary /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u. Within capturedbody replace every lowercase column0 `model` line with spaces/tabs aroundcolon, not indented/case variants. Exactmatch shape /^(model[ \t]*:[ \t]*)([^\r\n]*)/gmu. Scalar split exact grammar /^("(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[^#]*?)([ \t]+#.*|[ \t]*)$/u. QuotedJSON double withbackslash escapes or singlewithdoubledquotes; unquoted no#; trailingcomment requires whitespacebefore#, separated trailingwhitespace preserved. Unmatchedscalarline unchanged. Parse doubles JSON.parse intry, singlesstripouter and doubled'->', unquotedtokenliteral (NOTtrim); parsingthrow leaveswholeoriginal line. If migrationreturnsidenticalvalue, leavewholeoriginal line evenquotes/escapes. Changed double reencodeJSON.stringify; singlewrapanddoubleinnerquotes; plainnextliteral. Preserveprefix/trailingsuffix, CRLF/BOM/outsidefrontmatter and ALLunrelated bytes. Splice using offsetfirstnewline+1 and original capturedbody length; onlybodychanged.
Value migration: if startsWithcustom:, customdecode; unless decoded.modelName truthy and decoded.providerId.startsWithbuiltin: returnoriginal. Migrateprovider; unless returnedtruthy AND differsold returnoriginal. Callmodelmigration withOLDprovider and decodedmodelName. Work with originalvalue bodyaftercustom:; findseparatorcolon AFTER initialbuiltin:prefix length ifbody startsbuiltin:, otherwise firstcolon; ifseparator<0returnoriginal. Returncustom:+encodeURIComponent(newprovider)+':'+(modelIdunchanged? ORIGINALbodysuffixafterseparator : encodeURIComponent(newmodel)). Preserve originalencoded model bytes including %24/%2F/lowercase when modelunchanged, no reparsing as picker. Provider changing isrequired beforemodelmigration in custombranch.
Noncustom: firstslashindex>=1 required; oldproviderprefixbeforefirstslash MUSTstartsWithbuiltin:; migrateprovider thenmodelIdrest; split FIRST'$' into name and suffix (suffix includes$ evenatindex0), migrateONLYname withOLDprovider, appendunchangedsuffix. If provider undefined/falsyreturnoriginal, else provider+'/'+migratedname+suffix; here provider sameoldstillinvokesmodelmigration. No canonicalizationother IDs/ordinaryunknown. Chinese comments explain preservation/nointerimread/reasoningsuffix boundaries. Regex/publicshape/controlflowmayrecur; no novelty threshold or provenanceacceptance.

No numerical similarity threshold or novelty requirement applies. Report unavoidable contract/public API/import/fixed expression and structure recurrence without reading or comparing inherited source.
