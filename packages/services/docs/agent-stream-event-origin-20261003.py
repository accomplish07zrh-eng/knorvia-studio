from pathlib import Path
import collections
import hashlib
import itertools
import json
import subprocess

ROOT = Path('/workspace/knorvia-studio')
OUT = Path('/tmp/knorvia-agent-three-origin-screen-20261003.json')
NAMES = {
    'protocolClient.ts': 'zcodeProtocolClient.ts',
    'stdioTransport.ts': 'zcodeStdioTransport.ts',
    'sessionEventCoalescer.ts': 'zcodeSessionEventCoalescer.ts',
}
EXPECTED = {
    'protocolClient.ts': '1a28886f9568c5ff9d18f461d42ca3b676867cd3319db7129e181d587a0e4660',
    'stdioTransport.ts': 'ffd032b47e510c5e2568e83a573e4cab28d442471c2f869151481a0cbd202ab1',
    'sessionEventCoalescer.ts': '5813ae114edcf1acddd7ae2d2520fa3c851d5e8fa926912b817cafbc2b9d3e99',
}
COMMANDS = []

def digest(data):
    return hashlib.sha256(data).hexdigest()

def git(*args, stdin=None, record=True):
    p = subprocess.run(['git', *args], input=stdin, capture_output=True, cwd=ROOT)
    if record:
        COMMANDS.append({'argv': ['git', *args], 'exit': p.returncode,
                         'stdout': p.stdout.decode('utf8', errors='replace'),
                         'stderr': p.stderr.decode('utf8', errors='replace')})
    return p

def rows_at_path(node, path):
    found = []
    if isinstance(node, dict):
        if node.get('path') == path:
            found.append(node)
        for child in node.values():
            found.extend(rows_at_path(child, path))
    elif isinstance(node, list):
        for child in node:
            found.extend(rows_at_path(child, path))
    return found

def windows(data):
    meaningful = [(i + 1, line.strip()) for i, line in enumerate(data.decode('utf8').splitlines())
                  if len(line.strip()) >= 12 and not line.strip().startswith(('import ', '//', '/*', '*'))]
    found = []
    for i in range(len(meaningful) - 7):
        fragment = '\n'.join(line for _, line in meaningful[i:i + 8])
        if len(fragment) >= 160:
            found.append((digest(fragment.encode()), meaningful[i][0]))
    return found

manifest_path = 'licensing/upstream-baseline.json'
manifest_bytes = (ROOT / manifest_path).read_bytes()
manifest = json.loads(manifest_bytes)
service_rows = [r for r in manifest['files'] if r['path'].startswith('packages/services/src/')
                and r['path'].endswith('.ts')]
check = git('cat-file', '--batch-check', stdin=('\n'.join(r['blob'] for r in service_rows) + '\n').encode())
assert check.returncode == 0
available, missing = [], []
for row, line in zip(service_rows, check.stdout.decode().splitlines(), strict=True):
    (missing if line.endswith(' missing') else available).append(row)
index = collections.defaultdict(list)
for row in available:
    p = git('cat-file', 'blob', row['blob'], record=False)
    assert p.returncode == 0
    assert digest(p.stdout) == row['sha256']
    for hash_value, line in windows(p.stdout):
        index[hash_value].append({'path': row['path'], 'blob': row['blob'], 'sourceLine': line})

