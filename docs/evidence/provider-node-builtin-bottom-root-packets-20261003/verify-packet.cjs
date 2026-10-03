// Static evidence/declaration checks only. Never import either application owner.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ts = require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const dir = 'docs/evidence/provider-node-builtin-bottom-root-packets-20261003';
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'curator-manifest.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(dir, 'retained-data.json'), 'utf8'));
const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'prior-receipt-search.json'), 'utf8'));
function assert(condition, message) { if (!condition) throw Error(message); }
function eq(a, b, message) { assert(JSON.stringify(a) === JSON.stringify(b), message); }
function bind(p, x) {
  const b = fs.readFileSync(p);
  assert(b.length === x.bytes && crypto.createHash('sha256').update(b).digest('hex') === x.sha256 &&
    crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + b.length + '\0'), b])).digest('hex') === x.gitBlob, 'Binding mismatch: ' + p);
}
for (const x of manifest.sourceMetadataBindings) bind(x.path, x);
for (const x of manifest.authorInputBindings) bind(path.join(dir, x.path), x);
bind(path.join(dir, manifest.receiptBinding.path), manifest.receiptBinding);
bind(path.join(dir, manifest.checkerFailureBinding.path), manifest.checkerFailureBinding);
function parse(p) { const f = ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true); assert(!f.parseDiagnostics.length, 'Parse: ' + p); return f; }
function walk(n, fn) { fn(n); ts.forEachChild(n, c => walk(c, fn)); }
function exported(f) { return f.statements.filter(n => n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)); }
function topology(f) { return exported(f).map(n => ({ kind: ts.SyntaxKind[n.kind], name: ts.isVariableStatement(n) ? n.declarationList.declarations[0].name.getText(f) : n.name.getText(f) })); }
function signature(n, f) { return { name: n.name.getText(f), parameters: n.parameters.map(p => ({ name: p.name.getText(f), type: p.type?.getText(f), optional: !!p.questionToken })), returns: n.type?.getText(f) }; }
const download = parse('packages/provider-node/src/builtin-download.ts'), release = parse('packages/provider-node/src/builtin-release.ts');
const downloadApi = parse(path.join(dir, 'download-api.d.ts')), releaseApi = parse(path.join(dir, 'release-api.d.ts'));
let exportCount = 0, functionCount = 0;
for (const [src, api] of [[download, downloadApi], [release, releaseApi]]) {
  eq(topology(src), topology(api), 'Export topology'); exportCount += exported(src).length;
  for (const n of exported(src)) {
    if (ts.isInterfaceDeclaration(n)) {
      const a = exported(api).find(a => ts.isInterfaceDeclaration(a) && a.name.text === n.name.text);
      eq(n.getText(src), a.getText(api), 'Interface: ' + n.name.text);
    } else if (ts.isFunctionDeclaration(n)) {
      const a = exported(api).find(a => ts.isFunctionDeclaration(a) && a.name.text === n.name.text);
      eq(signature(n, src), signature(a, api), 'Function: ' + n.name.text); functionCount++;
    }
  }
}
let bodies = 0, initializers = 0, declarationFiles = 0;
for (const x of manifest.authorInputBindings.filter(x => x.path.endsWith('.d.ts'))) {
  const f = parse(path.join(dir, x.path)); declarationFiles++;
  walk(f, n => {
    if (n.body && (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n))) bodies++;
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) bodies++;
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isPropertyDeclaration(n)) && n.initializer) initializers++;
  });
}
assert(!bodies && !initializers, 'Body/default expression leaked into declarations');
const deps = parse(path.join(dir, 'dependency-types.d.ts')), schema = parse('packages/provider/src/config/schema.ts');
for (const n of deps.statements.filter(ts.isFunctionDeclaration)) {
  const s = schema.statements.find(s => ts.isFunctionDeclaration(s) && s.name.text === n.name.text);
  eq(signature(n, deps), signature(s, schema), 'Canonical parser signature');
}
const strings = new Set(), numbers = new Set(), templates = new Set();
walk(download, n => { if (ts.isStringLiteral(n)) strings.add(n.text); if (ts.isPropertyAssignment(n)) strings.add(n.name.getText(download)); if (ts.isNumericLiteral(n)) numbers.add(Number(n.text.replaceAll('_', ''))); if (ts.isTemplateExpression(n)) templates.add(n.getText(download).slice(1, -1)); });
for (const v of [data.download.clientConfigPath, ...data.download.queryKeys, data.download.envelope.downloadUrlKey, ...data.download.stages, ...data.download.fixedReasons, ...Object.values(data.download.requestInit).filter(v => v !== 'same combined/internal signal for both requests')]) assert(strings.has(v), 'Missing fixed download token: ' + v);
for (const v of [data.download.httpReasonTemplate, data.download.schemaReasonTemplate, data.download.errorTemplate]) assert(templates.has(v), 'Download diagnostic mismatch');
assert(numbers.has(data.download.budgetMs) && numbers.has(data.download.bodyLimitBytesPerResponse), 'Budget/body limit constant');
let hasStrictByteBoundary = false, requestInit;
walk(download, n => {
  if (ts.isBinaryExpression(n) && n.left.getText(download) === 'bytes' && n.operatorToken.kind === ts.SyntaxKind.GreaterThanToken && Number(n.right.getText(download).replaceAll('_', '')) === data.download.bodyLimitBytesPerResponse) hasStrictByteBoundary = true;
  if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'request') requestInit = n.arguments[1];
});
assert(hasStrictByteBoundary, 'Body limit >, not >=');
eq(requestInit.properties.map(p => p.name.getText(download)), ['method', 'signal', 'credentials', 'redirect'], 'Request init keys/security');
for (const [k, v] of Object.entries(data.download.requestInit).filter(([k]) => k !== 'signal')) assert(requestInit.properties.find(p => p.name.text === k).initializer.text === v, 'Request init ' + k);
function variable(f, name) { for (const s of f.statements.filter(ts.isVariableStatement)) for (const n of s.declarationList.declarations) if (n.name.getText(f) === name) return n; throw Error('Missing variable ' + name); }
const version = variable(release, 'KNORVIA_BUILTIN_RELEASE_SCHEMA_VERSION');
assert(ts.isAsExpression(version.initializer) && Number(version.initializer.expression.text) === data.release.schemaVersion, 'Release version value');
assert(variable(releaseApi, 'KNORVIA_BUILTIN_RELEASE_SCHEMA_VERSION').type.getText(releaseApi) === '1', 'Public version literal type');
const retired = variable(release, 'RETIRED_ZAPI_PROVIDER_ID'); assert(retired.initializer.text === data.release.retiredProviderId, 'Retired identity');
let retiredTemplate, maxRevision = false;
walk(release, n => { if (ts.isTemplateExpression(n)) retiredTemplate = n.getText(release).slice(1, -1); if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'max' && n.arguments[0].getText(release) === 'Number.MAX_SAFE_INTEGER') maxRevision = true; });
assert(retiredTemplate.replace('${RETIRED_ZAPI_PROVIDER_ID}', data.release.retiredProviderId) === data.release.retiredProviderError, 'Retired diagnostic');
assert(maxRevision && data.release.revisionMaximum === Number.MAX_SAFE_INTEGER, 'Revision maximum');
function objectSchemaKeys(f, name) {
  let keys; walk(variable(f, name).initializer, n => {
    if (!keys && ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'z' && n.expression.name.text === 'object') keys = n.arguments[0].properties.map(p => p.name.getText(f));
  }); return keys;
}
eq(objectSchemaKeys(release, 'releaseSchema'), data.release.strictInputOuterKeys, 'Release envelope keys');
const encoder = release.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'encodeKnorviaBuiltinRelease');
const projection = encoder.body.statements.find(ts.isReturnStatement).expression;
eq(projection.properties.map(p => p.name.getText(release)), data.release.encodedOuterKeys, 'Encoded root key order');
const config = projection.properties.find(p => p.name.text === 'config').initializer;
eq(config.properties.map(p => p.name.getText(release)), data.release.encodedConfigKeys, 'Encoded config order');
eq(config.properties[0].initializer.properties.map(p => p.name.getText(release)), data.release.encodedProviderKeys, 'Encoded provider group order');
const ruleSchema = parse('packages/provider/src/config/rule-data-schema.ts');
eq(objectSchemaKeys(ruleSchema, 'builtinModelConfigRulesSchema'), data.dependency.builtinModelGroups, 'Canonical builtin model groups');
eq(objectSchemaKeys(ruleSchema, 'builtinProviderConfigRulesSchema'), data.dependency.providerRuleGroups, 'Canonical builtin provider groups');
assert(JSON.parse(fs.readFileSync('packages/provider-node/package.json', 'utf8')).dependencies.zod === data.dependency.zodVersion, 'Pinned Zod version');
const targetPaths = manifest.sourceMetadataBindings.slice(0, 2).map(x => x.path);
const targetDigests = manifest.sourceMetadataBindings.slice(0, 2).map(x => x.sha256);
assert(!JSON.parse(fs.readFileSync('licensing/reviews.json', 'utf8')).files.some(x => targetPaths.includes(x.path) || targetDigests.some(h => JSON.stringify(x).includes(h))), 'STOP exact path/digest review found');
assert(receipt.exactReviewHits === 0 && receipt.exactDigestReviewHits === 0 && receipt.namedReceiptHits.length === 1 && receipt.namedReceiptHits[0].path.endsWith('/source-review.json'), 'STOP receipt scope changed');
let links = 0;
for (const file of ['README.md', 'dependency-contract.md']) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (/^https?:/.test(match[1])) continue;
    const target = path.resolve(dir, match[1].split('#')[0]);
    if (target !== path.resolve(dir, 'packet-static-results.json')) assert(fs.existsSync(target), 'Broken link: ' + match[1]); links++;
  }
}
const result = { mode: 'AST/digest/fixed data only; no application imports/runtime/network', typescript: ts.version, sourceMetadataBindings: manifest.sourceMetadataBindings.length, authorInputBindings: manifest.authorInputBindings.length, receiptBinding: 'PASS', exportDeclarations: exportCount, completeOwnerFunctions: functionCount, canonicalParserSignatures: 'PASS2/2', declarationFiles, bodies, initializers, parseErrors: 0, fixedDownloadSecurityAndDiagnostics: 'PASS', releaseVersionRetiredIdentityAndProjection: 'PASS', canonicalBuiltinGroupData: 'PASS', zodVersion: data.dependency.zodVersion, localLinks: links, exactPublicAcceptedReceipt: false, semanticTypeClosure: 'DEFERRED', ordinaryTestsBuilds: false, realDownloadProviderCacheCredentialsConfig: false, newRequests: 0, productionChanges: 0, materialOpen: 21, rightsAccepted: false, status: 'PASS' };
fs.writeFileSync(path.join(dir, 'packet-static-results.json'), JSON.stringify(result, null, 2) + '\n');
assert(fs.existsSync(path.join(dir, 'packet-static-results.json')), 'Missing generated result');
console.log(JSON.stringify(result));
