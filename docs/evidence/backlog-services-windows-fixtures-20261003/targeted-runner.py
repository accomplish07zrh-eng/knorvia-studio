import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

REPO = Path('/workspace/knorvia-studio')
NODE = '/tmp/knorvia-services-node-24.14.0/node-v24.14.0-linux-x64/bin/node'
FILES = [
    'atomic-write-fake-safety-20261002.test.ts',
    'feedback-traversal-fake-authority-20261002.test.ts',
    'file-service-fake-write-safety-20261002.test.ts',
    'git-checkpoint-helpers-fake-safety-20261002.test.ts',
    'git-checkpoint-repo-fake-safety-20261002.test.ts',
    'git-cli-helpers-fake-safety-20261002.test.ts',
    'git-cli-repo-fake-safety-20261002.test.ts',
    'plugin-archive-fake-containment-20261002.test.ts',
    'runtime-tool-fake-permission-20261002.test.ts',
    'skills-write-permission-safety-20261002.test.ts',
    'ssh-alias-fake-authority-20261002.test.ts',
    'storage-cleaner-fake-safety-20261002.test.ts',
]

mode, label = sys.argv[1:3]
if mode not in ('native', 'win32-paths', 'skills-alias'):
    raise ValueError(mode)
files = FILES
if mode == 'win32-paths':
    files = [name for name in FILES if not name.startswith('skills-write-')]
if mode == 'skills-alias':
    files = [name for name in FILES if name.startswith('skills-write-')]
command = [NODE, '--experimental-test-module-mocks', '--import', 'tsx']
if mode == 'win32-paths':
    command += ['--import', '/tmp/knorvia-services-win32-paths-preload.mjs']
command += ['--test', '--test-concurrency=2', '--test-timeout=30000']
command += ['packages/services/test/' + name for name in files]

with tempfile.TemporaryDirectory(prefix='knorvia-services-windows-fixtures-') as sandbox:
    root = Path(sandbox)
    real = root / 'real'
    real.mkdir()
    temp_root = real
    if mode == 'skills-alias':
        temp_root = root / 'alias'
        temp_root.symlink_to(real, target_is_directory=True)
    env = {
        key: value for key, value in os.environ.items()
        if not re.search(r'(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY)', key, re.I)
    }
    env.update({
        'HOME': str(real), 'USERPROFILE': str(real),
        'TMPDIR': str(temp_root), 'TMP': str(temp_root), 'TEMP': str(temp_root),
        'KNORVIA_ENV': 'test', 'KNORVIA_DATA_BASE_DIR': str(real),
        'KNORVIA_STORAGE_DIR': str(real / 'cli'),
        'TSX_TSCONFIG_PATH': str(REPO / 'packages/ui/tsconfig.json'),
    })
    result = subprocess.run(command, cwd=REPO, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=120)
    log_path = Path('/tmp') / f'knorvia-services-{label}.log'
    log_path.write_bytes(result.stdout)
    meta = {
        'command': command,
        'observedExitCode': result.returncode,
        'host': 'linux-x64',
        'nodeVersion': 'v24.14.0',
        'mode': mode,
        'processPlatform': 'linux (unchanged)',
        'windowsExecution': False,
        'testFiles': files,
        'logFile': str(log_path),
        'logSha256': hashlib.sha256(result.stdout).hexdigest(),
        'aliasRootCreated': mode == 'skills-alias',
    }
    (Path('/tmp') / f'knorvia-services-{label}.json').write_text(
        json.dumps(meta, indent=2) + '\n')
    print('mode:', mode, 'exit:', result.returncode)
    print(result.stdout.decode('utf8', errors='replace')[-24000:])
    sys.exit(result.returncode)