reverse_pairs = [
    ('#src/agent/', '#src/zcode-agent/'),
    ('/storageStartupGate.js', '/zcodeStorageStartupGate.js'),
    ('./protocolTransport.js', './zcodeProtocolTransport.js'),
    ('/agent.js', '/zcodeAgent.js'),
    ('agent-process-tree', 'zcode-agent-process-tree'),
    ('./agentStderrCollector.js', './zcodeAgentStderrCollector.js'),
    ('@zcode/shared/protocol-v4', '@zcode/shared/zcode-protocol-v4'),
]
records = []
for name, upstream_name in NAMES.items():
    path = 'packages/services/src/agent/' + name
    current = (ROOT / path).read_bytes()
    assert digest(current) == EXPECTED[name]
    appearance = git('log', '--follow', '--diff-filter=A', '--format=%H', '--', path).stdout.decode().strip()
    assert appearance and '\n' not in appearance
    initial = git('show', appearance + ':' + path, record=False).stdout
    blob = git('rev-parse', appearance + ':' + path).stdout.decode().strip()
    meta = git('show', '-s', '--format=%H%n%P%n%aI%n%an%n%s%n%B', appearance).stdout.decode().splitlines()
    history = git('log', '--all', '--full-history', '--format=%H %aI %s', '--', path).stdout.decode().splitlines()
    target = next(r for r in service_rows if r['path'].endswith('/' + upstream_name))
    source = current.decode('utf8')
    count = source.count('Knorvia Studio')
    attempts, matches, seen = 0, [], set()
    for choices in itertools.product(['ZCode', 'ZCode Studio'], repeat=count):
        pieces = source.split('Knorvia Studio')
        branded = pieces[0] + ''.join(choice + part for choice, part in zip(choices, pieces[1:]))
        branded = branded.replace('Knorvia', 'ZCode').replace('knorvia', 'zcode').replace('KNORVIA', 'ZCODE')
        active = [(a, b) for a, b in reverse_pairs if a in branded]
        for mask in itertools.product([False, True], repeat=len(active)):
            candidate, chosen = branded, []
            for yes, (a, b) in zip(mask, active):
                if yes:
                    candidate = candidate.replace(a, b)
                    chosen.append({'from': a, 'to': b})
            raw = candidate.encode('utf8')
            hash_value = digest(raw)
            if hash_value in seen:
                continue
            seen.add(hash_value)
            attempts += 1
            if hash_value == target['normalizedSha256']:
                matches.append({'sha256': hash_value, 'bytes': len(raw),
                                'studioOccurrencesReverse': list(choices),
                                'globalTokenReverse': [{'from': 'Knorvia', 'to': 'ZCode'},
                                                       {'from': 'knorvia', 'to': 'zcode'},
                                                       {'from': 'KNORVIA', 'to': 'ZCODE'}],
                                'pathAndScopeReverse': chosen,
                                'match': 'COMPLETE FILE SHA-256 equals upstream manifest; only listed token/path/scope reversals'})
    snippets = [{'localSourceLine': line, 'sha256': h, 'upstream': index[h]}
                for h, line in windows(current) if h in index]
    snapshots = []
    for stage, data in [('first-local-appearance', initial), ('lane-current', current)]:
        sha = digest(data.replace(b'\r\n', b'\n'))
        snapshots.append({'stage': stage, 'normalizedSha256': sha,
                          'upstreamExactFileMatches': [r['path'] for r in manifest['files']
                                                       if r.get('normalizedSha256') == sha]})
    records.append({'path': path, 'laneCurrentSha256': digest(current), 'bytes': len(current),
                    'firstLocalAppearance': {'commit': appearance, 'parents': meta[1].split(),
                                             'date': meta[2], 'authorLabel': meta[3], 'subject': meta[4],
                                             'message': '\n'.join(meta[5:]), 'blob': blob,
                                             'sha256': digest(initial), 'bytes': len(initial),
                                             'qualification': 'Parentless snapshot; cannot certify pre-snapshot authorship'},
                    'currentEqualsFirstLocalAppearance': current == initial,
                    'reachablePathHistory': history, 'sameNameAnalogueUpstreamManifest': target,
                    'sameNameAnalogueBlobAvailable': target in available,
                    'unmodifiedExactFileComparisons': snapshots,
                    'boundedBrandPathReverse': {'uniqueCandidatesCompared': attempts, 'matches': matches,
                                                'candidateRules': reverse_pairs,
                                                'policy': 'No semantic edits, executable reordering, comment deletion, generic identifier normalization, application execution or external retrieval'},
                    'availableUpstreamEightMeaningfulLineMatches': snippets,
                    'recommendation': ('Demonstrated retained upstream substantive whole owner after branding/path/scope-only edits; eligible for a separately allocated complete-owner reconstruction. Keep source unchanged in this origin-screen batch.'
                                       if matches else 'Unknown pre-snapshot origin; retain provisionally unchanged. No inherited complete owner demonstrated by this bounded screen; absent matching evidence is not proof of independent origin.')})

