import hashlib,json,shutil,subprocess,tempfile
from pathlib import Path
root=Path('/workspace/knorvia-native-linux-email-20261003')
fixture=Path(tempfile.mkdtemp(prefix='pacman-format-fixture-',dir=root/'tmp'))
fpm=Path('/tmp/knorvia-native-package-acceptance-20261003/builder-cache/fpm@2.1.4/fpm@2.1.4-fpm-1.17.0-ruby-3.4.3-linux-amd64/fpm')
report={'inputSha':'b5fbc3d89c34c45d6d9f7e16183bbdaec79d75f8','syntheticToolProbe':True,'fixture':str(fixture),'configuredArtifactExtension':'.pkg.tar.zst','lockedBuilderDefaultCompression':'xz'}
try:
    source=fixture/'source';source.mkdir();(source/'fixture.txt').write_text('synthetic package-format fixture\n')
    artifact=fixture/'synthetic-pacman.pkg.tar.zst'
    args=[str(fpm),'-s','dir','-t','pacman','--name','knorvia-format-fixture','--version','1.0.0','--architecture','x86_64','--maintainer','Knorvia Studio <accomplish07zrh@gmail.com>','--license','Apache-2.0','--url','https://knorvia.xyz','--pacman-compression','xz','--pacman-compression','zstd','--package',str(artifact),'--chdir',str(source),'.']
    env={'PATH':str(root/'tools/bin')+':/tmp/knorvia-native-package-acceptance-20261003/bin:/usr/bin:/bin','LANG':'C.UTF-8','TMPDIR':str(root/'tmp')}
    r=subprocess.run(args,env=env,text=True,capture_output=True,timeout=60)
    report.update({'command':args,'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
    assert r.returncode==0,r.stderr
    magic=artifact.read_bytes()[:4];report['artifactMagicHex']=magic.hex();report['artifactSha256']=hashlib.sha256(artifact.read_bytes()).hexdigest()
    assert magic==bytes.fromhex('28b52ffd'),magic.hex()
    report['status']='confirmed-supported-fpm-last-compression-override'
finally:
    shutil.rmtree(fixture);report['fixtureRemoved']=not fixture.exists()
    (root/'pacman-zstd-extension-probe.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'status':report.get('status'),'actualMagicHex':report.get('artifactMagicHex'),'configuredExtension':report['configuredArtifactExtension'],'fixtureRemoved':report['fixtureRemoved']}))
