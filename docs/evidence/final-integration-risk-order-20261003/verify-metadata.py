"""Verify this bounded evidence record; does not run product code or tests."""
from pathlib import Path
import hashlib
import itertools
import json
import re

directory = Path(__file__).resolve().parent
repo = directory.parents[2]
record = json.loads((directory / 'published-path-collisions.json').read_text())
changes = record['changedPathBindings']
expected = []
for left, right in itertools.combinations(sorted(changes, key=int), 2):
    common = set(changes[left]) & set(changes[right])
    expected.append({
        'prs': [int(left), int(right)],
        'differentBlobCollisions': [
            {'path': path, left: changes[left][path]['headBlob'], right: changes[right][path]['headBlob']}
            for path in sorted(common)
            if changes[left][path]['headBlob'] != changes[right][path]['headBlob']
        ],
        'sameBlobOverlaps': sum(changes[left][path]['headBlob'] == changes[right][path]['headBlob'] for path in common),
    })
assert expected == record['pairs']
assert sum(len(pair['differentBlobCollisions']) for pair in expected) == 3
pins = {
    'apps/cli/packages/core/src/workflow/scheduler/collection-planner.ts': '32ffd9142ec2d13db5589fa520222c68dbd15e8da2d248efb3b72377620de3af',
    'apps/cli/packages/core/src/workflow/scheduler/node-runner.ts': '61e6c3ea17edf02e748469e21dd8d2e3f22b26ead2f3a27169a30c197252dc27',
    'apps/cli/packages/core/src/workflow/scheduler/planner-expansion.ts': 'fa55221d297c30564d8960ba3e91e50fb6e9de14e7c915025f5dbcc4c736fb73',
    'packages/desktop/src/main/desktopRuntimeEnv.ts': '74cbdfd11402b8442c1fbd473c8fbd9902c807d05096a9ec736673ab2a55e194',
    'packages/shared/src/dynamic-workflow-feature.ts': '210b8d1bdda0981b85ddf465f91c4c882245d974f68d7910d792e32233d84c42',
}
for path, digest in pins.items():
    assert hashlib.sha256((repo / path).read_bytes()).hexdigest() == digest, path
links = []
for markdown in directory.glob('*.md'):
    for target in re.findall(r'\]\(([^)]+)\)', markdown.read_text()):
        if '://' not in target:
            assert (markdown.parent / target).exists(), target
            links.append(target)
evidence = json.loads((directory / 'published-evidence-observations.json').read_text())
repair = evidence['dCuaRepair']['diagnosticComparison']
assert [item['repairedDiagnostics'] for item in repair] == [6, 15]
assert all(item['originalNormalizedSha256'] == item['repairedNormalizedSha256'] for item in repair)
print(json.dumps({'boundedCollisionRecord': 'PASS', 'differentBlobCollisions': 3, 'localSourceDigestPins': len(pins), 'localLinks': len(links), 'dPublishedDiagnosticObservation': [6, 15], 'productTestsRun': False, 'compilerOrRuntimeExecuted': False}, indent=2))