prior_paths = ['licensing/current-files.json', 'licensing/evidence/repository-migration-scope-20260930.json',
               'packages/services/docs/service-scope-map-fast-1240.json',
               'packages/services/docs/service-scope-map-fast-2057.json',
               'specs/knorvia-clean-base.md', 'specs/knorvia-identity-rename.md',
               'specs/knorvia-backend.md', 'docs/knorvia-protocol-source-review-strategy-20260930.md']
prior = []
for name in prior_paths:
    data = (ROOT / name).read_bytes()
    item = {'path': name, 'sha256': digest(data)}
    if name.endswith('.json'):
        node = json.loads(data)
        item['exactScopeRecords'] = [row for record in records for row in rows_at_path(node, record['path'])]
    else:
        item['firstLocalAppearance'] = git('log', '--follow', '--diff-filter=A', '--format=%H %aI %s', '--', name).stdout.decode().strip()
    prior.append(item)

head = git('rev-parse', 'HEAD').stdout.decode().strip()
status = git('status', '--porcelain').stdout.decode()
commit_check = git('cat-file', '-t', manifest['commit'])
shallow = git('rev-parse', '--is-shallow-repository').stdout.decode().strip()
result = {
    'schemaVersion': 1, 'date': '2026-10-03', 'checkpoint': head,
    'branch': git('branch', '--show-current').stdout.decode().strip(),
    'request': 'Root delegation narrowed to verify origin first; return bounded evidence for allocation and keep sources unchanged.',
    'files': records,
    'upstream': {'manifest': manifest_path, 'manifestSha256': digest(manifest_bytes),
                 'source': manifest['source'], 'commit': manifest['commit'],
                 'commitObjectAvailable': commit_check.returncode == 0, 'repositoryShallow': shallow,
                 'servicesTypeScriptCount': len(service_rows), 'availableBlobCount': len(available),
                 'missingBlobCount': len(missing),
                 'availableBlobs': [{'path': r['path'], 'blob': r['blob'], 'sha256': r['sha256']} for r in available],
                 'windowMethod': 'Exact 8 trimmed meaningful lines of >=12 chars each, combined >=160 bytes; exclude import/comment-prefixed lines. No generic identifier normalization or semantic clone detection; negative results are not origin proof.'},
    'priorRecords': prior,
    'contradiction': 'Unreviewed ledger rows have upstream:null, but complete brand/path-only reversed hashes bind two whole substantive owners to upstream inventory. The ledger is not changed or treated as accepted review.',
    'featureSpecsQualification': 'Clean-base says existing agent/runtime behavior remains; identity-rename describes token/path renaming; backend adds external StudioRuntime ownership while retaining native V4. These support lineage context, not independent authorship receipts.',
    'sourceUnchanged': True, 'worktreeBeforeEvidence': status,
    'candidateAuthorCyclesStarted': 0,
    'openEvidence': ['Pre-root-snapshot raw drafts/author access records absent in bounded records',
                     'Upstream commit and all three analogous blob objects unavailable; no fetch or alternate retrieval',
                     'Protocol client origin unresolved; broad absence/independent originality not established',
                     'Two exact hash matches establish technical retained expression, not rights clearance or accepted ledger status'],
    'limits': 'Repository-only static metadata/hash screening; no source/global inventory/license/dependency/authority changes, author cycles, actual subprocess/stdio/provider/network/user-data operations, tests/builds/native acceptance, MIT claim, main merge or cross-lane integration.',
    'commands': COMMANDS,
}
OUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'checkpoint': head, 'sourcesUnchanged': status == '',
                  'files': [{'path': r['path'], 'sha256': r['laneCurrentSha256'],
                             'sameAsParentlessSnapshot': r['currentEqualsFirstLocalAppearance'],
                             'brandPathWholeFileMatches': len(r['boundedBrandPathReverse']['matches']),
                             'brandPathCandidates': r['boundedBrandPathReverse']['uniqueCandidatesCompared'],
                             'eightLineMatches': len(r['availableUpstreamEightMeaningfulLineMatches'])} for r in records],
                  'upstreamBlobsAvailable': len(available), 'upstreamBlobsMissing': len(missing),
                  'evidence': str(OUT)}, indent=2))
