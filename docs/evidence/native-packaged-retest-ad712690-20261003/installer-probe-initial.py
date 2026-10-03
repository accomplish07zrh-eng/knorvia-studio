import datetime
import hashlib
import http.server
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import threading

release = Path(sys.argv[1]).resolve()
destination = Path(sys.argv[2]).resolve()
tool_bin = '/tmp/knorvia-native-package-acceptance-20261003/bin'
fixture = Path(tempfile.mkdtemp(prefix='isolated-installer-', dir=destination.parent))
report = {'status': 'running', 'inputSha': 'ad712690b3eb1501574c1d29361dc801c1414373', 'startedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'fixture': str(fixture), 'checks': [], 'runs': [], 'httpRequests': [], 'limits': ['Task-local install only; no global or OS Desktop install', 'No GUI/model/user-data access', 'External archive checksum comparison is performed by this probe; the existing installer itself does not verify sha256.txt']}
server = None

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(release), **kwargs)

    def log_message(self, fmt, *args):
        report['httpRequests'].append({'request': self.requestline, 'message': fmt % args})

try:
    latest = json.loads((release / 'latest.json').read_text())
    version = latest['version']
    archive = release / 'releases' / version / latest['tarball']
    checksum_text = (archive.parent / 'sha256.txt').read_text()
    actual = digest(archive)
    assert actual == checksum_text.split()[0], 'Generated checksum must match the fresh archive'
    assert latest['sha256'] == actual, 'Generated latest metadata must bind the fresh archive'
    report['archive'] = {'path': str(archive), 'bytes': archive.stat().st_size, 'sha256': actual}
    report['checks'].append('Fresh archive matches both generated checksum and latest metadata')
    expected = {}
    with tarfile.open(archive, 'r:gz') as package:
        for name in ['knorvia/package.json', 'knorvia/bin/knorvia.mjs', 'knorvia/agent/knorvia.cjs', 'knorvia/server/entry-http.js', 'knorvia/web/index.html', 'knorvia/agent/node_modules/@knorvia/cua/index.js']:
            member = package.getmember(name)
            content = package.extractfile(member).read()
            expected[name.removeprefix('knorvia/')] = hashlib.sha256(content).hexdigest()
    profile = fixture / 'synthetic-data'
    profile.mkdir()
    sentinel = profile / 'user-fixture.bin'
    sentinel.write_bytes(b'knorvia-independent-install-fixture\x00\xff\n')
    sentinel_hash = digest(sentinel)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    install_root = fixture / 'runtime'
    bin_dir = fixture / 'bin'
    env = {'PATH': tool_bin + ':/usr/bin:/bin', 'LANG': 'C.UTF-8', 'TERM': 'xterm-256color', 'NODE_PATH': '', 'NODE_OPTIONS': '', 'KNORVIA_DIST_BASE_URL': 'http://127.0.0.1:' + str(server.server_port) + '/', 'KNORVIA_DIST_HOME': str(install_root), 'KNORVIA_DIST_BIN_DIR': str(bin_dir), 'KNORVIA_DATA_BASE_DIR': str(profile), 'KNORVIA_HOME': str(profile / '.knorvia-studio'), 'KNORVIA_STORAGE_DIR': str(profile / '.knorvia-studio'), 'KNORVIA_BASE_URL': 'http://127.0.0.1:9', 'KNORVIA_MODEL_TELEMETRY_ENABLED': '0'}
    for number in [1, 2]:
        result = subprocess.run(['/bin/sh', str(release / 'install.sh')], cwd=fixture, env=env, text=True, capture_output=True, timeout=90)
        report['runs'].append({'run': number, 'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
        assert result.returncode == 0, 'Actual generated install.sh must exit zero'
        target = install_root / 'releases' / version
        assert (install_root / 'current').is_symlink()
        assert (install_root / 'current').resolve() == target.resolve()
        assert not (install_root / 'releases' / (version + '.new')).exists()
        checked = {}
        for relative, sha256 in expected.items():
            installed = target / relative
            checked[relative] = digest(installed)
            assert checked[relative] == sha256, 'Installed artifact bytes must match the fresh archive: ' + relative
        report['runs'][-1]['installedBindings'] = checked
        launcher = bin_dir / 'knorvia'
        assert os.access(launcher, os.X_OK)
        executed = subprocess.run([str(launcher), '--version'], cwd=fixture, env=env, text=True, capture_output=True, timeout=20)
        report['runs'][-1]['launcherVersion'] = {'exitCode': executed.returncode, 'stdout': executed.stdout, 'stderr': executed.stderr}
        assert executed.returncode == 0 and executed.stdout.strip() == version
        help_result = subprocess.run([str(launcher), '--help'], cwd=fixture, env=env, text=True, capture_output=True, timeout=20)
        report['runs'][-1]['launcherHelp'] = {'exitCode': help_result.returncode, 'outputBytes': len(help_result.stdout.encode()), 'stderr': help_result.stderr}
        assert help_result.returncode == 0 and 'Usage' in help_result.stdout
        assert digest(sentinel) == sentinel_hash
        report['checks'].append('Install run ' + str(number) + ': local download/extraction/current symlink/executable launcher/version/help/exact artifact bytes/synthetic profile sentinel passed')
    assert len(report['httpRequests']) == 4, 'Two actual installs must fetch metadata and tarball from the owned loopback server'
    report['version'] = version
    report['status'] = 'passed'
except BaseException as error:
    report['status'] = 'failed'
    report['error'] = repr(error)
finally:
    if server:
        server.shutdown()
        server.server_close()
    shutil.rmtree(fixture)
    report['fixtureRemoved'] = not fixture.exists()
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'result': str(destination), 'checks': report['checks'], 'error': report.get('error')}, ensure_ascii=False))
    sys.exit(0 if report['status'] == 'passed' else 1)
